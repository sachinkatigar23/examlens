#!/usr/bin/env node
// Demo seed: creates the demo account and a notebook, uploads every PDF in demo-data/, waits until the AI service
// has processed them, asks one question so the Ask tab has an example, then writes every question-bank answer,
// every topic's lesson and every unit's revision sheet, so demo visitors never wait for those.
// Safe to run again: uploaded files and anything already written are skipped (an interrupted run resumes).
// No dependencies (Node 20+: fetch, FormData, Blob).
//
//   node scripts/seed-demo.mjs                                # dev servers: API on http://localhost:5000
//   API_URL=http://localhost:8080/api/v1 node scripts/seed-demo.mjs   # docker stack, from the host
//   docker compose --profile demo up seed                     # inside docker (see docker-compose.yml)
//   node scripts/seed-demo.mjs --reset                        # delete the demo notebook first
//   DEMO_DIR=samples node scripts/seed-demo.mjs               # your own PDFs instead of demo-data/
//   SEED_MODE=cloud node scripts/seed-demo.mjs                # write the answers with Cloud (uses the daily quota)
//   node scripts/seed-demo.mjs --no-generate                  # only upload + process, pre-write nothing
//
// Public demo (PUBLIC_DEMO=true): sign-ups are closed and the demo account is read-only, so the script sends
// SERVICE_KEY (the server's shared secret) as X-Service-Key, which lets it create and fill the demo notebook.
//
// File names decide the kind: "syllabus" → syllabus; "important" → question bank; a year (2019, 2023, ...) →
// past paper of that year; anything else → notes ("unit3" / "unit-3" in the name → Unit 3, otherwise mixed).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = (process.env.API_URL || 'http://localhost:5000/api/v1').replace(/\/$/, '');
const DEMO_DIR = path.resolve(ROOT, process.env.DEMO_DIR || 'demo-data');
const EMAIL = process.env.DEMO_EMAIL || 'demo@examlens.local';
const PASSWORD = process.env.DEMO_PASSWORD || 'examlens-demo';
const SPACE = { name: process.env.DEMO_SPACE || 'Computer Networks – Sem 3', subject: 'Computer Networks', color: '#2C6E7F' };
const QUESTION = process.env.DEMO_QUESTION || 'Explain the TCP three-way handshake';
const SERVICE_KEY = process.env.SERVICE_KEY || '';
const MODE = process.env.SEED_MODE === 'cloud' ? 'cloud' : 'local'; // which model writes the pre-generated text
const RESET = process.argv.includes('--reset');
const GENERATE = !process.argv.includes('--no-generate');
const WAIT_MINUTES = Number(process.env.WAIT_MINUTES) || 60; // a CPU-only server reads PDFs slowly

let token = null;
const log = (...a) => console.log('[seed]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const authHeaders = () => ({
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(SERVICE_KEY ? { 'X-Service-Key': SERVICE_KEY } : {}),
});

