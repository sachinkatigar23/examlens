import { GitBranch, PlayCircle } from 'lucide-react';
import { REPO_URL, STATIC_DEMO, VIDEO_URL } from '../static/mode.js';

// Static demo (GitHub Pages) only: a thin strip on every page saying what this is and where the real thing is.
export default function StaticDemoBanner() {
  if (!STATIC_DEMO) return null;
  const link = 'inline-flex items-center gap-1 font-medium text-ink underline decoration-pen decoration-2 underline-offset-4';
  return (
    <div className="no-print flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-rule bg-highlight/40 px-4 py-1.5 text-sm" role="note">
      <span>
        <span className="font-mono text-[11px] tracking-wider uppercase">Live demo (read-only)</span>
        <span className="text-ink-muted">: recorded data, no live AI.</span>
      </span>
      <a href={REPO_URL} className={link} target="_blank" rel="noreferrer">
        <GitBranch size={14} aria-hidden="true" /> GitHub repo
      </a>
      {VIDEO_URL && (
        <a href={VIDEO_URL} className={link} target="_blank" rel="noreferrer">
          <PlayCircle size={14} aria-hidden="true" /> Watch the video
        </a>
      )}
    </div>
  );
}
