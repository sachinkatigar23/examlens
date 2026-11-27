import { api } from './client.js';
import { cloudUsed } from './settings.js';

export function uploadPhoto(spaceId, file, onProgress) {
  const form = new FormData();
  form.append('image', file);
  return api
    .post(`/spaces/${spaceId}/photos`, form, {
      onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
    })
    .then((r) => r.data.photo);
}

// Vision can take a while (a minute or more for a local model), hence the long timeout.
// purpose: 'doubt' (a question/code to solve) or 'answer' (the student's own written answer, for Check my answer)
export const transcribePhoto = (spaceId, photoId, mode, purpose = 'doubt') =>
  api
    .post(`/spaces/${spaceId}/photos/${photoId}/transcribe`, { mode, purpose }, { timeout: 600_000 })
    .then((r) => r.data)
    .finally(() => cloudUsed(mode));

// The image needs the access token, so it is fetched as a blob and shown through an object URL.
export const photoBlobUrl = (spaceId, photoId) =>
  api.get(`/spaces/${spaceId}/photos/${photoId}/file`, { responseType: 'blob' }).then((r) => URL.createObjectURL(r.data));
