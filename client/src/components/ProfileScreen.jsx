import { useState } from 'react';
import { api } from '../api';
import { roleLabel } from '../access';

export function ProfileScreen({ user, onUser, onToast }) {
  const [name, setName] = useState(user.name);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveName(event) {
    event.preventDefault();
    setSavingName(true);
    try {
      const result = await api.updateProfile({ name });
      onUser(result.user);
      onToast('Profile saved.');
    } catch (error) {
      onToast(error.message, 'danger');
    } finally {
      setSavingName(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setSavingPassword(true);
    try {
      const result = await api.changePassword({ currentPassword, newPassword });
      onUser(result.user);
      setCurrentPassword('');
      setNewPassword('');
      onToast('Password changed.');
    } catch (error) {
      onToast(error.message, 'danger');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">Account</p>
          <h1>Profile</h1>
        </div>
      </header>
      <form className="stack profile-form" onSubmit={saveName}>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
        </label>
        <label>
          Email
          <input value={user.email} readOnly />
        </label>
        <label>
          Role
          <input value={roleLabel(user.role)} readOnly />
        </label>
        <div className="dialog-actions">
          <button type="submit" className="solid" disabled={savingName}>
            {savingName ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
      <form className="stack profile-form" onSubmit={savePassword}>
        <h2>Password</h2>
        <label>
          Current password
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
            maxLength={200}
          />
        </label>
        <label>
          New password
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={200}
          />
        </label>
        <p className="hint">Use at least 8 characters.</p>
        <div className="dialog-actions">
          <button type="submit" className="solid" disabled={savingPassword}>
            {savingPassword ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </form>
    </section>
  );
}
