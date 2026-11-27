#!/usr/bin/env node
// Exports the demo account's notebook from a running ExamLens into client/public/static-demo/, the data of the
// read-only static demo on GitHub Pages (client: `npm run build:pages`, see client/src/static/).
//
//   node scripts/export-static-demo.mjs                                   # dev API on http://localhost:5000
//   API_URL=http://localhost:8080/api/v1 node scripts/export-static-demo.mjs        # docker-compose.yml
//   API_URL=https://localhost/api/v1 SERVICE_KEY=... NODE_TLS_REJECT_UNAUTHORIZED=0 \
//     node scripts/export-static-demo.mjs                                 # docker-compose.prod.yml (local test)
//
// Seed the demo first (scripts/seed-demo.mjs: answers, lessons and revision sheets are pre-written). This script
// adds what the seed doesn't: a few recorded Ask conversations, two checked answers and an exam plan. Those
// writes need SERVICE_KEY when the server runs in PUBLIC_DEMO mode (the demo account is read-only there).
// Recorded answers already in the output are reused, so re-exporting doesn't regenerate them.
//
// Only the demo account is read, and the output is checked: no email but the demo one, no service key.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'client/public/static-demo');
const API = (process.env.API_URL || 'http://localhost:5000/api/v1').replace(/\/$/, '');
const EMAIL = process.env.DEMO_EMAIL || 'demo@examlens.local';
const PASSWORD = process.env.DEMO_PASSWORD || 'examlens-demo';
const SERVICE_KEY = process.env.SERVICE_KEY || '';
const MODE = process.env.EXPORT_MODE === 'cloud' ? 'cloud' : 'local';

// Suggested questions in the static Ask tab; each one's answer is recorded once and replayed.
const ASK_QUESTIONS = [
  'Explain the TCP three-way handshake',
  'What is the difference between TCP and UDP?',
  'Explain the OSI reference model for 10 marks',
  'What is subnetting? Explain with an example',
];

// "Check my answer": typed student answers, deliberately incomplete so the grading has something to say.
const SAMPLE_CHECKS = [
  {
    question: 'Explain the TCP three-way handshake.',
    marks: 5,
    answer:
      'TCP uses a three-way handshake to start a connection. First the client sends a SYN packet to the server. ' +
      'Then the server replies with SYN-ACK. Finally the client sends an ACK and the connection is established, ' +
      'after which data can be sent in both directions.',
  },
  {
    question: 'Compare circuit switching and packet switching.',
    marks: 5,
    answer:
      'In circuit switching a dedicated path is set up before communication, like in a telephone call, and the ' +
      'bandwidth is reserved for the whole call. In packet switching the data is broken into packets which can ' +
      'take different routes. Packet switching is used in the internet.',
  },
];

let token = null;
const log = (...a) => console.log('[export]', ...a);

// Same rule as client/src/static/mode.js fileFor(): "/spaces/a/revision/Unit%202" → "spaces/a/revision/Unit_202.json"
const fileFor = (p) =>
  `${p
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/[^A-Za-z0-9_-]/g, '_'))
    .join('/')}.json`;

const headers = (json) => ({
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(SERVICE_KEY ? { 'X-Service-Key': SERVICE_KEY } : {}),
  ...(json ? { 'Content-Type': 'application/json' } : {}),
});

async function api(method, url, body) {
  const res = await fetch(API + url, { method, headers: headers(body !== undefined), body: body && JSON.stringify(body) });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${data?.error?.message ?? ''}`);
  return data;
}

// Fields that say nothing useful in a demo, or point at the account/server internals.
const DROP = new Set(['owner', 'storedName', 'passwordHash', 'refreshTokens', 'tokenVersion', '__v']);
const clean = (value) =>
  Array.isArray(value)
    ? value.map(clean)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).filter(([k]) => !DROP.has(k)).map(([k, v]) => [k, clean(v)]))
      : value;

let written = 0;
function save(urlPath, data) {
  const file = path.join(OUT, fileFor(urlPath.split('?')[0]));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(clean(data))}\n`);
  written += 1;
}

async function exportGet(urlPath) {
  const data = await api('GET', urlPath);
  save(urlPath, data);
  return data;
}

