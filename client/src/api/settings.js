import { api } from './client.js';

// Fired after every Cloud request so the quota shown next to the Local/Cloud toggle stays current.
export const CLOUD_USED = 'examlens:cloud-used';
export const cloudUsed = (mode) => mode === 'cloud' && window.dispatchEvent(new Event(CLOUD_USED));

// { local: { available, model }, cloud: { available, model, quota: { used, limit, remaining, exhausted, resetsAt } },
//   vision: { local, cloud }, embeddings }
export const getProviders = () => api.get('/ai/providers').then((r) => r.data);

export const updateSettings = (changes) => api.patch('/auth/me/settings', changes).then((r) => r.data.user);
