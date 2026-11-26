import { API_URL, api, getAccessToken, refreshSession } from './client.js';

// thread: 'ask' (the Ask tab) or 'study:<unit>' (follow-up chat under a lesson)
export const listMessages = (spaceId, thread = 'ask') =>
  api.get(`/spaces/${spaceId}/messages`, { params: { thread } }).then((r) => r.data.messages);
export const clearMessages = (spaceId, thread = 'ask') => api.delete(`/spaces/${spaceId}/messages`, { params: { thread } });

// An error from the AI side. `code` tells the UI what to offer, e.g. 'local_offline' → "use Cloud for this answer?".
export class StreamError extends Error {
  constructor(message, code = null) {
    super(message);
    this.code = code;
  }
}

// Splits a Server-Sent Events byte stream into { event, data } objects.
async function* readEvents(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let end;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = raw.match(/^event: (.*)$/m)?.[1] ?? 'message';
      const data = raw.match(/^data: (.*)$/m)?.[1];
      if (data) yield { event, data: JSON.parse(data) };
    }
  }
}

// POSTs to a streaming route and calls onToken(text) for every piece; resolves with the final "done" data.
// axios can't read a response while it is still arriving, so this uses fetch. EventSource can't either:
// it only does GET and can't send the Authorization header.
export async function streamPost(path, body, { onToken, signal }) {
  const send = () =>
    fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
      body: JSON.stringify(body),
      credentials: 'include',
      signal,
    });

  let res;
  try {
    res = await send();
    if (res.status === 401) {
      await refreshSession(); // same single-flight refresh the axios interceptor uses
      res = await send();
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new StreamError("Can't reach the ExamLens server. Is it running?", 'server_down');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new StreamError(data?.error?.message || 'Something went wrong. Please try again.', data?.error?.code?.toLowerCase());
  }

  for await (const { event, data } of readEvents(res.body)) {
    if (event === 'token') onToken(data.text);
    else if (event === 'done') return data;
    else if (event === 'error') throw new StreamError(data.message, data.code);
  }
  throw new StreamError('The answer was cut off. Please try again.', 'cut_off');
}

// Ask a question. Resolves with { citations, provider, model, marks, messageId }.
export const streamAnswer = (spaceId, { question, mode, thread, photoId }, handlers) =>
  streamPost(`/spaces/${spaceId}/ask`, { question, mode, thread, photoId }, handlers);
