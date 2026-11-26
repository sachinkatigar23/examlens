import { api } from './client.js';

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
export const transcribePhoto = (spaceId, photoId, mode) =>
  api.post(`/spaces/${spaceId}/photos/${photoId}/transcribe`, { mode }, { timeout: 600_000 }).then((r) => r.data);

// The image needs the access token, so it is fetched as a blob and shown through an object URL.
export const photoBlobUrl = (spaceId, photoId) =>
  api.get(`/spaces/${spaceId}/photos/${photoId}/file`, { responseType: 'blob' }).then((r) => URL.createObjectURL(r.data));
