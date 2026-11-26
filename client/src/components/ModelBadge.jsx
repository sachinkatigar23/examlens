import { Cloud, HardDrive } from 'lucide-react';

// "Local · qwen2.5:3b" / "Cloud · gemini-3.5-flash-lite": which model wrote this answer.
export default function ModelBadge({ provider, model, marks }) {
  if (!provider) return null;
  const Icon = provider === 'cloud' ? Cloud : HardDrive;
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-rule px-1.5 py-px font-mono text-[10px] text-ink-muted">
      <Icon size={10} aria-hidden="true" />
      {provider === 'cloud' ? 'Cloud' : 'Local'}
      {model && <> · {model}</>}
      {marks && <> · {marks} marks</>}
    </span>
  );
}
