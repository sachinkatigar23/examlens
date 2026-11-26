import Logo from './Logo.jsx';
import PageTransition from './PageTransition.jsx';
import ThemeToggle from './ThemeToggle.jsx';

// A tiny, static "topics × years" tally: a preview of what the Analyzer will show.
const PREVIEW = [
  { topic: 'Normalization', marks: [1, 1, 1, 0, 1, 1, 1, 1] },
  { topic: 'Transactions', marks: [1, 0, 1, 1, 0, 1, 0, 1] },
  { topic: 'ER diagrams', marks: [0, 1, 0, 1, 1, 0, 1, 0] },
  { topic: 'Indexing', marks: [0, 0, 1, 0, 0, 1, 0, 0] },
];
const YEARS = ['17', '18', '19', '20', '21', '22', '23', '24'];

function TallyPreview() {
  return (
    <figure aria-label="Example: how often each DBMS topic was asked from 2017 to 2024" className="mt-10">
      <div className="grid grid-cols-[7.5rem_repeat(8,minmax(0,1fr))] gap-1.5 font-mono text-[11px] text-ink-muted">
        <span />
        {YEARS.map((y) => (
          <span key={y} className="text-center">’{y}</span>
        ))}
        {PREVIEW.map((row) => (
          <div key={row.topic} className="contents">
            <span className="truncate pr-2 font-sans text-xs text-ink">{row.topic}</span>
            {row.marks.map((m, i) => (
              <span
                key={i}
                className={`h-5 rounded-[3px] ${m ? 'bg-highlight' : 'border border-dashed border-rule'}`}
              />
            ))}
          </div>
        ))}
      </div>
      <figcaption className="mt-3 text-xs text-ink-muted">Each filled cell: the topic showed up that year.</figcaption>
    </figure>
  );
}

export default function AuthLayout({ children }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="ruled ruled-margin hidden border-r border-rule px-16 py-12 lg:flex lg:flex-col lg:pl-24">
        <Logo to="/" />
        <div className="my-auto max-w-md">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-pen">Before the paper</p>
          <h1 className="mt-4 text-4xl leading-[1.15] font-medium xl:text-5xl">
            Seven of the last eight DBMS papers asked about <span className="highlighted">normalization</span>.
            <br />
            <em className="font-normal">Now you know.</em>
          </h1>
          <TallyPreview />
        </div>
        <p className="text-xs text-ink-muted">Runs on your machine. Your notes never leave it.</p>
      </aside>

      <main className="flex flex-col px-6 py-10 sm:px-12">
        <div className="flex items-center justify-between">
          <span className="lg:hidden"><Logo to="/" /></span>
          <ThemeToggle className="ml-auto" />
        </div>
        <PageTransition className="mx-auto my-auto w-full max-w-sm py-10">{children}</PageTransition>
      </main>
    </div>
  );
}
