import { useState } from 'react';
import UploadTray from './UploadTray.jsx';
import DocumentList from './DocumentList.jsx';
import FormError from './FormError.jsx';
import { useDocuments } from '../hooks/useDocuments.js';
import { deleteDocument, retryDocument } from '../api/documents.js';
import { errorMessage } from '../api/client.js';

export default function DocumentsTab({ spaceId }) {
  const { documents, error, setDocuments } = useDocuments(spaceId);
  const [actionError, setActionError] = useState('');

  // New uploads appear immediately; polling then takes over their status.
  const handleUploaded = (doc) => setDocuments((list) => [doc, ...(list ?? [])]);

  async function handleDelete(doc) {
    setActionError('');
    try {
      await deleteDocument(spaceId, doc._id);
      setDocuments((list) => list.filter((d) => d._id !== doc._id));
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function handleRetry(doc) {
    setActionError('');
    try {
      const updated = await retryDocument(spaceId, doc._id);
      // Back to "queued": the polling in useDocuments picks it up from here.
      setDocuments((list) => list.map((d) => (d._id === updated._id ? updated : d)));
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[22rem_1fr] lg:items-start">
      <div className="lg:sticky lg:top-6">
        <UploadTray spaceId={spaceId} onUploaded={handleUploaded} />
      </div>
      <div>
        <FormError message={error || actionError} />
        {documents === null ? (
          !error && <p className="font-mono text-sm text-ink-muted" role="status">Opening the folder…</p>
        ) : (
          <DocumentList documents={documents} onDelete={handleDelete} onRetry={handleRetry} />
        )}
      </div>
    </div>
  );
}
