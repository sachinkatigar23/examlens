import mongoose from 'mongoose';
import { AnswerCheck } from '../models/AnswerCheck.js';
import { Photo } from '../models/Photo.js';
import { Question } from '../models/Question.js';
import { relayAiStream } from '../services/streamRelay.js';
import { AppError, notFound } from '../utils/AppError.js';

const DEFAULT_MARKS = 5;

// POST /spaces/:spaceId/checks { questionId? | question, marks?, answer, photoId?, mode }
// Streams (SSE): "grade" (estimated marks, covered, missing…) → tokens of the improved version → "done".
// The attempt is saved once complete.
export async function checkAnswer(req, res) {
  const { questionId, answer, photoId, mode } = req.body;
  const space = req.space._id;

  let question = null;
  if (questionId) {
    question = await Question.findOne({ _id: questionId, space }).select('text marks').lean();
    if (!question) throw notFound('Question');
  } else if (!req.body.question) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Pick a question or type one');
  }
  if (photoId && !(await Photo.exists({ _id: photoId, space }))) throw notFound('Photo');

  const questionText = question?.text ?? req.body.question;
  const marks = req.body.marks ?? question?.marks ?? DEFAULT_MARKS;

  await relayAiStream(req, res, {
    path: '/check-answer',
    body: { space_id: String(space), question: questionText, marks, student_answer: answer, mode },
    keepGoing: true, // the verdict is worth keeping even if the tab closes
    onFinish: async ({ text, meta, citations, complete, events }) => {
      const grade = meta?.grade ?? events.grade;
      if (!complete || !grade) return null;
      if (req.user.demo) return null; // public demo: graded, not saved (visitors share one account)
      const saved = await AnswerCheck.create({
        space,
        user: req.user.id,
        question: question?._id ?? null,
        questionText,
        marks,
        answerText: answer,
        photo: photoId ?? null,
        estimatedMarks: grade.estimatedMarks,
        breakdown: grade.breakdown,
        covered: grade.covered,
        missing: grade.missing,
        mistakes: grade.mistakes,
        feedback: grade.feedback,
        checklist: grade.checklist,
        wordCount: grade.wordCount,
        notesCover: grade.notesCover,
        improved: text,
        citations,
        provider: meta.provider,
        model: meta.model,
      });
      return { checkId: saved._id };
    },
  });
}

// GET /spaces/:spaceId/checks?questionId=… — attempts, newest first (all, or one question's).
// Without the long texts, so the list stays light; GET …/checks/:checkId has everything.
export async function listChecks(req, res) {
  const filter = { space: req.space._id };
  const { questionId } = req.query;
  if (typeof questionId === 'string' && questionId) {
    if (!mongoose.isValidObjectId(questionId)) throw notFound('Question');
    filter.question = questionId;
  }
  const checks = await AnswerCheck.find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .select('question questionText marks estimatedMarks provider model createdAt')
    .lean();
  res.json({ checks });
}

async function findCheck(req) {
  const { checkId } = req.params;
  if (!mongoose.isValidObjectId(checkId)) throw notFound('Check');
  const check = await AnswerCheck.findOne({ _id: checkId, space: req.space._id });
  if (!check) throw notFound('Check');
  return check;
}

export async function getCheck(req, res) {
  res.json({ check: await findCheck(req) });
}

export async function deleteCheck(req, res) {
  const check = await findCheck(req);
  await check.deleteOne();
  res.status(204).end();
}
