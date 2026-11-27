import { useId } from 'react';
import { Cloud, HardDrive } from 'lucide-react';
import { useModels } from '../context/ModelContext.jsx';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

// "1:30 PM" today, "Sat 1:30 PM" on another day.
export function formatReset(iso) {
  const when = new Date(iso);
  return when.toDateString() === new Date().toDateString() ? timeFormat.format(when) : dayFormat.format(when);
}

// Local (Ollama, private) / Cloud (Gemini) switch for one screen or one request, with today's Cloud quota.
export default function ModeToggle({ mode, onChange, className = '' }) {
  const { providers, confirmCloud } = useModels();
  const name = useId();
  const quota = providers.cloud.quota;
  const cloudOff = !providers.cloud.available;
  const limitReached = Boolean(quota?.exhausted);

  async function pick(next) {
    if (next === mode) return;
    if (next === 'cloud' && !(await confirmCloud())) return; // privacy note the first time
    onChange(next);
  }

  const cloudTitle = cloudOff
    ? 'Cloud is not set up: add GEMINI_API_KEY to ai-service/.env'
    : limitReached
      ? `Gemini's free daily limit is used up. It resets at ${formatReset(quota.resetsAt)}.`
      : `Google Gemini (${providers.cloud.model}). Sends only the question and the note passages used.`;
  const options = [
    { value: 'local', label: 'Local', Icon: HardDrive, title: `Runs on this computer (${providers.local.model ?? 'Ollama'}). Nothing leaves it.` },
    { value: 'cloud', label: 'Cloud', Icon: Cloud, title: cloudTitle },
  ];

  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      <fieldset className="inline-flex rounded-full border border-rule bg-paper p-0.5 text-xs">
        <legend className="sr-only">Model</legend>
        {options.map(({ value, label, Icon, title }) => {
          const disabled = value === 'cloud' && (cloudOff || (limitReached && mode !== 'cloud'));
          return (
            <label key={value} title={title} className={disabled ? 'cursor-not-allowed' : 'cursor-pointer'}>
              <input
                type="radio"
                name={name}
                value={value}
                checked={mode === value}
                disabled={disabled}
                onChange={() => pick(value)}
                className="peer sr-only"
              />
              <span
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-ink-muted transition-colors duration-150
                           peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:ring-2 peer-focus-visible:ring-pen
                           peer-disabled:opacity-45"
              >
                <Icon size={12} aria-hidden="true" />
                {label}
                {disabled && <span className="sr-only"> ({cloudOff ? 'not set up' : 'daily limit reached'})</span>}
              </span>
            </label>
          );
        })}
      </fieldset>
      {!cloudOff && <CloudQuota quota={quota} selected={mode === 'cloud'} />}
    </span>
  );
}

// "≈14 of 20 left today" while Cloud is picked; "Cloud limit reached · resets 1:30 PM" whenever it is used up.
export function CloudQuota({ quota, selected }) {
  if (!quota) return null;
  if (quota.exhausted) {
    return (
      <span className="font-mono text-[11px] text-pen" role="status">
        Cloud limit reached · resets {formatReset(quota.resetsAt)}
      </span>
    );
  }
  if (!selected || quota.remaining == null) return null;
  return (
    <span
      className={`font-mono text-[11px] ${quota.remaining <= 3 ? 'text-pen' : 'text-ink-muted'}`}
      title="Counted by ExamLens for this API key (Gemini doesn't report the remaining free quota), so it's an estimate."
      role="status"
    >
      ≈{quota.remaining} of {quota.limit} Cloud requests left today
    </span>
  );
}
