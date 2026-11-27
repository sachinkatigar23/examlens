import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, PenLine } from 'lucide-react';
import { plural } from '../utils/format.js';

// "Weak topics": asked a lot (past papers, question bank) but not ready yet (not studied, or your checked
// answers score low). Ranked by the server (weakTopicService.js); this only explains each one.
export default function WeakTopics({ topics, paperCount }) {
  return (
    <section aria-labelledby="weak-title">
      <h3 id="weak-title" className="text-2xl font-semibold">Weak topics</h3>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">
        Often asked, not ready yet. Based on past papers, the question bank, what you've marked as studied and your
        Check-my-answer scores.
      </p>
      {topics.length === 0 ? (
        <p className="mt-5 text-sm text-ink-muted">
          Nothing weak right now: every topic that gets asked is studied and scores well when you check your answers.
        </p>
      ) : (
        <ol className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          {topics.map((t, i) => (
            <motion.li
              key={t.topicId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.04, ease: 'easeOut' }}
              className="card-surface flex flex-col gap-3 p-4"
            >
              <div>
                <p className="font-mono text-[11px] tracking-wider text-ink-muted uppercase">{t.unit}</p>
                <p className="font-serif text-lg leading-snug font-medium">{t.name}</p>
              </div>
              <ul className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                {t.paperYears > 0 && <Chip>in {t.paperYears} of {paperCount} papers</Chip>}
                {t.bankCount > 0 && <Chip>{plural(t.bankCount, 'bank question')}</Chip>}
                <Chip tone={t.studied ? 'ok' : 'warn'}>{t.studied ? 'studied' : 'not studied yet'}</Chip>
                <Chip tone={t.checkPercent == null ? 'muted' : 'warn'}>
                  {t.checkPercent == null
                    ? 'no answers checked'
                    : `your answers: ${t.checkPercent}% (${t.checked} checked)`}
                </Chip>
              </ul>
              {t.checkPercent != null && <ScoreBar percent={t.checkPercent} />}
              <div className="mt-auto flex flex-wrap gap-2">
                <Link to={`?tab=study&topic=${t.topicId}`} className={actionClass}>
                  <BookOpen size={12} aria-hidden="true" /> {t.studied ? 'Revise it' : 'Study it'}
                </Link>
                <Link to="?tab=check" className={actionClass}>
                  <PenLine size={12} aria-hidden="true" /> Check an answer
                </Link>
              </div>
            </motion.li>
          ))}
        </ol>
      )}
    </section>
  );
}

const actionClass =
  'inline-flex items-center gap-1 rounded-md border border-ink/20 px-2 py-1 text-xs font-medium text-ink hover:border-ink/50';

const TONES = {
  plain: 'border-rule text-ink-muted',
  muted: 'border-dashed border-rule text-ink-muted',
  ok: 'border-ink/30 text-ink',
  warn: 'border-pen/50 text-pen',
};

function Chip({ tone = 'plain', children }) {
  return <li className={`rounded-sm border px-1.5 py-px ${TONES[tone]}`}>{children}</li>;
}

// Average estimated mark of your latest checks in this topic, drawn like a highlighter stroke.
function ScoreBar({ percent }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-rule" role="img" aria-label={`Average score ${percent}%`}>
      <div className="h-full bg-highlight" style={{ width: `${Math.max(percent, 3)}%` }} />
    </div>
  );
}
