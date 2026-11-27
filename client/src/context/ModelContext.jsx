import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import Dialog from '../components/Dialog.jsx';
import Button from '../components/Button.jsx';
import { useAuth } from './AuthContext.jsx';
import { CLOUD_USED, getProviders, updateSettings } from '../api/settings.js';

// Which chat models are available (Local = Ollama, Cloud = Gemini), the user's default, and the one-time
// privacy note shown before Cloud is used for the first time.
const ModelContext = createContext(null);

const UNKNOWN = { local: { available: true, model: null }, cloud: { available: false, model: null }, vision: {} };

export function ModelProvider({ children }) {
  const { user, setUser } = useAuth();
  const [providers, setProviders] = useState(UNKNOWN);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const noticeResolve = useRef(null);

  const refresh = useCallback(() => getProviders().then(setProviders).catch(() => {}), []);
  useEffect(() => {
    refresh();
    // Every Cloud call changes today's quota (see api/ask.js); coming back to the tab may be hours later.
    window.addEventListener(CLOUD_USED, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(CLOUD_USED, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  const defaultMode = user?.settings?.defaultMode === 'cloud' && providers.cloud.available ? 'cloud' : 'local';

  const saveSettings = useCallback(async (changes) => setUser(await updateSettings(changes)), [setUser]);

  // Resolves true when Cloud may be used: immediately if the note was already seen, else after "Use Cloud".
  const confirmCloud = useCallback(() => {
    if (user?.settings?.cloudNoticeSeen) return Promise.resolve(true);
    setNoticeOpen(true);
    return new Promise((resolve) => {
      noticeResolve.current = resolve;
    });
  }, [user]);

  function closeNotice(accepted) {
    setNoticeOpen(false);
    noticeResolve.current?.(accepted);
    noticeResolve.current = null;
    if (accepted) saveSettings({ cloudNoticeSeen: true }).catch(() => {});
  }

  const value = useMemo(
    () => ({ providers, defaultMode, refresh, saveSettings, confirmCloud }),
    [providers, defaultMode, refresh, saveSettings, confirmCloud],
  );

  return (
    <ModelContext.Provider value={value}>
      {children}
      <Dialog open={noticeOpen} onClose={() => closeNotice(false)} title="Before you use Cloud">
        <div className="space-y-3 text-sm leading-relaxed">
          <p className="flex gap-2">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-pen" aria-hidden="true" />
            <span>
              Cloud answers come from Google Gemini ({providers.cloud.model ?? 'Gemini'}). For each answer ExamLens sends
              only your question, the few note passages it found, and (for photos) the image.
            </span>
          </p>
          <p className="text-ink-muted">
            Your PDFs are never uploaded: reading, indexing and searching your notes always stay on this machine.
            Local mode sends nothing anywhere.
          </p>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => closeNotice(false)}>Stay local</Button>
          <Button onClick={() => closeNotice(true)}>Use Cloud</Button>
        </div>
      </Dialog>
    </ModelContext.Provider>
  );
}

export function useModels() {
  const ctx = useContext(ModelContext);
  if (!ctx) throw new Error('useModels must be used inside <ModelProvider>');
  return ctx;
}

// Per-screen mode toggle state, starting from the user's default.
export function useModeState() {
  const { defaultMode } = useModels();
  const [mode, setMode] = useState(defaultMode);
  useEffect(() => setMode(defaultMode), [defaultMode]);
  return [mode, setMode];
}