async function api(method, url, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(API + url, {
    method,
    headers: {
      ...authHeaders(),
      ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
    },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text;
  if (!res.ok) {
    const err = new Error(data?.error?.message || `${method} ${url} → ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function waitForApi() {
  for (let i = 0; i < 60; i++) {
    try {
      const health = await api('GET', '/health');
      if (!health.ai?.ok) log('warning: AI service not fully ready (is Ollama running with both models?)', JSON.stringify(health.ai));
      return;
    } catch {
      if (i === 0) log(`waiting for the API at ${API} …`);
      await sleep(2000);
    }
  }
  throw new Error(`API not reachable at ${API}`);
}

async function signIn() {
  try {
    token = (await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD })).accessToken;
    log(`logged in as ${EMAIL}`);
  } catch (err) {
    if (err.status !== 401) throw err;
    token = (await api('POST', '/auth/register', { name: 'Demo Student', email: EMAIL, password: PASSWORD })).accessToken;
    log(`created demo account ${EMAIL}`);
  }
}

async function getSpace() {
  const { spaces } = await api('GET', '/spaces');
  let space = spaces.find((s) => s.name === SPACE.name);
  if (space && RESET) {
    await api('DELETE', `/spaces/${space._id}`);
    log('deleted the old demo notebook (--reset)');
    space = null;
  }
  if (!space) {
    space = (await api('POST', '/spaces', SPACE)).space;
    log(`created notebook "${SPACE.name}"`);
  }
  return space;
}

function classify(file) {
  const year = file.match(/(?:19|20)\d{2}/)?.[0];
  const unit = file.match(/unit[\s_-]*(\d+)/i)?.[1];
  if (/syllabus/i.test(file)) return { kind: 'syllabus' };
  if (/important/i.test(file)) return { kind: 'important' };
  if (year) return { kind: 'paper', year };
  return { kind: 'notes', unit: unit && `Unit ${unit}` };
}

async function upload(space) {
  if (!fs.existsSync(DEMO_DIR)) throw new Error(`No folder at ${DEMO_DIR}.`);
  const files = fs.readdirSync(DEMO_DIR).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  if (!files.length) throw new Error(`No PDFs in ${DEMO_DIR}.`);

  const { documents } = await api('GET', `/spaces/${space._id}/documents`);
  const existing = new Set(documents.map((d) => d.originalName));
  // Syllabus first, so papers are matched to topics as they arrive.
  files.sort((a, b) => Number(!/syllabus/i.test(a)) - Number(!/syllabus/i.test(b)));

  for (const file of files) {
    if (existing.has(file)) {
      log(`skip ${file} (already uploaded)`);
      continue;
    }
    const { kind, year, unit } = classify(file);
    const form = new FormData();
    form.append('kind', kind);
    if (year) form.append('year', year);
    if (unit) form.append('unit', unit);
    form.append('file', new Blob([fs.readFileSync(path.join(DEMO_DIR, file))], { type: 'application/pdf' }), file);
    await api('POST', `/spaces/${space._id}/documents`, form);
    log(`uploaded ${file} as ${kind}${year ? ` ${year}` : ''}${unit ? ` (${unit})` : ''}`);
  }
}

async function waitUntilProcessed(space) {
  const deadline = Date.now() + WAIT_MINUTES * 60_000;
  let last = '';
  while (Date.now() < deadline) {
    const { documents } = await api('GET', `/spaces/${space._id}/documents`);
    const counts = documents.reduce((c, d) => ({ ...c, [d.status]: (c[d.status] || 0) + 1 }), {});
    const line = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ');
    if (line !== last) log(`documents: ${line}`);
    last = line;
    if (!counts.queued && !counts.processing) {
      for (const d of documents.filter((x) => x.status === 'failed')) log(`FAILED ${d.originalName}: ${d.error}`);
      return documents;
    }
    await sleep(3000);
  }
  throw new Error(`Documents still processing after ${WAIT_MINUTES} minutes.`);
}

// POSTs to an SSE route and reads the stream to the end (the server saves the result once it's complete).
// Returns null on success, or the error message.
async function stream(url, body) {
  const res = await fetch(API + url, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) return text.match(/"message":"([^"]*)"/)?.[1] || `HTTP ${res.status}`;
  const error = text.match(/event: error\r?\ndata: (.*)/)?.[1];
  return error ? (JSON.parse(error).message ?? 'error') : null;
}

// One example question so the Ask tab isn't empty.
async function askExample(space) {
  const { messages } = await api('GET', `/spaces/${space._id}/messages`);
  if (messages.length) return log('Ask history already has messages, skipping the example question');
  const error = await stream(`/spaces/${space._id}/ask`, { question: QUESTION, mode: MODE });
  log(error ? `example question failed: ${error}` : `asked "${QUESTION}"`);
}

// Every question-bank answer, through the server's own "Answer all" job (one at a time, resumable).
async function answerAll(space) {
  const { questions } = await api('GET', `/spaces/${space._id}/bank`);
  const missing = questions.filter((q) => !q.answer).length;
  if (!missing) return log(`question bank: all ${questions.length} answers already written`);
  log(`question bank: writing ${missing} of ${questions.length} answers (${MODE}) …`);
  try {
    await api('POST', `/spaces/${space._id}/bank/answer-all`, { mode: MODE });
  } catch (err) {
    if (err.status !== 409) throw err; // 409 = already running (the server resumed it): just wait for it
  }
  let job;
  let last = '';
  do {
    await sleep(5000);
    job = (await api('GET', `/spaces/${space._id}/bank/job`)).job;
    const line = `${job.done}/${job.total}`;
    if (line !== last) log(`question bank: ${line} answered`);
    last = line;
  } while (job.status === 'running');
  if (job.status !== 'done') log(`question bank: job ${job.status}${job.error ? `: ${job.error}` : ''}`);
}

// Every topic's lesson (Study tab), then every unit's last-night revision sheet.
async function lessonsAndSheets(space) {
  const { units } = await api('GET', `/spaces/${space._id}/study`);
  const topics = units.flatMap((u) => u.topics.map((t) => ({ ...t, unit: u.unit })));
  const todo = topics.filter((t) => t.status === 'not_started');
  log(`lessons: ${topics.length - todo.length} of ${topics.length} already written`);
  for (const [i, t] of todo.entries()) {
    const started = Date.now();
    const error = await stream(`/spaces/${space._id}/topics/${t._id}/lesson`, { mode: MODE });
    const secs = Math.round((Date.now() - started) / 1000);
    log(`lesson ${i + 1}/${todo.length} ${t.unit} · ${t.name}: ${error ? `FAILED (${error})` : `done in ${secs}s`}`);
  }

  for (const u of units) {
    const unit = encodeURIComponent(u.unit);
    const { sheet } = await api('GET', `/spaces/${space._id}/revision/${unit}`);
    if (sheet) {
      log(`revision sheet ${u.unit}: already written`);
      continue;
    }
    const error = await stream(`/spaces/${space._id}/revision/${unit}`, { mode: MODE });
    log(`revision sheet ${u.unit}: ${error ? `FAILED (${error})` : 'done'}`);
  }
}

async function main() {
  await waitForApi();
  await signIn();
  const space = await getSpace();
  await upload(space);
  const documents = await waitUntilProcessed(space);
  if (documents.some((d) => d.status === 'ready')) {
    await askExample(space);
    if (GENERATE) {
      await answerAll(space);
      await lessonsAndSheets(space);
    }
  }

  const a = await api('GET', `/spaces/${space._id}/analysis`);
  log(`analysis: ${a.paperCount} papers, ${a.questionCount} questions, ${a.topics.length} topics, ${a.repeats.length} repeated questions`);
  if (a.hotTopics[0]) log(`hot topic #1: ${a.hotTopics[0].name} (asked in ${a.hotTopics[0].yearsAsked} of ${a.paperCount} papers)`);
  log(`done. Log in with ${EMAIL} / ${PASSWORD}`);
}

main().catch((err) => {
  console.error('[seed] failed:', err.message);
  process.exit(1);
});
