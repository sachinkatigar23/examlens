export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
export const formatDate = (iso) => dateFormat.format(new Date(iso));

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
