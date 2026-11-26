import { api } from './client.js';

export const listDocuments = (spaceId) =>
  api.get(`/spaces/${spaceId}/documents`).then((r) => r.data.documents);

export function uploadDocument(spaceId, { file, kind, year, unit }, onProgress) {
  const form = new FormData();
  form.append('file', file);
  form.append('kind', kind);
  if (kind === 'paper') form.append('year', String(year));
  if (kind === 'notes' && unit) form.append('unit', unit); // 'mixed' = several units
  return api
    .post(`/spaces/${spaceId}/documents`, form, {
      onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
    })
    .then((r) => r.data.document);
}

export const retryDocument = (spaceId, docId) =>
  api.post(`/spaces/${spaceId}/documents/${docId}/retry`).then((r) => r.data.document);

export const deleteDocument = (spaceId, docId) => api.delete(`/spaces/${spaceId}/documents/${docId}`);
