import { useState } from 'react';
import { PenLine } from 'lucide-react';
import ExamAnswer from './ExamAnswer.jsx';
import ModeToggle from './ModeToggle.jsx';
import { useModeState } from '../context/ModelContext.jsx';

// "Answer this from my notes" under a past-paper question (Analyzer cell drill-down, "Asked again").
// Uses the same marks-aware pipeline and cache as the Question Bank.
export default function AnswerToggle({ spaceId, question }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useModeState();
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink underline decoration-pen decoration-2 underline-offset-4 hover:decoration-4"
        >
          <PenLine size={13} aria-hidden="true" /> {open ? 'Hide the answer' : 'Answer this from my notes'}
        </button>
        {open && <ModeToggle mode={mode} onChange={setMode} />}
      </div>
      {open && <ExamAnswer spaceId={spaceId} question={question} mode={mode} />}
    </div>
  );
}
