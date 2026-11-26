import { motion } from 'framer-motion';

const fill = (n) => (n >= 3 ? 'bg-highlight' : n === 2 ? 'bg-highlight/75' : 'bg-highlight/45');

// Topics (rows, grouped by unit) × years (columns). Each cell fills like a highlighter stroke, left to right.
// Click a cell to see the actual questions.
export default function Heatmap({ years, topics, selected, onSelect }) {
  const units = [...new Set(topics.map((t) => t.unit))];
  const columns = `minmax(9rem, 16rem) repeat(${years.length}, minmax(2.75rem, 1fr)) 3rem`;

  return (
    <div className="card-surface overflow-x-auto p-4 sm:p-5">
      <div role="table" aria-label="How many questions each topic got per year" className="min-w-fit">
        <div role="row" className="grid items-end gap-1.5 pb-2" style={{ gridTemplateColumns: columns }}>
          <span role="columnheader" className="text-xs text-ink-muted">Topic</span>
          {years.map((y) => (
            <span role="columnheader" key={y} className="text-center font-mono text-xs text-ink-muted">{y}</span>
          ))}
          <span role="columnheader" className="text-right font-mono text-xs text-ink-muted">Σ</span>
        </div>

        {units.map((unit) => (
          <div key={unit} role="rowgroup" className="border-t border-rule pt-2 pb-1">
            <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-pen">{unit}</p>
            {topics
              .filter((t) => t.unit === unit)
              .map((t, row) => (
                <div role="row" key={t.topicId} className="grid items-center gap-1.5 py-0.5" style={{ gridTemplateColumns: columns }}>
                  <span role="rowheader" className={`truncate pr-2 text-sm ${t.total ? 'text-ink' : 'text-ink-muted'}`} title={t.name}>
                    {t.name}
                  </span>
                  {years.map((y, col) => {
                    const n = t.byYear[y] ?? 0;
                    const isSelected = selected?.topic === t.topicId && selected?.year === y;
                    return (
                      <span role="cell" key={y}>
                        <button
                          type="button"
                          disabled={!n}
                          onClick={() => onSelect({ topic: t.topicId, year: y, label: `${t.name} · ${y}` })}
                          aria-label={`${t.name}, ${y}: ${n ? `${n} question${n > 1 ? 's' : ''}` : 'not asked'}`}
                          aria-pressed={isSelected}
                          className={`relative grid h-8 w-full place-items-center overflow-hidden rounded-[3px] ${
                            n ? 'cursor-pointer hover:ring-2 hover:ring-ink/30' : 'border border-dashed border-rule'
                          } ${isSelected ? 'ring-2 ring-pen' : ''}`}
                        >
                          {n > 0 && (
                            <motion.span
                              className={`absolute inset-0 origin-left ${fill(n)}`}
                              initial={{ scaleX: 0 }}
                              animate={{ scaleX: 1 }}
                              transition={{ duration: 0.3, delay: Math.min(row * 0.03 + col * 0.05, 0.6), ease: 'easeOut' }}
                            />
                          )}
                          {n > 0 && <span className="relative font-mono text-xs font-medium text-[#1B2A4A]">{n}</span>}
                        </button>
                      </span>
                    );
                  })}
                  <span role="cell" className="text-right font-mono text-xs text-ink-muted">{t.total || '–'}</span>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
