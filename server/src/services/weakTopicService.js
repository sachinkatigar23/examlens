import mongoose from 'mongoose';
import { AnswerCheck } from '../models/AnswerCheck.js';
import { Topic } from '../models/Topic.js';
import { priorityOf, studiedTopicIds, topicStats } from './planService.js';

// "Weak topics": important for the exam but not ready yet. A plain formula, no LLM:
//   importance = the planner's priority (past-paper years, marks, question bank), see planService.js
//   readiness  = average score of your latest "Check my answer" attempt per question in the topic (0–1);
//                with no checks: 0.5 if you ticked the topic as studied, else 0
//   weakness   = importance × (1 − readiness)
// A topic counts as ready once its checked answers average READY_SCORE or more.
const READY_SCORE = 0.7;
const MAX_WEAK = 6;

// { topicId: { checked, percent } } from the latest attempt at each question (older attempts are history).
async function checkScoresByTopic(spaceId) {
  const rows = await AnswerCheck.aggregate([
    { $match: { space: spaceId, question: { $ne: null } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$question', estimatedMarks: { $first: '$estimatedMarks' }, marks: { $first: '$marks' } } },
    { $lookup: { from: 'questions', localField: '_id', foreignField: '_id', as: 'q' } },
    { $unwind: '$q' },
    { $match: { 'q.topic': { $ne: null }, marks: { $gt: 0 } } },
    {
      $group: {
        _id: '$q.topic',
        checked: { $sum: 1 },
        avgShare: { $avg: { $divide: ['$estimatedMarks', '$marks'] } },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), { checked: r.checked, percent: Math.round(r.avgShare * 100) }]));
}

export async function findWeakTopics(spaceIdValue, limit = MAX_WEAK) {
  const spaceId = new mongoose.Types.ObjectId(String(spaceIdValue));
  const [topics, stats, studied, scores] = await Promise.all([
    Topic.find({ space: spaceId }).sort({ order: 1 }).select('unit name').lean(),
    topicStats(spaceId),
    studiedTopicIds(spaceId),
    checkScoresByTopic(spaceId),
  ]);
  return rankWeakTopics(topics, stats, studied, scores, limit);
}

// The formula above, kept free of database calls so it can be unit-tested.
// stats: Map id → { paperYears, bankCount, maxMarks }; studied: Set of ids; scores: Map id → { checked, percent }
export function rankWeakTopics(topics, stats, studied, scores, limit = MAX_WEAK) {
  return topics
    .map((t) => {
      const id = String(t._id);
      const s = stats.get(id) ?? { paperYears: 0, bankCount: 0, maxMarks: 0 };
      const score = scores.get(id) ?? null;
      const isStudied = studied.has(id);
      const readiness = score ? Math.min(score.percent / 100, 1) : isStudied ? 0.5 : 0;
      const importance = priorityOf(s);
      return {
        topicId: t._id,
        unit: t.unit,
        name: t.name,
        paperYears: s.paperYears,
        bankCount: s.bankCount,
        studied: isStudied,
        checked: score?.checked ?? 0,
        checkPercent: score?.percent ?? null,
        weakness: Math.round(importance * (1 - readiness) * 100) / 100,
        ready: score ? readiness >= READY_SCORE : false,
      };
    })
    .filter((t) => t.weakness > 0 && !t.ready)
    .sort((a, b) => b.weakness - a.weakness)
    .slice(0, limit);
}
