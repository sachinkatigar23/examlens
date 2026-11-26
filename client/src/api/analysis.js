import { api } from './client.js';

export const getAnalysis = (spaceId) => api.get(`/spaces/${spaceId}/analysis`).then((r) => r.data);

// topic: a topic id or 'none' (unmatched); year: e.g. 2023; confidence: 'low'. All optional.
export const listQuestions = (spaceId, { topic, year, confidence } = {}) =>
  api.get(`/spaces/${spaceId}/questions`, { params: { topic, year, confidence } }).then((r) => r.data.questions);

// Move a question to another topic by hand (topicId null = "no topic").
export const moveQuestion = (spaceId, questionId, topicId) =>
  api.patch(`/spaces/${spaceId}/questions/${questionId}`, { topicId }).then((r) => r.data.question);
