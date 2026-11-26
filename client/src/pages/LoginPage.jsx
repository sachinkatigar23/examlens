import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout.jsx';
import Field from '../components/Field.jsx';
import Button from '../components/Button.jsx';
import FormError from '../components/FormError.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../api/client.js';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(form);
      navigate(location.state?.from?.pathname || '/dashboard', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <h2 className="text-3xl font-semibold">Welcome back.</h2>
      <p className="mt-2 text-ink-muted">Your notebooks are where you left them.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6" noValidate>
        <FormError message={error} />
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

      <p className="mt-8 text-sm text-ink-muted">
        New here?{' '}
        <Link to="/register" className="font-medium text-ink underline decoration-pen decoration-2 underline-offset-4">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
