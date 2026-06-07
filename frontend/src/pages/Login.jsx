// Login page — simple name + password form
import React, { useState } from 'react';
import { login as apiLogin } from '../api';
import { useAuth } from '../App';

export default function LoginPage() {
  const { login } = useAuth();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiLogin(name, password);
      login(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 16, background: 'var(--bg)'
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>⚽</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>
            World Cup 2026
          </h1>
          <p className="text-muted" style={{ fontSize: 14, marginTop: 4 }}>
            Predictions Challenge
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
              Your name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Simon"
              style={{ width: '100%' }}
              autoFocus
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Your password"
              style={{ width: '100%' }}
              required
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(244,67,54,0.1)', border: '1px solid rgba(244,67,54,0.3)',
              borderRadius: 8, padding: '10px 12px', color: 'var(--red)', fontSize: 14
            }}>
              {error}
            </div>
          )}

          <button className="btn" type="submit" disabled={loading} style={{ marginTop: 4 }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
