import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

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

// Opens the SSE stream for an answer. Returns the fetch Response; the caller reads response.body.
// No overall timeout (answers stream for a while); `signal` aborts it when the browser disconnects.
export async function openAskStream({ spaceId, question, history }, signal) {
  let res;
  try {
    res = await fetch(`${env.aiServiceUrl}/ask`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ space_id: spaceId, question, history }),
      signal,
    });
  } catch {
    throw aiDown();
  }
  if (!res.ok || !res.body) {
    throw new AppError(502, 'AI_SERVICE_ERROR', `The AI service answered with ${res.status}`);
  }
  return res;
}

export async function isAiHealthy() {
  try {
    const res = await fetch(`${env.aiServiceUrl}/health`, { signal: AbortSignal.timeout(2000) });
    return await res.json();
  } catch {
    return { ok: false, reachable: false };
  }
}
