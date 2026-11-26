import { Answer } from '../models/Answer.js';
import { Lesson } from '../models/Lesson.js';
import { Question } from '../models/Question.js';
import { Topic } from '../models/Topic.js';
import { topicsChangedInBackground } from './topicMatchService.js';

// Deletes topics and everything hanging off them (lessons), and un-links their questions.
export async function removeTopics(filter) {
  const ids = (await Topic.find(filter).select('_id').lean()).map((t) => t._id);
  if (!ids.length) return 0;
  await Promise.all([
    Topic.deleteMany({ _id: { $in: ids } }),
    Lesson.deleteMany({ topic: { $in: ids } }),
    Question.updateMany({ topic: { $in: ids } }, { topic: null, matchScore: null, topicLocked: false }),
  ]);
  return ids.length;
}

// Deletes questions together with their cached answers.
export async function removeQuestions(filter) {
  const ids = (await Question.find(filter).select('_id').lean()).map((q) => q._id);
  if (!ids.length) return;
  await Promise.all([Question.deleteMany({ _id: { $in: ids } }), Answer.deleteMany({ question: { $in: ids } })]);
}

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
  // Marks the student corrected by hand survive a re-run (matched by question number).
  const edited = await Question.find({ document: document._id, marksEdited: true }).select('number marks').lean();
  const editedMarks = new Map(edited.map((q) => [q.number, q.marks]));
  await Promise.all([removeTopics({ document: document._id }), removeQuestions({ document: document._id })]);

  if (update.topics?.length) {
    // A real syllabus replaces topics that were only derived from a question bank.
    if (document.kind === 'syllabus') await removeTopics({ space: document.space, derived: true });
    await Topic.insertMany(
      update.topics.map((t) => ({
        _id: t.id, // same id as in Qdrant
        space: document.space,
        document: document._id,
        unit: t.unit,
        unitTitle: t.unit_title,
        name: t.name,
        details: t.details,
        order: t.order,
        derived: t.derived,
      })),
    );
  }

  if (update.questions?.length) {
    const important = document.kind === 'important';
    await Question.insertMany(
      update.questions.map((q) => ({
        _id: q.id,
        space: document.space,
        document: document._id,
        kind: important ? 'important' : 'paper',
        year: important ? null : document.year,
        unit: q.unit,
        number: q.number,
        text: q.text,
        marks: editedMarks.get(q.number) ?? q.marks,
        marksEdited: editedMarks.has(q.number),
        topic: q.topic_id,
        matchScore: q.match_score,
        repeatGroup: q.repeat_group,
      })),
    );
  }

  document.set({ status: 'ready', error: null, pages: update.pages, chunkCount: update.chunkCount });
  await document.save();

  // New topics: earlier questions can now be matched to them and notes tagged with units.
  if (update.topics?.length) topicsChangedInBackground(document.space);
}
