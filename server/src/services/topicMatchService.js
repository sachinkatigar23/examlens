import { Document } from '../models/Document.js';
import { Question } from '../models/Question.js';
import { Topic } from '../models/Topic.js';
import { rematchQuestions, retagUnits } from './aiService.js';

const BATCH = 200;

// Re-links every question in the space to its closest current topic. Needed when the syllabus arrives
// after the papers, or when a syllabus is deleted/replaced.
export async function rematchSpace(spaceId) {
  // Questions the student placed by hand keep their topic. So do question-bank questions inside a topic that
  // was derived from that bank: the AI service assigned and checked them while deriving (plain embedding
  // matching against the short topic names put Minimax under "A*"). A real syllabus deletes derived topics,
  // which clears those links first, so the questions are matched again then.
  const derived = await Topic.find({ space: spaceId, derived: true }).distinct('_id');
  const auto = {
    space: spaceId,
    topicLocked: { $ne: true },
    $nor: [{ kind: 'important', topic: { $in: derived } }],
  };
  const questions = await Question.find(auto).select('text unit').lean();
  if (!questions.length) return;

  if (!(await Topic.exists({ space: spaceId }))) {
    await Question.updateMany(auto, { topic: null, matchScore: null });
    return;
  }

  for (let i = 0; i < questions.length; i += BATCH) {
    const batch = questions.slice(i, i + BATCH).map((q) => ({ id: q._id.toString(), text: q.text, unit: q.unit ?? null }));
    const matches = await rematchQuestions(spaceId.toString(), batch);
    await Question.bulkWrite(
      matches.map((m) => ({
        updateOne: { filter: { _id: m.id }, update: { topic: m.topic_id, matchScore: m.match_score } },
      })),
    );
  }
}

// Note chunks carry a unit + topic tag (Study mode retrieves by them). New topics = new tags.
export async function retagNotes(spaceId) {
  const notes = await Document.find({ space: spaceId, kind: 'notes', status: 'ready' }).select('unit').lean();
  if (!notes.length) return;
  await retagUnits(
    spaceId.toString(),
    notes.map((d) => ({ document_id: d._id.toString(), unit: d.unit })),
  );
}

// Fire-and-forget for request handlers: the topics changed (syllabus/question bank added or removed), so
// questions are re-matched and notes re-tagged. A failure must not fail the request.
export function topicsChangedInBackground(spaceId) {
  rematchSpace(spaceId).catch((err) => console.warn(`Rematch failed for space ${spaceId}: ${err.message}`));
  retagNotes(spaceId).catch((err) => console.warn(`Retag failed for space ${spaceId}: ${err.message}`));
}

// Kept for callers that only need the questions re-matched.
export const rematchSpaceInBackground = topicsChangedInBackground;
