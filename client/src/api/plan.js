import { api } from './client.js';
import { localToday } from '../utils/format.js';

// The exam countdown plan (null when no exam date is set). "today" is always the browser's local day.
export const getPlan = (spaceId) => api.get(`/spaces/${spaceId}/plan`, { params: { today: localToday() } }).then((r) => r.data.plan);
export const setExamDate = (spaceId, examDate) =>
  api.put(`/spaces/${spaceId}/plan`, { examDate, today: localToday() }).then((r) => r.data.plan);
export const deletePlan = (spaceId) => api.delete(`/spaces/${spaceId}/plan`);
export const tickPlanItem = (spaceId, itemId, done) =>
  api.patch(`/spaces/${spaceId}/plan/items/${itemId}`, { done, today: localToday() }).then((r) => r.data.plan);
