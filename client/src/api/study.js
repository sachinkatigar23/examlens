import { api } from './client.js';
import { streamPost } from './ask.js';

// { units: [{ unit, unitTitle, notesCount, topics: [{ _id, name, details, status }] }], mixedNotes }
export const getStudyPlan = (spaceId) => api.get(`/spaces/${spaceId}/study`).then((r) => r.data);

export const getLesson = (spaceId, topicId) =>
  api
    .get(`/spaces/${spaceId}/topics/${topicId}/lesson`)
    .then((r) => r.data.lesson); // null = not written yet

export const streamLesson = (spaceId, topicId, { mode }, handlers) =>
  streamPost(`/spaces/${spaceId}/topics/${topicId}/lesson`, { mode }, handlers);

export const setStudied = (spaceId, topicId, studied) =>
  api.patch(`/spaces/${spaceId}/topics/${topicId}/lesson`, { studied }).then((r) => r.data);
