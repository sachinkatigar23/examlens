import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { BookOpen, Check, CircleDashed, GraduationCap, Printer, RefreshCw, Square } from 'lucide-react';
import Markdown from './Markdown.jsx';
import ModeToggle from './ModeToggle.jsx';
import ModelBadge from './ModelBadge.jsx';
import AnswerError from './AnswerError.jsx';
import AskTab from './AskTab.jsx';
import Button from './Button.jsx';
import FormError from './FormError.jsx';
import PlanPanel from './PlanPanel.jsx';
import { getLesson, getStudyPlan, setStudied, streamLesson } from '../api/study.js';
import { errorMessage } from '../api/client.js';
import { useModeState } from '../context/ModelContext.jsx';

const STATUS = {
  not_started: { label: 'Not started', Icon: CircleDashed, className: 'text-ink-muted' },
  generated: { label: 'Lesson ready', Icon: BookOpen, className: 'text-ink' },
  studied: { label: 'Studied', Icon: Check, className: 'text-pen' },
};

// Study mode: pick a unit, see its syllabus topics, and let ExamLens teach them from scratch, topic by topic,
// from your own notes. Lessons are saved, so each is written once (unless you regenerate it).
export default function StudyTab({ spaceId }) {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [unitName, setUnitName] = useState(null);
  const [topicId, setTopicId] = useState(null);
  const [lessons, setLessons] = useState({}); // topicId -> lesson (cached ones are loaded on demand)
  const [live, setLive] = useState(null); // { topicId, text } while a lesson streams
  const [lessonError, setLessonError] = useState(null);
  const [teaching, setTeaching] = useState(null); // { done, total } during "Teach me this unit"
  const [mode, setMode] = useModeState();
  const [planKey, setPlanKey] = useState(0); // bumped when a topic is ticked here, so the countdown re-reads
  const abortRef = useRef(null);
  const stopRef = useRef(false);

  const loadPlan = useCallback(
    () =>
      getStudyPlan(spaceId)
        .then((p) => {
          setPlan(p);
          setUnitName((u) => u ?? p.units[0]?.unit ?? null);
        })
        .catch((err) => setError(errorMessage(err))),
    [spaceId],
  );
  useEffect(() => {
    loadPlan();
    return () => abortRef.current?.abort();
  }, [loadPlan]);

  const unit = plan?.units.find((u) => u.unit === unitName);
  const topic = unit?.topics.find((t) => t._id === topicId) ?? null;

  // Open a topic: show its saved lesson if there is one.
  useEffect(() => {
    if (!topicId || lessons[topicId] !== undefined) return;
    getLesson(spaceId, topicId)
      .then((l) => setLessons((all) => ({ ...all, [topicId]: l })))
      .catch(() => setLessons((all) => ({ ...all, [topicId]: null })));
  }, [spaceId, topicId, lessons]);

  const setTopicStatus = (id, status) =>
    setPlan((p) => ({ ...p, units: p.units.map((u) => ({ ...u, topics: u.topics.map((t) => (t._id === id ? { ...t, status } : t)) })) }));

  // Streams one topic's lesson. Returns true if it finished.
  async function teach(t, useMode = mode) {
    setTopicId(t._id);
    setLessonError(null);
    setLive({ topicId: t._id, text: '' });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const done = await streamLesson(spaceId, t._id, { mode: useMode }, {
        signal: controller.signal,
        onToken: (text) => setLive((l) => ({ ...l, text: l.text + text })),
      });
      const saved = await getLesson(spaceId, t._id);
      setLessons((all) => ({ ...all, [t._id]: saved ?? { content: '', citations: done.citations, provider: done.provider, model: done.model } }));
      if (t.status !== 'studied') setTopicStatus(t._id, 'generated');
      return true;
    } catch (err) {
      if (err.name !== 'AbortError') setLessonError({ message: err.message, code: err.code, mode: useMode, topic: t });
      return false;
    } finally {
      setLive(null);
      abortRef.current = null;
    }
  }

  // "Teach me this unit": every topic without a lesson, one after another (one at a time: 4 GB GPU).
  async function teachUnit() {
    const todo = unit.topics.filter((t) => t.status === 'not_started');
    stopRef.current = false;
    setTeaching({ done: 0, total: todo.length });
    for (const [i, t] of todo.entries()) {
      if (stopRef.current || !(await teach(t))) break;
      setTeaching({ done: i + 1, total: todo.length });
    }
    setTeaching(null);
  }

  function stop() {
    stopRef.current = true;
    abortRef.current?.abort(); // the server still finishes and saves the topic it was on
  }

  async function toggleStudied() {
    try {
      const studied = topic.status !== 'studied';
      const { status, lesson } = await setStudied(spaceId, topic._id, studied);
      setTopicStatus(topic._id, status);
      setPlanKey((k) => k + 1);
      setLessons((all) => ({ ...all, [topic._id]: lesson }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (error && !plan) return <FormError message={error} />;
  if (!plan) return <p className="font-mono text-sm text-ink-muted" role="status">Opening your study plan…</p>;
  if (!plan.units.length) return <EmptyStudy />;

  const busy = Boolean(live) || Boolean(teaching);
  const lesson = topic ? lessons[topic._id] : undefined;

  return (
    <>
    <PlanPanel
      spaceId={spaceId}
      refreshKey={planKey}
      onChanged={loadPlan}
      onOpenTopic={(id, u) => !busy && (setUnitName(u), setTopicId(id))}
    />
    <div className="grid gap-8 lg:grid-cols-[17rem_1fr] lg:items-start">
      {/* Units, like the index of a notebook */}
      <nav aria-label="Units" className="space-y-2 lg:sticky lg:top-6">
        {plan.units.map((u) => {
          const done = u.topics.filter((t) => t.status === 'studied').length;
          const ready = u.topics.filter((t) => t.status !== 'not_started').length;
          return (
            <button
              key={u.unit}
              onClick={() => !busy && (setUnitName(u.unit), setTopicId(null))}
              disabled={busy && u.unit !== unitName}
              aria-current={u.unit === unitName ? 'true' : undefined}
              className={`card-surface block w-full border-l-4 px-4 py-3 text-left transition-colors duration-150 disabled:opacity-50 ${
                u.unit === unitName ? 'border-l-pen' : 'border-l-rule hover:border-l-ink/40'
              }`}
            >
              <span className="font-mono text-[11px] tracking-wider text-ink-muted uppercase">{u.unit}</span>
              <span className="block font-serif text-lg leading-snug font-semibold">{u.unitTitle || u.unit}</span>
              <span className="mt-1 block text-xs text-ink-muted">
                {ready}/{u.topics.length} lessons · {done} studied
              </span>
            </button>
          );
        })}
        {plan.units.some((u) => u.topics.some((t) => t.derived)) && (
          <p className="px-1 text-xs text-ink-muted">No syllabus uploaded: topics were worked out from your question bank.</p>
        )}
      </nav>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="mr-auto text-2xl font-semibold">{unit.unitTitle || unit.unit}</h3>
          <ModeToggle mode={mode} onChange={setMode} />
          <Link
            to={`/spaces/${spaceId}/revision/${encodeURIComponent(unit.unit)}`}
            className="inline-flex items-center gap-2 rounded-md border border-ink/25 bg-card px-4 py-2.5 text-sm font-medium text-ink hover:border-ink/50"
          >
            <Printer size={16} aria-hidden="true" /> Last-night sheet
          </Link>
          {teaching ? (
            <Button variant="secondary" onClick={stop}>
              <Square size={14} aria-hidden="true" /> Stop ({teaching.done}/{teaching.total})
            </Button>
          ) : (
            <Button onClick={teachUnit} disabled={busy || unit.topics.every((t) => t.status !== 'not_started')}>
              <GraduationCap size={16} aria-hidden="true" /> Teach me this unit
            </Button>
          )}
        </div>
        {unit.notesCount === 0 && (
          <p className="mt-2 text-sm text-ink-muted">
            No notes were uploaded for {unit.unit} directly{plan.mixedNotes ? '; lessons use your mixed notes' : ''}.
          </p>
        )}

        <ol className="mt-4 grid gap-2 sm:grid-cols-2">
          {unit.topics.map((t, i) => {
            const { label, Icon, className } = STATUS[t.status];
            const streamingThis = live?.topicId === t._id;
            return (
              <li key={t._id}>
                <button
                  onClick={() => !busy && setTopicId(t._id)}
                  aria-current={t._id === topicId ? 'true' : undefined}
                  className={`flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors duration-150 ${
                    t._id === topicId ? 'border-ink/60 bg-card' : 'border-rule hover:border-ink/40'
                  }`}
                >
                  <span className="pt-0.5 font-mono text-xs text-ink-muted">{String(i + 1).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block leading-snug font-medium">{t.name}</span>
                    <span className={`mt-0.5 inline-flex items-center gap-1 text-xs ${streamingThis ? 'text-pen' : className}`}>
                      <Icon size={12} aria-hidden="true" /> {streamingThis ? 'Writing the lesson…' : label}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <AnimatePresence mode="wait">
          {topic && (
            <motion.section
              key={topic._id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="ruled-margin card-surface mt-8 py-5 pr-5 pl-16"
              aria-label={`Lesson: ${topic.name}`}
            >
              <span className="absolute top-5 left-4 font-mono text-[10px] tracking-widest text-pen uppercase">Lesson</span>
              <h4 className="text-2xl font-semibold">{topic.name}</h4>
              {topic.details && !topic.derived && <p className="mt-1 text-sm text-ink-muted">{topic.details}</p>}

              <div className="mt-5">
                {live?.topicId === topic._id ? (
                  live.text ? <Markdown text={live.text} /> : <p className="font-mono text-sm text-ink-muted" role="status">Reading your notes on this topic…</p>
                ) : lesson === undefined ? (
                  <p className="font-mono text-sm text-ink-muted" role="status">Opening the lesson…</p>
                ) : lesson ? (
                  <Markdown text={lesson.content} citations={lesson.citations} />
                ) : (
                  !lessonError && (
                    <Button onClick={() => teach(topic)} disabled={busy}>
                      <GraduationCap size={16} aria-hidden="true" /> Teach me this topic
                    </Button>
                  )
                )}
                {lessonError?.topic?._id === topic._id && (
                  <AnswerError error={lessonError} mode={lessonError.mode} onUseCloud={() => teach(topic, 'cloud')} />
                )}
              </div>

              {lesson && live?.topicId !== topic._id && (
                <footer className="mt-5 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
                  <ModelBadge provider={lesson.provider} model={lesson.model} />
                  <button
                    onClick={toggleStudied}
                    className={`ml-auto inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${
                      topic.status === 'studied' ? 'border-pen text-pen' : 'border-ink/25 text-ink hover:border-ink/60'
                    }`}
                    aria-pressed={topic.status === 'studied'}
                  >
                    <Check size={13} aria-hidden="true" /> {topic.status === 'studied' ? 'Studied' : 'Mark as studied'}
                  </button>
                  <button
                    onClick={() => teach(topic)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-ink/5 hover:text-ink disabled:opacity-50"
                  >
                    <RefreshCw size={12} aria-hidden="true" /> Regenerate
                  </button>
                </footer>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {topic && lesson && (
          <section className="mt-6" aria-label={`Questions about ${unit.unit}`}>
            <h4 className="mb-3 font-serif text-lg font-semibold">Still unsure? Ask about {unit.unit}</h4>
            <AskTab
              key={unit.unit}
              spaceId={spaceId}
              thread={`study:${unit.unit}`}
              compact
              placeholder={`Ask about ${topic.name}…`}
              starters={[`Explain ${topic.name} more simply`, `Give another example of ${topic.name}`, `How is ${topic.name} asked in exams?`]}
            />
          </section>
        )}
      </div>
    </div>
    </>
  );
}

function EmptyStudy() {
  return (
    <div className="ruled ruled-margin card-surface px-6 py-10 pl-16">
      <h2 className="text-2xl font-semibold">Nothing to study yet.</h2>
      <p className="mt-2 max-w-lg text-ink-muted">
        Study mode needs the units and topics of the subject. Upload the syllabus, or the college's important
        questions PDF (ExamLens works out the topics from it), plus your unit notes.
      </p>
    </div>
  );
}
