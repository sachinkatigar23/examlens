import { api } from './client.js';
import { streamPost } from './ask.js';

export const getBank = (spaceId) => api.get(`/spaces/${spaceId}/bank`).then((r) => r.data);

export const setMarks = (spaceId, questionId, marks) =>
  api.patch(`/spaces/${spaceId}/questions/${questionId}/marks`, { marks }).then((r) => r.data.question);

// The cached exam answer of a question, or null when there isn't one yet.
export const getAnswer = (spaceId, questionId) =>
  api
    .get(`/spaces/${spaceId}/questions/${questionId}/answer`)
    .then((r) => r.data.answer); // null = not written yet

// Generates (or regenerates) the marks-aware answer, streamed. Works for bank and past-paper questions.
export const streamExamAnswer = (spaceId, questionId, { mode, marks }, handlers) =>
  streamPost(`/spaces/${spaceId}/questions/${questionId}/answer`, { mode, marks }, handlers);

export const listAnswers = (spaceId, unit) =>
  api.get(`/spaces/${spaceId}/answers`, { params: { unit: unit || undefined } }).then((r) => r.data);

export const startAnswerAll = (spaceId, { mode, unit }) =>
  api.post(`/spaces/${spaceId}/bank/answer-all`, { mode, unit: unit || null }).then((r) => r.data.job);
export const getJob = (spaceId) => api.get(`/spaces/${spaceId}/bank/job`).then((r) => r.data.job);
export const stopJob = (spaceId) => api.delete(`/spaces/${spaceId}/bank/job`).then((r) => r.data.job);
