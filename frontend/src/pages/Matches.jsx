// Matches page — shows all matches grouped by stage
// User can submit or update predictions for upcoming matches
import React, { useState, useEffect, useCallback } from 'react';
import { getMatches } from '../api';
import MatchCard from '../components/MatchCard';

export default function MatchesPage() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeStage, setActiveStage] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await getMatches();
      setMatches(data);
      // Default to the first stage with upcoming matches, or just the first stage
      if (!activeStage && data.length > 0) {
        const upcoming = data.find(m => m.status === 'SCHEDULED');
        setActiveStage(upcoming ? upcoming.stage : data[0].stage);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (error) return <div className="page"><p style={{ color: 'var(--red)' }}>{error}</p></div>;
  if (matches.length === 0) return (
    <div className="page" style={{ textAlign: 'center', paddingTop: 60 }}>
      <p style={{ fontSize: 40 }}>⏳</p>
      <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>
        No matches yet. Check back after the squad sync runs.
      </p>
    </div>
  );

  // Group matches by stage
  const stages = [...new Set(matches.map(m => m.stage))];

  // Order stages logically
  const stageOrder = ['Group Stage', 'Round of 32', 'Round of 16', 'Quarter-Finals', 'Semi-Finals', 'Third Place', 'Final'];
  stages.sort((a, b) => {
    const ai = stageOrder.indexOf(a), bi = stageOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const grouped = {};
  stages.forEach(s => { grouped[s] = matches.filter(m => m.stage === s); });

  return (
    <div className="page">
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Matches</h1>

      {/* Stage tabs */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 20, paddingBottom: 4 }}>
        {stages.map(stage => (
          <button
            key={stage}
            onClick={() => setActiveStage(stage)}
            style={{
              whiteSpace: 'nowrap',
              padding: '7px 14px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 500,
              background: activeStage === stage ? 'var(--accent)' : 'var(--surface)',
              color: activeStage === stage ? '#000' : 'var(--text-muted)',
              border: '1px solid var(--border)',
              transition: 'all 0.15s',
            }}
          >
            {stage}
          </button>
        ))}
      </div>

      {/* Matches for selected stage */}
      {activeStage && grouped[activeStage] && (
        <div>
          {grouped[activeStage].map(match => (
            <MatchCard key={match.id} match={match} onPredictionSaved={load} />
          ))}
        </div>
      )}
    </div>
  );
}
