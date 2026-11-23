import { useState } from 'react';
import { api } from '../api';

export function LoginScreen({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await api.login({ email: email.trim(), password });
      onSuccess(result.user);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <section className="dialog login-card">
      <div className="brand login-brand">
        <span className="mark" aria-hidden="true" />
        <div>
          <p className="brand-name">Helio Practice</p>
          <p className="brand-sub login-sub">Patient desk</p>
        </div>
      </div>
      <p className="kicker">Sign in</p>
      <h1>Welcome back</h1>
      <form onSubmit={submit} className="stack">
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoFocus
            required
            autoComplete="username"
            maxLength={160}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
            maxLength={200}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="dialog-actions">
          <button type="submit" className="solid" disabled={saving}>
            {saving ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </section>
  );
}
