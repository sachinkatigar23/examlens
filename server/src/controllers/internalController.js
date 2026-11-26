import mongoose from 'mongoose';
import { Document } from '../models/Document.js';
import { notFound } from '../utils/AppError.js';
import { applyIngestUpdate } from '../services/ingestResultService.js';

// PATCH /internal/documents/:id — the AI service reports progress and results here.
// 404 tells the AI service the document was deleted meanwhile, so it drops the vectors it just made.
export async function updateDocument(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw notFound('Document');

  const document = await Document.findById(id);
  if (!document) throw notFound('Document');

  await applyIngestUpdate(document, req.body);
  res.status(204).end();
}
