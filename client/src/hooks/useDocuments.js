import { useCallback, useEffect, useState } from 'react';
import { listDocuments } from '../api/documents.js';
import { errorMessage } from '../api/client.js';

const POLL_MS = 2000;
const isActive = (doc) => doc.status === 'queued' || doc.status === 'processing';

// Loads a space's documents and keeps polling every 2 s while any of them is still being processed.
export function useDocuments(spaceId) {
  const [documents, setDocuments] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setDocuments(await listDocuments(spaceId));
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [spaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const anyActive = documents?.some(isActive) ?? false;
  useEffect(() => {
    if (!anyActive) return;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [anyActive, refresh]);

  return { documents, error, refresh, setDocuments };
}
