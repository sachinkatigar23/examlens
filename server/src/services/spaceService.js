import { Document } from '../models/Document.js';
import { Message } from '../models/Message.js';
import { Question } from '../models/Question.js';
import { Topic } from '../models/Topic.js';
import { removeDocument } from './documentService.js';

// Deleting a space deletes everything inside it.
export async function deleteSpaceCascade(space) {
  const documents = await Document.find({ space: space._id });
  for (const doc of documents) await removeDocument(doc, { rematch: false });
  await Promise.all([
    Message.deleteMany({ space: space._id }),
    Question.deleteMany({ space: space._id }),
    Topic.deleteMany({ space: space._id }),
  ]);
  await space.deleteOne();
}

// { [spaceId]: number of documents } for the dashboard cards.
export async function countDocumentsBySpace(spaceIds) {
  const rows = await Document.aggregate([
    { $match: { space: { $in: spaceIds } } },
    { $group: { _id: '$space', count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id.toString(), r.count]));
}
