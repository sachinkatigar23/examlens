import { useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// A little paper sticker "p. 14" stuck into the answer. Hover or focus shows which file and the exact
// passage the answer came from, so the student can check it.
export default function CitationSticker({ page, sources = [] }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  const hasSources = sources.length > 0;

  return (
    <span className="relative inline-block align-baseline">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        aria-describedby={hasSources && open ? tipId : undefined}
        aria-label={`Page ${page}${hasSources ? `, ${sources[0].originalName}` : ''}`}
        className="mx-0.5 -rotate-2 rounded-[3px] border border-rule bg-highlight/70 px-1.5 py-px font-mono text-[11px] font-medium
                   text-[#1B2A4A] shadow-[1px_1px_0_rgb(27_42_74/0.15)] transition-transform duration-150 hover:rotate-0"
      >
        p. {page}
      </button>
      <AnimatePresence>
        {open && hasSources && (
          <motion.span
            id={tipId}
            role="tooltip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="card-surface absolute bottom-full left-1/2 z-20 mb-2 block w-72 -translate-x-1/2 p-3 text-left text-xs leading-relaxed text-ink"
          >
            {sources.map((s) => (
              <span key={`${s.documentId}-${s.page}`} className="block not-first:mt-2 not-first:border-t not-first:border-rule not-first:pt-2">
                <span className="block font-mono text-[11px] text-ink-muted">
                  {s.originalName} · p. {s.page}
                </span>
                <span className="mt-1 block whitespace-pre-line">{s.snippet}</span>
              </span>
            ))}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
