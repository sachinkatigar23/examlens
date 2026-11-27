// Topic dropdown grouped by unit, used to move a question to another topic (Analyzer and Question Bank).
// topics: [{ id, unit, name }]; value '' = "No topic".
export default function TopicSelect({ id, value, onChange, topics, className = '' }) {
  const units = [...new Set(topics.map((t) => t.unit))];
  return (
    <>
      <label htmlFor={id} className="sr-only">Topic for this question</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`max-w-full rounded-md border border-rule bg-card px-2 py-1 text-xs text-ink focus:border-pen focus:outline-none sm:max-w-72 ${className}`}
      >
        <option value="">No topic</option>
        {units.map((unit) => (
          <optgroup key={unit} label={unit}>
            {topics.filter((t) => t.unit === unit).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </>
  );
}
