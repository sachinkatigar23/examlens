import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import PageTransition from '../components/PageTransition.jsx';
import SpaceCard, { cardReveal } from '../components/SpaceCard.jsx';
import SpaceFormDialog from '../components/SpaceFormDialog.jsx';
import Button from '../components/Button.jsx';
import FormError from '../components/FormError.jsx';
import RedPenUnderline from '../components/RedPenUnderline.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { createSpace, listSpaces } from '../api/spaces.js';
import { errorMessage } from '../api/client.js';
import { useReadOnly } from '../hooks/usePublicConfig.js';

export default function DashboardPage() {
  const readOnly = useReadOnly();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState(null); // null = still loading
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listSpaces()
      .then(setSpaces)
      .catch((err) => {
        setError(errorMessage(err));
        setSpaces([]);
      });
  }, []);

  async function handleCreate(form) {
    const space = await createSpace(form);
    navigate(`/spaces/${space._id}`);
  }

  const firstName = user?.name?.split(' ')[0];

  return (
    <PageTransition>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-muted">Hi {firstName}</p>
          <h1 className="mt-2 text-4xl font-semibold sm:text-5xl">
            Your <RedPenUnderline>notebooks</RedPenUnderline>
          </h1>
          <p className="mt-4 max-w-xl text-ink-muted">
            One per subject. Drop in the syllabus, your notes and a few past papers, and ExamLens works out what
            keeps getting asked.
          </p>
        </div>
        {!readOnly && (
          <Button onClick={() => setCreating(true)}>
            <Plus size={18} aria-hidden="true" /> New notebook
          </Button>
        )}
      </div>

      <div className="mt-6">
        <FormError message={error} />
      </div>

      {spaces === null ? (
        <p className="mt-10 font-mono text-sm text-ink-muted" role="status">Fetching your notebooks…</p>
      ) : spaces.length === 0 && !error ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <motion.ul
          className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.05 } } }}
        >
          {spaces.map((space) => (
            <SpaceCard key={space._id} space={space} />
          ))}
          <motion.li variants={cardReveal}>
            <button
              onClick={() => setCreating(true)}
              className="flex h-full min-h-44 w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-rule
                         text-ink-muted transition-colors duration-150 hover:border-ink/40 hover:text-ink"
            >
              <Plus size={22} aria-hidden="true" />
              <span className="text-sm font-medium">Another subject</span>
            </button>
          </motion.li>
        </motion.ul>
      )}

      <SpaceFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSubmit={handleCreate}
        title="New notebook"
        submitLabel="Create notebook"
      />
    </PageTransition>
  );
}

function EmptyState({ onCreate }) {
  return (
    <div className="ruled ruled-margin card-surface mt-10 px-6 py-14 pl-16 sm:pl-20">
      <h2 className="text-2xl font-semibold">Nothing on the desk yet.</h2>
      <p className="mt-3 max-w-md text-ink-muted">
        Start with the subject whose exam is closest. You'll need its syllabus, whatever notes you have, and as many
        past papers as you can find.
      </p>
      <Button className="mt-6" onClick={onCreate}>
        <Plus size={18} aria-hidden="true" /> Create your first notebook
      </Button>
    </div>
  );
}
