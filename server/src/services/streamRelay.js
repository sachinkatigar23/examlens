import { Document } from '../models/Document.js';
import { openAiStream } from './aiService.js';
import { readSse, sendEvent, startSse } from '../utils/sse.js';

// The AI service only knows document ids; the user wants to see file names.
export async function withFileNames(citations = []) {
  const ids = [...new Set(citations.map((c) => c.document_id))];
  const docs = await Document.find({ _id: { $in: ids } }).select('originalName').lean();
  const names = new Map(docs.map((d) => [d._id.toString(), d.originalName]));
  return citations
    .filter((c) => names.has(c.document_id)) // skip chunks of a document deleted a moment ago
    .map((c) => ({ documentId: c.document_id, originalName: names.get(c.document_id), page: c.page, snippet: c.snippet }));
}

// Relays an AI-service SSE stream (/ask or /lesson) to the browser token by token, then lets the caller save
// the result. Used by Ask, exam answers and Study lessons.
//   onStart()                               runs once the AI stream is open (e.g. save the user's question)
//   onFinish({ text, meta, citations, complete })  saves the result; returns extra fields for the "done" event
//   keepGoing: true = finish and save even if the browser leaves (a lesson is worth keeping)
export async function relayAiStream(req, res, { path, body, onStart, onFinish, keepGoing = false }) {
  const upstreamAbort = new AbortController();
  let clientGone = false;
  res.on('close', () => {
    if (res.writableEnded) return;
    clientGone = true;
    if (!keepGoing) upstreamAbort.abort();
  });

  // If the AI service is down this throws before anything is streamed → normal JSON error (503).
  const upstream = await openAiStream(path, body, upstreamAbort.signal);
  await onStart?.();
  startSse(res);
  const send = (event, data) => !clientGone && sendEvent(res, event, data);

  let text = '';
  let meta = null;
  let error = null;
  try {
    for await (const { event, data } of readSse(upstream.body)) {
      if (event === 'token') {
        text += data.text;
        send('token', { text: data.text });
      } else if (event === 'done') meta = data;
      else if (event === 'error') error = { message: data.message, code: data.code ?? null };
    }
  } catch (err) {
    if (!upstreamAbort.signal.aborted) {
      console.error('AI stream failed', err);
      error = { message: 'The answer was cut off. Please try again.', code: 'cut_off' };
    }
  }

  const stopped = upstreamAbort.signal.aborted;
  const citations = meta ? await withFileNames(meta.citations) : [];
  const complete = Boolean(meta) && !error;
  // Save whatever was produced; the caller decides whether a partial text is worth keeping.
  const extra = text.trim() ? await onFinish({ text, meta, citations, complete }) : null;

  if (complete) send('done', { ...meta, citations, ...extra });
  else if (error) send('error', error);
  else if (!stopped) send('error', { message: 'The AI service stopped before finishing the answer.', code: 'cut_off' });
  if (!res.writableEnded) res.end();
}
