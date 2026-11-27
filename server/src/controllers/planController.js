import { StudyPlan } from '../models/StudyPlan.js';
import { buildPlan, currentPlan, daysBetween, serverToday, setItemDone } from '../services/planService.js';
import { AppError, notFound } from '../utils/AppError.js';

// The browser sends its own calendar day (?today= or body.today), so "today" is the student's day.
const todayOf = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : serverToday());

// GET /spaces/:spaceId/plan?today=YYYY-MM-DD → { plan } (null when no exam date is set)
export async function getPlan(req, res) {
  res.json({ plan: await currentPlan(req.space, todayOf(req.query.today)) });
}

// PUT /spaces/:spaceId/plan { examDate, today } → a fresh plan
export async function setExamDate(req, res) {
  const { examDate, today } = req.body;
  if (daysBetween(today, examDate) < 0) throw new AppError(400, 'VALIDATION_ERROR', 'The exam date is in the past');
  const plan = await buildPlan(req.space, examDate, today);
  plan.replanned = 0; // a new date is a new plan
  await plan.save();
  res.json({ plan: await currentPlan(req.space, today) });
}

// DELETE /spaces/:spaceId/plan — removes the exam date and the plan
export async function deletePlan(req, res) {
  await StudyPlan.deleteOne({ space: req.space._id });
  res.status(204).end();
}

// PATCH /spaces/:spaceId/plan/items/:itemId { done, today }
export async function tickItem(req, res) {
  const plan = await setItemDone(req.space, req.params.itemId, req.body.done);
  if (!plan) throw notFound('Plan item');
  res.json({ plan: await currentPlan(req.space, req.body.today) });
}
