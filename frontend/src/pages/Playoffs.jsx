// Playoffs page — visual tournament bracket with connector lines
import React, { useEffect, useState } from 'react';
import { getBracket } from '../api';

// ── Layout constants ──────────────────────────────────────────────────────────
const CARD_W = 180;          // match card width
const ROW_H  = 32;           // height of each team row inside a card
const CARD_H = ROW_H * 2 + 1; // 65px  (2 rows + 1px divider)
const GAP    = 8;            // vertical gap between cards in the same round
const UNIT   = CARD_H + GAP; // 73 — but we want integers; see below

// Use a round UNIT so all offsets are integers
// UNIT = 72 works with CARD_H=64 (we accept 1px rounding on the card)
const U      = 72;
const BETWEEN = 52;          // horizontal space between adjacent round columns
const STEP   = CARD_W + BETWEEN; // column stride: 232
const CONN_W = 18;           // horizontal arm of the ⊣ connector

const ROUNDS = [
  { label: 'R32',            key: 'Round of 32',    n: 16 },
  { label: 'R16',            key: 'Round of 16',    n: 8  },
  { label: 'QF',             key: 'Quarter-Finals', n: 4  },
  { label: 'SF',             key: 'Semi-Finals',    n: 2  },
  { label: 'Final',          key: 'Final',          n: 1  },
];

// Top edge of match i in round idx
function cardTop(idx, i)  { return topOff(idx) + i * sp(idx); }
// Spacing between consecutive card tops in round idx
function sp(idx)          { return Math.pow(2, idx) * U; }
// Top offset for first card in round idx (centres it relative to previous round)
function topOff(idx)      { return (Math.pow(2, idx) - 1) * U / 2; }

const CANVAS_H = 15 * U + CARD_H; // tall enough for 16 R32 cards
const CANVAS_W = ROUNDS.length * STEP - BETWEEN;

// ── Small components ──────────────────────────────────────────────────────────
function Flag({ code, name }) {
  if (!code) return <span style={{ width: 20, display: 'inline-block', flexShrink: 0 }} />;
  return (
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      alt={name || ''}
      style={{ width: 20, height: 'auto', borderRadius: 2, flexShrink: 0 }}
      onError={e => { e.target.style.display = 'none'; }}
    />
  );
}

function TeamRow({ name, code, score, won, finished }) {
  const tbd = !name || name === 'TBD';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '0 8px', height: ROW_H,
      background: won ? 'rgba(0,212,170,0.12)' : 'transparent',
    }}>
      <Flag code={code} name={name} />
      <span style={{
        flex: 1, fontSize: 12, fontWeight: won ? 700 : 500,
        color: tbd ? 'var(--text-muted)' : 'var(--text)',
        fontStyle: tbd ? 'italic' : 'normal',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {name || 'TBD'}
      </span>
      {finished && (
        <span style={{
          fontWeight: 700, fontSize: 13, flexShrink: 0,
          color: won ? 'var(--accent)' : 'var(--text-muted)',
          minWidth: 14, textAlign: 'right',
        }}>
          {score ?? '–'}
        </span>
      )}
    </div>
  );
}

function MatchCard({ match }) {
  const f  = match?.status === 'FINISHED';
  const hw = f && match.home_score > match.away_score;
  const aw = f && match.away_score > match.home_score;
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, overflow: 'hidden', width: CARD_W,
    }}>
      <TeamRow name={match?.home_team} code={match?.home_team_code}
               score={match?.home_score} won={hw} finished={f} />
      <div style={{ height: 1, background: 'var(--border)' }} />
      <TeamRow name={match?.away_team} code={match?.away_team_code}
               score={match?.away_score} won={aw} finished={f} />
    </div>
  );
}

function Ghost() {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px dashed var(--border)',
      borderRadius: 6, overflow: 'hidden', width: CARD_W,
      opacity: 0.3, display: 'flex', flexDirection: 'column',
      justifyContent: 'space-around', padding: '10px 8px', gap: 8,
    }}>
      {[0, 1].map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 20, height: 12, background: 'var(--surface2)', borderRadius: 2, flexShrink: 0 }} />
          <div style={{ width: 60, height: 9, background: 'var(--surface2)', borderRadius: 2 }} />
        </div>
      ))}
    </div>
  );
}

// ── Bracket canvas ────────────────────────────────────────────────────────────
function BracketCanvas({ stages }) {
  const nodes = [];

  ROUNDS.forEach((round, rIdx) => {
    const matches = stages[round.key] || [];

    for (let i = 0; i < round.n; i++) {
      const match = matches[i] ?? null;
      const top   = cardTop(rIdx, i);
      const left  = rIdx * STEP;

      // Card
      nodes.push(
        <div key={`c-${rIdx}-${i}`} style={{ position: 'absolute', top, left }}>
          {match ? <MatchCard match={match} /> : <Ghost />}
        </div>
      );

      // Connector — one per pair, anchored on the even (top) match
      if (i % 2 === 0 && rIdx < ROUNDS.length - 1) {
        const armTop  = top + CARD_H / 2;        // Y of top card centre
        const armH    = sp(rIdx);                 // distance to bottom card centre
        const armLeft = left + CARD_W;

        // ⊣ arm: border-top + border-right + border-bottom
        nodes.push(
          <div key={`arm-${rIdx}-${i}`} style={{
            position: 'absolute',
            top: armTop, left: armLeft,
            width: CONN_W, height: armH,
            borderTop:    '1px solid var(--border)',
            borderRight:  '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
          }} />
        );

        // Horizontal lead from arm midpoint to next-round card
        nodes.push(
          <div key={`lead-${rIdx}-${i}`} style={{
            position: 'absolute',
            top:  armTop + armH / 2,
            left: armLeft + CONN_W,
            width: BETWEEN - CONN_W,
            height: 1,
            background: 'var(--border)',
          }} />
        );
      }
    }
  });

  return (
    <div style={{ overflowX: 'auto', overflowY: 'visible', paddingBottom: 12 }}>
      {/* Round labels */}
      <div style={{ display: 'flex', marginBottom: 10, width: CANVAS_W }}>
        {ROUNDS.map((r, idx) => (
          <div key={r.key} style={{
            width: idx < ROUNDS.length - 1 ? STEP : CARD_W,
            flexShrink: 0, textAlign: 'center',
            fontSize: 10, fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase', color: 'var(--accent)',
          }}>
            {r.label}
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div style={{ position: 'relative', width: CANVAS_W, height: CANVAS_H }}>
        {nodes}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PlayoffsPage() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    getBracket()
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (error)   return <div className="page"><p style={{ color: 'var(--red)' }}>{error}</p></div>;

  const stages     = data?.stages || {};
  const thirdPlace = (stages['Third Place'] || [])[0] ?? null;

  return (
    <div style={{ margin: '0 auto', padding: '20px 16px 80px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Bracket</h1>
      <p className="text-muted" style={{ fontSize: 13, marginBottom: 24 }}>
        Knockout phase — slots fill in as the group stage concludes.
      </p>

      <BracketCanvas stages={stages} />

      {/* Third-place match shown separately */}
      <div style={{ marginTop: 32 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10,
        }}>
          Third Place
        </div>
        {thirdPlace ? <MatchCard match={thirdPlace} /> : <Ghost />}
      </div>
    </div>
  );
}
