import { Space } from '../models/Space.js';
import { countDocumentsBySpace, deleteSpaceCascade } from '../services/spaceService.js';
import { planSummaries, serverToday } from '../services/planService.js';

export async function listSpaces(req, res) {
  const spaces = await Space.find({ owner: req.user.id }).sort({ updatedAt: -1 });
  // ?today=YYYY-MM-DD: the browser's day, for "4 days to the exam · today: …" on the cards.
  const today = /^\d{4}-\d{2}-\d{2}$/.test(req.query.today ?? '') ? req.query.today : serverToday();
  const [counts, plans] = await Promise.all([
    countDocumentsBySpace(spaces.map((s) => s._id)),
    planSummaries(spaces.map((s) => s._id), today),
  ]);
  res.json({
    spaces: spaces.map((s) => ({ ...s.toJSON(), documentCount: counts[s.id] ?? 0, plan: plans[s.id] ?? null })),
  });
}

export async function createSpace(req, res) {
  const space = await Space.create({ ...req.body, owner: req.user.id });
  res.status(201).json({ space });
}

// req.space was loaded (and ownership checked) by requireSpaceOwner.
export async function getSpace(req, res) {
  res.json({ space: req.space });
}

export async function updateSpace(req, res) {
  req.space.set(req.body);
  await req.space.save();
  res.json({ space: req.space });
}

export async function deleteSpace(req, res) {
  await deleteSpaceCascade(req.space);
  res.status(204).end();
}
