import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

// Thin client for the internal FastAPI service. Every call carries the shared X-Service-Key.
async function callAi(method, path, body, timeoutMs = 5000) {
  let res;
  try {
    res = await fetch(`${env.aiServiceUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': env.serviceKey },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new AppError(503, 'AI_SERVICE_DOWN', 'The AI service is not running right now');
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
