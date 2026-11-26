import mongoose from 'mongoose';
import { Document } from '../models/Document.js';
import { Question } from '../models/Question.js';
import { Topic } from '../models/Topic.js';

const HOT_TOPICS = 5;
const MAX_REPEATS = 20;

// Everything the Analyzer tab shows, computed with MongoDB aggregations.
export async function analyseSpace(spaceIdValue) {
  const space = new mongoose.Types.ObjectId(String(spaceIdValue));

  const [years, topics, cells, repeats, unmatched, questionCount] = await Promise.all([
    // Years = papers that finished processing (a paper with 0 matched questions still counts as a year).
    Document.distinct('year', { space, kind: 'paper', status: 'ready' }),
    Topic.find({ space }).sort({ order: 1 }).lean(),

    // One row per (topic, year): how many questions and marks that topic got in that year's paper.
    Question.aggregate([
      { $match: { space, topic: { $ne: null } } },
      {
        $group: {
          _id: { topic: '$topic', year: '$year' },
          count: { $sum: 1 },
          marks: { $sum: { $ifNull: ['$marks', 0] } },
        },
      },
    ]),

    // Repeated questions: groups whose questions span 2+ different years.
    Question.aggregate([
      { $match: { space, repeatGroup: { $ne: null } } },
      { $sort: { year: 1 } },
      {
        $group: {
          _id: '$repeatGroup',
          text: { $first: '$text' }, // wording from the earliest paper
          topic: { $first: '$topic' },
          years: { $addToSet: '$year' },
        },
      },
      { $addFields: { yearCount: { $size: '$years' } } },
      { $match: { yearCount: { $gte: 2 } } },
      { $sort: { yearCount: -1, _id: 1 } },
      { $limit: MAX_REPEATS },
    ]),

    Question.countDocuments({ space, topic: null }),
    Question.countDocuments({ space }),
  ]);

  const sortedYears = years.filter(Boolean).sort((a, b) => a - b);
  const topicName = new Map(topics.map((t) => [t._id.toString(), t.name]));

  const rows = topics.map((t) => {
    const mine = cells.filter((c) => c._id.topic.equals(t._id));
    const byYear = Object.fromEntries(mine.map((c) => [c._id.year, c.count]));
    return {
      topicId: t._id,
      unit: t.unit,
      name: t.name,
      total: mine.reduce((sum, c) => sum + c.count, 0),
      marks: mine.reduce((sum, c) => sum + c.marks, 0),
      yearsAsked: mine.length, // in how many different papers it appeared
      byYear,
    };
  });

  // "Hot" = asked in the most different years; ties broken by how many questions.
  const hotTopics = rows
    .filter((r) => r.total > 0)
    .sort((a, b) => b.yearsAsked - a.yearsAsked || b.total - a.total)
    .slice(0, HOT_TOPICS);

  return {
    years: sortedYears,
    paperCount: sortedYears.length,
    questionCount,
    topics: rows,
    hotTopics,
    repeats: repeats.map((r) => ({
      group: r._id,
      text: r.text,
      years: r.years.sort((a, b) => a - b),
      topic: r.topic ? topicName.get(r.topic.toString()) ?? null : null,
    })),
    unmatched,
  };
}
