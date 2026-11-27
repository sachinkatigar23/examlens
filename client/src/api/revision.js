import { api } from './client.js';
import { streamPost } from './ask.js';

const path = (spaceId, unit) => `/spaces/${spaceId}/revision/${encodeURIComponent(unit)}`;

// { unit, unitTitle, topics, sheet (null until written), topQuestions: [{ text, marks, years, inBank }] }
export const getRevisionSheet = (spaceId, unit) => api.get(path(spaceId, unit)).then((r) => r.data);
export const streamRevisionSheet = (spaceId, unit, { mode }, handlers) => streamPost(path(spaceId, unit), { mode }, handlers);
