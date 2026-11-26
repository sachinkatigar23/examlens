import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { Document } from '../models/Document.js';
import { Question } from '../models/Question.js';
import { Topic } from '../models/Topic.js';
import { deleteDocumentVectors, requestIngest } from './aiService.js';
import { rematchSpaceInBackground } from './topicMatchService.js';

// A document stuck in queued/processing this long (e.g. the AI service restarted) may be retried.
export const STALE_AFTER_MS = 10 * 60 * 1000;

// Hand the document to the AI service. If it isn't reachable, mark the document failed with a
// clear message instead of leaving it "queued" forever.
export async function startIngest(document) {
  try {
    await requestIngest(document);
  } catch (err) {
    document.status = 'failed';
    document.error = `${err.message}. Use Retry once it is running.`;
    await document.save();
  }
}

// Removes what earlier processing produced for this document (topics/questions in MongoDB).
// Returns true if it removed syllabus topics, i.e. questions need re-matching.
async function clearResults(document) {
  const topics = await Topic.find({ document: document._id }).select('_id').lean();
  await Question.deleteMany({ document: document._id });
  await Topic.deleteMany({ document: document._id });
  if (!topics.length) return false;
  await Question.updateMany(
    { space: document.space, topic: { $in: topics.map((t) => t._id) } },
    { topic: null, matchScore: null, topicLocked: false }, // their topic is gone, even if placed by hand
  );
  return true;
}

export async function retryDocument(document) {
  const hadTopics = await clearResults(document);
  if (hadTopics) rematchSpaceInBackground(document.space);
  document.set({ status: 'queued', error: null, pages: null, chunkCount: 0 });
  await document.save();
  await startIngest(document);
}

export function canRetry(document) {
  if (document.status === 'failed') return true;
  const stuck = document.status === 'queued' || document.status === 'processing';
  return stuck && Date.now() - document.updatedAt.getTime() > STALE_AFTER_MS;
}

// Removes the record, its topics/questions, the PDF on disk and (best effort) its vectors in Qdrant.
export async function removeDocument(document, { rematch = true } = {}) {
  await deleteDocumentVectors(document.id).catch((err) =>
    console.warn(`Could not delete vectors for ${document.id}: ${err.message}`),
  );
  const hadTopics = await clearResults(document);
  await fs.unlink(path.join(env.uploadDir, document.storedName)).catch(() => {});
  await Document.deleteOne({ _id: document._id });
  // Questions that pointed at the deleted syllabus may fit another syllabus still in the space.
  if (hadTopics && rematch) rematchSpaceInBackground(document.space);
}
