export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
export const formatDate = (iso) => dateFormat.format(new Date(iso));

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

// Today as the student's local calendar day, "YYYY-MM-DD" (the planner works in local days).
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const dayFormat = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
// "2026-12-04" → "Fri, 4 Dec" (parsed as a local date, not UTC midnight)
export const formatDay = (ymd) => dayFormat.format(new Date(`${ymd}T00:00:00`));
