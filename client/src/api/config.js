import { api } from './client.js';

// { publicDemo, registrationOpen, demoAccount: { email, password } | null } — asked once per page load.
let pending = null;
export function getPublicConfig() {
  pending ??= api.get('/config').then((r) => r.data).catch(() => {
    pending = null; // try again next time (server still starting)
    return { publicDemo: false, registrationOpen: true, demoAccount: null };
  });
  return pending;
}
