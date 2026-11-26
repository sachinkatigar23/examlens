import fs from 'node:fs/promises';
import mongoose from 'mongoose';
import { Document } from '../models/Document.js';
import { AppError, notFound } from '../utils/AppError.js';
import { removeDocument, startIngest } from '../services/documentService.js';

// The browser's mimetype can be faked, so check the file really starts with "%PDF-".
async function looksLikePdf(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    const { buffer } = await handle.read(Buffer.alloc(5), 0, 5, 0);
    return buffer.toString('latin1') === '%PDF-';
  } finally {
    await handle.close();
  }
}

export async function uploadDocument(req, res) {
  if (!req.file) throw new AppError(400, 'NO_FILE', 'Attach a PDF in the "file" field');
  if (!(await looksLikePdf(req.file.path))) {
    throw new AppError(415, 'UNSUPPORTED_FILE', 'That file is not a valid PDF');
  }

  const document = await Document.create({
    space: req.space._id,
    owner: req.user.id,
    kind: req.body.kind,
    year: req.body.year,
    originalName: req.file.originalname,
    storedName: req.file.filename,
    sizeBytes: req.file.size,
  });

  // 202 Accepted: the file is saved, processing happens in the background.
  res.status(202).json({ document });
  startIngest(document).catch((err) => console.error('startIngest failed', err));
}

export async function listDocuments(req, res) {
  const documents = await Document.find({ space: req.space._id }).sort({ createdAt: -1 });
  res.json({ documents });
}

export async function deleteDocument(req, res) {
  const { docId } = req.params;
  if (!mongoose.isValidObjectId(docId)) throw notFound('Document');

  const document = await Document.findOne({ _id: docId, space: req.space._id });
  if (!document) throw notFound('Document');

  await removeDocument(document);
  res.status(204).end();
}
