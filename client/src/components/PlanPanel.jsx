import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarDays, ChevronDown, Printer, X } from 'lucide-react';
import Button from './Button.jsx';
import FormError from './FormError.jsx';
import { deletePlan, getPlan, setExamDate, tickPlanItem } from '../api/plan.js';
import { errorMessage } from '../api/client.js';
import { formatDay, localToday } from '../utils/format.js';

// Exam countdown: set the exam date, get a day-by-day plan (most-asked topics first to make the cut, learnt in
// syllabus order), tick things off. Missed days are re-planned automatically from today.
export default function PlanPanel({ spaceId, onOpenTopic, onChanged, refreshKey }) {
  const [plan, setPlan] = useState(undefined); // undefined = loading, null = no exam date
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    getPlan(spaceId).then(setPlan).catch((err) => (setPlan(null), setError(errorMessage(err))));
  }, [spaceId, refreshKey]);

  async function save(examDate = date) {
    setBusy(true);
    setError('');
    try {
      setPlan(await setExamDate(spaceId, examDate));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function tick(item) {
    try {
      setPlan(await tickPlanItem(spaceId, item._id, !item.done));
      if (item.kind === 'topic') onChanged?.(); // the topic's "studied" mark in the unit list
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function clear() {
    await deletePlan(spaceId).catch(() => {});
    setPlan(null);
  }

  if (plan === undefined) return null;

  if (!plan) {
    return (
      <section className="card-surface mb-8 flex flex-wrap items-end gap-3 p-4" aria-label="Exam countdown">
        <div className="mr-auto">
          <h3 className="flex items-center gap-2 font-serif text-lg font-semibold">
            <CalendarDays size={18} className="text-pen" aria-hidden="true" /> When is the exam?
          </h3>
          <p className="text-sm text-ink-muted">ExamLens plans every day until then, most-asked topics first.</p>
        </div>
        <label className="text-sm">
          <span className="sr-only">Exam date</span>
          <input
            type="date"
            min={localToday()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-rule bg-paper px-2 py-2 text-sm text-ink"
          />
        </label>
        <Button onClick={() => save()} disabled={!date || busy}>Make my plan</Button>
        <FormError message={error} />
      </section>
    );
  }

  const today = localToday();
  const upcoming = plan.days.filter((d) => d.date >= today);
  const visible = showAll ? upcoming : upcoming.slice(0, 3);
  const total = plan.days.flatMap((d) => d.items);
  const done = total.filter((i) => i.done).length;

  return (
    <section className="card-surface mb-8 p-4 sm:p-5" aria-label="Exam countdown">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h3 className="font-serif text-2xl font-semibold">
          <span className="text-pen">{countdown(plan.daysLeft)}</span>
        </h3>
        <p className="text-sm text-ink-muted">Exam on {formatDay(plan.examDate)} · {done}/{total.length} done</p>
        <button onClick={clear} className="ml-auto inline-flex items-center gap-1 text-xs text-ink-muted hover:text-pen">
          <X size={12} aria-hidden="true" /> Remove exam date
        </button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-rule" aria-hidden="true">
        <div className="h-full bg-highlight transition-[width] duration-300" style={{ width: `${total.length ? (done / total.length) * 100 : 0}%` }} />
      </div>
      {plan.justReplanned && (
        <p className="mt-2 text-sm text-pen" role="status">You missed a day, so the plan was redone from today. Nothing studied is lost.</p>
      )}
      {plan.leftOut > 0 && (
        <p className="mt-2 text-xs text-ink-muted">
          {plan.leftOut} lower-priority topics didn't fit in the days left; they come back in if you get ahead.
        </p>
      )}

      <ol className="mt-4 grid gap-3 md:grid-cols-3">
        {visible.map((day) => (
          <motion.li
            key={day.date}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`rounded-md border p-3 ${day.date === today ? 'border-ink/60 bg-paper' : 'border-rule'}`}
          >
            <p className="font-mono text-[11px] tracking-wider uppercase">
              <span className={day.date === today ? 'text-pen' : 'text-ink-muted'}>{day.date === today ? 'Today' : formatDay(day.date)}</span>
              {day.items.some((i) => i.kind === 'revision') && <span className="text-ink-muted"> · revision day</span>}
            </p>
            <ul className="mt-2 space-y-1.5">
              {day.items.map((item) => (
                <PlanItem key={item._id} spaceId={spaceId} item={item} onTick={() => tick(item)} onOpenTopic={onOpenTopic} />
              ))}
            </ul>
          </motion.li>
        ))}
      </ol>
      {upcoming.length > 3 && (
        <button onClick={() => setShowAll((s) => !s)} className="mt-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
          <ChevronDown size={14} className={showAll ? 'rotate-180' : ''} aria-hidden="true" />
          {showAll ? 'Show the next 3 days only' : `Show all ${upcoming.length} days`}
        </button>
      )}
      <FormError message={error} />
    </section>
  );
}

const countdown = (n) => (n > 1 ? `${n} days to the exam` : n === 1 ? 'Exam tomorrow' : n === 0 ? 'Exam today. Good luck!' : 'The exam is over');

function PlanItem({ spaceId, item, onTick, onOpenTopic }) {
  const label =
    item.kind === 'revision' ? (
      <Link to={`/spaces/${spaceId}/revision/${encodeURIComponent(item.unit)}`} className="inline-flex items-center gap-1 underline decoration-rule underline-offset-2 hover:decoration-pen">
        <Printer size={12} aria-hidden="true" /> {item.label}
      </Link>
    ) : item.kind === 'repeats' ? (
      <Link to={`/spaces/${spaceId}?tab=analyzer`} className="underline decoration-rule underline-offset-2 hover:decoration-pen">
        {item.label}
      </Link>
    ) : (
      <button onClick={() => onOpenTopic?.(item.topic, item.unit)} className="text-left hover:underline hover:decoration-pen">
        <span className="font-mono text-[10px] text-ink-muted">{item.unit} · </span>
        {item.label}
      </button>
    );
  return (
    <li className="flex items-start gap-2 text-sm leading-snug">
      <input
        type="checkbox"
        checked={item.done}
        onChange={onTick}
        aria-label={`Done: ${item.label}`}
        className="mt-0.5 size-4 shrink-0 accent-[var(--pen)]"
      />
      <span className={item.done ? 'text-ink-muted line-through decoration-pen/60' : ''}>{label}</span>
    </li>
  );
}
