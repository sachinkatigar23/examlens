import mongoose from 'mongoose';
import { Answer } from '../models/Answer.js';
import { PAPERS_ONLY, Question } from '../models/Question.js';
import { Topic } from '../models/Topic.js';
import { bankScope, cancelJob, latestJob, saveAnswer, startAnswerAll } from '../services/answerJobService.js';
import { relayAiStream } from '../services/streamRelay.js';
import { notFound } from '../utils/AppError.js';

const DEFAULT_MARKS = 5;

async function findQuestion(req) {
  const { questionId } = req.params;
  if (!mongoose.isValidObjectId(questionId)) throw notFound('Question');
  const question = await Question.findOne({ _id: questionId, space: req.space._id });
  if (!question) throw notFound('Question');
  return question;
}

// { repeatGroup: [2023, 2025] } — the past papers that asked the same question.
async function pastYearsByGroup(spaceId, groups) {
  const rows = await Question.aggregate([
    { $match: { space: spaceId, ...PAPERS_ONLY, repeatGroup: { $in: groups }, year: { $ne: null } } },
    { $group: { _id: '$repeatGroup', years: { $addToSet: '$year' } } },
  ]);
  return new Map(rows.map((r) => [r._id, r.years.sort((a, b) => a - b)]));
}

const answerSummary = (a) => (a ? { provider: a.provider, model: a.model, marks: a.marks, grounded: a.grounded } : null);

// GET /spaces/:spaceId/bank — the question bank grouped data: units, topics, questions with marks,
// "also asked in" years and whether an answer is cached. The client groups unit → topic.
export async function getBank(req, res) {
  const space = req.space._id;
  const [topics, questions, job] = await Promise.all([
    Topic.find({ space }).sort({ order: 1 }).select('unit unitTitle name order').lean(),
    Question.find({ space, kind: 'important' }).select('unit number text marks topic repeatGroup matchScore marksEdited').lean(),
    latestJob(space),
  ]);
  const [years, answers] = await Promise.all([
    pastYearsByGroup(space, questions.map((q) => q.repeatGroup).filter(Boolean)),
    Answer.find({ question: { $in: questions.map((q) => q._id) } }).select('question provider model marks grounded').lean(),
  ]);
  const answerOf = new Map(answers.map((a) => [String(a.question), a]));

  const units = [];
  for (const t of topics) if (!units.some((u) => u.unit === t.unit)) units.push({ unit: t.unit, unitTitle: t.unitTitle });
  for (const q of questions) if (q.unit && !units.some((u) => u.unit === q.unit)) units.push({ unit: q.unit, unitTitle: '' });

  res.json({
    units,
    topics,
    questions: questions.map(({ repeatGroup, ...q }) => ({
      ...q,
      pastYears: years.get(repeatGroup) ?? [],
      answer: answerSummary(answerOf.get(String(q._id))),
    })),
    job,
  });
}

// PATCH /spaces/:spaceId/questions/:questionId/marks { marks }
export async function setMarks(req, res) {
  const question = await findQuestion(req);
  question.set({ marks: req.body.marks, marksEdited: true });
  await question.save();
  res.json({ question });
}

// GET /spaces/:spaceId/questions/:questionId/answer — the cached answer, or { answer: null } if none yet.
export async function getAnswer(req, res) {
  const question = await findQuestion(req);
  const answer = await Answer.findOne({ question: question._id }).lean();
  res.json({ answer });
}

// POST /spaces/:spaceId/questions/:questionId/answer { mode, marks? } — generates (or regenerates) the
// marks-aware answer from the notes, streamed (SSE), then caches it.
export async function generateAnswer(req, res) {
  const question = await findQuestion(req);
  const marks = req.body.marks ?? question.marks ?? DEFAULT_MARKS;
  await relayAiStream(req, res, {
    path: '/ask',
    body: { space_id: String(req.space._id), question: question.text, marks, mode: req.body.mode, purpose: 'exam' },
    keepGoing: true, // a long answer is worth finishing and caching even if the tab closes
    onFinish: async ({ text, meta, citations, complete }) => {
      if (!complete) return null; // never cache half an answer
      const saved = await saveAnswer(question, { text, meta, citations });
      return { answerId: saved._id };
    },
  });
}

// GET /spaces/:spaceId/answers?unit=Unit%202 — every cached bank answer (the printable answer booklet).
export async function listAnswers(req, res) {
  const unit = typeof req.query.unit === 'string' && req.query.unit ? req.query.unit : null;
  const questions = await Question.find(bankScope(req.space._id, unit)).select('unit number text marks topic').lean();
  const [answers, topics] = await Promise.all([
    Answer.find({ question: { $in: questions.map((q) => q._id) } }).lean(),
    Topic.find({ space: req.space._id }).sort({ order: 1 }).select('unit unitTitle name order').lean(),
  ]);
  const answerOf = new Map(answers.map((a) => [String(a.question), a]));
  res.json({ topics, questions: questions.map((q) => ({ ...q, answer: answerOf.get(String(q._id)) ?? null })) });
}

// POST /spaces/:spaceId/bank/answer-all { mode, unit? } → 202 { job }
export async function answerAll(req, res) {
  const job = await startAnswerAll(req.space, req.user.id, req.body);
  res.status(202).json({ job });
}

export async function getJob(req, res) {
  res.json({ job: await latestJob(req.space._id) });
}

export async function stopJob(req, res) {
  const job = await cancelJob(req.space._id);
  if (!job) throw notFound('Running job');
  res.json({ job });
}
