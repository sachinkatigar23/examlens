import { useEffect, useId, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, ImageUp, ScanText, X } from 'lucide-react';
import Button from './Button.jsx';
import { useModels } from '../context/ModelContext.jsx';
import { photoBlobUrl, transcribePhoto, uploadPhoto } from '../api/photos.js';
import { errorMessage } from '../api/client.js';
import { formatBytes } from '../utils/format.js';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

// "Snap a doubt": photo → the vision model transcribes it → the student corrects the text → solved step by
// step from the notes (through the normal Ask stream, with photoId so the answer follows the notes' method).
export default function SnapDoubt({ spaceId, onSolve, onCancel }) {
  const { providers, confirmCloud } = useModels();
  const inputId = useId();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [step, setStep] = useState('pick'); // pick | uploading | reading | edit
  const [progress, setProgress] = useState(0);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [usedModel, setUsedModel] = useState(null);

  // Cloud reads photos best; local only if a vision model is installed (slower, weaker on handwriting).
  const visionCloud = providers.vision?.cloud && !providers.cloud.quota?.exhausted; // not when today's limit is used up
  const visionLocal = providers.vision?.local;
  const [visionMode, setVisionMode] = useState(visionCloud ? 'cloud' : 'local');
  useEffect(() => setVisionMode(visionCloud ? 'cloud' : 'local'), [visionCloud]);

  // The preview URL is not revoked on close: the chat keeps showing it next to the question.

  async function pickFile(f) {
    setError('');
    if (!f) return;
    if (!TYPES.includes(f.type)) return setError('Use a JPG, PNG or WebP photo.');
    if (f.size > MAX_BYTES) return setError(`This photo is ${formatBytes(f.size)}; the limit is 10 MB.`);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStep('uploading');
    try {
      const uploaded = await uploadPhoto(spaceId, f, setProgress);
      setPhoto(uploaded);
      await read(uploaded, visionMode);
    } catch (err) {
      setError(errorMessage(err));
      setStep('edit'); // the student can still type the question themselves
    }
  }

  async function read(target = photo, mode = visionMode) {
    if (!target) return;
    if (mode === 'cloud' && !(await confirmCloud())) return setStep('edit');
    setError('');
    setStep('reading');
    try {
      const result = await transcribePhoto(spaceId, target._id, mode);
      setText(result.text);
      setUsedModel(result);
    } catch (err) {
      setError(errorMessage(err, 'Could not read the photo. Type the question below instead.'));
    }
    setStep('edit');
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="ruled-margin card-surface mt-6 py-4 pr-4 pl-16"
      aria-label="Snap a doubt"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-semibold">Snap a doubt</h3>
          <p className="text-xs text-ink-muted">A photo of a problem or code. ExamLens reads it, you check the text, then it solves it the way your notes do.</p>
        </div>
        <button onClick={onCancel} className="rounded-md p-1 text-ink-muted hover:bg-ink/5 hover:text-ink" aria-label="Close">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {step === 'pick' && (
        <div className="mt-4 flex flex-wrap gap-2">
          {/* capture opens the camera straight away on phones; the second picker allows the gallery / files. */}
          <label htmlFor={`${inputId}-cam`} className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-medium text-paper focus-within:ring-2 focus-within:ring-pen">
            <Camera size={16} aria-hidden="true" /> Take a photo
            <input id={`${inputId}-cam`} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pickFile(e.target.files[0])} />
          </label>
          <label htmlFor={`${inputId}-file`} className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-ink/25 bg-card px-3 py-2 text-sm font-medium text-ink hover:border-ink/50 focus-within:ring-2 focus-within:ring-pen">
            <ImageUp size={16} aria-hidden="true" /> Choose an image
            <input id={`${inputId}-file`} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => pickFile(e.target.files[0])} />
          </label>
          <span className="self-center font-mono text-[11px] tracking-wider text-ink-muted uppercase">JPG · PNG · WebP · 10 MB</span>
        </div>
      )}

      {step !== 'pick' && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[9rem_1fr]">
          {preview && <img src={preview} alt="Your photo" className="max-h-48 w-full rounded-md border border-rule object-contain" />}
          <div>
            {step === 'uploading' && <p className="font-mono text-sm text-ink-muted" role="status">Uploading… {progress}%</p>}
            {step === 'reading' && (
              <p className="font-mono text-sm text-ink-muted" role="status">
                Reading the photo with {visionMode === 'cloud' ? 'Cloud' : 'the local vision model'}…
              </p>
            )}
            {step === 'edit' && (
              <>
                <label htmlFor={`${inputId}-text`} className="text-sm font-medium">
                  Check the text. Fix anything the model misread.
                </label>
                <textarea
                  id={`${inputId}-text`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={6}
                  placeholder="Type the question or code from the photo…"
                  className="mt-1.5 w-full rounded-md border border-rule bg-paper p-2 font-mono text-sm text-ink focus:border-pen focus:outline-none"
                />
                {usedModel && (
                  <p className="text-[11px] text-ink-muted">
                    Read by {usedModel.provider === 'cloud' ? 'Cloud' : 'Local'} · {usedModel.model}
                  </p>
                )}
              </>
            )}
            {error && <p className="mt-2 text-sm text-pen" role="alert">{error}</p>}

            {step === 'edit' && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button onClick={() => onSolve(text, { _id: photo?._id, localUrl: preview })} disabled={text.trim().length < 2}>
                  Solve step by step
                </Button>
                {photo && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                    <ScanText size={14} aria-hidden="true" />
                    Read again with
                    <select
                      value={visionMode}
                      onChange={(e) => {
                        setVisionMode(e.target.value);
                        read(photo, e.target.value);
                      }}
                      className="rounded border border-rule bg-card px-1 py-0.5 text-xs text-ink"
                    >
                      <option value="cloud" disabled={!visionCloud}>
                        Cloud{visionCloud ? '' : providers.cloud.quota?.exhausted ? ' (daily limit reached)' : ' (not set up)'}
                      </option>
                      <option value="local" disabled={!visionLocal}>Local{visionLocal ? '' : ' (no vision model)'}</option>
                    </select>
                  </span>
                )}
              </div>
            )}
            {visionMode === 'local' && visionLocal && (
              <p className="mt-2 text-[11px] text-ink-muted">Local vision is slower and weaker on handwriting than Cloud.</p>
            )}
            {!visionCloud && !visionLocal && step === 'edit' && (
              <p className="mt-2 text-[11px] text-ink-muted">
                No vision model is set up (Cloud needs GEMINI_API_KEY; Local needs VISION_MODEL_LOCAL). Type the question instead.
              </p>
            )}
          </div>
        </div>
      )}
      {file && step === 'pick' && <p className="text-xs">{file.name}</p>}
    </motion.section>
  );
}

// The photo next to a question in the chat. History items only have the id, so the image is fetched.
export function PhotoThumb({ spaceId, photoId, localUrl }) {
  const [url, setUrl] = useState(localUrl ?? null);
  useEffect(() => {
    if (localUrl || !photoId) return undefined;
    let objectUrl;
    photoBlobUrl(spaceId, photoId)
      .then((u) => setUrl((objectUrl = u)))
      .catch(() => {});
    return () => objectUrl && URL.revokeObjectURL(objectUrl);
  }, [spaceId, photoId, localUrl]);
  if (!url) return null;
  return <img src={url} alt="Photographed question" className="max-h-40 max-w-[60%] rounded-md border border-rule object-contain shadow-sm" />;
}
