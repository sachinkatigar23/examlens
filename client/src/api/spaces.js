import { api } from './client.js';

export const listSpaces = () => api.get('/spaces').then((r) => r.data.spaces);
export const getSpace = (id) => api.get(`/spaces/${id}`).then((r) => r.data.space);
export const createSpace = (body) => api.post('/spaces', body).then((r) => r.data.space);
export const updateSpace = (id, body) => api.patch(`/spaces/${id}`, body).then((r) => r.data.space);
export const deleteSpace = (id) => api.delete(`/spaces/${id}`);
