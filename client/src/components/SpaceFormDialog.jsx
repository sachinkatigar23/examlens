import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import Dialog from './Dialog.jsx';
import Field from './Field.jsx';
import Button from './Button.jsx';
import FormError from './FormError.jsx';
import { SPACE_COLORS } from './spaceColors.js';
import { errorMessage } from '../api/client.js';

const EMPTY = { name: '', subject: '', color: SPACE_COLORS[0].value };

// Used for both "new notebook" and "edit notebook". onSubmit receives { name, subject, color }.
export default function SpaceFormDialog({ open, onClose, initial, onSubmit, title, submitLabel }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ? { name: initial.name, subject: initial.subject || '', color: initial.color } : EMPTY);
      setError('');
      setBusy(false);
    }
  }, [open, initial]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return setError('Give the notebook a name.');
    setBusy(true);
    try {
      await onSubmit(form);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <FormError message={error} />
        <Field
          label="Name"
          placeholder="DBMS – Sem 5"
          maxLength={80}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          autoFocus
        />
        <Field
          label="Subject (optional)"
          placeholder="Database Management Systems"
          maxLength={80}
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
        />
        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">Spine colour</legend>
          <div className="flex flex-wrap gap-2">
            {SPACE_COLORS.map((c) => {
              const selected = form.color === c.value;
              return (
                <label key={c.value} className="cursor-pointer" title={c.name}>
                  <input
                    type="radio"
                    name="color"
                    value={c.value}
                    checked={selected}
                    onChange={() => setForm({ ...form, color: c.value })}
                    className="peer sr-only"
                  />
                  <span
                    className="grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-card peer-focus-visible:ring-2 peer-focus-visible:ring-pen"
                    style={{ backgroundColor: c.value }}
                  >
                    {selected && <Check size={16} className="text-white" aria-hidden="true" />}
                  </span>
                  <span className="sr-only">{c.name}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</Button>
        </div>
      </form>
    </Dialog>
  );
}
