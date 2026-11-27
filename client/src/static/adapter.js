import { AxiosError } from 'axios';
import { DATA_URL, READ_ONLY_MESSAGE, fileFor } from './mode.js';

// An axios adapter for the static demo: GET requests are answered from the exported JSON files, everything
// that would write gets a friendly read-only error. Components don't know the difference.

const cache = new Map();
async function load(path) {
  if (!cache.has(path)) {
    cache.set(
      path,
      // A missing file is a 404 on GitHub Pages, but an SPA host (vite preview) answers with index.html: only
      // JSON counts.
      fetch(`${DATA_URL}/${fileFor(path)}`)
        .then((res) => (res.ok && res.headers.get('content-type')?.includes('json') ? res.json() : null))
        .catch(() => null),
    );
  }
  return cache.get(path);
}

// What the server answers when there is nothing to show (no lesson written, no chat yet, ...).
const EMPTY = [
  [/\/messages$/, { messages: [] }],
  [/\/questions\/[^/]+\/answer$/, { answer: null }],
  [/\/topics\/[^/]+\/lesson$/, { lesson: null }],
  [/\/revision\/[^/]+$/, null], // a unit without a sheet: the page shows its own empty state below
  [/\/bank\/job$/, { job: null }],
  [/\/plan$/, { plan: null }],
  [/\/checks$/, { checks: [] }],
  [/\/recorded-asks$/, { conversations: [] }],
];

// Query parameters the server would filter by; the files hold the unfiltered lists.
function filtered(path, params, data) {
  if (/\/questions$/.test(path) && data?.questions) {
    let list = data.questions;
    if (params.topic === 'none') list = list.filter((q) => !q.topic);
    else if (params.topic) list = list.filter((q) => q.topic === params.topic);
    if (params.year) list = list.filter((q) => String(q.year) === String(params.year));
    if (params.confidence === 'low') list = list.filter((q) => q.lowConfidence);
    return { questions: list };
  }
  if (/\/checks$/.test(path) && data?.checks && params.questionId) {
    return { checks: data.checks.filter((c) => c.question === params.questionId) };
  }
  if (/\/answers$/.test(path) && data?.questions && params.unit) {
    return { ...data, questions: data.questions.filter((q) => q.unit === params.unit) };
  }
  if (/\/messages$/.test(path) && params.thread && params.thread !== 'ask') return { messages: [] };
  return data;
}

const PROVIDERS = {
  local: { available: true, model: 'qwen2.5:3b' },
  cloud: { available: false, model: null },
  vision: { local: false, cloud: false },
  embeddings: true,
};

function reply(config, data, status = 200) {
  return { data, status, statusText: String(status), headers: {}, config, request: {} };
}

function fail(config, status, code, message) {
  const response = reply(config, { error: { code, message } }, status);
  return Promise.reject(new AxiosError(message, AxiosError.ERR_BAD_REQUEST, config, {}, response));
}

export async function staticAdapter(config) {
  const method = (config.method || 'get').toUpperCase();
  const path = `/${config.url.replace(/^\/+/, '').split('?')[0]}`;
  const params = config.params || {};

  // No login: every visit is the demo student.
  if (path === '/auth/refresh' || path === '/auth/me') {
    const { user } = await load('/auth/me');
    return reply(config, { user: { ...user, readOnly: true }, accessToken: 'static-demo' });
  }
  if (path === '/auth/logout') return reply(config, null, 204);
  if (path === '/ai/providers') return reply(config, PROVIDERS);
  if (path === '/config') return reply(config, { publicDemo: false, registrationOpen: false, demoAccount: null });

  if (method !== 'GET') return fail(config, 403, 'STATIC_DEMO', READ_ONLY_MESSAGE);

  const data = await load(path);
  if (data) return reply(config, filtered(path, params, data));
  const empty = EMPTY.find(([re]) => re.test(path));
  if (empty && empty[1]) return reply(config, empty[1]);
  if (empty) return fail(config, 404, 'NOT_FOUND', 'Not in this demo');
  return fail(config, 404, 'NOT_FOUND', 'This part of the demo has no data');
}
