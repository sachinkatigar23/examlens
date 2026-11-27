import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout.jsx';
import Field from '../components/Field.jsx';
import Button from '../components/Button.jsx';
import FormError from '../components/FormError.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../api/client.js';
import { usePublicConfig } from '../hooks/usePublicConfig.js';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { demoAccount, registrationOpen } = usePublicConfig();

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function logIn(credentials) {
    setError('');
    setBusy(true);
    try {
      await login(credentials);
      navigate(location.state?.from?.pathname || '/dashboard', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    logIn(form);
  }

  return (
    <AuthLayout>
      <h2 className="text-3xl font-semibold">Welcome back.</h2>
      <p className="mt-2 text-ink-muted">Your notebooks are where you left them.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6" noValidate>
        <FormError message={error} />
        {demoAccount && (
          <div className="rounded-md border border-rule bg-card p-4 text-sm">
            <p className="text-ink-muted">
              Public demo: log in as <span className="font-mono text-ink">{demoAccount.email}</span> with the password{' '}
              <span className="font-mono text-ink">{demoAccount.password}</span>.
            </p>
            <Button type="button" variant="secondary" className="mt-3" disabled={busy} onClick={() => logIn(demoAccount)}>
              Use the demo account
            </Button>
          </div>
        )}
        <Field label="Email" type="email" autoComplete="email" required value={form.email} onChange={update('email')} />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={form.password}
          onChange={update('password')}
        />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </Button>
      </form>

      {registrationOpen && (
        <p className="mt-8 text-sm text-ink-muted">
          New here?{' '}
          <Link to="/register" className="font-medium text-ink underline decoration-pen decoration-2 underline-offset-4">
            Create an account
          </Link>
        </p>
      )}
    </AuthLayout>
  );
}
