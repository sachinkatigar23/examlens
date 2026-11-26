import { Cloud } from 'lucide-react';
import { useModels } from '../context/ModelContext.jsx';

const LOCAL_DOWN = new Set(['local_offline', 'model_missing']);

// An answer that failed. When the local model is offline and Cloud is set up, offer Cloud for THIS answer
// (never switch silently: the student decides whether the question may leave the machine).
export default function AnswerError({ error, mode, onUseCloud }) {
  const { providers, confirmCloud } = useModels();
  if (!error) return null;
  const offerCloud = mode === 'local' && LOCAL_DOWN.has(error.code) && providers.cloud.available && onUseCloud;

  return (
    <div role="alert" className="mt-2 border-l-2 border-pen pl-3 text-sm">
      <p className="text-pen">{offerCloud ? 'Local model is offline.' : error.message}</p>
      {offerCloud && (
        <>
          <p className="mt-0.5 text-xs text-ink-muted">{error.message}</p>
          <button
            type="button"
            onClick={async () => (await confirmCloud()) && onUseCloud()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-ink/25 bg-card px-2.5 py-1 text-xs font-medium text-ink hover:border-ink/60"
          >
            <Cloud size={13} aria-hidden="true" /> Use Cloud for this answer?
          </button>
        </>
      )}
      {error.code === 'rate_limited' && <p className="mt-0.5 text-xs text-ink-muted">Switch to Local to keep going.</p>}
    </div>
  );
}
