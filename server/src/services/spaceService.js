import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { Answer } from '../models/Answer.js';
import { AnswerCheck } from '../models/AnswerCheck.js';
import { Document } from '../models/Document.js';
import { Job } from '../models/Job.js';
import { Lesson } from '../models/Lesson.js';
import { Message } from '../models/Message.js';
import { Photo } from '../models/Photo.js';
import { Question } from '../models/Question.js';
import { Topic } from '../models/Topic.js';
import { removeDocument } from './documentService.js';

// Deleting a space deletes everything inside it.
export async function deleteSpaceCascade(space) {
  const spaceId = space._id;
  await Job.updateMany({ space: spaceId, status: 'running' }, { status: 'cancelled' }); // stops "Answer all"
  const documents = await Document.find({ space: spaceId });
  for (const doc of documents) await removeDocument(doc, { rematch: false });

  const photos = await Photo.find({ space: spaceId }).select('storedName').lean();
  await Promise.all(photos.map((p) => fs.unlink(path.join(env.uploadDir, 'images', p.storedName)).catch(() => {})));

  await Promise.all(
    [Message, Question, Topic, Answer, AnswerCheck, Lesson, Job, Photo].map((Model) => Model.deleteMany({ space: spaceId })),
  );
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
