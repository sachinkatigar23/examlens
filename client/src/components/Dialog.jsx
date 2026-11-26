import { useEffect, useRef } from 'react';

// Native <dialog>: focus trapping, Esc to close and the backdrop come from the browser for free.
export default function Dialog({ open, onClose, title, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // A click whose target is the <dialog> itself landed on the backdrop.
      onClick={(e) => e.target === ref.current && onClose()}
      className="card-surface m-auto w-[min(28rem,calc(100vw-2rem))] p-0 text-ink backdrop:bg-[#0f1626]/45"
    >
      <div className="ruled-margin p-6 pl-16">
        <h2 className="mb-5 text-2xl font-semibold">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
