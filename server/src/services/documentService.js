import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { Document } from '../models/Document.js';
import { deleteDocumentVectors, requestIngest } from './aiService.js';

// Hand the document to the AI service. If it isn't reachable, mark the document failed with a
// clear message instead of leaving it "queued" forever.
export async function startIngest(document) {
  try {
    await requestIngest(document);
  } catch (err) {
    document.status = 'failed';
    document.error = `${err.message}. Delete this file and upload it again once it is running.`;
    await document.save();
  }
}

// Removes the record, the PDF on disk and (best effort) its vectors in Qdrant.
export async function removeDocument(document) {
  await deleteDocumentVectors(document.id).catch((err) =>
    console.warn(`Could not delete vectors for ${document.id}: ${err.message}`),
  );
  await fs.unlink(path.join(env.uploadDir, document.storedName)).catch(() => {});
  await Document.deleteOne({ _id: document._id });
}
