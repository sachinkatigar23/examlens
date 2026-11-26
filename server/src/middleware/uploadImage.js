import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

// "Snap a doubt" photos live next to the PDFs, in UPLOAD_DIR/images (shared with the AI service).
export const IMAGE_DIR = path.join(env.uploadDir, 'images');
fs.mkdirSync(IMAGE_DIR, { recursive: true });

export const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: IMAGE_DIR,
  // Random name: never trust the user's file name on disk.
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${IMAGE_TYPES[file.mimetype]}`),
});

function imagesOnly(_req, file, cb) {
  if (!IMAGE_TYPES[file.mimetype]) return cb(new AppError(415, 'UNSUPPORTED_FILE', 'Only JPG, PNG or WebP photos'));
  cb(null, true);
}

export const uploadImage = multer({
  storage,
  fileFilter: imagesOnly,
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
}).single('image');

// The browser's mimetype can be faked: check the first bytes really are a JPG/PNG/WebP.
export async function looksLikeImage(filePath, mimeType) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const { buffer } = await handle.read(Buffer.alloc(12), 0, 12, 0);
    if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (mimeType === 'image/webp') return buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP';
    return false;
  } finally {
    await handle.close();
  }
}
