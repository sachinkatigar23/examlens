import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, RefreshCw, Square } from 'lucide-react';
import Markdown from '../components/Markdown.jsx';
import Button from '../components/Button.jsx';
import FormError from '../components/FormError.jsx';
import ModeToggle from '../components/ModeToggle.jsx';
import ModelBadge from '../components/ModelBadge.jsx';
import AnswerError from '../components/AnswerError.jsx';
import { getSpace } from '../api/spaces.js';
import { getRevisionSheet, streamRevisionSheet } from '../api/revision.js';
import { errorMessage } from '../api/client.js';
import { useModeState } from '../context/ModelContext.jsx';

// Last-night revision sheet: one printable page per unit. The sheet (definitions, diagrams, formulas/code,
// must-remember) is written once from the notes and cached; the top questions come from the question data.
export default function RevisionPage() {
  const { spaceId, unit } = useParams();
  const [space, setSpace] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [live, setLive] = useState(null); // streaming text
  const [genError, setGenError] = useState(null);
  const [mode, setMode] = useModeState();
  const abortRef = useRef(null);

  useEffect(() => {
    Promise.all([getSpace(spaceId), getRevisionSheet(spaceId, unit)])
      .then(([s, d]) => {
        setSpace(s);
        setData(d);
      })
      .catch((err) => setError(errorMessage(err)));
    return () => abortRef.current?.abort();
  }, [spaceId, unit]);

  async function generate(useMode = mode) {
    setGenError(null);
    setLive('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamRevisionSheet(spaceId, unit, { mode: useMode }, { signal: controller.signal, onToken: (t) => setLive((s) => s + t) });
      setData(await getRevisionSheet(spaceId, unit));
    } catch (err) {
      if (err.name !== 'AbortError') setGenError({ message: err.message, code: err.code, mode: useMode });
    } finally {
      setLive(null);
      abortRef.current = null;
    }
  }

  if (error) return <FormError message={error} />;
  if (!data) return <p className="font-mono text-sm text-ink-muted" role="status">Fetching the sheet…</p>;
  const { sheet } = data;

  return (
    <article className="revision-sheet mx-auto max-w-3xl">
      <div className="no-print mb-8 flex flex-wrap items-center gap-3">
        <Link to={`/spaces/${spaceId}?tab=study`} className="mr-auto inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft size={16} aria-hidden="true" /> Back to Study
        </Link>
        <ModeToggle mode={mode} onChange={setMode} />
        {live !== null ? (
          <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
            <Square size={14} aria-hidden="true" /> Stop
          </Button>
        ) : (
          <Button variant={sheet ? 'secondary' : 'primary'} onClick={() => generate()}>
            <RefreshCw size={16} aria-hidden="true" /> {sheet ? 'Regenerate' : 'Write the sheet'}
          </Button>
        )}
        {sheet && (
          <Button onClick={() => window.print()}>
            <Printer size={16} aria-hidden="true" /> Print / Save as PDF
          </Button>
        )}
      </div>

      <header className="border-b-2 border-ink pb-3">
        <p className="font-mono text-xs tracking-[0.2em] text-pen uppercase">Last-night revision · {space.name}</p>
        <h1 className="mt-1 text-3xl font-semibold">
          {data.unit}
          {data.unitTitle && <span className="font-normal text-ink-muted"> · {data.unitTitle}</span>}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">{data.topics.join(' · ')}</p>
      </header>

      <div className="mt-5">
        {live !== null ? (
          live ? <Markdown text={live} /> : <p className="font-mono text-sm text-ink-muted" role="status">Reading your {data.unit} notes…</p>
        ) : sheet ? (
          <Markdown text={sheet.content} citations={sheet.citations} />
        ) : (
          !genError && (
            <p className="no-print text-ink-muted">
              Not written yet. “Write the sheet” builds it once from your {data.unit} notes; it's saved for next time.
            </p>
          )
        )}
        <AnswerError error={genError} mode={genError?.mode} onUseCloud={() => generate('cloud')} />
      </div>

      {data.topQuestions.length > 0 && (
        <section className="print-avoid-break mt-6">
          <h2 className="font-serif text-xl font-semibold">Most likely questions</h2>
          <p className="text-xs text-ink-muted">From your past papers and question bank: most years asked first, then marks.</p>
          <ol className="mt-2 space-y-1.5 text-sm">
            {data.topQuestions.map((q, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-5 shrink-0 font-mono text-ink-muted">{i + 1}.</span>
                <span className="flex-1">{q.text}</span>
                {q.years.length > 0 && <span className="shrink-0 font-mono text-[11px] text-ink-muted">{q.years.join(', ')}</span>}
                <span className="shrink-0 font-mono text-pen">[{q.marks}]</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {sheet && live === null && (
        <p className="no-print mt-6 border-t border-rule pt-3">
          <ModelBadge provider={sheet.provider} model={sheet.model} />
        </p>
      )}
    </article>
  );
}
