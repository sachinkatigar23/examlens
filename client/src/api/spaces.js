import { api } from './client.js';
import { localToday } from '../utils/format.js';


// Each space carries plan: { examDate, daysLeft, today: [{ label, done }] } when an exam date is set.
export const listSpaces = () => api.get('/spaces', { params: { today: localToday() } }).then((r) => r.data.spaces);
export const getSpace = (id) => api.get(`/spaces/${id}`).then((r) => r.data.space);
export const createSpace = (body) => api.post('/spaces', body).then((r) => r.data.space);
export const updateSpace = (id, body) => api.patch(`/spaces/${id}`, body).then((r) => r.data.space);
export const deleteSpace = (id) => api.delete(`/spaces/${id}`);
