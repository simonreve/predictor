// Leaderboard page — shows all players ranked by total points
import React, { useState, useEffect } from 'react';
import { getLeaderboard } from '../api';
import { useAuth } from '../App';

const MEDAL = ['🥇', '🥈', '🥉'];

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getLeaderboard()
      .then(setRows)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (error) return <div className="page"><p style={{ color: 'var(--red)' }}>{error}</p></div>;

  return (
    <div className="page">
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Rankings</h1>
      <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>
        Points update automatically when match results come in.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row, i) => {
          const isMe = row.id === user.id;
          const medal = MEDAL[i] || null;

          return (
            <div
              key={row.id}
              className="card"
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: isMe ? 'rgba(0,212,170,0.08)' : 'var(--surface)',
                border: isMe ? '1px solid rgba(0,212,170,0.4)' : '1px solid var(--border)',
              }}
            >
              {/* Rank */}
              <div style={{ width: 36, textAlign: 'center', flexShrink: 0 }}>
                {medal
                  ? <span style={{ fontSize: 22 }}>{medal}</span>
                  : <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-muted)' }}>
                      {row.rank}
                    </span>
                }
              </div>

              {/* Name */}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 16 }}>
                  {row.name} {isMe && <span style={{ fontSize: 12, color: 'var(--accent)' }}>(you)</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {row.correct_predictions} correct / {row.total_predictions} predictions
                </div>
              </div>

              {/* Points */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{
                  fontSize: 22, fontWeight: 700,
                  color: i === 0 ? 'var(--yellow)' : 'var(--accent)'
                }}>
                  {Math.round(row.total_points)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>pts</div>
              </div>
            </div>
          );
        })}
      </div>

      {rows.length === 0 && (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ fontSize: 40 }}>🏆</p>
          <p className="text-muted" style={{ marginTop: 12 }}>
            Leaderboard will fill up once results come in.
          </p>
        </div>
      )}
    </div>
  );
}
