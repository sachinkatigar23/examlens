import { API_URL, api, getAccessToken, refreshSession } from './client.js';

export const listMessages = (spaceId) => api.get(`/spaces/${spaceId}/messages`).then((r) => r.data.messages);
export const clearMessages = (spaceId) => api.delete(`/spaces/${spaceId}/messages`);

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

// Asks a question and streams the answer. axios can't read a response while it is still arriving, so this
// uses fetch. EventSource can't either: it only does GET and can't send the Authorization header.
// Calls onToken(text) for every piece; resolves with { citations, messageId } when the answer is complete.
export async function streamAnswer(spaceId, question, { onToken, signal }) {
  const send = () =>
    fetch(`${API_URL}/spaces/${spaceId}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
      body: JSON.stringify({ question }),
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
    throw new Error("Can't reach the ExamLens server. Is it running?");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || 'Something went wrong. Please try again.');
  }

  for await (const { event, data } of readEvents(res.body)) {
    if (event === 'token') onToken(data.text);
    else if (event === 'done') return data;
    else if (event === 'error') throw new Error(data.message);
  }
  throw new Error('The answer was cut off. Please ask again.');
}
