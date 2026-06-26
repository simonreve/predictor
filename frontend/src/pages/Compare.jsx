import React, { useState, useEffect } from 'react';
import { getLeaderboard, getUserPredictions, getMyPredictions } from '../api';
import { useAuth } from '../App';

function Flag({ code }) {
  if (!code) return null;
  return (
    <img
      className="flag"
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      alt=""
      style={{ width: 18 }}
      onError={e => { e.target.style.display = 'none'; }}
    />
  );
}

function PredBadge({ pred, matchHomeSc, matchAwaySc }) {
  if (!pred || pred.points_earned === null) return null;
  const ph = pred.home_score, pa = pred.away_score;
  const mh = matchHomeSc, ma = matchAwaySc;
  if (ph === mh && pa === ma) return <span className="badge badge-green" style={{ fontSize: 10 }}>Exact</span>;
  if (Math.sign(ph - pa) === Math.sign(mh - ma)) {
    if ((ph - pa) === (mh - ma)) return <span className="badge badge-blue" style={{ fontSize: 10 }}>Diff</span>;
    return <span className="badge badge-yellow" style={{ fontSize: 10 }}>Winner</span>;
  }
  return <span className="badge badge-red" style={{ fontSize: 10 }}>Wrong</span>;
}

export default function ComparePage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [myPreds, setMyPreds] = useState([]);
  const [theirPreds, setTheirPreds] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getLeaderboard().then(rows => setUsers(rows.filter(r => r.id !== user.id)));
    getMyPredictions().then(setMyPreds);
  }, []);

  useEffect(() => {
    if (!selectedUserId) { setTheirPreds([]); return; }
    setLoading(true);
    getUserPredictions(selectedUserId)
      .then(setTheirPreds)
      .finally(() => setLoading(false));
  }, [selectedUserId]);

  const finished = myPreds.filter(p => p.match_status === 'FINISHED');
  const theirMap = Object.fromEntries(theirPreds.map(p => [p.match_id, p]));

  const selectedUser = users.find(u => u.id === selectedUserId);

  const myTotal = finished.reduce((s, p) => s + (parseFloat(p.points_earned) || 0), 0);
  const theirTotal = selectedUserId
    ? theirPreds.filter(p => p.match_status === 'FINISHED').reduce((s, p) => s + (parseFloat(p.points_earned) || 0), 0)
    : 0;

  return (
    <div className="page">
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Compare</h1>
      <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>
        Compare your predictions match by match with another player.
      </p>

      <div style={{ marginBottom: 20 }}>
        <select
          value={selectedUserId || ''}
          onChange={e => setSelectedUserId(Number(e.target.value) || null)}
          style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 8, color: 'var(--text)', padding: '9px 14px',
            fontSize: 14, minWidth: 220,
          }}
        >
          <option value="">— Choisir un joueur —</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </div>

      {selectedUserId && !loading && (
        <>
          {/* Score totals header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div className="card" style={{ textAlign: 'center', background: 'rgba(0,212,170,0.08)', border: '1px solid rgba(0,212,170,0.3)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{user.name} (vous)</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--accent)' }}>{Math.round(myTotal)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>pts sur {finished.length} matchs</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{selectedUser?.name}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>{Math.round(theirTotal)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>pts sur {finished.length} matchs</div>
            </div>
          </div>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, padding: '6px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <span>Match</span>
            <span style={{ textAlign: 'center', minWidth: 90 }}>Vous</span>
            <span style={{ textAlign: 'center', minWidth: 90 }}>{selectedUser?.name}</span>
            <span style={{ textAlign: 'center', minWidth: 44 }}>Δ</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {finished.map(myP => {
              const theirP = theirMap[myP.match_id] || null;
              return (
                <div key={myP.match_id} className="card" style={{ padding: '10px 12px' }}>
                  {/* Match line */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
                    <Flag code={myP.home_team_code} />
                    {myP.home_team}
                    <span style={{ color: 'var(--accent)', fontWeight: 700, margin: '0 4px' }}>
                      {myP.match_home_score} – {myP.match_away_score}
                    </span>
                    {myP.away_team}
                    <Flag code={myP.away_team_code} />
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{myP.stage}</span>
                  </div>

                  {/* Predictions grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, alignItems: 'center' }}>
                    <div />

                    {/* My prediction */}
                    <div style={{ textAlign: 'center', minWidth: 90 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{myP.home_score} – {myP.away_score}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 2 }}>
                        <PredBadge pred={myP} matchHomeSc={myP.match_home_score} matchAwaySc={myP.match_away_score} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: myP.points_earned > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                          {myP.points_earned != null ? `${Math.round(myP.points_earned)} pts` : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Their prediction */}
                    <div style={{ textAlign: 'center', minWidth: 90 }}>
                      {theirP ? (
                        <>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{theirP.home_score} – {theirP.away_score}</div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 2 }}>
                            <PredBadge pred={theirP} matchHomeSc={myP.match_home_score} matchAwaySc={myP.match_away_score} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: theirP.points_earned > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                              {theirP.points_earned != null ? `${Math.round(theirP.points_earned)} pts` : '—'}
                            </span>
                          </div>
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                      )}
                    </div>

                    {/* Delta */}
                    {(() => {
                      const myPts = parseFloat(myP.points_earned) || 0;
                      const theirPts = theirP ? (parseFloat(theirP.points_earned) || 0) : null;
                      if (theirPts === null) return <div style={{ minWidth: 44 }} />;
                      const delta = Math.round(myPts - theirPts);
                      const color = delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : 'var(--text-muted)';
                      const label = delta > 0 ? `+${delta}` : `${delta}`;
                      return (
                        <div style={{ textAlign: 'center', minWidth: 44, fontWeight: 700, fontSize: 13, color }}>
                          {label}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>

          {finished.length === 0 && (
            <p className="text-muted" style={{ textAlign: 'center', marginTop: 40 }}>No finished matches yet.</p>
          )}
        </>
      )}

      {loading && <div className="spinner" />}

      {!selectedUserId && (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ fontSize: 36 }}>⚡</p>
          <p className="text-muted" style={{ marginTop: 12 }}>Select a player above to compare.</p>
        </div>
      )}
    </div>
  );
}
