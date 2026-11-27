import { DATA_URL, READ_ONLY_MESSAGE, fileFor } from './mode.js';

// The static demo's stand-in for streaming answers: a recorded answer (exported from a real run) is typed out
// again piece by piece, so it looks and feels like the live app. Anything else would need live AI.

export class StaticDemoError extends Error {
  constructor() {
    super(READ_ONLY_MESSAGE);
    this.code = 'static_demo';
  }
}

const normalise = (text) => text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?.!]+$/, '');

let recorded = null;
export async function recordedConversations(spaceId) {
  recorded ??= {};
  recorded[spaceId] ??= fetch(`${DATA_URL}/${fileFor(`/spaces/${spaceId}/recorded-asks`)}`)
    .then((res) => (res.ok && res.headers.get('content-type')?.includes('json') ? res.json() : { conversations: [] }))
    .then((d) => d.conversations)
    .catch(() => []);
  return recorded[spaceId];
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Stopped', 'AbortError'));
    });
  });

// path: the streaming route the live app would POST to. Only Ask has recordings.
export async function replayStream(path, body, { onToken, signal }) {
  const ask = path.match(/^\/spaces\/([^/]+)\/ask$/);
  if (!ask || !body.question) throw new StaticDemoError();
  const conversation = (await recordedConversations(ask[1])).find((c) => normalise(c.question) === normalise(body.question));
  if (!conversation) throw new StaticDemoError();

  await sleep(600, signal); // "Reading your notes…"
  const pieces = conversation.content.match(/\S+\s*/g) ?? [];
  for (let i = 0; i < pieces.length; i += 2) {
    if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
    onToken(pieces.slice(i, i + 2).join(''));
    await sleep(28, signal);
  }
  return { content: conversation.content, citations: conversation.citations, provider: conversation.provider, model: conversation.model, marks: conversation.marks, recorded: true };
}
