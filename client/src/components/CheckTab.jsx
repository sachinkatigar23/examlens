import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, Camera, Check, ImageUp, Keyboard, Square, Trash2, X } from 'lucide-react';
import Button from './Button.jsx';
import FormError from './FormError.jsx';
import Markdown from './Markdown.jsx';
import ModeToggle from './ModeToggle.jsx';
import ModelBadge from './ModelBadge.jsx';
import AnswerError from './AnswerError.jsx';
import { getBank } from '../api/bank.js';
import { deleteCheck, getCheck, listChecks, streamCheck } from '../api/checks.js';
import { transcribePhoto, uploadPhoto } from '../api/photos.js';
import { errorMessage } from '../api/client.js';
import { useModels } from '../context/ModelContext.jsx';
import { formatDate, formatBytes } from '../utils/format.js';
import { useReadOnly } from '../hooks/usePublicConfig.js';

const MARK_OPTIONS = [2, 5, 10, 16];
const WORD_TARGET = { 2: '40–70', 5: '150–250', 10: '350–500', 16: '600–800' };
const snap = (m) => (m <= 3 ? 2 : m <= 7 ? 5 : m <= 12 ? 10 : 16);
const TYPED = ''; // questionId value for "type my own question"
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE = 10 * 1024 * 1024;

