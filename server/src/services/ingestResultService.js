import { Question } from '../models/Question.js';
import { Topic } from '../models/Topic.js';
import { rematchSpaceInBackground } from './topicMatchService.js';

// Applies what the AI service reports for a document (PATCH /internal/documents/:id).
export async function applyIngestUpdate(document, update) {
  if (update.status === 'processing') {
    document.set({ status: 'processing', error: null });
    return document.save();
  }

  if (update.status === 'failed') {
    document.set({ status: 'failed', error: update.error });
    return document.save();
  }

  // ready: replace anything an earlier run saved (retries are safe), then save the new results.
  await Promise.all([Topic.deleteMany({ document: document._id }), Question.deleteMany({ document: document._id })]);

  if (update.topics?.length) {
    await Topic.insertMany(
      update.topics.map((t) => ({
        _id: t.id, // same id as in Qdrant
        space: document.space,
        document: document._id,
        unit: t.unit,
        name: t.name,
        details: t.details,
        order: t.order,
      })),
    );
  }

  if (update.questions?.length) {
    await Question.insertMany(
      update.questions.map((q) => ({
        _id: q.id,
        space: document.space,
        document: document._id,
        year: document.year,
        number: q.number,
        text: q.text,
        marks: q.marks,
        topic: q.topic_id,
        matchScore: q.match_score,
        repeatGroup: q.repeat_group,
      })),
    );
  }

  document.set({ status: 'ready', error: null, pages: update.pages, chunkCount: update.chunkCount });
  await document.save();

  // New syllabus topics: papers uploaded earlier can now be matched to them.
  if (update.topics?.length) rematchSpaceInBackground(document.space);
}
