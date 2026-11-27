import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout.jsx';
import Field from '../components/Field.jsx';
import Button from '../components/Button.jsx';
import FormError from '../components/FormError.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../api/client.js';
import { usePublicConfig } from '../hooks/usePublicConfig.js';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { registrationOpen } = usePublicConfig();

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    setError('');
    setBusy(true);
    try {
      await register(form);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (!registrationOpen) return <RegistrationClosed />;

  return (
    <AuthLayout>
      <h2 className="text-3xl font-semibold">Start a notebook.</h2>
      <p className="mt-2 text-ink-muted">One account, every subject. Free, and it stays on this machine.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6" noValidate>
        <FormError message={error} />
        <Field label="Name" autoComplete="name" required value={form.name} onChange={update('name')} />
        <Field label="Email" type="email" autoComplete="email" required value={form.email} onChange={update('email')} />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          required
          value={form.password}
          onChange={update('password')}
        />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="mt-8 text-sm text-ink-muted">
        Already have one?{' '}
        <Link to="/login" className="font-medium text-ink underline decoration-pen decoration-2 underline-offset-4">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}

// Public demo: no new accounts. Visitors use the shared, read-only demo account.
function RegistrationClosed() {
  return (
    <AuthLayout>
      <h2 className="text-3xl font-semibold">Sign-ups are closed.</h2>
      <p className="mt-2 text-ink-muted">
        This is a public demo of ExamLens. Log in with the demo account to look around: a Computer Networks notebook
        with sample past papers, answers, lessons and revision sheets. To use your own notes, run ExamLens on your own
        machine (it's free and stays offline).
      </p>
      <Link
        to="/login"
        className="mt-8 inline-flex items-center rounded-md bg-ink px-4 py-2.5 font-medium text-paper hover:bg-ink/90"
      >
        Go to the demo login
      </Link>
    </AuthLayout>
  );
}
