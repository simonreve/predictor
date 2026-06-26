import React, { useState, useEffect } from 'react';
import { getMyPredictions, getMatchPredictions } from '../api';
import { useAuth } from '../App';

function Flag({ code }) {
  if (!code) return null;
  return (
    <img
      className="flag"
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      alt=""
      style={{ width: 20 }}
      onError={e => { e.target.style.display = 'none'; }}
    />
  );
}

function ResultBadge({ pred }) {
  if (pred.match_status !== 'FINISHED' || pred.points_earned === null) {
    return <span className="badge" style={{ background: 'rgba(139,143,168,0.15)', color: 'var(--text-muted)' }}>Pending</span>;
  }
  const ph = pred.home_score, pa = pred.away_score;
  const mh = pred.match_home_score, ma = pred.match_away_score;

  if (ph === mh && pa === ma) return <span className="badge badge-green">Exact ⚡</span>;
  if (Math.sign(ph - pa) === Math.sign(mh - ma)) {
    if ((ph - pa) === (mh - ma)) return <span className="badge badge-blue">Goal diff</span>;
    return <span className="badge badge-yellow">Winner</span>;
  }
  return <span className="badge badge-red">Wrong</span>;
}

function BonusSummary({ pred }) {
  if (!pred.bonus_prediction_type || !pred.bonus_prediction_value) return null;

  if (pred.bonus_prediction_type === 'country') {
    const team = pred.bonus_prediction_value === 'home' ? pred.home_team : pred.away_team;
    return <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Bonus: Country · {team}</div>;
  }

  if (pred.bonus_prediction_type === 'player') {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Bonus: Player · {pred.bonus_prediction_value}</div>;
  }

  return null;
}

function CommunityPanel({ matchId, myName }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getMatchPredictions(matchId)
      .then(setRows)
      .catch(err => setError(err.message));
  }, [matchId]);

  if (error) return <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{error}</p>;
  if (!rows) return <div className="spinner" style={{ width: 20, height: 20, margin: '8px auto', borderWidth: 2 }} />;

  return (
    <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
        Tous les pronostics ({rows.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <span style={{ flex: 1, fontWeight: r.user_name === myName ? 700 : 400, color: r.user_name === myName ? 'var(--accent)' : 'var(--text)' }}>
              {r.user_name} {r.user_name === myName && <span style={{ fontSize: 11 }}>(vous)</span>}
            </span>
            <span style={{ fontWeight: 600, minWidth: 50, textAlign: 'center' }}>{r.home_score} – {r.away_score}</span>
            <span style={{ minWidth: 52, textAlign: 'right', fontWeight: 700, color: r.points_earned > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
              {r.points_earned != null ? `${Math.round(r.points_earned)} pts` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MyPredictionsPage() {
  const { user } = useAuth();
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    getMyPredictions()
      .then(setPredictions)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function toggleExpand(matchId) {
    setExpanded(prev => ({ ...prev, [matchId]: !prev[matchId] }));
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (error) return <div className="page"><p style={{ color: 'var(--red)' }}>{error}</p></div>;

  const totalPts = predictions.reduce((s, p) => s + (parseFloat(p.points_earned) || 0), 0);
  const correct = predictions.filter(p => p.points_earned > 0).length;
  const finished = predictions.filter(p => p.match_status === 'FINISHED').length;

  return (
    <div className="page">
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>My Predictions</h1>

      {predictions.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard label="Total points" value={Math.round(totalPts)} color="var(--accent)" />
          <StatCard label="Correct" value={`${correct}/${finished}`} color="var(--green)" />
          <StatCard label="Predictions" value={predictions.length} color="var(--text-muted)" />
        </div>
      )}

      {predictions.length === 0 && (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ fontSize: 40 }}>🎯</p>
          <p className="text-muted" style={{ marginTop: 12 }}>
            No predictions yet — go to Matches to make your picks!
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {predictions.map(pred => (
          <div key={pred.id} className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              {/* Match info */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  <Flag code={pred.home_team_code} />
                  {pred.home_team}
                  <span className="text-muted"> vs </span>
                  {pred.away_team}
                  <Flag code={pred.away_team_code} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {new Date(pred.kickoff_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  {' · '}{pred.stage}
                </div>
                <BonusSummary pred={pred} />
              </div>

              {/* Scores: prediction vs result */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  {pred.home_score} – {pred.away_score}
                </div>
                {pred.match_status === 'FINISHED' && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Result: {pred.match_home_score} – {pred.match_away_score}
                  </div>
                )}
              </div>

              {/* Badge + points + expand button */}
              <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 70 }}>
                <ResultBadge pred={pred} />
                {pred.points_earned !== null && (
                  <div style={{
                    fontSize: 15, fontWeight: 700, marginTop: 4,
                    color: pred.points_earned > 0 ? 'var(--accent)' : 'var(--text-muted)'
                  }}>
                    {Math.round(pred.points_earned)} pts
                  </div>
                )}
              </div>
            </div>

            {/* Community expand — only for finished matches */}
            {pred.match_status === 'FINISHED' && (
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => toggleExpand(pred.match_id)}
                  style={{
                    background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                    padding: '3px 10px', fontSize: 12, color: 'var(--text-muted)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {expanded[pred.match_id] ? '▲ Masquer' : '+ Voir les paris'}
                </button>
              </div>
            )}

            {expanded[pred.match_id] && (
              <CommunityPanel matchId={pred.match_id} myName={user.name} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 90, textAlign: 'center', padding: '12px 8px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}
