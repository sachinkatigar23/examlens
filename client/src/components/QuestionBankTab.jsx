import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRightLeft, Check, ChevronDown, PenLine, Printer, Square } from 'lucide-react';
import ExamAnswer from './ExamAnswer.jsx';
import ModeToggle from './ModeToggle.jsx';
import FormError from './FormError.jsx';
import Button from './Button.jsx';
import TopicSelect from './TopicSelect.jsx';
import { moveQuestion } from '../api/analysis.js';
import { getBank, getJob, setMarks, startAnswerAll, stopJob } from '../api/bank.js';
import { errorMessage } from '../api/client.js';
import { useModeState } from '../context/ModelContext.jsx';
import { useReadOnly } from '../hooks/usePublicConfig.js';

const MARK_OPTIONS = [2, 5, 10, 16];
const NO_UNIT = 'Other questions';

// Question number "U2-10M3" → "3" (the unit and marks are shown separately).
const shortNumber = (n) => n?.replace(/^U\d+-/, '').replace(/^\d+M/, '') || '';

// The college's "important questions", grouped unit → topic, each with an exam answer from the notes.
export default function QuestionBankTab({ spaceId }) {
  const [bank, setBank] = useState(null);
  const [error, setError] = useState('');
  const [unit, setUnit] = useState(''); // '' = all units
  const [mode, setMode] = useModeState();
  const readOnly = useReadOnly(); // public demo: answers are pre-written, no "Answer all"
  const [job, setJob] = useState(null);

  const load = useCallback(
    () =>
      getBank(spaceId)
        .then((b) => {
          setBank(b);
          setJob(b.job);
        })
        .catch((err) => setError(errorMessage(err))),
    [spaceId],
  );
  useEffect(() => {
    load();
  }, [load]);

  // While "Answer all" runs: poll its progress, and refresh the ✓ marks every few answers.
  const running = job?.status === 'running';
  const lastDone = useRef(null);
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(async () => {
      try {
        const next = await getJob(spaceId);
        setJob(next);
        if (next.done !== lastDone.current || next.status !== 'running') load();
        lastDone.current = next.done;
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [running, spaceId, load]);

  const groups = useMemo(() => (bank ? groupBank(bank, unit) : []), [bank, unit]);

  if (error && !bank) return <FormError message={error} />;
  if (!bank) return <p className="font-mono text-sm text-ink-muted" role="status">Opening the question bank…</p>;
  if (!bank.questions.length) return <EmptyBank />;

  const inScope = bank.questions.filter((q) => !unit || q.unit === unit);
  const answered = inScope.filter((q) => q.answer).length;

  async function runAll() {
    setError('');
    try {
      setJob(await startAnswerAll(spaceId, { mode, unit }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function stop() {
    try {
      setJob(await stopJob(spaceId));
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <div className="card-surface flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
        <div>
          <p className="font-mono text-xs tracking-wider text-ink-muted uppercase">Answered from your notes</p>
          <p className="font-serif text-2xl font-semibold">
            {answered}
            <span className="text-ink-muted"> / {inScope.length}</span>
          </p>
        </div>
        <label className="text-sm">
          <span className="sr-only">Unit</span>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className="rounded-md border border-rule bg-card px-2 py-1.5 text-sm text-ink">
            <option value="">All units</option>
            {bank.units.map((u) => (
              <option key={u.unit} value={u.unit}>
                {u.unit}
                {u.unitTitle ? ` · ${u.unitTitle}` : ''}
              </option>
            ))}
          </select>
        </label>
        <ModeToggle mode={mode} onChange={setMode} />
        <div className="ml-auto flex flex-wrap gap-2">
          {readOnly ? null : running ? (
            <Button variant="secondary" onClick={stop}>
              <Square size={14} aria-hidden="true" /> Stop
            </Button>
          ) : (
            <Button onClick={runAll} disabled={answered === inScope.length}>
              Answer all{unit ? ` in ${unit}` : ''}
            </Button>
          )}
          <Link
            to={`/spaces/${spaceId}/booklet${unit ? `?unit=${encodeURIComponent(unit)}` : ''}`}
            className="inline-flex items-center gap-2 rounded-md border border-ink/25 bg-card px-4 py-2.5 text-sm font-medium text-ink hover:border-ink/50"
          >
            <Printer size={16} aria-hidden="true" /> Answer booklet
          </Link>
        </div>
        <JobProgress job={job} />
      </div>
      <FormError message={error} />

      <div className="mt-8 space-y-10">
        {groups.map((g) => (
          <section key={g.unit} aria-labelledby={`unit-${g.unit}`}>
            <h3 id={`unit-${g.unit}`} className="text-2xl font-semibold">
              {g.unit}
              {g.unitTitle && <span className="font-normal text-ink-muted"> · {g.unitTitle}</span>}
            </h3>
            <div className="mt-4 space-y-6">
              {g.topics.map((t) => (
                <div key={t.key}>
                  <h4 className="font-mono text-xs tracking-wider text-pen uppercase">{t.name}</h4>
                  <ul className="mt-2 divide-y divide-rule rounded-md border border-rule bg-card">
                    {t.questions.map((q) => (
                      <QuestionRow key={q._id} spaceId={spaceId} question={q} topics={bank.topics} mode={mode} onChange={load} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

// unit → topic → questions, in syllabus order; questions by marks then number.
function groupBank(bank, onlyUnit) {
  const topicOf = new Map(bank.topics.map((t) => [t._id, t]));
  const units = [...bank.units.map((u) => u.unit), NO_UNIT];
  const groups = units.map((u) => ({
    unit: u,
    unitTitle: bank.units.find((x) => x.unit === u)?.unitTitle ?? '',
    topics: new Map(),
  }));
  for (const q of bank.questions) {
    if (onlyUnit && q.unit !== onlyUnit) continue;
    const group = groups.find((g) => g.unit === (q.unit ?? NO_UNIT)) ?? groups[groups.length - 1];
    const topic = topicOf.get(q.topic);
    const key = topic?._id ?? 'none';
    if (!group.topics.has(key)) group.topics.set(key, { key, name: topic?.name ?? 'Not matched to a topic', order: topic?.order ?? 1e9, questions: [] });
    group.topics.get(key).questions.push(q);
  }
  const num = (q) => Number(shortNumber(q.number)) || 0;
  return groups
    .map((g) => ({
      ...g,
      topics: [...g.topics.values()]
        .sort((a, b) => a.order - b.order)
        .map((t) => ({ ...t, questions: t.questions.sort((a, b) => (a.marks ?? 5) - (b.marks ?? 5) || num(a) - num(b)) })),
    }))
    .filter((g) => g.topics.length);
}

function QuestionRow({ spaceId, question, topics, mode, onChange }) {
  const [q, setQ] = useState(question);
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [saving, setSaving] = useState(false);
  const readOnly = useReadOnly();
  useEffect(() => setQ(question), [question]);

  async function changeMarks(marks) {
    setSaving(true);
    try {
      const updated = await setMarks(spaceId, q._id, marks);
      setQ((prev) => ({ ...prev, marks: updated.marks, marksEdited: true }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span className="w-6 shrink-0 pt-0.5 font-mono text-xs text-ink-muted">{shortNumber(q.number)}</span>
        <p className="min-w-0 flex-1 leading-snug">{q.text}</p>
        {/* On a phone the controls take their own line under the question, so the text keeps its width. */}
        <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
          {q.pastYears?.length > 0 && (
            <span className="rounded-sm bg-highlight/70 px-1.5 py-px font-mono text-[10px] text-[#1B2A4A]" title="A similar question was in these past papers">
              also asked {q.pastYears.join(', ')}
            </span>
          )}
          <label className="sr-only" htmlFor={`marks-${q._id}`}>Marks</label>
          <select
            id={`marks-${q._id}`}
            value={q.marks ?? 5}
            disabled={saving || readOnly}
            onChange={(e) => changeMarks(Number(e.target.value))}
            title={q.marksEdited ? 'Marks set by you' : q.marks ? 'Marks from the PDF' : 'No marks in the PDF: 5 assumed'}
            className="rounded-sm border border-pen/40 bg-transparent px-1 py-px font-mono text-xs text-pen"
          >
            {[...new Set([...MARK_OPTIONS, q.marks ?? 5])].sort((a, b) => a - b).map((m) => (
              <option key={m} value={m}>
                [{m}]
              </option>
            ))}
          </select>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded-md border border-ink/20 px-2 py-1 text-xs font-medium text-ink hover:border-ink/50"
          >
            {q.answer && <Check size={12} className="text-pen" aria-label="Answer saved" />}
            Exam answer
            <ChevronDown size={12} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {!readOnly && topics.length > 0 && (
            <button
              onClick={() => setMoving((m) => !m)}
              aria-expanded={moving}
              className="inline-flex items-center gap-1 rounded-md border border-ink/20 px-2 py-1 text-xs font-medium text-ink hover:border-ink/50"
              title="In the wrong topic? Move it"
            >
              <ArrowRightLeft size={12} aria-hidden="true" /> Move
            </button>
          )}
          <Link
            to={`?tab=check&question=${q._id}`}
            className="inline-flex items-center gap-1 rounded-md border border-ink/20 px-2 py-1 text-xs font-medium text-ink hover:border-ink/50"
            title="Write your own answer and get an estimated mark"
          >
            <PenLine size={12} aria-hidden="true" /> Check my answer
          </Link>
        </div>
      </div>
      {moving && (
        <MoveToTopic
          spaceId={spaceId}
          question={q}
          topics={topics}
          onMoved={() => {
            setMoving(false);
            onChange(); // regroup: the question may now sit under another unit and topic
          }}
        />
      )}
      {open && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
          <ExamAnswer spaceId={spaceId} question={q} mode={mode} onSaved={onChange} />
        </motion.div>
      )}
    </li>
  );
}

// Re-assign a question to another syllabus topic (it also moves to that topic's unit).
function MoveToTopic({ spaceId, question, topics, onMoved }) {
  const [choice, setChoice] = useState(question.topic ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');
    try {
      await moveQuestion(spaceId, question._id, choice || null);
      onMoved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 sm:ml-9">
      <TopicSelect
        id={`bank-topic-${question._id}`}
        value={choice}
        onChange={setChoice}
        topics={topics.map((t) => ({ id: t._id, unit: t.unit, name: t.name }))}
      />
      <button
        onClick={save}
        disabled={saving || choice === (question.topic ?? '')}
        className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-paper disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      {error && <span className="text-xs text-pen">{error}</span>}
    </div>
  );
}

function JobProgress({ job }) {
  if (!job || (job.status === 'done' && job.done === 0)) return null;
  const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
  const label = {
    running: `Answering ${job.done + 1} of ${job.total}${job.mode === 'cloud' ? ' (Cloud)' : ''}…`,
    done: `Answer all finished: ${job.done} of ${job.total} answered.`,
    cancelled: `Stopped at ${job.done} of ${job.total}. Start again to continue; answered ones are skipped.`,
    failed: `Stopped: ${job.error}`,
  }[job.status];
  return (
    <div className="w-full" aria-live="polite">
      <div className="flex justify-between gap-3 text-xs text-ink-muted">
        <span className={job.status === 'failed' ? 'text-pen' : ''}>{label}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-rule">
        <div className="h-full bg-highlight transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      {job.status === 'running' && job.current && <p className="mt-1 truncate text-xs text-ink-muted">Now: {job.current}</p>}
    </div>
  );
}

function EmptyBank() {
  return (
    <div className="ruled ruled-margin card-surface px-6 py-10 pl-16">
      <h2 className="text-2xl font-semibold">No question bank yet.</h2>
      <p className="mt-2 max-w-lg text-ink-muted">
        Upload your college's “important questions” PDF in Documents (choose <em>Important questions</em>). ExamLens
        sorts every question into its unit and topic, and writes each exam answer from your notes, sized to its marks.
      </p>
    </div>
  );
}
