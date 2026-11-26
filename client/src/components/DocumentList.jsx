import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText, RotateCcw, Trash2 } from 'lucide-react';
import StatusChip from './StatusChip.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { formatBytes, plural } from '../utils/format.js';

const GROUPS = [
  { kind: 'syllabus', title: 'Syllabus', empty: 'Add the syllabus so questions can be matched to topics.' },
  { kind: 'notes', title: 'Notes', empty: 'Your class notes go here; Ask answers from them.' },
  { kind: 'paper', title: 'Past papers', empty: 'Three or more past papers make the Analyzer worth it.' },
];

export default function DocumentList({ documents, onDelete, onRetry }) {
  const [toDelete, setToDelete] = useState(null);

  return (
    <div className="space-y-8">
      {GROUPS.map((group) => {
        const docs = documents
          .filter((d) => d.kind === group.kind)
          .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
        return (
          <section key={group.kind} aria-labelledby={`group-${group.kind}`}>
            <h3 id={`group-${group.kind}`} className="flex items-baseline gap-3 text-lg font-semibold">
              {group.title}
              <span className="font-mono text-xs font-normal text-ink-muted">{docs.length}</span>
            </h3>
            {docs.length === 0 ? (
              <p className="mt-2 border-t border-rule pt-3 text-sm text-ink-muted">{group.empty}</p>
            ) : (
              <ul className="mt-2 divide-y divide-rule border-y border-rule">
                <AnimatePresence initial={false}>
                  {docs.map((doc) => (
                    <DocumentRow key={doc._id} doc={doc} onDelete={() => setToDelete(doc)} onRetry={() => onRetry(doc)} />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>
        );
      })}

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        title="Remove this file?"
        message={toDelete ? `"${toDelete.originalName}" and everything ExamLens learned from it will be removed.` : ''}
        confirmLabel="Remove file"
        onConfirm={() => onDelete(toDelete)}
      />
    </div>
  );
}

// Same rule as the server: failed, or "processing" for so long that the AI service must have restarted.
const STALE_MS = 10 * 60 * 1000;
const canRetry = (doc) =>
  doc.status === 'failed' ||
  (['queued', 'processing'].includes(doc.status) && Date.now() - new Date(doc.updatedAt).getTime() > STALE_MS);

function DocumentRow({ doc, onDelete, onRetry }) {
  const [retrying, setRetrying] = useState(false);
  const meta = [
    doc.kind === 'paper' && doc.year,
    doc.pages && plural(doc.pages, 'page'),
    formatBytes(doc.sizeBytes),
  ].filter(Boolean);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="py-3"
    >
      <div className="flex items-center gap-3">
        <FileText size={20} className="shrink-0 text-ink-muted" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={doc.originalName}>{doc.originalName}</p>
          <p className="font-mono text-xs text-ink-muted">{meta.join(' · ')}</p>
        </div>
        <StatusChip status={doc.status} />
        {canRetry(doc) && (
          <button
            onClick={async () => {
              setRetrying(true);
              await onRetry();
              setRetrying(false);
            }}
            disabled={retrying}
            aria-label={`Retry ${doc.originalName}`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-ink hover:bg-ink/5 disabled:opacity-50"
          >
            <RotateCcw size={14} aria-hidden="true" className={retrying ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Retry</span>
          </button>
        )}
        <button
          onClick={onDelete}
          className="rounded-md p-2 text-ink-muted transition-colors hover:bg-pen/10 hover:text-pen"
          aria-label={`Remove ${doc.originalName}`}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
      {doc.status === 'failed' && doc.error && (
        <p className="mt-1.5 ml-8 border-l-2 border-pen pl-3 text-sm text-pen">{doc.error}</p>
      )}
    </motion.li>
  );
}
