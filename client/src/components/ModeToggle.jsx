import { useId } from 'react';
import { Cloud, HardDrive } from 'lucide-react';
import { useModels } from '../context/ModelContext.jsx';

// Local (Ollama, private) / Cloud (Gemini) switch for one screen or one request.
export default function ModeToggle({ mode, onChange, className = '' }) {
  const { providers, confirmCloud } = useModels();
  const name = useId();
  const cloudOff = !providers.cloud.available;

  async function pick(next) {
    if (next === mode) return;
    if (next === 'cloud' && !(await confirmCloud())) return; // privacy note the first time
    onChange(next);
  }

  const options = [
    { value: 'local', label: 'Local', Icon: HardDrive, title: `Runs on this computer (${providers.local.model ?? 'Ollama'}). Nothing leaves it.` },
    {
      value: 'cloud',
      label: 'Cloud',
      Icon: Cloud,
      title: cloudOff
        ? 'Cloud is not set up: add GEMINI_API_KEY to ai-service/.env'
        : `Google Gemini (${providers.cloud.model}). Sends only the question and the note passages used.`,
    },
  ];

  return (
    <fieldset className={`inline-flex rounded-full border border-rule bg-paper p-0.5 text-xs ${className}`}>
      <legend className="sr-only">Model</legend>
      {options.map(({ value, label, Icon, title }) => {
        const disabled = value === 'cloud' && cloudOff;
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
              {disabled && <span className="sr-only"> (not set up)</span>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
