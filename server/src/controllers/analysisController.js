import mongoose from 'mongoose';
import { PAPERS_ONLY, Question } from '../models/Question.js';
import { Topic } from '../models/Topic.js';
import { LOW_CONFIDENCE_SCORE, analyseSpace, isLowConfidence } from '../services/analysisService.js';
import { findWeakTopics } from '../services/weakTopicService.js';
import { AppError, notFound } from '../utils/AppError.js';

export async function getAnalysis(req, res) {
  const [analysis, weakTopics] = await Promise.all([analyseSpace(req.space._id), findWeakTopics(req.space._id)]);
  res.json({ ...analysis, weakTopics });
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
  const topic = topicId ? await Topic.findOne({ _id: topicId, space: req.space._id }).select('unit').lean() : null;
  if (topicId && !topic) throw notFound('Topic');

  const question = await Question.findOne({ _id: questionId, space: req.space._id });
  if (!question) throw notFound('Question');
  question.set({ topic: topicId, topicLocked: true, matchScore: null });
  // Question bank questions are listed under their unit, so they follow the topic into its unit.
  if (question.kind === 'important' && topic) question.unit = topic.unit;
  await question.save();

  res.json({ question: { ...question.toObject(), lowConfidence: false } });
}
