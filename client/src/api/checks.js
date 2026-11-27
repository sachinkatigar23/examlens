import { api } from './client.js';
import { streamPost } from './ask.js';

// Check my answer. Streams: onGrade(verdict) first, then onToken for the full-marks version.
// body: { questionId } or { question, marks }, plus { answer, photoId?, mode }
export const streamCheck = (spaceId, body, { onGrade, ...handlers }) =>
  streamPost(`/spaces/${spaceId}/checks`, body, {
    ...handlers,
    onEvent: (event, data) => event === 'grade' && onGrade?.(data),
  });

// Attempts, newest first: [{ _id, question, questionText, marks, estimatedMarks, provider, model, createdAt }]
export const listChecks = (spaceId, questionId) =>
  api.get(`/spaces/${spaceId}/checks`, { params: { questionId: questionId || undefined } }).then((r) => r.data.checks);

export const getCheck = (spaceId, checkId) => api.get(`/spaces/${spaceId}/checks/${checkId}`).then((r) => r.data.check);
export const deleteCheck = (spaceId, checkId) => api.delete(`/spaces/${spaceId}/checks/${checkId}`);
