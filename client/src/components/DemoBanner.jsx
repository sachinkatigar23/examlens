import { usePublicConfig } from '../hooks/usePublicConfig.js';

// A thin strip on every page of the public demo: the box has no GPU, so answers are slower than on a laptop.
export default function DemoBanner() {
  const { publicDemo } = usePublicConfig();
  if (!publicDemo) return null;
  return (
    <div className="no-print border-b border-rule bg-highlight/40 px-4 py-1.5 text-center text-sm text-ink" role="note">
      <span className="font-mono text-[11px] tracking-wider uppercase">Public demo</span>
      <span className="text-ink-muted">: answers may take a moment.</span>
    </div>
  );
}
