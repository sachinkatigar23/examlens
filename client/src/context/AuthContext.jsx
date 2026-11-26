import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { refreshSession, setAccessToken, setSessionExpiredHandler } from '../api/client.js';
import { loginUser, logoutUser, registerUser } from '../api/auth.js';

const AuthContext = createContext(null);

// status: 'loading' (checking the refresh cookie on page load) | 'authed' | 'guest'
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  const signIn = useCallback(({ user, accessToken }) => {
    setAccessToken(accessToken);
    setUser(user);
    setStatus('authed');
  }, []);

  const signOutLocally = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('guest');
  }, []);

  // On first load, try the refresh cookie: if it's valid the user stays logged in across reloads.
  useEffect(() => {
    setSessionExpiredHandler(signOutLocally);
    refreshSession().then(signIn).catch(signOutLocally);
  }, [signIn, signOutLocally]);

  const value = useMemo(
    () => ({
      user,
      status,
      setUser, // after settings change (e.g. the default Local/Cloud mode)
      login: async (credentials) => signIn(await loginUser(credentials)),
      register: async (details) => signIn(await registerUser(details)),
      logout: async () => {
        await logoutUser().catch(() => {});
        signOutLocally();
      },
    }),
    [user, status, signIn, signOutLocally],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
