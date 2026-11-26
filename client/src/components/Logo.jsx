import { Link } from 'react-router-dom';

// Wordmark: a tiny ruled sheet with a highlighter mark, then "Exam" upright and "Lens" in italic.
export default function Logo({ to = '/dashboard', className = '' }) {
  return (
    <Link to={to} className={`inline-flex items-center gap-2 text-ink ${className}`} aria-label="ExamLens home">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="5" y="3" width="22" height="26" rx="2" fill="var(--card)" stroke="currentColor" strokeWidth="2" />
        <line x1="10" y1="3" x2="10" y2="29" stroke="var(--pen)" strokeWidth="1.5" />
        <rect x="12" y="11" width="11" height="4" fill="var(--highlight)" />
        <line x1="13" y1="13" x2="23" y2="13" stroke="currentColor" strokeWidth="1.5" />
        <line x1="13" y1="20" x2="21" y2="20" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span className="font-serif text-xl font-semibold tracking-tight">
        Exam<span className="font-normal italic">Lens</span>
      </span>
    </Link>
  );
}