// Check my answer: pick (or type) a question, write or photograph your own answer, and get an estimated
// mark, what's covered and missing, and a full-marks version from your notes. Every attempt is kept.
export default function CheckTab({ spaceId }) {
  const readOnly = useReadOnly();
  const { providers } = useModels();
  const [params, setParams] = useSearchParams();
  const [bank, setBank] = useState(null);
  const [questionId, setQuestionId] = useState(params.get('question') ?? TYPED);
  const [typedQuestion, setTypedQuestion] = useState('');
  const [marks, setMarks] = useState(5);
  const [source, setSource] = useState('type'); // type | photo
  const [answer, setAnswer] = useState('');
  const [photo, setPhoto] = useState(null);
  // Typed answers stay on this computer by default; reading handwriting needs Cloud (unless a local vision
  // model is installed), so a photo switches to Cloud when it is available.
  const [mode, setMode] = useState('local');
  const [run, setRun] = useState(null); // { grade, text, citations, provider, model, streaming, error }
  const [attempts, setAttempts] = useState([]);
  const [error, setError] = useState('');
  const abortRef = useRef(null);

  useEffect(() => {
    getBank(spaceId).then(setBank).catch((err) => setError(errorMessage(err)));
  }, [spaceId]);

  // "Check my answer" from a question bank row opens this tab with ?question=<id>.
  const linked = params.get('question');
  useEffect(() => {
    if (linked) setQuestionId(linked);
  }, [linked]);

  const question = useMemo(() => bank?.questions.find((q) => q._id === questionId) ?? null, [bank, questionId]);
  useEffect(() => {
    if (question) setMarks(question.marks ?? 5);
  }, [question]);

  const loadAttempts = useCallback(
    () => listChecks(spaceId, questionId || null).then((all) => setAttempts(questionId ? all : all.filter((a) => !a.question))),
    [spaceId, questionId],
  );
  useEffect(() => {
    loadAttempts().catch(() => {});
  }, [loadAttempts]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const cloudReady = providers.cloud.available && !providers.cloud.quota?.exhausted;
  function pickSource(next) {
    setSource(next);
    if (next === 'photo' && cloudReady) setMode('cloud');
    if (next === 'type') setMode('local');
  }

  function pickQuestion(id) {
    setQuestionId(id);
    setRun(null);
    const next = new URLSearchParams(params);
    if (id) next.set('question', id);
    else next.delete('question');
    setParams(next, { replace: true });
  }

  const questionText = question?.text ?? typedQuestion.trim();
  const canCheck = questionText.length >= 5 && answer.trim().length >= 10 && !run?.streaming;

  async function check(useMode = mode) {
    setError('');
    const controller = new AbortController();
    abortRef.current = controller;
    setRun({ grade: null, text: '', citations: [], streaming: true, mode: useMode });
    const body = {
      ...(question ? { questionId: question._id, marks } : { question: questionText, marks }),
      answer: answer.trim(),
      photoId: source === 'photo' ? photo?._id : undefined,
      mode: useMode,
    };
    try {
      const done = await streamCheck(spaceId, body, {
        signal: controller.signal,
        onGrade: (grade) => setRun((r) => ({ ...r, grade })),
        onToken: (t) => setRun((r) => ({ ...r, text: r.text + t })),
      });
      setRun((r) => ({
        ...r,
        grade: done.grade ?? r.grade,
        text: done.content ?? r.text,
        citations: done.citations ?? [],
        provider: done.provider,
        model: done.model,
        streaming: false,
      }));
      loadAttempts().catch(() => {});
    } catch (err) {
      if (err.name === 'AbortError') setRun((r) => ({ ...r, streaming: false, stopped: true }));
      else setRun((r) => ({ ...r, streaming: false, error: { message: err.message, code: err.code } }));
    } finally {
      abortRef.current = null;
    }
  }

  async function openAttempt(id) {
    try {
      const c = await getCheck(spaceId, id);
      setRun({
        grade: { ...c, outOf: c.marks },
        text: c.improved,
        citations: c.citations,
        provider: c.provider,
        model: c.model,
        streaming: false,
        answerText: c.answerText,
        attemptId: c._id,
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function removeAttempt(id) {
    try {
      await deleteCheck(spaceId, id);
      if (run?.attemptId === id) setRun(null);
      loadAttempts();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const words = answer.trim() ? answer.trim().split(/\s+/).length : 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="min-w-0">
        <section className="ruled-margin card-surface relative py-5 pr-5 pl-16" aria-label="Check my answer">
          <span className="absolute top-5 left-4 font-mono text-[10px] tracking-widest text-pen uppercase">Check</span>
          <h3 className="text-2xl font-semibold">Check my answer</h3>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">
            Answer a question the way you would in the exam. ExamLens marks it against your notes and the marks format,
            shows what's missing, and writes the full-marks version.
          </p>

          <QuestionPicker bank={bank} questionId={questionId} onPick={pickQuestion} />
          {!question && (
            <textarea
              aria-label="Your question"
              value={typedQuestion}
              onChange={(e) => setTypedQuestion(e.target.value)}
              rows={2}
              placeholder="Type the question, e.g. Explain the Minimax algorithm with an example."
              className="mt-2 w-full rounded-md border border-rule bg-paper p-2 text-sm text-ink focus:border-pen focus:outline-none"
            />
          )}

          <fieldset className="mt-3 flex flex-wrap items-center gap-2">
            <legend className="sr-only">Marks</legend>
            <span className="text-sm text-ink-muted">Marks</span>
            {[...new Set([...MARK_OPTIONS, marks])].sort((a, b) => a - b).map((m) => (
              <label key={m} className="cursor-pointer">
                <input type="radio" name="check-marks" value={m} checked={marks === m} onChange={() => setMarks(m)} className="peer sr-only" />
                <span className="rounded-sm border border-pen/40 px-2 py-0.5 font-mono text-xs text-pen peer-checked:bg-pen peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-ink">
                  [{m}]
                </span>
              </label>
            ))}
            <span className="font-mono text-[11px] text-ink-muted">aim for {WORD_TARGET[snap(marks)]} words</span>
          </fieldset>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-rule pt-4" role="tablist" aria-label="How to give your answer">
            <SourceTab active={source === 'type'} onClick={() => pickSource('type')} Icon={Keyboard} label="Type it" />
            {!readOnly && (
              <SourceTab active={source === 'photo'} onClick={() => pickSource('photo')} Icon={Camera} label="Photo of my answer" />
            )}
          </div>

          {source === 'photo' && (
            <AnswerPhoto spaceId={spaceId} photo={photo} onPhoto={setPhoto} onText={setAnswer} visionMode={mode} />
          )}
          <label className="mt-3 block text-sm font-medium" htmlFor="check-answer">
            {source === 'photo' ? 'Your answer as read from the photo. Fix anything misread.' : 'Your answer'}
          </label>
          <textarea
            id="check-answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={source === 'photo' ? 8 : 12}
            placeholder="Write your answer here, as you would in the exam…"
            className="mt-1.5 w-full rounded-md border border-rule bg-paper p-3 text-[15px] leading-relaxed text-ink focus:border-pen focus:outline-none"
          />
          <p className="font-mono text-[11px] text-ink-muted">{words} words</p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {run?.streaming ? (
              <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
                <Square size={14} aria-hidden="true" /> Stop
              </Button>
            ) : (
              <Button onClick={() => check()} disabled={!canCheck}>
                Check my answer
              </Button>
            )}
            <ModeToggle mode={mode} onChange={setMode} />
          </div>
          <FormError message={error} />
        </section>

        {run && <CheckResult run={run} onUseCloud={() => check('cloud')} />}
      </div>

      <Attempts attempts={attempts} activeId={run?.attemptId} onOpen={openAttempt} onDelete={readOnly ? null : removeAttempt} typed={!questionId} />
    </div>
  );
}

function QuestionPicker({ bank, questionId, onPick }) {
  const id = useId();
  const groups = useMemo(() => {
    if (!bank) return [];
    const units = [...bank.units.map((u) => u.unit), null];
    return units
      .map((unit) => ({
        unit,
        questions: bank.questions.filter((q) => (q.unit ?? null) === unit).sort((a, b) => (a.marks ?? 5) - (b.marks ?? 5)),
      }))
      .filter((g) => g.questions.length);
  }, [bank]);

  return (
    <div className="mt-4">
      <label htmlFor={id} className="text-sm font-medium">Question</label>
      <select
        id={id}
        value={questionId}
        onChange={(e) => onPick(e.target.value)}
        className="mt-1.5 block w-full rounded-md border border-rule bg-card px-2 py-2 text-sm text-ink"
      >
        <option value={TYPED}>Type my own question…</option>
        {groups.map((g) => (
          <optgroup key={g.unit ?? 'other'} label={g.unit ?? 'Other questions'}>
            {g.questions.map((q) => (
              <option key={q._id} value={q._id}>
                [{q.marks ?? 5}] {q.text.length > 110 ? `${q.text.slice(0, 110)}…` : q.text}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

function SourceTab({ active, onClick, Icon, label }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors duration-150 ${
        active ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-muted hover:border-ink/40 hover:text-ink'
      }`}
    >
      <Icon size={14} aria-hidden="true" /> {label}
    </button>
  );
}

// Photo of a handwritten answer → uploaded → read by the vision model → the text goes into the answer box.
function AnswerPhoto({ spaceId, photo, onPhoto, onText, visionMode }) {
  const { providers, confirmCloud } = useModels();
  const inputId = useId();
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const visionOk = visionMode === 'cloud' ? providers.vision?.cloud : providers.vision?.local;

  async function pick(file) {
    setError('');
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return setError('Use a JPG, PNG or WebP photo.');
    if (file.size > MAX_IMAGE) return setError(`This photo is ${formatBytes(file.size)}; the limit is 10 MB.`);
    setPreview(URL.createObjectURL(file));
    try {
      setStatus('Uploading…');
      const uploaded = await uploadPhoto(spaceId, file);
      onPhoto(uploaded);
      if (!visionOk) {
        setStatus('');
        return setError(
          visionMode === 'cloud'
            ? 'Cloud is not available right now. Type your answer below instead.'
            : 'No local vision model is installed: switch to Cloud to read the photo, or type your answer below.',
        );
      }
      if (visionMode === 'cloud' && !(await confirmCloud())) return setStatus('');
      setStatus(`Reading your handwriting with ${visionMode === 'cloud' ? 'Cloud' : 'the local vision model'}…`);
      const result = await transcribePhoto(spaceId, uploaded._id, visionMode, 'answer');
      onText(result.text);
      setStatus(`Read by ${result.provider === 'cloud' ? 'Cloud' : 'Local'} · ${result.model}`);
    } catch (err) {
      setStatus('');
      setError(errorMessage(err, 'Could not read the photo. Type your answer below instead.'));
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-start gap-4">
      {preview && <img src={preview} alt="Your written answer" className="max-h-40 rounded-md border border-rule object-contain" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-2">
          <label htmlFor={`${inputId}-cam`} className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-medium text-paper focus-within:ring-2 focus-within:ring-pen">
            <Camera size={16} aria-hidden="true" /> {photo ? 'Retake' : 'Take a photo'}
            <input id={`${inputId}-cam`} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pick(e.target.files[0])} />
          </label>
          <label htmlFor={`${inputId}-file`} className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-ink/25 bg-card px-3 py-2 text-sm font-medium text-ink hover:border-ink/50 focus-within:ring-2 focus-within:ring-pen">
            <ImageUp size={16} aria-hidden="true" /> Choose an image
            <input id={`${inputId}-file`} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => pick(e.target.files[0])} />
          </label>
        </div>
        {status && <p className="mt-2 font-mono text-xs text-ink-muted" role="status">{status}</p>}
        {error && <p className="mt-2 text-sm text-pen" role="alert">{error}</p>}
        <p className="mt-2 text-[11px] text-ink-muted">
          Photos are read with {visionMode === 'cloud' ? 'Cloud (Gemini): only the photo is sent' : 'the local vision model'}.
        </p>
      </div>
    </div>
  );
}

// The verdict: estimated marks (red pen), format checklist, covered / missing, then the full-marks version.
function CheckResult({ run, onUseCloud }) {
  const g = run.grade;
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="card-surface mt-6 p-5"
      aria-live="polite"
      aria-label="Your result"
    >
      {!g ? (
        !run.error && <p className="font-mono text-sm text-ink-muted" role="status">Marking your answer against your notes…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-5">
            <PenScore value={g.estimatedMarks} outOf={g.outOf} />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] tracking-wider text-ink-muted uppercase">Estimated marks</p>
              <p className="text-sm text-ink-muted">
                An AI estimate against your notes and the {g.outOf}-mark format, not an official grade.
              </p>
              {g.notesCover === false && (
                <p className="mt-1 text-sm text-pen">Your notes don't cover this question, so it was marked on general knowledge.</p>
              )}
            </div>
          </div>

          {g.breakdown?.length > 0 && <Breakdown parts={g.breakdown} />}

          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Format check">
            {g.checklist?.map((c) => (
              <li
                key={c.item}
                title={c.note}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${
                  c.ok ? 'border-ink/25 text-ink' : 'border-pen/50 text-pen'
                }`}
              >
                {c.ok ? <Check size={12} aria-hidden="true" /> : <X size={12} aria-hidden="true" />}
                {c.item}
                {c.item === 'Length' && <span className="font-mono text-[10px] text-ink-muted">· {c.note}</span>}
                <span className="sr-only">{c.ok ? ' present' : ' missing'}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <PointList title="What you covered" items={g.covered} Icon={Check} tone="text-ink" empty="Nothing matched the notes yet." />
            <PointList title="What's missing" items={g.missing} Icon={X} tone="text-pen" empty="Nothing major." />
          </div>
          {g.mistakes?.length > 0 && (
            <div className="mt-5">
              <PointList title="Check these against your notes" items={g.mistakes} Icon={AlertTriangle} tone="text-pen" />
            </div>
          )}
          {g.feedback && <p className="mt-5 border-l-2 border-highlight pl-3 text-sm">{g.feedback}</p>}
        </>
      )}

      {run.answerText && (
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer text-ink-muted hover:text-ink">Your answer in this attempt</summary>
          <p className="mt-2 whitespace-pre-wrap rounded-md border border-rule bg-paper p-3">{run.answerText}</p>
        </details>
      )}

      {(run.text || (g && run.streaming)) && (
        <div className="mt-6 border-t border-rule pt-5">
          <h4 className="font-serif text-xl font-semibold">The full-marks version</h4>
          <p className="text-xs text-ink-muted">Your answer, completed and corrected from your notes.</p>
          <div className="mt-3">
            {run.text ? <Markdown text={run.text} citations={run.streaming ? undefined : run.citations} /> : (
              <p className="font-mono text-sm text-ink-muted" role="status">Writing it…</p>
            )}
          </div>
        </div>
      )}

      <AnswerError error={run.error} mode={run.mode} onUseCloud={onUseCloud} />
      {run.stopped && <p className="mt-2 text-xs text-ink-muted">Stopped.</p>}
      {!run.streaming && run.provider && (
        <div className="mt-4 border-t border-rule pt-3">
          <ModelBadge provider={run.provider} model={run.model} />
        </div>
      )}
    </motion.section>
  );
}

// Where the marks came from: the marking scheme for this format, part by part.
function Breakdown({ parts }) {
  const fmt = (n) => (Number.isInteger(n) ? n : n.toFixed(1));
  return (
    <table className="mt-4 w-full max-w-md text-sm" aria-label="How the marks add up">
      <tbody>
        {parts.map((p) => (
          <tr key={p.part} className="border-b border-rule last:border-0">
            <th scope="row" className="py-1 pr-3 text-left font-normal whitespace-nowrap text-ink-muted">{p.part === 'Content' ? 'Key points from your notes' : p.part}</th>
            <td className="w-full py-1">
              <span className="block h-1.5 overflow-hidden rounded-full bg-rule">
                <span className="block h-full bg-highlight" style={{ width: `${p.max ? (p.got / p.max) * 100 : 0}%` }} />
              </span>
            </td>
            <td className="py-1 pl-3 text-right font-mono text-xs whitespace-nowrap">
              {fmt(p.got)} / {fmt(p.max)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PointList({ title, items, Icon, tone, empty }) {
  return (
    <div>
      <h4 className="font-mono text-xs tracking-wider text-ink-muted uppercase">{title}</h4>
      {items?.length ? (
        <ul className="mt-2 space-y-1.5 text-sm">
          {items.map((p) => (
            <li key={p} className="flex gap-2">
              <Icon size={14} className={`mt-0.5 shrink-0 ${tone}`} aria-hidden="true" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">{empty}</p>
      )}
    </div>
  );
}

// "6½ / 10" in red pen with a hand-drawn ring, like a teacher's mark.
export function PenScore({ value, outOf, size = 'lg' }) {
  const text = Number.isInteger(value) ? String(value) : `${Math.floor(value)}½`;
  const big = size === 'lg';
  return (
    <span className={`relative inline-grid shrink-0 place-items-center text-pen ${big ? 'size-24' : 'size-12'}`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 overflow-visible" aria-hidden="true">
        <motion.path
          d="M50 8 C 76 6, 93 24, 92 50 C 91 76, 72 93, 46 92 C 22 91, 7 74, 8 49 C 9 27, 26 10, 57 11"
          fill="none"
          stroke="var(--pen)"
          strokeWidth={big ? 2.5 : 3.5}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </svg>
      <span className={`font-serif font-semibold ${big ? 'text-3xl' : 'text-sm'}`}>
        {text}
        <span className={`text-ink-muted ${big ? 'text-base' : 'text-[10px]'}`}>/{outOf}</span>
      </span>
      <span className="sr-only">{`${value} out of ${outOf}, estimated`}</span>
    </span>
  );
}

function Attempts({ attempts, activeId, onOpen, onDelete, typed }) {
  if (!attempts.length) {
    return (
      <aside className="text-sm text-ink-muted">
        <h4 className="font-mono text-xs tracking-wider uppercase">Your attempts</h4>
        <p className="mt-2">Each check is saved here{typed ? '' : ' for this question'}, so you can see your marks go up.</p>
      </aside>
    );
  }
  const trend = [...attempts].reverse().map((a) => a.estimatedMarks);
  return (
    <aside aria-label="Your attempts">
      <h4 className="font-mono text-xs tracking-wider text-ink-muted uppercase">Your attempts</h4>
      {trend.length > 1 && (
        <p className="mt-1 font-mono text-xs text-pen" title="Oldest to newest">
          {trend.map((m) => (Number.isInteger(m) ? m : m.toFixed(1))).join(' → ')}
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {attempts.map((a) => (
          <li key={a._id} className={`flex items-center gap-3 rounded-md border px-2 py-2 ${a._id === activeId ? 'border-ink/60 bg-card' : 'border-rule'}`}>
            <button onClick={() => onOpen(a._id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <PenScore value={a.estimatedMarks} outOf={a.marks} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm">{typed ? a.questionText : formatDate(a.createdAt)}</span>
                <span className="block font-mono text-[10px] text-ink-muted">
                  {typed && `${formatDate(a.createdAt)} · `}
                  {a.provider === 'cloud' ? 'Cloud' : 'Local'}
                </span>
              </span>
            </button>
            {onDelete && (
              <button onClick={() => onDelete(a._id)} className="rounded p-1 text-ink-muted hover:text-pen" aria-label="Delete this attempt">
                <Trash2 size={14} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
