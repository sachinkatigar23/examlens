import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { Photo } from '../models/Photo.js';
import { IMAGE_DIR, looksLikeImage } from '../middleware/uploadImage.js';
import { transcribePhoto } from '../services/aiService.js';
import { AppError, notFound } from '../utils/AppError.js';

async function findPhoto(req) {
  const { photoId } = req.params;
  if (!mongoose.isValidObjectId(photoId)) throw notFound('Photo');
  const photo = await Photo.findOne({ _id: photoId, space: req.space._id }); // owner-checked via the space
  if (!photo) throw notFound('Photo');
  return photo;
}

// POST /spaces/:spaceId/photos (multipart "image") → 201 { photo }
export async function uploadPhoto(req, res) {
  if (!req.file) throw new AppError(400, 'NO_FILE', 'Attach a photo in the "image" field');
  if (!(await looksLikeImage(req.file.path, req.file.mimetype))) {
    throw new AppError(415, 'UNSUPPORTED_FILE', 'That file is not a valid JPG, PNG or WebP image');
  }
  const photo = await Photo.create({
    space: req.space._id,
    owner: req.user.id,
    storedName: req.file.filename,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
  });
  res.status(201).json({ photo });
}

// GET /spaces/:spaceId/photos/:photoId/file — the image itself (fetched with the access token, shown as a blob).
export async function getPhotoFile(req, res) {
  const photo = await findPhoto(req);
  res.set({ 'Content-Type': photo.mimeType, 'Cache-Control': 'private, max-age=3600' });
  res.sendFile(path.join(IMAGE_DIR, photo.storedName));
}

// POST /spaces/:spaceId/photos/:photoId/transcribe { mode } → { text, provider, model }
export async function transcribe(req, res) {
  const photo = await findPhoto(req);
  const result = await transcribePhoto(`images/${photo.storedName}`, req.body.mode, req.body.purpose);
  photo.transcription = result.text;
  await photo.save();
  res.json(result);
}

export async function deletePhoto(req, res) {
  const photo = await findPhoto(req);
  await fs.unlink(path.join(IMAGE_DIR, photo.storedName)).catch(() => {});
  await photo.deleteOne();
  res.status(204).end();
}
