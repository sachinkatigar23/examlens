import mongoose from 'mongoose';
import { Document } from '../models/Document.js';
import { Lesson } from '../models/Lesson.js';
import { Topic } from '../models/Topic.js';
import { relayAiStream } from '../services/streamRelay.js';
import { notFound } from '../utils/AppError.js';

async function findTopic(req) {
  const { topicId } = req.params;
  if (!mongoose.isValidObjectId(topicId)) throw notFound('Topic');
  const topic = await Topic.findOne({ _id: topicId, space: req.space._id }).lean();
  if (!topic) throw notFound('Topic');
  return topic;
}

const statusOf = (lesson) => (!lesson ? 'not_started' : lesson.studied ? 'studied' : 'generated');

// GET /spaces/:spaceId/study — units → topics, each with its lesson status
// (not_started | generated | studied), plus how many notes files were tagged with the unit.
export async function getStudyPlan(req, res) {
  const space = req.space._id;
  const [topics, lessons, notes] = await Promise.all([
    Topic.find({ space }).sort({ order: 1 }).lean(),
    Lesson.find({ space }).select('topic studied provider model updatedAt').lean(),
    Document.find({ space, kind: 'notes' }).select('unit status').lean(),
  ]);
  const lessonOf = new Map(lessons.map((l) => [String(l.topic), l]));

  const units = [];
  for (const t of topics) {
    let unit = units.find((u) => u.unit === t.unit);
    if (!unit) {
      unit = { unit: t.unit, unitTitle: t.unitTitle, notesCount: notes.filter((n) => n.unit === t.unit).length, topics: [] };
      units.push(unit);
    }
    const lesson = lessonOf.get(String(t._id));
    unit.topics.push({ _id: t._id, name: t.name, details: t.details, derived: t.derived, status: statusOf(lesson) });
  }
  res.json({ units, mixedNotes: notes.filter((n) => !n.unit).length });
}

// GET /spaces/:spaceId/topics/:topicId/lesson — the cached lesson, or { lesson: null } if not written yet.
export async function getLesson(req, res) {
  const topic = await findTopic(req);
  const lesson = await Lesson.findOne({ space: req.space._id, topic: topic._id }).lean();
  res.json({ lesson });
}

// POST /spaces/:spaceId/topics/:topicId/lesson { mode } — teaches the topic from scratch (SSE), then caches it.
export async function generateLesson(req, res) {
  const topic = await findTopic(req);
  const space = req.space._id;
  await relayAiStream(req, res, {
    path: '/lesson',
    // A topic derived from the question bank (no syllabus) has a list of questions as details, which can
    // belong to neighbouring topics, so only its name and unit steer retrieval.
    body: {
      space_id: String(space),
      topic_id: topic.derived ? null : String(topic._id),
      unit: topic.unit,
      name: topic.name,
      details: topic.derived ? '' : topic.details,
      mode: req.body.mode,
    },
    keepGoing: true, // "Teach me this unit" can take minutes: finish and cache the topic even if the tab closes
    onFinish: async ({ text, meta, citations, complete }) => {
      if (!complete) return null;
      const lesson = await Lesson.findOneAndUpdate(
        { space, topic: topic._id },
        {
          unit: topic.unit,
          content: text,
          citations,
          provider: meta.provider,
          model: meta.model,
          grounded: meta.grounded !== false,
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      );
      return { lessonId: lesson._id, status: statusOf(lesson) };
    },
  });
}

// PATCH /spaces/:spaceId/topics/:topicId/lesson { studied }
export async function setStudied(req, res) {
  const topic = await findTopic(req);
  const lesson = await Lesson.findOneAndUpdate(
    { space: req.space._id, topic: topic._id },
    { studied: req.body.studied },
    { returnDocument: 'after' },
  ).lean();
  if (!lesson) throw notFound('Lesson');
  res.json({ lesson, status: statusOf(lesson) });
}
