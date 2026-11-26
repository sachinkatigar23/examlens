import mongoose from 'mongoose';
import { Space } from '../models/Space.js';
import { notFound } from '../utils/AppError.js';

// Loads req.space. Returns 404 (not 403) for other users' spaces so we don't reveal they exist.
export async function requireSpaceOwner(req, _res, next) {
  const { spaceId } = req.params;
  if (!mongoose.isValidObjectId(spaceId)) return next(notFound('Space'));

  const space = await Space.findOne({ _id: spaceId, owner: req.user.id });
  if (!space) return next(notFound('Space'));

  req.space = space;
  next();
}
