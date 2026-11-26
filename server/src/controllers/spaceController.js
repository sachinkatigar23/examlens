import { Space } from '../models/Space.js';
import { countDocumentsBySpace, deleteSpaceCascade } from '../services/spaceService.js';

export async function listSpaces(req, res) {
  const spaces = await Space.find({ owner: req.user.id }).sort({ updatedAt: -1 });
  const counts = await countDocumentsBySpace(spaces.map((s) => s._id));
  res.json({
    spaces: spaces.map((s) => ({ ...s.toJSON(), documentCount: counts[s.id] ?? 0 })),
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
