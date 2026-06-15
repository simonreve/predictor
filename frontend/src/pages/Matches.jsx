// Matches page — shows all matches grouped by stage
// User can submit or update predictions for upcoming matches
import React, { useState, useEffect, useCallback } from 'react';
import { getMatches } from '../api';
import MatchCard from '../components/MatchCard';

const FINISHED_TAB = 'Terminés';

const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT']);
const UPCOMING_STATUSES = new Set(['SCHEDULED', 'TIMED']);

function isFinished(m) { return m.status === 'FINISHED'; }
function isLiveOrUpcoming(m) { return LIVE_STATUSES.has(m.status) || UPCOMING_STATUSES.has(m.status); }

// Group a list of matches by calendar day, returning [{ dayLabel, matches }]
function groupByDay(matches) {
  const order = [];
  const map = {};
  for (const m of matches) {
    const d = new Date(m.kickoff_time);
    const key = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (!map[key]) { map[key] = []; order.push(key); }
    map[key].push(m);
  }
  return order.map(day => ({ day, matches: map[day] }));
}

const stageOrder = ['Group Stage', 'Round of 32', 'Round of 16', 'Quarter-Finals', 'Semi-Finals', 'Third Place', 'Final'];

export default function MatchesPage() {
  const [matches, setMatches] = useState([]);
  const [scoringConfig, setScoringConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await getMatches();
      setMatches(data.matches);
      setScoringConfig(data.scoringConfig);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Set default tab once matches are loaded (only on first load)
  useEffect(() => {
    if (matches.length === 0 || activeTab) return;
    const firstLiveOrUpcoming = matches.find(isLiveOrUpcoming);
    if (firstLiveOrUpcoming) {
      setActiveTab(firstLiveOrUpcoming.stage);
    } else {
      // All done — show Finished
      setActiveTab(FINISHED_TAB);
    }
  }, [matches, activeTab]);

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

  // Stage tabs only show non-finished matches
  const stagesWithUpcoming = [...new Set(
    matches.filter(m => !isFinished(m)).map(m => m.stage)
  )].sort((a, b) => {
    const ai = stageOrder.indexOf(a), bi = stageOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  // All tabs: Finished first, then upcoming stages
  const tabs = [FINISHED_TAB, ...stagesWithUpcoming];

  // Match groups per tab
  const grouped = {};
  // Finished: all finished, most recent first
  grouped[FINISHED_TAB] = [...matches.filter(isFinished)].reverse();
  // Stage tabs: only non-finished
  stagesWithUpcoming.forEach(s => {
    grouped[s] = matches.filter(m => m.stage === s && !isFinished(m));
  });

  const currentMatches = grouped[activeTab] || [];
  const days = groupByDay(currentMatches);

  return (
    <div className="page">
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Matchs</h1>

      {/* Stage tabs */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 20, paddingBottom: 4 }}>
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              whiteSpace: 'nowrap',
              padding: '7px 14px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 500,
              background: activeTab === tab ? 'var(--accent)' : 'var(--surface)',
              color: activeTab === tab ? '#000' : 'var(--text-muted)',
              border: '1px solid var(--border)',
              transition: 'all 0.15s',
            }}
          >
            {tab}
            {tab === FINISHED_TAB && grouped[FINISHED_TAB].length > 0 && (
              <span style={{
                marginLeft: 6,
                padding: '1px 6px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 700,
                background: activeTab === tab ? 'rgba(0,0,0,0.2)' : 'var(--surface2)',
                color: activeTab === tab ? '#000' : 'var(--text-muted)',
              }}>
                {grouped[FINISHED_TAB].length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Matches grouped by day */}
      {days.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: 20 }}>
          Aucun match à afficher.
        </p>
      ) : (
        days.map(({ day, matches: dayMatches }) => (
          <div key={day} style={{ marginBottom: 24 }}>
            <div style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 10,
              paddingBottom: 6,
              borderBottom: '1px solid var(--border)',
            }}>
              {day}
            </div>
            {dayMatches.map(match => (
              <MatchCard key={match.id} match={match} onPredictionSaved={load} scoringConfig={scoringConfig} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
