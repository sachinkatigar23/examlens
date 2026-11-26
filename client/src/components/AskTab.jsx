import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, BookOpenText, Eraser, Square } from 'lucide-react';
import AnswerText from './AnswerText.jsx';
import CitationSticker from './CitationSticker.jsx';
import FormError from './FormError.jsx';
import { clearMessages, listMessages, streamAnswer } from '../api/ask.js';
import { getAnalysis } from '../api/analysis.js';
import { errorMessage } from '../api/client.js';

const NOT_FOUND_PREFIX = "I couldn't find this in your notes";

const reveal = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: 'easeOut' },
};

export default function AskTab({ spaceId }) {
  const [messages, setMessages] = useState(null); // [{ id, role, content, citations, pending?, error? }]
  const [question, setQuestion] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const abortRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    listMessages(spaceId)
      .then((list) => setMessages(list.map((m) => ({ ...m, id: m._id }))))
      .catch((err) => {
        setError(errorMessage(err));
        setMessages([]);
      });
    // Suggest questions about the topics exams ask most (if papers are analysed already).
    getAnalysis(spaceId)
      .then((a) => setSuggestions(a.hotTopics.slice(0, 3).map((t) => `Explain ${t.name.toLowerCase()} for a 10-mark answer`)))
      .catch(() => {});
    return () => abortRef.current?.abort();
  }, [spaceId]);

  // Keep the newest text in view while it streams in.
  const lastContent = messages?.[messages.length - 1]?.content;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages?.length, lastContent]);

  const patchLast = (changes) =>
    setMessages((list) => list.map((m, i) => (i === list.length - 1 ? { ...m, ...(typeof changes === 'function' ? changes(m) : changes) } : m)));

  async function ask(text) {
    const q = text.trim();
    if (q.length < 2 || streaming) return;
    setError('');
    setQuestion('');
    setStreaming(true);
    setMessages((list) => [
      ...list,
      { id: `q-${Date.now()}`, role: 'user', content: q },
      { id: `a-${Date.now()}`, role: 'assistant', content: '', citations: [], pending: true },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { citations } = await streamAnswer(spaceId, q, {
        signal: controller.signal,
        onToken: (t) => patchLast((m) => ({ content: m.content + t })),
      });
      patchLast({ citations, pending: false });
    } catch (err) {
      if (err.name === 'AbortError') patchLast((m) => ({ pending: false, stopped: true, content: m.content }));
      else patchLast({ pending: false, error: err.message });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  async function handleClear() {
    try {
      await clearMessages(spaceId);
      setMessages([]);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (messages === null) return <p className="font-mono text-sm text-ink-muted" role="status">Finding your notes…</p>;

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <FormError message={error} />

      {messages.length === 0 ? (
        <EmptyAsk suggestions={suggestions} onPick={ask} />
      ) : (
        <>
          <div className="mb-2 flex justify-end">
            <button
              onClick={handleClear}
              disabled={streaming}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-ink/5 hover:text-ink disabled:opacity-50"
            >
              <Eraser size={14} aria-hidden="true" /> Clear chat
            </button>
          </div>
          <ol className="space-y-6" aria-live="polite" aria-busy={streaming}>
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.li key={m.id} {...reveal}>
                  {m.role === 'user' ? <Question text={m.content} /> : <Answer message={m} />}
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </>
      )}
      <div ref={endRef} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="card-surface sticky bottom-4 mt-8 flex items-end gap-2 p-2 pl-4"
      >
        <label htmlFor="ask-input" className="sr-only">Ask a question about your notes</label>
        <textarea
          id="ask-input"
          rows={1}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              ask(question);
            }
          }}
          maxLength={2000}
          placeholder="Ask from your notes… e.g. What is BCNF?"
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-base text-ink placeholder:text-ink-muted/70 focus:outline-none field-sizing-content"
        />
        {streaming ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="grid size-10 shrink-0 place-items-center rounded-md border border-ink/25 text-ink hover:border-ink/60"
            aria-label="Stop the answer"
          >
            <Square size={14} fill="currentColor" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={question.trim().length < 2}
            className="grid size-10 shrink-0 place-items-center rounded-md bg-ink text-paper disabled:opacity-40"
            aria-label="Ask"
          >
            <ArrowUp size={18} aria-hidden="true" />
          </button>
        )}
      </form>
      <p className="mt-2 text-center text-xs text-ink-muted">
        Answers come only from the files in this notebook, with the page they came from.
      </p>
    </div>
  );
}

function Question({ text }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-md rounded-br-none bg-ink px-4 py-2.5 text-paper shadow-sm">{text}</p>
    </div>
  );
}

function Answer({ message }) {
  const notFound = message.content.startsWith(NOT_FOUND_PREFIX);
  const uniqueSources = message.citations?.filter(
    (c, i, all) => all.findIndex((x) => x.documentId === c.documentId && x.page === c.page) === i,
  );

  return (
    <article className={`ruled-margin card-surface py-4 pr-5 pl-16 ${notFound ? 'opacity-90' : ''}`}>
      <span className="absolute top-4 left-4 font-mono text-[10px] uppercase tracking-widest text-pen">Ans.</span>
      {message.content ? (
        notFound ? (
          <p className="flex items-start gap-2 text-ink-muted">
            <BookOpenText size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{message.content}</span>
          </p>
        ) : (
          <AnswerText text={message.content} citations={message.citations} />
        )
      ) : (
        message.pending && <ReadingDots />
      )}
      {message.pending && message.content && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-ink/60 align-middle" />}
      {message.stopped && <p className="mt-2 text-xs text-ink-muted">Stopped.</p>}
      {message.error && <p className="mt-2 border-l-2 border-pen pl-3 text-sm text-pen">{message.error}</p>}

      {!message.pending && uniqueSources?.length > 0 && (
        <footer className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-rule pt-3 text-xs text-ink-muted">
          <span>From your notes:</span>
          {uniqueSources.map((c) => (
            <span key={`${c.documentId}-${c.page}`} className="inline-flex items-center gap-1">
              <CitationSticker page={c.page} sources={[c]} />
              <span className="max-w-40 truncate">{c.originalName}</span>
            </span>
          ))}
        </footer>
      )}
    </article>
  );
}

function ReadingDots() {
  return (
    <p className="flex items-center gap-2 font-mono text-sm text-ink-muted" role="status">
      Reading your notes
      <span className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-ink-muted"
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </span>
    </p>
  );
}

function EmptyAsk({ suggestions, onPick }) {
  const picks = suggestions.length ? suggestions : ['Summarise the most important definitions', 'Explain the first unit in simple words'];
  return (
    <div className="ruled ruled-margin card-surface px-6 py-10 pl-16">
      <h2 className="text-2xl font-semibold">Ask your notes.</h2>
      <p className="mt-2 max-w-lg text-ink-muted">
        Every answer is written only from the files you uploaded, and every fact is stuck to the page it came from.
        If your notes don't cover it, ExamLens will say so instead of guessing.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {picks.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-full border border-ink/20 bg-card px-3 py-1.5 text-sm text-ink hover:border-ink/50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
