import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { formatDate, plural } from '../utils/format.js';

export const cardReveal = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
};

// A subject notebook: coloured spine with stitching on the left, ruled page on the right.
export default function SpaceCard({ space }) {
  return (
    <motion.li variants={cardReveal}>
      <Link
        to={`/spaces/${space._id}`}
        className="group card-surface flex h-full min-h-44 overflow-hidden transition-transform duration-200 ease-out
                   hover:-translate-y-1 hover:-rotate-[0.4deg] focus-visible:-translate-y-1"
      >
        <span className="relative w-4 shrink-0" style={{ backgroundColor: space.color }} aria-hidden="true">
          <span className="absolute inset-y-3 left-1/2 border-l border-dashed border-white/50" />
        </span>
        {/* Rules shifted 10px down so the title and subject sit on the lines instead of being crossed by them. */}
        <div className="ruled flex flex-1 flex-col p-5 pt-4" style={{ backgroundPositionY: '10px' }}>
          <h3 className="text-xl leading-tight font-semibold group-hover:underline group-hover:decoration-pen group-hover:decoration-2 group-hover:underline-offset-4">
            {space.name}
          </h3>
          {space.subject && <p className="mt-1 text-sm text-ink-muted">{space.subject}</p>}
          {space.plan && <PlanLine plan={space.plan} subject={space.subject || space.name} />}
          <p className="mt-auto pt-6 font-mono text-xs text-ink-muted">
            {plural(space.documentCount ?? 0, 'file')} · updated {formatDate(space.updatedAt)}
          </p>
        </div>
      </Link>
    </motion.li>
  );
}

// "4 days to the AI exam · today: Unit 2 – Search algorithms"
function PlanLine({ plan, subject }) {
  const { daysLeft } = plan;
  const when = daysLeft > 1 ? `${daysLeft} days to the ${subject} exam` : daysLeft === 1 ? `${subject} exam tomorrow` : daysLeft === 0 ? `${subject} exam today` : null;
  if (!when) return null;
  const todo = plan.today.filter((i) => !i.done);
  return (
    <p className="mt-3 text-sm leading-snug">
      <span className="font-medium text-pen">{when}</span>
      {plan.today.length > 0 && (
        <span className="text-ink-muted">
          {' · today: '}
          {todo.length ? todo.slice(0, 2).map((i) => i.label).join(', ') + (todo.length > 2 ? ` +${todo.length - 2}` : '') : 'all done ✓'}
        </span>
      )}
    </p>
  );
}
