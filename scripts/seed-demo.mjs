#!/usr/bin/env node
// Demo seed: creates the demo account and a notebook, uploads every PDF in samples/, waits until the AI service
// has processed them, and asks one question so the Ask tab has an example. Safe to run again: files already in
// the notebook are skipped. No dependencies (Node 20+: fetch, FormData, Blob).
//
//   node scripts/seed-demo.mjs                                # dev servers: API on http://localhost:5000
//   API_URL=http://localhost:8080/api/v1 node scripts/seed-demo.mjs   # docker stack, from the host
//   docker compose --profile demo up seed                     # inside docker (see docker-compose.yml)
//   node scripts/seed-demo.mjs --reset                        # delete the demo notebook first
//
// File names decide the kind: "syllabus" in the name → syllabus; a year (2019, 2023, ...) → past paper of that
// year; anything else → notes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = (process.env.API_URL || 'http://localhost:5000/api/v1').replace(/\/$/, '');
const SAMPLES = process.env.SAMPLES_DIR || path.join(ROOT, 'samples');
const EMAIL = process.env.DEMO_EMAIL || 'demo@examlens.local';
const PASSWORD = process.env.DEMO_PASSWORD || 'examlens-demo';
const SPACE = { name: process.env.DEMO_SPACE || 'Computer Networks – Sem 3', subject: 'Computer Networks', color: '#2C6E7F' };
const QUESTION = process.env.DEMO_QUESTION || 'Explain the leaky bucket algorithm';
const RESET = process.argv.includes('--reset');
const WAIT_MINUTES = 15;

let token = null;
const log = (...a) => console.log('[seed]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, url, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(API + url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  if (/syllabus/i.test(file)) return { kind: 'syllabus' };
  if (year) return { kind: 'paper', year };
  return { kind: 'notes' };
}

async function upload(space) {
  if (!fs.existsSync(SAMPLES)) throw new Error(`No samples folder at ${SAMPLES}. Put your PDFs there first.`);
  const files = fs.readdirSync(SAMPLES).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  if (!files.length) throw new Error(`No PDFs in ${SAMPLES}.`);

  const { documents } = await api('GET', `/spaces/${space._id}/documents`);
  const existing = new Set(documents.map((d) => d.originalName));
  // Syllabus first, so papers are matched to topics as they arrive.
  files.sort((a, b) => Number(!/syllabus/i.test(a)) - Number(!/syllabus/i.test(b)));

  for (const file of files) {
    if (existing.has(file)) {
      log(`skip ${file} (already uploaded)`);
      continue;
    }
    const { kind, year } = classify(file);
    const form = new FormData();
    form.append('kind', kind);
    if (year) form.append('year', year);
    form.append('file', new Blob([fs.readFileSync(path.join(SAMPLES, file))], { type: 'application/pdf' }), file);
    await api('POST', `/spaces/${space._id}/documents`, form);
    log(`uploaded ${file} as ${kind}${year ? ` ${year}` : ''}`);
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

// One example question so the Ask tab isn't empty. Reads the SSE stream to the end.
async function askExample(space) {
  const { messages } = await api('GET', `/spaces/${space._id}/messages`);
  if (messages.length) return log('Ask history already has messages, skipping the example question');
  const res = await fetch(`${API}/spaces/${space._id}/ask`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: QUESTION }),
  });
  if (!res.ok) return log(`example question skipped: ${res.status}`);
  await res.text(); // wait until the answer has finished streaming (the server saves it at the end)
  log(`asked "${QUESTION}"`);
}

async function main() {
  await waitForApi();
  await signIn();
  const space = await getSpace();
  await upload(space);
  const documents = await waitUntilProcessed(space);
  if (documents.some((d) => d.status === 'ready')) await askExample(space);

  const a = await api('GET', `/spaces/${space._id}/analysis`);
  log(`analysis: ${a.paperCount} papers, ${a.questionCount} questions, ${a.topics.length} topics, ${a.repeats.length} repeated questions`);
  if (a.hotTopics[0]) log(`hot topic #1: ${a.hotTopics[0].name} (asked in ${a.hotTopics[0].yearsAsked} of ${a.paperCount} papers)`);
  log(`done. Log in with ${EMAIL} / ${PASSWORD}`);
}

main().catch((err) => {
  console.error('[seed] failed:', err.message);
  process.exit(1);
});
