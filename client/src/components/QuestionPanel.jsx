import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { listQuestions } from '../api/analysis.js';
import { errorMessage } from '../api/client.js';

// The actual questions behind a heatmap cell (or the unmatched ones).
export default function QuestionPanel({ spaceId, selection, onClose }) {
  const [questions, setQuestions] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setQuestions(null);
    listQuestions(spaceId, { topic: selection.topic, year: selection.year })
      .then(setQuestions)
      .catch((err) => setError(errorMessage(err)));
  }, [spaceId, selection.topic, selection.year]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="ruled-margin card-surface mt-4 py-4 pr-4 pl-16"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-4">
        <h4 className="font-serif text-lg font-semibold">{selection.label}</h4>
        <button onClick={onClose} className="rounded-md p-1 text-ink-muted hover:bg-ink/5 hover:text-ink" aria-label="Close">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-pen">{error}</p>}
      {!questions && !error && <p className="mt-2 font-mono text-sm text-ink-muted">Loading…</p>}
      {questions && (
        <ul className="mt-3 space-y-2.5">
          {questions.map((q) => (
            <li key={q._id} className="flex gap-3 text-sm leading-snug">
              <span className="w-16 shrink-0 font-mono text-xs text-ink-muted">
                {selection.year ? `Q${q.number}` : `${q.year} Q${q.number}`}
              </span>
              <span className="flex-1">{q.text}</span>
              {q.marks && <span className="shrink-0 font-mono text-xs text-pen">[{q.marks}]</span>}
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}
