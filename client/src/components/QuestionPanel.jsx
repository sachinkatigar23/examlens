import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { listQuestions, moveQuestion } from '../api/analysis.js';
import { errorMessage } from '../api/client.js';

// The actual questions behind a heatmap cell (or the unmatched / low-confidence ones).
// Each question can be moved to another topic when ExamLens matched it wrongly.
export default function QuestionPanel({ spaceId, selection, topics, onMoved, onClose }) {
  const [questions, setQuestions] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setQuestions(null);
    setError('');
    listQuestions(spaceId, { topic: selection.topic, year: selection.year, confidence: selection.confidence })
      .then(setQuestions)
      .catch((err) => setError(errorMessage(err)));
  }, [spaceId, selection.topic, selection.year, selection.confidence]);

  const showYear = !selection.year;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="ruled-margin card-surface mt-4 py-4 pr-4 pl-16"
      aria-label={selection.label}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="font-serif text-lg font-semibold">{selection.label}</h4>
          <p className="text-xs text-ink-muted">Matched to the wrong topic? Pick the right one and save.</p>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-ink-muted hover:bg-ink/5 hover:text-ink" aria-label="Close">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-pen">{error}</p>}
      {!questions && !error && <p className="mt-2 font-mono text-sm text-ink-muted">Loading…</p>}
      {questions?.length === 0 && <p className="mt-3 text-sm text-ink-muted">Nothing left to review here.</p>}
      {questions && (
        <ul className="mt-3 divide-y divide-rule" aria-live="polite">
          {questions.map((q) => (
            <QuestionRow key={q._id} spaceId={spaceId} question={q} topics={topics} showYear={showYear} onMoved={onMoved} />
          ))}
        </ul>
      )}
    </motion.section>
  );
}

function QuestionRow({ spaceId, question, topics, showYear, onMoved }) {
  const [q, setQ] = useState(question);
  const [choice, setChoice] = useState(question.topic ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const changed = choice !== (q.topic ?? '');
  const units = [...new Set(topics.map((t) => t.unit))];
  const selectId = `topic-${q._id}`;

  async function save() {
    setSaving(true);
    setError('');
    try {
      const updated = await moveQuestion(spaceId, q._id, choice || null);
      setQ(updated);
      onMoved(); // refresh the heatmap counts
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="py-3 text-sm">
      <div className="flex gap-3 leading-snug">
        <span className="w-16 shrink-0 font-mono text-xs text-ink-muted">
          {showYear ? `${q.year} ` : ''}Q{q.number}
        </span>
        <span className="flex-1">{q.text}</span>
        {q.marks && <span className="shrink-0 font-mono text-xs text-pen">[{q.marks}]</span>}
      </div>
      <div className="mt-2 ml-19 flex flex-wrap items-center gap-2">
        <label htmlFor={selectId} className="sr-only">Topic for this question</label>
        <select
          id={selectId}
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="max-w-full rounded-md border border-rule bg-card px-2 py-1 text-xs text-ink focus:border-pen focus:outline-none sm:max-w-72"
        >
          <option value="">No topic</option>
          {units.map((unit) => (
            <optgroup key={unit} label={unit}>
              {topics.filter((t) => t.unit === unit).map((t) => (
                <option key={t.topicId} value={t.topicId}>{t.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {changed && (
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-paper disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
        {q.lowConfidence && !changed && (
          <span
            className="rounded-sm border border-dashed border-pen/70 px-1.5 py-px font-mono text-[10px] uppercase tracking-wider text-pen"
            title={`Similarity ${q.matchScore}: ExamLens isn't sure this is the right topic.`}
          >
            Low confidence
          </span>
        )}
        {q.topicLocked && !changed && (
          <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
            <Check size={12} aria-hidden="true" /> Set by you
          </span>
        )}
        {error && <span className="text-xs text-pen">{error}</span>}
      </div>
    </li>
  );
}
