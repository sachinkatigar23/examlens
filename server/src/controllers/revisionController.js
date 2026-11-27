import { Question } from '../models/Question.js';
import { RevisionSheet } from '../models/RevisionSheet.js';
import { Topic } from '../models/Topic.js';
import { relayAiStream } from '../services/streamRelay.js';
import { notFound } from '../utils/AppError.js';
import { alreadyWritten } from '../utils/demo.js';

const TOP_QUESTIONS = 10;

async function unitTopics(req) {
  const unit = req.params.unit;
  const topics = await Topic.find({ space: req.space._id, unit }).sort({ order: 1 }).select('name unitTitle').lean();
  if (!topics.length) throw notFound('Unit');
  return { unit, topics };
}

// The unit's most likely questions: asked in the most past-paper years, then highest marks. Bank and paper
// versions of the same question (same repeatGroup) count once.
async function topQuestions(spaceId, unit, topicIds) {
  const questions = await Question.find({ space: spaceId, $or: [{ unit }, { topic: { $in: topicIds } }] })
    .select('text marks year kind repeatGroup')
    .lean();
  const groups = new Map();
  for (const q of questions) {
    const key = q.repeatGroup ?? String(q._id);
    const g = groups.get(key) ?? { text: q.text, marks: q.marks, years: new Set(), inBank: false };
    if (q.kind === 'important') g.inBank = true;
    else if (q.year) g.years.add(q.year);
    if ((q.marks ?? 0) > (g.marks ?? 0)) g.marks = q.marks;
    if (q.kind === 'important') g.text = q.text; // the bank's wording is usually the cleanest
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ text: g.text, marks: g.marks ?? 5, years: [...g.years].sort(), inBank: g.inBank }))
    .sort((a, b) => b.years.length - a.years.length || b.marks - a.marks)
    .slice(0, TOP_QUESTIONS);
}

// GET /spaces/:spaceId/revision/:unit → { unit, unitTitle, topics, sheet (or null), topQuestions }
export async function getSheet(req, res) {
  const { unit, topics } = await unitTopics(req);
  const [sheet, top] = await Promise.all([
    RevisionSheet.findOne({ space: req.space._id, unit }).lean(),
    topQuestions(req.space._id, unit, topics.map((t) => t._id)),
  ]);
  res.json({ unit, unitTitle: topics[0].unitTitle, topics: topics.map((t) => t.name), sheet, topQuestions: top });
}

// POST /spaces/:spaceId/revision/:unit { mode } — writes the sheet from the notes (SSE), then caches it.
export async function generateSheet(req, res) {
  const { unit, topics } = await unitTopics(req);
  const space = req.space._id;
  if (req.user.demo && (await RevisionSheet.exists({ space, unit }))) throw alreadyWritten('revision sheet');
  await relayAiStream(req, res, {
    path: '/revision-sheet',
    body: { space_id: String(space), unit, unit_title: topics[0].unitTitle, topics: topics.map((t) => t.name), mode: req.body.mode },
    keepGoing: true, // finish and cache it even if the tab closes
    onFinish: async ({ text, meta, citations, complete }) => {
      if (!complete) return null;
      const sheet = await RevisionSheet.findOneAndUpdate(
        { space, unit },
        { content: text, citations, provider: meta.provider, model: meta.model },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      );
      return { sheetId: sheet._id };
    },
  });
}

