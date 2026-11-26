import { useId } from 'react';

// Label + input written "on the line" of a notebook: just an underline, which turns red-pen on focus.
export default function Field({ label, hint, error, className = '', ...inputProps }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        className="w-full border-0 border-b-2 border-ink/25 bg-transparent px-0.5 py-2 text-base text-ink
                   placeholder:text-ink-muted/60 transition-colors duration-150
                   focus:border-pen focus:outline-none focus-visible:outline-none aria-[invalid=true]:border-pen"
        {...inputProps}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-pen">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}
