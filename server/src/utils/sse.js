// Tiny Server-Sent Events helpers.

export function startSse(res) {
  res.status(200).set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // stop proxies (nginx) from buffering the stream
  });
  res.flushHeaders();
}

export function sendEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// Reads an SSE byte stream and yields { event, data } objects. Events are separated by a blank line;
// a network chunk can end in the middle of an event, so incomplete text waits in `buffer`.
export async function* readSse(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = raw.match(/^event: (.*)$/m)?.[1] ?? 'message';
      const data = raw
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n');
      if (data) yield { event, data: JSON.parse(data) };
    }
  }
}
