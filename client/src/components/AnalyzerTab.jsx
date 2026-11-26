import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import FormError from './FormError.jsx';
import Heatmap from './Heatmap.jsx';
import QuestionPanel from './QuestionPanel.jsx';
import { getAnalysis } from '../api/analysis.js';
import { errorMessage } from '../api/client.js';
import { plural } from '../utils/format.js';

export default function AnalyzerTab({ spaceId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null); // { topic, year, label }

  // Also called after a question is moved to another topic, so the heatmap counts follow.
  const load = useCallback(
    () => getAnalysis(spaceId).then(setData).catch((err) => setError(errorMessage(err))),
    [spaceId],
  );
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <FormError message={error} />;
  if (!data) return <p className="font-mono text-sm text-ink-muted" role="status">Counting questions…</p>;

  if (data.paperCount === 0) {
    return (
      <Empty
        title="No past papers yet."
        text="Upload a few previous years' question papers in Documents (with the year), plus the syllabus. The more years, the clearer the pattern."
      />
    );
  }

  const top = data.hotTopics[0];
  return (
    <div className="space-y-12">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-muted">
          {plural(data.paperCount, 'paper')} · {plural(data.questionCount, 'question')} · {data.years[0]}–{data.years.at(-1)}
        </p>
        {top && (
          <h2 className="mt-3 max-w-3xl text-3xl leading-tight font-medium sm:text-4xl">
            <span className="highlighted">{top.name}</span> came up in {top.yearsAsked} of the last {data.paperCount}{' '}
            papers.
          </h2>
        )}
        {data.topics.length === 0 && (
          <p className="mt-4 max-w-xl border-l-2 border-pen pl-3 text-ink-muted">
            Upload the syllabus to group these questions by topic. Repeated questions below already work without it.
          </p>
        )}
      </header>

      {data.topics.length > 0 && (
        <section aria-labelledby="heatmap-title">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="heatmap-title" className="text-2xl font-semibold">Topics × years</h3>
            <Legend />
          </div>
          <Heatmap
            years={data.years}
            topics={data.topics}
            selected={selected}
            onSelect={(cell) => setSelected(cell)}
          />
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
            {data.lowConfidence > 0 && (
              <button
                onClick={() => setSelected({ confidence: 'low', label: 'Low-confidence matches' })}
                className="text-sm text-pen underline decoration-pen/40 decoration-2 underline-offset-4 hover:decoration-pen"
              >
                {plural(data.lowConfidence, 'match', 'matches')} {data.lowConfidence === 1 ? 'is' : 'are'} low confidence. Review
              </button>
            )}
            {data.unmatched > 0 && (
              <button
                onClick={() => setSelected({ topic: 'none', label: 'Questions not matched to a topic' })}
                className="text-sm text-ink-muted underline decoration-rule decoration-2 underline-offset-4 hover:text-ink"
              >
                {plural(data.unmatched, 'question')} didn't match any syllabus topic. See them
              </button>
            )}
          </div>
          {selected && (
            <QuestionPanel
              key={JSON.stringify(selected)}
              spaceId={spaceId}
              selection={selected}
              topics={data.topics}
              onMoved={load}
              onClose={() => setSelected(null)}
            />
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
        {data.hotTopics.length > 0 && <HotTopics topics={data.hotTopics} paperCount={data.paperCount} />}
        <Repeats repeats={data.repeats} />
      </div>
    </div>
  );
}

function Legend() {
  return (
    <p className="flex items-center gap-3 font-mono text-[11px] text-ink-muted" aria-hidden="true">
      <span className="flex items-center gap-1"><span className="size-3 rounded-[2px] border border-dashed border-rule" /> not asked</span>
      <span className="flex items-center gap-1"><span className="size-3 rounded-[2px] bg-highlight/45" /> 1</span>
      <span className="flex items-center gap-1"><span className="size-3 rounded-[2px] bg-highlight/75" /> 2</span>
      <span className="flex items-center gap-1"><span className="size-3 rounded-[2px] bg-highlight" /> 3+</span>
    </p>
  );
}

// Rank number with a hand-drawn red-pen circle around it.
function PenCircle({ n }) {
  return (
    <span className="relative grid size-10 shrink-0 place-items-center font-mono text-sm font-semibold text-pen">
      <svg viewBox="0 0 40 40" className="absolute inset-0 overflow-visible" aria-hidden="true">
        <motion.path
          d="M20 4 C 31 3, 37 11, 36 21 C 35 31, 27 37, 18 36 C 9 35, 3 28, 4 18 C 5 10, 12 5, 23 5"
          fill="none"
          stroke="var(--pen)"
          strokeWidth="1.8"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: n * 0.08, ease: 'easeOut' }}
        />
      </svg>
      {n}
    </span>
  );
}

function HotTopics({ topics, paperCount }) {
  return (
    <section aria-labelledby="hot-title">
      <h3 id="hot-title" className="text-2xl font-semibold">Hot topics</h3>
      <p className="mt-1 text-sm text-ink-muted">Asked in the most different years. Revise these first.</p>
      <ol className="mt-5 space-y-4">
        {topics.map((t, i) => (
          <li key={t.topicId} className="flex items-center gap-4">
            <PenCircle n={i + 1} />
            <div className="min-w-0">
              <p className="font-serif text-lg leading-snug font-medium">{t.name}</p>
              {t.details && t.details !== t.name && (
                <p className="truncate text-sm text-ink-muted" title={t.details}>{t.details}</p>
              )}
              <p className="font-mono text-xs text-ink-muted">
                {t.unit} · in {t.yearsAsked} of {paperCount} papers · {plural(t.total, 'question')}
                {t.marks > 0 && ` · ${t.marks} marks`}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Repeats({ repeats }) {
  return (
    <section aria-labelledby="repeats-title">
      <h3 id="repeats-title" className="text-2xl font-semibold">Asked again</h3>
      <p className="mt-1 text-sm text-ink-muted">The same question, in more than one year's paper.</p>
      {repeats.length === 0 ? (
        <p className="mt-5 text-sm text-ink-muted">No repeats yet. They show up once two papers share a question.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {repeats.map((r, i) => (
            <motion.li
              key={r.group}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i, 6) * 0.04, ease: 'easeOut' }}
              className="card-surface p-4"
            >
              <p className="leading-snug">“{r.text}”</p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {r.years.map((y) => (
                  <span key={y} className="rounded-sm border border-pen/60 px-1.5 py-px font-mono text-[11px] text-pen">{y}</span>
                ))}
                {r.topic && <span className="ml-1 text-xs text-ink-muted">· {r.topic}</span>}
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Empty({ title, text }) {
  return (
    <div className="ruled ruled-margin card-surface max-w-2xl px-6 py-10 pl-16">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-ink-muted">{text}</p>
    </div>
  );
}
