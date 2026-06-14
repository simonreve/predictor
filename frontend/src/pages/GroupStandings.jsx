// Group Standings page — shows the live World Cup group tables
import React, { useState, useEffect } from 'react';
import { getStandings } from '../api';

function Flag({ code, name }) {
  if (!code) return <span style={{ display: 'inline-block', width: 24 }} />;
  return (
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      alt={name}
      className="flag"
      style={{ width: 22, height: 'auto', borderRadius: 2, verticalAlign: 'middle' }}
      onError={e => { e.target.style.display = 'none'; }}
    />
  );
}

// "GROUP_A" → "A"
function groupLabel(key) {
  return key.replace('GROUP_', '');
}

export default function GroupStandingsPage() {
  const [groups, setGroups] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeGroup, setActiveGroup] = useState(null);

  useEffect(() => {
    getStandings()
      .then(data => {
        setGroups(data.groups);
        const keys = Object.keys(data.groups).sort();
        if (keys.length > 0) setActiveGroup(keys[0]);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (error) return <div className="page"><p style={{ color: 'var(--red)' }}>{error}</p></div>;

  const groupKeys = Object.keys(groups).sort();

  if (groupKeys.length === 0) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: 60 }}>
        <p style={{ fontSize: 40 }}>⏳</p>
        <p style={{ fontWeight: 600, marginTop: 12 }}>Groups not available yet</p>
        <p className="text-muted" style={{ fontSize: 13, marginTop: 6 }}>
          Group data will load once the football-data.org API provides standings for WC2026.<br />
          Try triggering a sync from the Admin panel if you're an admin.
        </p>
      </div>
    );
  }

  const rows = activeGroup ? (groups[activeGroup] || []) : [];

  return (
    <div className="page">
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Group Standings</h1>
      <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>
        Top 2 of each group advance to the knockout phase.
      </p>

      {/* Group tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {groupKeys.map(key => (
          <button
            key={key}
            onClick={() => setActiveGroup(key)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 600,
              background: activeGroup === key ? 'var(--accent)' : 'var(--surface)',
              color: activeGroup === key ? '#000' : 'var(--text-muted)',
              border: '1px solid var(--border)',
              transition: 'all 0.15s',
            }}
          >
            {groupLabel(key)}
          </button>
        ))}
      </div>

      {/* Standings table */}
      {activeGroup && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            fontWeight: 700,
            fontSize: 15,
            color: 'var(--accent)',
          }}>
            Group {groupLabel(activeGroup)}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', width: 32 }}>#</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Team</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Pts</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>P</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>W</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>D</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>L</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>GF</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>GA</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>GD</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((team, i) => {
                  const qualifies = i < 2;
                  return (
                    <tr
                      key={team.team}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: qualifies ? 'rgba(0,212,170,0.05)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '11px 12px', textAlign: 'left' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 22, height: 22, borderRadius: '50%',
                          background: qualifies ? 'var(--accent)' : 'var(--surface2)',
                          color: qualifies ? '#000' : 'var(--text-muted)',
                          fontSize: 11, fontWeight: 700,
                        }}>
                          {i + 1}
                        </span>
                      </td>
                      <td style={{ padding: '11px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Flag code={team.team_code} name={team.team} />
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{team.team}</span>
                        </div>
                      </td>
					  <td style={{ padding: '11px 12px', textAlign: 'center', fontWeight: 700, fontSize: 16, color: qualifies ? 'var(--accent)' : 'var(--text)' }}>
                        {team.points}
                      </td>
                      <td style={{ padding: '11px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>{team.played}</td>
                      <td style={{ padding: '11px 8px', textAlign: 'center' }}>{team.won}</td>
                      <td style={{ padding: '11px 8px', textAlign: 'center' }}>{team.drawn}</td>
                      <td style={{ padding: '11px 8px', textAlign: 'center' }}>{team.lost}</td>
                      <td style={{ padding: '11px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>{team.goals_for}</td>
                      <td style={{ padding: '11px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>{team.goals_against}</td>
                      <td style={{ padding: '11px 8px', textAlign: 'center', color: team.goal_diff > 0 ? 'var(--green)' : team.goal_diff < 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                        {team.goal_diff > 0 ? `+${team.goal_diff}` : team.goal_diff}
                      </td>
                      
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
              background: 'var(--accent)', flexShrink: 0,
            }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Advances to knockout phase</span>
          </div>
        </div>
      )}
    </div>
  );
}
