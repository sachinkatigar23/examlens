import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Check, Clock, LoaderCircle } from 'lucide-react';

const STYLES = {
  queued: { label: 'Queued', Icon: Clock, className: 'border border-dashed border-ink/35 text-ink-muted' },
  processing: { label: 'Reading', Icon: LoaderCircle, className: 'chip-processing border border-highlight text-[#1B2A4A]' },
  ready: { label: 'Ready', Icon: Check, className: 'border border-ink bg-ink text-paper' },
  failed: { label: 'Failed', Icon: AlertCircle, className: 'border border-pen text-pen' },
};

// queued → processing → ready: the new label slides up and replaces the old one.
export default function StatusChip({ status }) {
  const { label, Icon, className } = STYLES[status] ?? STYLES.queued;
  return (
    <span className="inline-grid min-w-[6.5rem] justify-items-end" aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={status}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-wider ${className}`}
        >
          <Icon size={12} aria-hidden="true" className={status === 'processing' ? 'animate-spin' : ''} />
          {label}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
