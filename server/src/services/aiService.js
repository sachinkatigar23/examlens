import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { readSse } from '../utils/sse.js';

const headers = () => ({ 'Content-Type': 'application/json', 'X-Service-Key': env.serviceKey });
const aiDown = () => new AppError(503, 'AI_SERVICE_DOWN', 'The AI service is not running right now');

// Thin client for the internal FastAPI service. Every call carries the shared X-Service-Key.
async function callAi(method, path, body, timeoutMs = 5000) {
  let res;
  try {
    res = await fetch(`${env.aiServiceUrl}${path}`, {
      method,
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw aiDown();
  }
  if (!res.ok) {
    // Errors the AI service raises on purpose look like { detail: { message, code } }.
    const detail = (await res.json().catch(() => null))?.detail;
    if (detail?.message) {
      const status = [400, 429].includes(res.status) ? res.status : 503;
      throw new AppError(status, String(detail.code || 'ai_error').toUpperCase(), detail.message);
    }
    throw new AppError(502, 'AI_SERVICE_ERROR', `The AI service answered with ${res.status}`);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

export function requestIngest(document) {
  return callAi('POST', '/ingest', {
    document_id: document.id,
    space_id: document.space.toString(),
    kind: document.kind,
    year: document.year,
    unit: document.unit,
    file_path: document.storedName, // relative to UPLOAD_DIR, which both services share
  });
}

export function deleteDocumentVectors(documentId) {
  return callAi('DELETE', `/documents/${documentId}`);
}

// questions: [{ id, text }] → [{ id, topic_id, match_score }]
export function rematchQuestions(spaceId, questions) {
  return callAi('POST', '/rematch', { space_id: spaceId, questions }, 120_000);
}

// documents: [{ document_id, unit }] → re-tags their note chunks with unit + nearest topic
export function retagUnits(spaceId, documents) {
  return callAi('POST', '/retag-units', { space_id: spaceId, documents }, 300_000);
}

// What the Local/Cloud toggle can offer. Never throws: AI down = nothing available.
export async function getProviders() {
  try {
    return await callAi('GET', '/providers', null, 4000);
  } catch {
    return {
      local: { available: false, model: null },
      cloud: { available: false, model: null },
      vision: { local: false, cloud: false },
      embeddings: false,
      aiDown: true,
    };
  }
}

// filePath: "images/<uuid>.jpg" → { text, provider, model }. purpose: 'doubt' | 'answer' (a written answer). Vision can be slow (local models: minutes).
export function transcribePhoto(filePath, mode, purpose = 'doubt') {
  return callAi('POST', '/transcribe', { file_path: filePath, mode, purpose }, 600_000);
}

// Opens an SSE stream (/ask, /lesson). Returns the fetch Response; the caller reads response.body.
// No overall timeout (answers stream for a while); `signal` aborts it when the browser disconnects.
export async function openAiStream(path, body, signal) {
  let res;
  try {
    res = await fetch(`${env.aiServiceUrl}${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal });
  } catch {
    throw aiDown();
  }
  if (!res.ok || !res.body) {
    throw new AppError(502, 'AI_SERVICE_ERROR', `The AI service answered with ${res.status}`);
  }
  return res;
}

// Reads a whole stream without a browser attached (background jobs): { text, meta, error }.
export async function collectAiStream(path, body, signal) {
  const res = await openAiStream(path, body, signal);
  let text = '';
  let meta = null;
  let error = null;
  for await (const { event, data } of readSse(res.body)) {
    if (event === 'token') text += data.text;
    else if (event === 'done') meta = data;
    else if (event === 'error') error = data;
  }
  if (!meta && !error) error = { message: 'The AI service stopped before finishing the answer.', code: 'cut_off' };
  if (meta?.content) text = meta.content; // the corrected text (page citations added), see streamRelay.js
  return { text, meta, error };
}

export async function isAiHealthy() {
  try {
    const res = await fetch(`${env.aiServiceUrl}/health`, { signal: AbortSignal.timeout(2000) });
    return await res.json();
  } catch {
    return { ok: false, reachable: false };
  }
}
