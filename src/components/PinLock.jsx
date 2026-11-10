import React, { useState } from 'react';
import Icon from './Icon';
import { api } from '../lib/api';

export default function PinLock({ businessName, onUnlocked }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!pin) return;
    setBusy(true);
    setError(null);
    try {
      await api.auth.unlock(pin);
      onUnlocked();
    } catch (err) {
      setError(err.message);
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lock-screen">
      <form className="lock-card" onSubmit={submit}>
        <div className="lock-icon">
          <Icon name="lock" size={28} />
        </div>
        <h1>DailyCollect</h1>
        {businessName && <div className="muted">{businessName}</div>}
        <p className="muted">Enter your PIN to unlock</p>
        <input
          className="input pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          aria-label="PIN"
        />
        {error && <div className="form-error">{error}</div>}
        <button className="btn primary block" disabled={busy || pin.length < 4}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}
