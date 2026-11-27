import { useEffect, useState } from 'react';
import { getPublicConfig } from '../api/config.js';
import { useAuth } from '../context/AuthContext.jsx';

const DEFAULT = { publicDemo: false, registrationOpen: true, demoAccount: null };

// Is this the public demo? (banner, sign-ups closed, "use the demo account" button)
export function usePublicConfig() {
  const [config, setConfig] = useState(DEFAULT);
  useEffect(() => {
    let alive = true;
    getPublicConfig().then((c) => alive && setConfig(c));
    return () => {
      alive = false;
    };
  }, []);
  return config;
}

// The shared public-demo account can look at everything but not upload, delete or edit (the server enforces
// it; the UI just doesn't offer those buttons).
export function useReadOnly() {
  return Boolean(useAuth().user?.readOnly);
}
