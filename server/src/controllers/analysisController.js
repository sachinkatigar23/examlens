import mongoose from 'mongoose';
import { PAPERS_ONLY, Question } from '../models/Question.js';
import { Topic } from '../models/Topic.js';
import { LOW_CONFIDENCE_SCORE, analyseSpace, isLowConfidence } from '../services/analysisService.js';
import { AppError, notFound } from '../utils/AppError.js';

export async function getAnalysis(req, res) {
  res.json(await analyseSpace(req.space._id));
}

// GET /spaces/:spaceId/questions?topic=<id|none>&year=2023&confidence=low
// The questions behind one heatmap cell, the unmatched ones, or the low-confidence matches to review.
export async function listQuestions(req, res) {
  const { topic, year, confidence } = req.query;
  const filter = { space: req.space._id, ...PAPERS_ONLY };

  if (topic === 'none') filter.topic = null;
  else if (topic) {
    if (!mongoose.isValidObjectId(topic)) throw new AppError(400, 'VALIDATION_ERROR', 'topic must be an id or "none"');
    filter.topic = topic;
  }
  if (year) {
    if (!/^\d{4}$/.test(year)) throw new AppError(400, 'VALIDATION_ERROR', 'year must look like 2023');
    filter.year = Number(year);
  }
  if (confidence === 'low') {
    Object.assign(filter, { topic: filter.topic ?? { $ne: null }, topicLocked: { $ne: true }, matchScore: { $lt: LOW_CONFIDENCE_SCORE } });
  }

  const questions = await Question.find(filter)
    .sort({ year: -1, number: 1 })
    .select('year number text marks topic matchScore topicLocked repeatGroup')
    .limit(300)
    .lean();
  res.json({ questions: questions.map((q) => ({ ...q, lowConfidence: isLowConfidence(q) })) });
}

// PATCH /spaces/:spaceId/questions/:questionId { topicId } — the student corrects a match by hand.
export async function moveQuestion(req, res) {
  const { questionId } = req.params;
  if (!mongoose.isValidObjectId(questionId)) throw notFound('Question');

  const { topicId } = req.body;
  // The topic must belong to the same space, or one user could link to another user's topics.
  if (topicId && !(await Topic.exists({ _id: topicId, space: req.space._id }))) throw notFound('Topic');

  const question = await Question.findOneAndUpdate(
    { _id: questionId, space: req.space._id },
    { topic: topicId, topicLocked: true, matchScore: null },
    { returnDocument: 'after' },
  ).lean();
  if (!question) throw notFound('Question');

  res.json({ question: { ...question, lowConfidence: false } });
}
