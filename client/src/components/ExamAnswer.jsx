import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import Markdown from './Markdown.jsx';
import ModelBadge from './ModelBadge.jsx';
import AnswerError from './AnswerError.jsx';
import { getAnswer, streamExamAnswer } from '../api/bank.js';
import { errorMessage } from '../api/client.js';

// The marks-aware exam answer for one stored question (question bank or past paper). Shows the cached answer;
// otherwise writes it (streamed) and the server caches it. "Regenerate" replaces it.
export default function ExamAnswer({ spaceId, question, mode, onSaved }) {
  const [answer, setAnswer] = useState(undefined); // undefined = loading, null = none yet
  const [streamText, setStreamText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [usedMode, setUsedMode] = useState(mode);
  const abortRef = useRef(null);

  useEffect(() => {
    let alive = true;
    getAnswer(spaceId, question._id)
      .then((a) => alive && setAnswer(a))
      .catch((err) => alive && (setAnswer(null), setError({ message: errorMessage(err) })));
    return () => {
      alive = false;
      abortRef.current?.abort();
    };
  }, [spaceId, question._id]);

  async function generate(useMode = mode) {
    setBusy(true);
    setError(null);
    setStreamText('');
    setUsedMode(useMode);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const done = await streamExamAnswer(
        spaceId,
        question._id,
        { mode: useMode, marks: question.marks ?? undefined },
        { signal: controller.signal, onToken: (t) => setStreamText((s) => s + t) },
      );
      const saved = await getAnswer(spaceId, question._id);
      setAnswer(saved ?? { content: '', citations: done.citations, provider: done.provider, model: done.model, marks: done.marks });
      setStreamText('');
      onSaved?.(saved);
    } catch (err) {
      if (err.name !== 'AbortError') setError({ message: err.message, code: err.code });
    } finally {
      setBusy(false);
    }
  }

  if (answer === undefined) return <p className="font-mono text-xs text-ink-muted" role="status">Looking for a saved answer…</p>;

  const marksChanged = answer && question.marks && answer.marks !== question.marks;
  return (
    <div className="mt-3 rounded-md border border-rule bg-card p-4">
      {busy ? (
        streamText ? (
          <Markdown text={streamText} />
        ) : (
          <p className="font-mono text-sm text-ink-muted" role="status">Writing a {question.marks ?? 5}-mark answer from your notes…</p>
        )
      ) : answer ? (
        <Markdown text={answer.content} citations={answer.citations} />
      ) : (
        !error && (
          <button onClick={() => generate()} className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper">
            Write the {question.marks ?? 5}-mark answer
          </button>
        )
      )}

      <AnswerError error={error} mode={usedMode} onUseCloud={() => generate('cloud')} />

      {!busy && (answer || error) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
          {answer && <ModelBadge provider={answer.provider} model={answer.model} marks={answer.marks} />}
          {marksChanged && <span className="text-xs text-pen">Written for {answer.marks} marks; marks are now {question.marks}.</span>}
          <button
            onClick={() => generate()}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-ink/5 hover:text-ink"
          >
            <RefreshCw size={12} aria-hidden="true" /> {answer ? 'Regenerate' : 'Try again'}
          </button>
        </div>
      )}
    </div>
  );
}
