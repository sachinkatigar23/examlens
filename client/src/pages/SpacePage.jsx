import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, MessageSquareText, Pencil, Table2, Trash2 } from 'lucide-react';
import PageTransition from '../components/PageTransition.jsx';
import DocumentsTab from '../components/DocumentsTab.jsx';
import SpaceFormDialog from '../components/SpaceFormDialog.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import Button from '../components/Button.jsx';
import FormError from '../components/FormError.jsx';
import { deleteSpace, getSpace, updateSpace } from '../api/spaces.js';
import { errorMessage } from '../api/client.js';

const TABS = [
  { id: 'documents', label: 'Documents' },
  { id: 'ask', label: 'Ask' },
  { id: 'analyzer', label: 'Analyzer' },
];

export default function SpacePage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'documents';

  const [space, setSpace] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setSpace(null);
    getSpace(spaceId).then(setSpace).catch((err) => setError(errorMessage(err)));
  }, [spaceId]);

  if (error && !space) {
    return (
      <PageTransition>
        <BackLink />
        <h1 className="mt-6 text-3xl font-semibold">This notebook isn't on your desk.</h1>
        <p className="mt-3 text-ink-muted">{error}</p>
      </PageTransition>
    );
  }
  if (!space) return <p className="font-mono text-sm text-ink-muted" role="status">Opening notebook…</p>;

  return (
    <PageTransition>
      <BackLink />

      <header className="mt-6 flex flex-wrap items-start justify-between gap-4 border-l-[6px] pl-4" style={{ borderColor: space.color }}>
        <div>
          <h1 className="text-3xl font-semibold sm:text-4xl">{space.name}</h1>
          {space.subject && <p className="mt-1 text-ink-muted">{space.subject}</p>}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" onClick={() => setEditing(true)}>
            <Pencil size={16} aria-hidden="true" /> Edit
          </Button>
          <Button variant="ghost" onClick={() => setDeleting(true)} className="hover:text-pen">
            <Trash2 size={16} aria-hidden="true" /> Delete
          </Button>
        </div>
      </header>

      <FormError message={error} />

      <nav className="mt-8 flex gap-6 border-b border-rule" aria-label="Notebook sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setParams(t.id === 'documents' ? {} : { tab: t.id }, { replace: true })}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`relative pb-3 text-sm font-medium transition-colors duration-150 ${
              tab === t.id ? 'text-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {t.label}
            {tab === t.id && (
              <motion.span
                layoutId="tab-underline"
                className="absolute inset-x-0 -bottom-px h-0.5 bg-pen"
                transition={{ duration: 0.25, ease: 'easeOut' }}
              />
            )}
          </button>
        ))}
      </nav>

      <div className="mt-8">
        {tab === 'documents' && <DocumentsTab spaceId={space._id} />}
        {tab === 'ask' && (
          <ComingNext
            Icon={MessageSquareText}
            title="Ask ExamLens"
            text="Ask a doubt and get an answer written only from your notes, with page numbers you can check. It switches on once the AI service is running."
          />
        )}
        {tab === 'analyzer' && (
          <ComingNext
            Icon={Table2}
            title="Analyzer"
            text="A topics × years grid of your past papers: what's asked every year, what's asked again word for word, and what you can safely skim."
          />
        )}
      </div>

      <SpaceFormDialog
        open={editing}
        onClose={() => setEditing(false)}
        initial={space}
        onSubmit={async (form) => setSpace(await updateSpace(space._id, form))}
        title="Edit notebook"
        submitLabel="Save changes"
      />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this notebook?"
        message={`"${space.name}" and every file in it will be deleted. This can't be undone.`}
        confirmLabel="Delete notebook"
        onConfirm={async () => {
          try {
            await deleteSpace(space._id);
            navigate('/dashboard', { replace: true });
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      />
    </PageTransition>
  );
}

function BackLink() {
  return (
    <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
      <ArrowLeft size={16} aria-hidden="true" /> All notebooks
    </Link>
  );
}

function ComingNext({ Icon, title, text }) {
  return (
    <div className="ruled ruled-margin card-surface max-w-2xl px-6 py-10 pl-16">
      <Icon size={22} className="text-pen" aria-hidden="true" />
      <h2 className="mt-3 text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-ink-muted">{text}</p>
    </div>
  );
}
