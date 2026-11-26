import mongoose from 'mongoose';
import { Question } from '../models/Question.js';
import { analyseSpace } from '../services/analysisService.js';
import { AppError } from '../utils/AppError.js';

export async function getAnalysis(req, res) {
  res.json(await analyseSpace(req.space._id));
}

// GET /spaces/:spaceId/questions?topic=<id|none>&year=2023 — the questions behind one heatmap cell.
export async function listQuestions(req, res) {
  const { topic, year } = req.query;
  const filter = { space: req.space._id };

  if (topic === 'none') filter.topic = null;
  else if (topic) {
    if (!mongoose.isValidObjectId(topic)) throw new AppError(400, 'VALIDATION_ERROR', 'topic must be an id or "none"');
    filter.topic = topic;
  }
  if (year) {
    if (!/^\d{4}$/.test(year)) throw new AppError(400, 'VALIDATION_ERROR', 'year must look like 2023');
    filter.year = Number(year);
  }

  const questions = await Question.find(filter)
    .sort({ year: -1, number: 1 })
    .select('year number text marks topic matchScore repeatGroup')
    .limit(300)
    .lean();
  res.json({ questions });
}
