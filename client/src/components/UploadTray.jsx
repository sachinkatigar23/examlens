import { useEffect, useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { uploadDocument } from '../api/documents.js';
import { getStudyPlan } from '../api/study.js';
import { errorMessage } from '../api/client.js';
import { formatBytes } from '../utils/format.js';

const MAX_BYTES = 20 * 1024 * 1024;
const KINDS = [
  { value: 'syllabus', label: 'Syllabus' },
  { value: 'notes', label: 'Notes' },
  { value: 'paper', label: 'Past paper' },
  { value: 'important', label: 'Important Qs', title: "Your college's important questions PDF (question bank)" },
];
// Offered when the notebook has no units yet (no syllabus or question bank uploaded).
const FALLBACK_UNITS = ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5'].map((unit) => ({ unit, unitTitle: '' }));
const LAST_YEAR = new Date().getFullYear() - 1;

// Checked here for a fast answer; the server checks again (and properly).
function checkFile(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) return 'Only PDF files can go in the tray.';
  if (file.size > MAX_BYTES) return `This one is ${formatBytes(file.size)}; the limit is 20 MB.`;
  return null;
}

export default function UploadTray({ spaceId, onUploaded }) {
  const inputId = useId();
  const [kind, setKind] = useState('notes');
  const [year, setYear] = useState(LAST_YEAR);
  const [unit, setUnit] = useState('mixed');
  const [units, setUnits] = useState(FALLBACK_UNITS);

  // Units come from the syllabus (or the question bank). Re-read whenever notes are about to be uploaded.
  useEffect(() => {
    if (kind !== 'notes') return;
    getStudyPlan(spaceId)
      .then((p) => setUnits(p.units.length ? p.units : FALLBACK_UNITS))
      .catch(() => {});
  }, [kind, spaceId]);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState([]); // [{ id, name, progress, error, done }]

  const patch = (id, changes) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...changes } : it)));

  async function handleFiles(fileList) {
    const files = Array.from(fileList);
    if (!files.length) return;
    const yearNumber = Number(year);
    if (kind === 'paper' && !(yearNumber >= 1990 && yearNumber <= LAST_YEAR + 2)) {
      setItems((list) => [{ id: crypto.randomUUID(), name: 'Year', error: 'Enter the year this paper was set.' }, ...list]);
      return;
    }

    const batch = files.map((file) => ({ id: crypto.randomUUID(), file, name: file.name, progress: 0, error: checkFile(file) }));
    setItems((list) => [...batch.map(({ file: _file, ...rest }) => rest), ...list].slice(0, 8));

    // One at a time keeps the progress bars readable and the server calm.
    for (const item of batch) {
      if (item.error) continue;
      try {
        const doc = await uploadDocument(spaceId, { file: item.file, kind, year: yearNumber, unit }, (p) =>
          patch(item.id, { progress: p }),
        );
        patch(item.id, { progress: 100, done: true });
        onUploaded(doc);
        setTimeout(() => setItems((list) => list.filter((it) => it.id !== item.id)), 1500);
      } catch (err) {
        patch(item.id, { error: errorMessage(err) });
      }
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <section aria-labelledby={`${inputId}-title`} className="card-surface p-5">
      <h2 id={`${inputId}-title`} className="text-xl font-semibold">Add to this notebook</h2>

      <fieldset className="mt-4">
        <legend className="sr-only">What are you uploading?</legend>
        <div className="grid grid-cols-2 gap-0.5 rounded-md border border-rule bg-paper p-1 text-sm">
          {KINDS.map((k) => (
            <label key={k.value} className="cursor-pointer" title={k.title}>
              <input
                type="radio"
                name={`${inputId}-kind`}
                value={k.value}
                checked={kind === k.value}
                onChange={() => setKind(k.value)}
                className="peer sr-only"
              />
              <span className="block rounded px-2 py-1.5 text-center text-ink-muted transition-colors duration-150 peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:ring-2 peer-focus-visible:ring-pen">
                {k.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <AnimatePresence initial={false}>
        {kind === 'paper' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <label className="mt-4 flex items-center justify-between gap-3 text-sm">
              <span className="text-ink-muted">Which year's paper?</span>
              <input
                type="number"
                inputMode="numeric"
                min="1990"
                max={LAST_YEAR + 2}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-24 border-0 border-b-2 border-ink/25 bg-transparent py-1 text-right font-mono text-ink focus:border-pen focus:outline-none"
              />
            </label>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {kind === 'notes' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <label className="mt-4 flex items-center justify-between gap-3 text-sm">
              <span className="text-ink-muted">Which unit?</span>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="max-w-48 rounded-md border border-rule bg-card px-2 py-1 text-sm text-ink focus:border-pen focus:outline-none"
              >
                <option value="mixed">Mixed / whole subject</option>
                {units.map((u) => (
                  <option key={u.unit} value={u.unit}>
                    {u.unit}
                    {u.unitTitle ? ` · ${u.unitTitle}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The paper tray: a label for the hidden file input, so it's clickable and keyboard-focusable. */}
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`tray mt-4 block cursor-pointer rounded-md px-4 pt-8 pb-6 text-center transition-colors duration-200 ease-out
                    focus-within:ring-2 focus-within:ring-pen ${dragging ? 'tray-active' : ''}`}
      >
        <TraySheets lifted={dragging} />
        <span className="mt-4 block font-serif text-lg font-medium">
          {dragging ? 'Let go to add them' : 'Drop PDFs in the tray'}
        </span>
        <span className="mt-1 block text-sm text-ink-muted">
          or <span className="text-ink underline decoration-pen decoration-2 underline-offset-4">browse files</span>
        </span>
        <span className="mt-3 block font-mono text-[11px] uppercase tracking-wider text-ink-muted">PDF · up to 20 MB</span>
        <input
          id={inputId}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = ''; // allow choosing the same file again
          }}
        />
      </label>

      <ul className="mt-3 space-y-2" aria-live="polite">
        <AnimatePresence initial={false}>
          {items.map((it) => (
            <motion.li
              key={it.id}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate">{it.name}</span>
                {!it.error && <span className="font-mono text-xs text-ink-muted">{it.done ? 'Added' : `${it.progress}%`}</span>}
              </div>
              {it.error ? (
                <p className="mt-0.5 text-pen">{it.error}</p>
              ) : (
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-rule">
                  <div className="h-full bg-ink transition-[width] duration-200" style={{ width: `${it.progress}%` }} />
                </div>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

// Three loose sheets sitting in the tray; they lift and fan slightly while a file is dragged over.
function TraySheets({ lifted }) {
  const sheet = 'absolute inset-x-0 mx-auto h-14 w-24 rounded-[3px] border border-rule bg-card shadow-sm';
  return (
    <span className="relative mx-auto block h-16 w-32" aria-hidden="true">
      <motion.span className={sheet} animate={{ rotate: lifted ? -9 : -4, y: lifted ? -6 : 4 }} transition={{ duration: 0.25, ease: 'easeOut' }} />
      <motion.span className={sheet} animate={{ rotate: lifted ? 8 : 3, y: lifted ? -8 : 2 }} transition={{ duration: 0.25, ease: 'easeOut' }} />
      <motion.span
        className={`${sheet} ruled overflow-hidden`}
        animate={{ y: lifted ? -14 : 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <span className="absolute top-3 left-3 h-1.5 w-12 bg-highlight/80" />
      </motion.span>
    </span>
  );
}
