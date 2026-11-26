import { api } from './client.js';

export const registerUser = (body) => api.post('/auth/register', body).then((r) => r.data);
export const loginUser = (body) => api.post('/auth/login', body).then((r) => r.data);
export const logoutUser = () => api.post('/auth/logout');
