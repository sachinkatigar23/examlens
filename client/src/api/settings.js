import { api } from './client.js';

// { local: { available, model }, cloud: { available, model }, vision: { local, cloud }, embeddings }
export const getProviders = () => api.get('/ai/providers').then((r) => r.data);

export const updateSettings = (changes) => api.patch('/auth/me/settings', changes).then((r) => r.data.user);
