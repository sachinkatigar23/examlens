import { api } from './client.js';

export const getAnalysis = (spaceId) => api.get(`/spaces/${spaceId}/analysis`).then((r) => r.data);

// topic: a topic id or 'none' (unmatched); year: e.g. 2023. Both optional.
export const listQuestions = (spaceId, { topic, year } = {}) =>
  api.get(`/spaces/${spaceId}/questions`, { params: { topic, year } }).then((r) => r.data.questions);
