import { Message } from '../models/Message.js';
import { Photo } from '../models/Photo.js';
import { relayAiStream } from '../services/streamRelay.js';
import { notFound } from '../utils/AppError.js';

const HISTORY_MESSAGES = 6;

// Messages saved before threads existed have no `thread`: they belong to the Ask tab.
const threadFilter = (thread) => (thread === 'ask' ? { $in: ['ask', null] } : thread);
const unitOf = (thread) => (thread.startsWith('study:') ? thread.slice('study:'.length) : null);

// POST /spaces/:spaceId/ask { question, mode, thread?, photoId? } — proxies the AI service's SSE stream
// to the browser and saves the question and the answer as Messages.
export async function ask(req, res) {
  const { question, mode, thread, photoId } = req.body;
  const space = req.space._id;
  if (photoId && !(await Photo.exists({ _id: photoId, space }))) throw notFound('Photo');

  const recent = await Message.find({ space, thread: threadFilter(thread) }).sort({ createdAt: -1 }).limit(HISTORY_MESSAGES).lean();
  const history = recent.reverse().map((m) => ({ role: m.role, content: m.content }));

  await relayAiStream(req, res, {
    path: '/ask',
    body: {
      space_id: space.toString(),
      question,
      history,
      mode,
      unit: unitOf(thread),
      purpose: photoId ? 'doubt' : 'ask',
    },
    onStart: () => Message.create({ space, user: req.user.id, role: 'user', content: question, thread, photo: photoId ?? null }),
    // Save whatever was answered, even if the user stopped it halfway.
    onFinish: async ({ text, meta, citations }) => {
      const saved = await Message.create({
        space,
        user: req.user.id,
        role: 'assistant',
        content: text,
        citations,
        thread,
        provider: meta?.provider ?? (meta?.small_talk ? null : mode),
        model: meta?.model ?? null,
        marks: meta?.marks ?? null,
      });
      return { messageId: saved._id };
    },
  });
}

// GET /spaces/:spaceId/messages?thread=study:Unit%202
export async function listMessages(req, res) {
  const thread = typeof req.query.thread === 'string' ? req.query.thread : 'ask';
  const messages = await Message.find({ space: req.space._id, thread: threadFilter(thread) })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.json({ messages: messages.reverse() });
}

export async function clearMessages(req, res) {
  const thread = typeof req.query.thread === 'string' ? req.query.thread : 'ask';
  await Message.deleteMany({ space: req.space._id, thread: threadFilter(thread) });
  res.status(204).end();
}
