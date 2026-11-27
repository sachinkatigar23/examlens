import { Lesson } from '../models/Lesson.js';
import { Question } from '../models/Question.js';
import { StudyPlan } from '../models/StudyPlan.js';
import { Topic } from '../models/Topic.js';

// Exam countdown planner: a plain algorithm, no LLM.
//   priority(topic) = 2 × (past-paper years it was asked in) + (highest marks asked) / 5
//                     + 1 if it is in the question bank + 0.25 per bank question (up to 6)
//   Studied topics are left out. Study days run from today to the day before the exam's eve; the eve is the
//   revision day (last-night sheets + "Asked again" questions). Each day gets at most MAX_PER_DAY topics in
//   syllabus order; if there are more topics than room, the lowest-priority ones are left out (and counted).
const MAX_PER_DAY = 5;

// --- dates as local "YYYY-MM-DD" strings ---
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (s) => DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
export const serverToday = () => new Date().toISOString().slice(0, 10);

// Topics the student has finished: ticked in Study mode, or ticked in the plan (kept across re-plans).
export async function studiedTopicIds(spaceId) {
  const [lessons, plan] = await Promise.all([
    Lesson.find({ space: spaceId, studied: true }).distinct('topic'),
    StudyPlan.findOne({ space: spaceId }).lean(),
  ]);
  return new Set([...lessons, ...(plan?.studiedTopics ?? [])].map(String));
}

// { topicId: { paperYears, maxMarks, bankCount } }
export async function topicStats(spaceId) {
  const rows = await Question.aggregate([
    { $match: { space: spaceId, topic: { $ne: null } } },
    {
      $group: {
        _id: '$topic',
        paperYears: { $addToSet: { $cond: [{ $eq: ['$kind', 'important'] }, null, '$year'] } },
        bankCount: { $sum: { $cond: [{ $eq: ['$kind', 'important'] }, 1, 0] } },
        maxMarks: { $max: '$marks' },
      },
    },
  ]);
  return new Map(
    rows.map((r) => [String(r._id), { paperYears: r.paperYears.filter((y) => y != null).length, bankCount: r.bankCount, maxMarks: r.maxMarks ?? 0 }]),
  );
}

export function priorityOf(stats) {
  if (!stats) return 0;
  return 2 * stats.paperYears + stats.maxMarks / 5 + (stats.bankCount > 0 ? 1 : 0) + 0.25 * Math.min(stats.bankCount, 6);
}

// Builds (or rebuilds) the plan from `today` to `examDate` and saves it.
export async function buildPlan(space, examDate, today) {
  const spaceId = space._id;
  const [topics, studied, stats, previous] = await Promise.all([
    Topic.find({ space: spaceId }).sort({ order: 1 }).lean(),
    studiedTopicIds(spaceId),
    topicStats(spaceId),
    StudyPlan.findOne({ space: spaceId }),
  ]);

  const totalDays = daysBetween(today, examDate); // days before the exam, today included
  const units = [...new Set(topics.map((t) => t.unit))];
  const studyDays = Math.max(totalDays - 1, 0);

  const todo = topics
    .filter((t) => !studied.has(String(t._id)))
    .map((t, i) => ({ topic: t, order: i, priority: priorityOf(stats.get(String(t._id))) }));
  const room = Math.max(studyDays, 1) * MAX_PER_DAY;
  const chosen = [...todo].sort((a, b) => b.priority - a.priority || a.order - b.order).slice(0, room);
  chosen.sort((a, b) => a.order - b.order); // learn in syllabus order

  const topicItem = ({ topic }) => ({ kind: 'topic', topic: topic._id, unit: topic.unit, label: topic.name });
  const days = [];
  if (totalDays >= 1) {
    const perDay = studyDays ? Math.ceil(chosen.length / studyDays) : 0;
    for (let d = 0; d < studyDays; d += 1) {
      days.push({ date: addDays(today, d), items: chosen.slice(d * perDay, (d + 1) * perDay).map(topicItem) });
    }
    const eve = {
      date: addDays(today, studyDays),
      items: [
        ...units.map((u) => ({ kind: 'revision', unit: u, label: `Last-night sheet: ${u}` })),
        { kind: 'repeats', label: 'Asked-again questions (Analyzer)' },
      ],
    };
    // Only one day left: the most important topics go on the eve too.
    if (!studyDays) eve.items.unshift(...chosen.slice(0, 3).map(topicItem));
    days.push(eve);
  }

  const plan = previous ?? new StudyPlan({ space: spaceId });
  plan.set({
    examDate,
    startDate: today,
    days: days.filter((d) => d.items.length),
    leftOut: Math.max(todo.length - (studyDays ? chosen.length : Math.min(chosen.length, 3)), 0),
  });
  await plan.save();
  return plan;
}

// The plan as of `today`. A past day with unticked items = missed: the plan is remade from today, keeping
// what was ticked (ticked topics count as studied).
export async function currentPlan(space, today) {
  const plan = await StudyPlan.findOne({ space: space._id });
  if (!plan) return null;
  const missed = plan.days.some((d) => d.date < today && d.items.some((i) => !i.done));
  if (missed && daysBetween(today, plan.examDate) >= 0) {
    const replanned = plan.replanned + 1;
    const fresh = await buildPlan(space, plan.examDate, today);
    fresh.replanned = replanned;
    await fresh.save();
    return withStudied(fresh, today, true);
  }
  return withStudied(plan, today, false);
}

// Topic items count as done when the topic was ticked as studied in Study mode too.
async function withStudied(plan, today, justReplanned) {
  const studied = new Set((await Lesson.find({ space: plan.space, studied: true }).distinct('topic')).map(String));
  const json = plan.toObject();
  for (const day of json.days) for (const item of day.items) if (item.topic && studied.has(String(item.topic))) item.done = true;
  return { ...json, daysLeft: daysBetween(today, plan.examDate), today, justReplanned };
}

// Ticks a plan item. Ticking a topic also marks its lesson studied (if there is one).
export async function setItemDone(space, itemId, done) {
  const plan = await StudyPlan.findOne({ space: space._id });
  const item = plan?.days.flatMap((d) => d.items).find((i) => String(i._id) === itemId);
  if (!item) return null;
  item.done = done;
  if (item.topic) {
    if (done) plan.studiedTopics.addToSet(item.topic);
    else plan.studiedTopics.pull(item.topic);
  }
  await plan.save();
  if (item.topic) await Lesson.updateOne({ space: space._id, topic: item.topic }, { studied: done });
  return plan;
}

// For the dashboard: "4 days to the AI exam · today: Unit 2 – Search algorithms".
export async function planSummaries(spaceIds, today) {
  const plans = await StudyPlan.find({ space: { $in: spaceIds } }).lean();
  return Object.fromEntries(
    plans.map((p) => {
      const day = p.days.find((d) => d.date === today);
      return [
        String(p.space),
        {
          examDate: p.examDate,
          daysLeft: daysBetween(today, p.examDate),
          today: day ? day.items.map((i) => ({ label: i.unit && i.kind === 'topic' ? `${i.unit} – ${i.label}` : i.label, done: i.done })) : [],
        },
      ];
    }),
  );
}

