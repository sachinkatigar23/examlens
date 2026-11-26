import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

function CheckingSession() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status">
      <p className="font-mono text-sm text-ink-muted">Opening your notebooks…</p>
    </div>
  );
}

// Only for logged-in users; remembers where they were going so login can send them back.
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <CheckingSession />;
  if (status === 'guest') return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

// Login/Register: logged-in users skip straight to the dashboard.
export function GuestOnly() {
  const { status } = useAuth();
  if (status === 'loading') return <CheckingSession />;
  if (status === 'authed') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
