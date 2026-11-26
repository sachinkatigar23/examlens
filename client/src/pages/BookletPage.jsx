import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import Markdown from '../components/Markdown.jsx';
import Button from '../components/Button.jsx';
import FormError from '../components/FormError.jsx';
import { getSpace } from '../api/spaces.js';
import { listAnswers } from '../api/bank.js';
import { errorMessage } from '../api/client.js';

const shortNumber = (n) => n?.replace(/^U\d+-/, '').replace(/^\d+M/, '') || '';

// Print-friendly answer booklet: every saved question-bank answer of one unit (or all), in unit → topic order.
// The browser's "Print → Save as PDF" makes the PDF; print CSS hides the app chrome.
export default function BookletPage() {
  const { spaceId } = useParams();
  const [params] = useSearchParams();
  const unit = params.get('unit') || '';
  const [space, setSpace] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getSpace(spaceId), listAnswers(spaceId, unit)])
      .then(([s, d]) => {
        setSpace(s);
        setData(d);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [spaceId, unit]);

  if (error) return <FormError message={error} />;
  if (!data) return <p className="font-mono text-sm text-ink-muted" role="status">Binding the booklet…</p>;

  const sections = arrange(data);
  const answered = data.questions.filter((q) => q.answer).length;

  return (
    <article className="mx-auto max-w-3xl">
      <div className="no-print mb-8 flex flex-wrap items-center justify-between gap-3">
        <Link to={`/spaces/${spaceId}?tab=bank`} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft size={16} aria-hidden="true" /> Back to the question bank
        </Link>
        <Button onClick={() => window.print()}>
          <Printer size={16} aria-hidden="true" /> Print / Save as PDF
        </Button>
      </div>

      <header className="border-b-2 border-ink pb-4">
        <p className="font-mono text-xs tracking-[0.2em] text-pen uppercase">Answer booklet</p>
        <h1 className="mt-2 text-4xl font-semibold">{space.name}</h1>
        <p className="mt-1 text-ink-muted">
          {unit || 'All units'} · {answered} of {data.questions.length} questions answered from your notes
        </p>
      </header>
      {answered < data.questions.length && (
        <p className="no-print mt-4 text-sm text-ink-muted">
          Unanswered questions are listed without an answer. Use “Answer all” in the question bank to fill them in.
        </p>
      )}

      {sections.map((s) => (
        <section key={s.unit} className="mt-10">
          <h2 className="text-2xl font-semibold">
            {s.unit}
            {s.unitTitle && <span className="font-normal text-ink-muted"> · {s.unitTitle}</span>}
          </h2>
          {s.topics.map((t) => (
            <div key={t.name} className="mt-6">
              <h3 className="font-mono text-xs tracking-wider text-pen uppercase">{t.name}</h3>
              {t.questions.map((q) => (
                <div key={q._id} className="print-avoid-break mt-4 border-b border-rule pb-5">
                  <p className="flex gap-3 font-medium">
                    <span className="font-mono text-sm text-ink-muted">Q{shortNumber(q.number)}.</span>
                    <span className="flex-1">{q.text}</span>
                    <span className="font-mono text-sm text-pen">[{q.marks ?? 5}]</span>
                  </p>
                  <div className="mt-2 pl-8">
                    {q.answer ? <Markdown text={q.answer.content} citations={q.answer.citations} /> : <p className="text-sm text-ink-muted italic">Not answered yet.</p>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
    </article>
  );
}

function arrange({ topics, questions }) {
  const topicOf = new Map(topics.map((t) => [t._id, t]));
  const units = [...new Set([...topics.map((t) => t.unit), ...questions.map((q) => q.unit ?? 'Other questions')])];
  return units
    .map((unit) => {
      const qs = questions.filter((q) => (q.unit ?? 'Other questions') === unit);
      const byTopic = new Map();
      for (const q of qs) {
        const t = topicOf.get(q.topic);
        const name = t?.name ?? 'Other';
        if (!byTopic.has(name)) byTopic.set(name, { name, order: t?.order ?? 1e9, questions: [] });
        byTopic.get(name).questions.push(q);
      }
      return {
        unit,
        unitTitle: topics.find((t) => t.unit === unit)?.unitTitle ?? '',
        topics: [...byTopic.values()]
          .sort((a, b) => a.order - b.order)
          .map((t) => ({ ...t, questions: t.questions.sort((a, b) => (a.marks ?? 5) - (b.marks ?? 5)) })),
      };
    })
    .filter((s) => s.topics.length);
}
