import { Document } from '../models/Document.js';
import { Message } from '../models/Message.js';
import { openAskStream } from '../services/aiService.js';
import { readSse, sendEvent, startSse } from '../utils/sse.js';

const HISTORY_MESSAGES = 6;

// The AI service only knows document ids; the user wants to see file names.
async function withFileNames(citations) {
  const ids = [...new Set(citations.map((c) => c.document_id))];
  const docs = await Document.find({ _id: { $in: ids } }).select('originalName').lean();
  const names = new Map(docs.map((d) => [d._id.toString(), d.originalName]));
  return citations
    .filter((c) => names.has(c.document_id)) // skip chunks of a document deleted a moment ago
    .map((c) => ({ documentId: c.document_id, originalName: names.get(c.document_id), page: c.page, snippet: c.snippet }));
}

// POST /spaces/:spaceId/ask — proxies the AI service's SSE stream to the browser, event by event,
// and saves the question and the final answer as Messages.
export async function ask(req, res) {
  const { question } = req.body;
  const space = req.space._id;

  const recent = await Message.find({ space }).sort({ createdAt: -1 }).limit(HISTORY_MESSAGES).lean();
  const history = recent.reverse().map((m) => ({ role: m.role, content: m.content }));

  // Stop generating if the browser goes away (tab closed, "Stop" pressed).
  const upstreamAbort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) upstreamAbort.abort();
  });

  // If the AI service is down this throws before anything is streamed → normal JSON error (503).
  const upstream = await openAskStream({ spaceId: space.toString(), question, history }, upstreamAbort.signal);

  await Message.create({ space, user: req.user.id, role: 'user', content: question });
  startSse(res);

  let answer = '';
  let citations = [];
  let finished = false;
  try {
    for await (const { event, data } of readSse(upstream.body)) {
      if (event === 'token') {
        answer += data.text;
        sendEvent(res, 'token', { text: data.text });
      } else if (event === 'done') {
        citations = await withFileNames(data.citations ?? []);
        finished = true;
      } else if (event === 'error') {
        sendEvent(res, 'error', { message: data.message });
        finished = true;
      }
    }
  } catch (err) {
    if (!upstreamAbort.signal.aborted) {
      console.error('ask stream failed', err);
      sendEvent(res, 'error', { message: 'The answer was cut off. Please ask again.' });
    }
  }

  // Save whatever was answered, even if the user stopped it halfway.
  const saved = answer.trim()
    ? await Message.create({ space, user: req.user.id, role: 'assistant', content: answer, citations })
    : null;

  if (finished && saved) sendEvent(res, 'done', { citations, messageId: saved._id });
  else if (!finished && !upstreamAbort.signal.aborted) {
    sendEvent(res, 'error', { message: 'The AI service stopped before finishing the answer.' });
  }
  res.end();
}

export async function listMessages(req, res) {
  const messages = await Message.find({ space: req.space._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ messages: messages.reverse() });
}

export async function clearMessages(req, res) {
  await Message.deleteMany({ space: req.space._id });
  res.status(204).end();
}
