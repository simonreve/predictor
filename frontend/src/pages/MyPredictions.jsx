// My Predictions page — shows the logged-in user's full prediction history
import React, { useState, useEffect } from 'react';
import { getMyPredictions } from '../api';

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

export default function MyPredictionsPage() {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getMyPredictions()
      .then(setPredictions)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (error) return <div className="page"><p style={{ color: 'var(--red)' }}>{error}</p></div>;

  // Calculate totals
  const totalPts = predictions.reduce((s, p) => s + (parseFloat(p.points_earned) || 0), 0);
  const correct = predictions.filter(p => p.points_earned > 0).length;
  const finished = predictions.filter(p => p.match_status === 'FINISHED').length;

  return (
    <div className="page">
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>My Predictions</h1>

      {/* Stats row */}
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
                {pred.status === 'FINISHED' && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Result: {pred.match_home_score} – {pred.match_away_score}
                  </div>
                )}
              </div>

              {/* Badge + points */}
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