// POSTs to an SSE route and collects { text, done } (or throws the error event's message).
async function stream(url, body) {
  const res = await fetch(API + url, { method: 'POST', headers: headers(true), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`POST ${url} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  let text = '';
  let done = null;
  const events = {};
  for (const block of (await res.text()).replace(/\r\n/g, '\n').split('\n\n')) {
    const event = block.match(/^event: (.*)$/m)?.[1];
    const data = block.match(/^data: (.*)$/m)?.[1];
    if (!event || !data) continue;
    const parsed = JSON.parse(data);
    if (event === 'token') text += parsed.text;
    else if (event === 'done') done = parsed;
    else if (event === 'error') throw new Error(parsed.message);
    else events[event] = parsed;
  }
  if (!done) throw new Error(`POST ${url}: the stream ended without an answer`);
  return { text: done.content ?? text, done, events };
}

async function recordAsks(spaceId, previous) {
  const conversations = [];
  for (const question of ASK_QUESTIONS) {
    const old = previous.find((c) => c.question === question);
    if (old) {
      conversations.push(old);
      continue;
    }
    log(`recording "${question}" (${MODE}) …`);
    try {
      const { text, done } = await stream(`/spaces/${spaceId}/ask`, { question, mode: MODE });
      conversations.push({ question, content: text, citations: done.citations, provider: done.provider, model: done.model, marks: done.marks ?? null });
    } catch (err) {
      log(`  skipped: ${err.message}`);
    }
  }
  save(`/spaces/${spaceId}/recorded-asks`, { conversations });
  return conversations.length;
}

async function exportChecks(spaceId) {
  const typed = async () => (await api('GET', `/spaces/${spaceId}/checks`)).checks.filter((c) => !c.question);
  let checks = await typed();
  for (const sample of SAMPLE_CHECKS) {
    if (checks.some((c) => c.questionText === sample.question)) continue;
    log(`checking a sample answer: "${sample.question}" (${MODE}) …`);
    try {
      await stream(`/spaces/${spaceId}/checks`, { ...sample, mode: MODE });
    } catch (err) {
      log(`  skipped: ${err.message}`);
    }
  }
  checks = (await typed()).filter((c) => SAMPLE_CHECKS.some((s) => s.question === c.questionText)).slice(0, 2);
  save(`/spaces/${spaceId}/checks`, { checks });
  for (const c of checks) await exportGet(`/spaces/${spaceId}/checks/${c._id}`);
  return checks.length;
}

async function exportPlan(spaceId) {
  const today = new Date().toISOString().slice(0, 10);
  let { plan } = await api('GET', `/spaces/${spaceId}/plan?today=${today}`);
  if (!plan) {
    const exam = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10);
    plan = (await api('PUT', `/spaces/${spaceId}/plan`, { examDate: exam, today })).plan;
    log(`set an exam date (${exam}) for the plan`);
  }
  save(`/spaces/${spaceId}/plan`, { plan });
}

async function exportSpace(space) {
  const id = space._id;
  const base = `/spaces/${id}`;
  log(`notebook "${space.name}"`);
  for (const p of ['', '/documents', '/analysis', '/bank', '/answers']) await exportGet(base + p);
  const { questions } = await exportGet(`${base}/questions`); // past-paper questions (filtered client-side)
  const { questions: bank } = await api('GET', `${base}/bank`);

  // Cached exam answers: every bank question, plus any past-paper question that has one.
  let answers = 0;
  for (const q of [...bank, ...questions]) {
    const { answer } = await api('GET', `${base}/questions/${q._id}/answer`);
    if (answer) {
      save(`${base}/questions/${q._id}/answer`, { answer });
      answers += 1;
    }
  }

  const study = await exportGet(`${base}/study`);
  let lessons = 0;
  for (const t of study.units.flatMap((u) => u.topics)) {
    const { lesson } = await api('GET', `${base}/topics/${t._id}/lesson`);
    if (lesson) {
      save(`${base}/topics/${t._id}/lesson`, { lesson });
      lessons += 1;
    }
  }
  let sheets = 0;
  for (const u of study.units) {
    const sheet = await exportGet(`${base}/revision/${encodeURIComponent(u.unit)}`);
    if (sheet.sheet) sheets += 1;
  }

  await exportPlan(id);
  save(`${base}/messages`, { messages: [] }); // Ask starts empty: its suggestions replay the recorded answers
  const previousFile = path.join(OUT, fileFor(`${base}/recorded-asks`));
  const previous = PREVIOUS_ASKS[previousFile] ?? [];
  const asks = await recordAsks(id, previous);
  const checks = await exportChecks(id);
  log(`  ${questions.length} paper questions, ${bank.length} bank questions, ${answers} answers, ${lessons} lessons, ${sheets} revision sheets, ${asks} recorded asks, ${checks} checks`);
}

// Recorded answers from the last export, read before the folder is cleared.
const PREVIOUS_ASKS = {};
function rememberPreviousAsks() {
  if (!fs.existsSync(OUT)) return;
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'recorded-asks.json') PREVIOUS_ASKS[p] = JSON.parse(fs.readFileSync(p, 'utf8')).conversations;
    });
  walk(OUT);
}

// Nothing private may leave: no email but the demo account's, never the service key.
function checkOutput() {
  const all = [];
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else all.push(fs.readFileSync(p, 'utf8'));
    });
  walk(OUT);
  const text = all.join('\n');
  const emails = new Set(text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []);
  emails.delete(EMAIL);
  // Placeholder addresses the model writes in code examples (SMTP etc.): domains reserved for docs (RFC 2606).
  for (const e of emails) if (/@(?:[a-z0-9-]+\.)*example\.(?:com|org|net)$/i.test(e)) emails.delete(e);
  if (emails.size) throw new Error(`unexpected email addresses in the export: ${[...emails].join(', ')}`);
  if (SERVICE_KEY && text.includes(SERVICE_KEY)) throw new Error('the service key ended up in the export');
  const kb = Math.round(Buffer.byteLength(text) / 1024);
  log(`checked ${all.length} files (${kb} KB): only ${EMAIL}, no secrets`);
}

async function main() {
  token = (await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD })).accessToken;
  rememberPreviousAsks();
  // Empty the folder (not delete it: an editor or shell may have it open).
  fs.mkdirSync(OUT, { recursive: true });
  for (const entry of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, entry), { recursive: true, force: true });

  const { user } = await api('GET', '/auth/me');
  const { _id, name, email, settings, createdAt } = user;
  save('/auth/me', { user: { _id, name, email, settings: { ...settings, defaultMode: 'local' }, createdAt } });

  const { spaces } = await exportGet('/spaces');
  for (const space of spaces) await exportSpace(space);
  checkOutput();
  log(`done: ${written} files in ${path.relative(ROOT, OUT)}`);
}

main().catch((err) => {
  console.error('[export] failed:', err.message);
  process.exit(1);
});
