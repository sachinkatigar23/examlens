import { Question } from '../models/Question.js';
import { Topic } from '../models/Topic.js';
import { rematchQuestions } from './aiService.js';

const BATCH = 200;

// Re-links every question in the space to its closest current topic. Needed when the syllabus arrives
// after the papers, or when a syllabus is deleted/replaced.
export async function rematchSpace(spaceId) {
  // Questions the student placed by hand keep their topic.
  const auto = { space: spaceId, topicLocked: { $ne: true } };
  const questions = await Question.find(auto).select('text').lean();
  if (!questions.length) return;

  if (!(await Topic.exists({ space: spaceId }))) {
    await Question.updateMany(auto, { topic: null, matchScore: null });
    return;
  }

  for (let i = 0; i < questions.length; i += BATCH) {
    const batch = questions.slice(i, i + BATCH).map((q) => ({ id: q._id.toString(), text: q.text }));
    const matches = await rematchQuestions(spaceId.toString(), batch);
    await Question.bulkWrite(
      matches.map((m) => ({
        updateOne: { filter: { _id: m.id }, update: { topic: m.topic_id, matchScore: m.match_score } },
      })),
    );
  }
}

// Fire-and-forget version for request handlers: a failed rematch must not fail the request.
export function rematchSpaceInBackground(spaceId) {
  rematchSpace(spaceId).catch((err) => console.warn(`Rematch failed for space ${spaceId}: ${err.message}`));
}
