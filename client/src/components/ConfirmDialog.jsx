import { useState } from 'react';
import Dialog from './Dialog.jsx';
import Button from './Button.jsx';

export default function ConfirmDialog({ open, onClose, title, message, confirmLabel = 'Delete', onConfirm }) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p className="text-ink-muted">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Keep it</Button>
        <Button variant="danger" onClick={handleConfirm} disabled={busy}>
          {busy ? 'Deleting…' : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
