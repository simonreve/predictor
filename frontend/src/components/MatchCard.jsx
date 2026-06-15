// MatchCard — displays a single match with prediction input or locked result
import React, { useEffect, useRef, useState } from 'react';
import { submitPrediction, submitBonusAnswer } from '../api';

function Flag({ code, name }) {
  if (!code) return <span style={{ width: 28, display: 'inline-block' }}>🏳</span>;
  return (
    <img
      className="flag"
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      alt={name}
      onError={e => { e.target.style.display = 'none'; }}
    />
  );
}

function formatKickoff(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// "GROUP_A" → "Group A"
function formatGroup(g) {
  if (!g) return null;
  return 'Group ' + g.replace('GROUP_', '');
}

// Compute bonus points earned from bonus questions data
function computeBonusPoints(bonusQuestions) {
  return (bonusQuestions || []).reduce((sum, q) => {
    if (!q.correct_answer || q.my_answer == null) return sum;
    const correct = q.type === 'country'
      ? q.my_answer === q.correct_answer
      : q.my_answer.trim().toLowerCase() === q.correct_answer.trim().toLowerCase();
    return sum + (correct ? (q.type === 'country' ? 3 : 5) : 0);
  }, 0);
}

// Compute score breakdown from prediction + match result (excludes bonus)
function computeBreakdown(pred, match, bonusPoints) {
  const ph = pred.home_score, pa = pred.away_score;
  const mh = match.home_score, ma = match.away_score;
  if (ph == null || pa == null || mh == null || ma == null) return null;

  const predCat = Math.sign(ph - pa);
  const realCat = Math.sign(mh - ma);

  if (predCat !== realCat) {
    return { resultCorrect: false, goalDiffCorrect: false, totalGoalsCorrect: false, rawPoints: 0, multiplier: null, bonusPoints };
  }

  const goalDiffCorrect = realCat !== 0 && (ph - pa) === (mh - ma);
  const totalGoalsCorrect = (ph + pa) === (mh + ma);

  let rawPoints = 5;
  if (goalDiffCorrect) rawPoints += 3;
  if (totalGoalsCorrect) rawPoints += 3;

  // score_points = total - bonus; multiplier = score_points / rawPoints
  const scorePoints = pred.points_earned - bonusPoints;
  const multiplier = rawPoints > 0 ? scorePoints / rawPoints : 1;

  return { resultCorrect: true, goalDiffCorrect, totalGoalsCorrect, rawPoints, multiplier, bonusPoints };
}

function AccuracyBadge({ prediction, match }) {
  if (match.status !== 'FINISHED' || prediction.points_earned === null) return null;
  const ph = prediction.home_score, pa = prediction.away_score;
  const mh = match.home_score, ma = match.away_score;
  if (ph === mh && pa === ma) return <span className="badge badge-green">Exact ✓</span>;
  if (Math.sign(ph - pa) === Math.sign(mh - ma)) {
    if ((ph - pa) === (mh - ma)) return <span className="badge badge-blue">Goal diff ✓</span>;
    return <span className="badge badge-yellow">Winner ✓</span>;
  }
  return <span className="badge badge-red">Wrong ✗</span>;
}

// Single bonus question row
function BonusRow({ q, match, isLocked, value, onChange }) {
  const displayAnswer = (ans) => {
    if (!ans) return '—';
    if (q.type === 'country') {
      if (ans === 'home') return match.home_team;
      if (ans === 'away') return match.away_team;
      if (ans === 'none') return 'Aucune équipe';
    }
    return ans;
  };

  const correct = q.correct_answer;
  const isCorrect = correct && value && (
    q.type === 'country' ? value === correct : value.trim().toLowerCase() === correct.trim().toLowerCase()
  );

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 5, fontWeight: 600 }}>
        {q.type === 'country' ? '🌍' : '⚽'} {q.question}
      </div>

      {!isLocked ? (
        q.type === 'country' ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['home', 'away', 'none'].map(side => (
              <button
                key={side}
                onClick={() => onChange(side)}
                style={{
                  padding: '5px 12px', borderRadius: 6, fontSize: 13, fontWeight: 500,
                  border: '1px solid var(--border)',
                  background: value === side ? 'var(--accent)' : 'var(--surface2)',
                  color: value === side ? '#000' : 'var(--text)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {side === 'none' ? 'Aucune' : (
                  <>
                    <Flag code={side === 'home' ? match.home_team_code : match.away_team_code} name={side === 'home' ? match.home_team : match.away_team} />
                    {' '}{side === 'home' ? match.home_team : match.away_team}
                  </>
                )}
              </button>
            ))}
          </div>
        ) : (
          <input
            type="text"
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            placeholder="Player name…"
            style={{ minWidth: 200 }}
          />
        )
      ) : (
        <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: value ? 'var(--text)' : 'var(--text-muted)' }}>
            {displayAnswer(value)}
          </span>
          {correct && (
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: isCorrect ? 'var(--green)' : 'var(--red)',
            }}>
              {isCorrect ? '✓' : `✗ (${displayAnswer(correct)})`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Points breakdown panel shown when user clicks "+"
function PointsBreakdown({ pred, match, bonusQuestions }) {
  const bonusPoints = computeBonusPoints(bonusQuestions);
  const bd = computeBreakdown(pred, match, bonusPoints);
  if (!bd) return null;

  const scorePoints = pred.points_earned - bonusPoints;

  return (
    <div style={{
      marginTop: 8,
      padding: '10px 12px',
      background: 'var(--surface2)',
      borderRadius: 8,
      fontSize: 12,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <BreakdownRow label="Résultat correct" pts={5} ok={bd.resultCorrect} />
        {bd.resultCorrect && (
          <>
            <BreakdownRow label="Différence de buts" pts={3} ok={bd.goalDiffCorrect} />
            <BreakdownRow label="Total de buts" pts={3} ok={bd.totalGoalsCorrect} />
          </>
        )}
        {bd.resultCorrect && bd.multiplier != null && (
          <div style={{ paddingTop: 4, marginTop: 2, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Multiplicateur rareté</span>
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>×{bd.multiplier.toFixed(2)}</span>
          </div>
        )}
        {bd.resultCorrect && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span>Sous-total score</span>
            <span>{Math.round(scorePoints)} pts</span>
          </div>
        )}
        {bonusPoints > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Bonus questions</span>
            <span style={{ color: 'var(--accent2)', fontWeight: 600 }}>+{bonusPoints} pts</span>
          </div>
        )}
        <div style={{ marginTop: 2, paddingTop: 4, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
          <span>Total</span>
          <span style={{ color: pred.points_earned > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
            {Math.round(pred.points_earned)} pts
          </span>
        </div>
      </div>
    </div>
  );
}

function BreakdownRow({ label, pts, ok }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: ok ? 'var(--text)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: ok ? 'var(--green)' : 'var(--red)', fontSize: 11 }}>{ok ? '✓' : '✗'}</span>
        {label}
      </span>
      <span style={{ color: ok ? 'var(--text)' : 'var(--text-muted)', fontWeight: ok ? 600 : 400 }}>
        {ok ? `+${pts}` : '—'}
      </span>
    </div>
  );
}

export default function MatchCard({ match, onPredictionSaved }) {
  const openStatuses = ['SCHEDULED', 'TIMED'];
  const isLocked = new Date() >= new Date(match.kickoff_time) || !openStatuses.includes(match.status);
  const pred = match.my_prediction;

  // Score prediction state
  const [homeInput, setHomeInput] = useState('');
  const [awayInput, setAwayInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const hydrationRef = useRef(false);
  const saveTimerRef = useRef(null);
  const lastSavedSigRef = useRef('');

  // Bonus answers state: { [questionId]: answerString }
  const [bonusAnswers, setBonusAnswers] = useState({});
  const bonusTimersRef = useRef({});

  // Points breakdown toggle
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Initialise score inputs from existing prediction
  useEffect(() => {
    hydrationRef.current = false;
    setHomeInput(pred ? String(pred.home_score) : '');
    setAwayInput(pred ? String(pred.away_score) : '');
    lastSavedSigRef.current = pred
      ? `${pred.home_score}|${pred.away_score}` : '';
    hydrationRef.current = true;
  }, [pred?.home_score, pred?.away_score, match.id]);

  // Initialise bonus answers from server data
  useEffect(() => {
    const init = {};
    (match.bonus_questions || []).forEach(q => {
      if (q.my_answer != null) init[q.id] = q.my_answer;
    });
    setBonusAnswers(init);
  }, [match.id, match.bonus_questions]);

  // Auto-save score prediction
  useEffect(() => {
    if (!hydrationRef.current || isLocked) return;
    const h = parseInt(homeInput, 10);
    const a = parseInt(awayInput, 10);
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) return;
    const sig = `${h}|${a}`;
    if (sig === lastSavedSigRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true); setError('');
      try {
        await submitPrediction(match.id, h, a, null, null);
        lastSavedSigRef.current = sig;
        setSaved(true); setTimeout(() => setSaved(false), 1500);
        if (onPredictionSaved) onPredictionSaved();
      } catch (err) { setError(err.message); }
      finally { setSaving(false); }
    }, 600);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [homeInput, awayInput, isLocked, match.id, onPredictionSaved]);

  // Save immediately on blur so navigating away never drops a prediction
  async function handleBlur() {
    if (!hydrationRef.current || isLocked) return;
    const h = parseInt(homeInput, 10);
    const a = parseInt(awayInput, 10);
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) return;
    const sig = `${h}|${a}`;
    if (sig === lastSavedSigRef.current) return;
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    setSaving(true); setError('');
    try {
      await submitPrediction(match.id, h, a, null, null);
      lastSavedSigRef.current = sig;
      setSaved(true); setTimeout(() => setSaved(false), 1500);
      if (onPredictionSaved) onPredictionSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  // Auto-save a bonus answer when it changes
  function handleBonusChange(questionId, value) {
    setBonusAnswers(prev => ({ ...prev, [questionId]: value }));
    if (bonusTimersRef.current[questionId]) clearTimeout(bonusTimersRef.current[questionId]);
    bonusTimersRef.current[questionId] = setTimeout(async () => {
      if (!value?.trim()) return;
      try {
        await submitBonusAnswer(questionId, value.trim());
        setSaved(true); setTimeout(() => setSaved(false), 1500);
      } catch (err) { setError(err.message); }
    }, 600);
  }

  const group = formatGroup(match.group_name);
  const bonusQuestions = match.bonus_questions || [];

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      {/* Header row: date · group  |  status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {formatKickoff(match.kickoff_time)}
          {group && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, background: 'rgba(0,212,170,0.12)', color: 'var(--accent)', fontWeight: 600 }}>{group}</span>}
        </span>
        <StatusBadge status={match.status} />
      </div>

      {/* Teams + score */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
          <Flag code={match.home_team_code} name={match.home_team} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>{match.home_team}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {match.status === 'FINISHED' ? (
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', minWidth: 60, textAlign: 'center' }}>
              {match.home_score ?? '-'} – {match.away_score ?? '-'}
            </div>
          ) : isLocked ? (
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-muted)', minWidth: 60, textAlign: 'center' }}>
              {pred ? `${pred.home_score ?? '-'} – ${pred.away_score ?? '-'}` : '— – —'}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*"
                value={homeInput} onChange={e => setHomeInput(e.target.value)}
                onBlur={handleBlur}
                style={{ width: 44, textAlign: 'center', padding: '6px 4px' }}
                placeholder="-"
              />
              <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>–</span>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*"
                value={awayInput} onChange={e => setAwayInput(e.target.value)}
                onBlur={handleBlur}
                style={{ width: 44, textAlign: 'center', padding: '6px 4px' }}
                placeholder="-"
              />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end' }}>
          <span style={{ fontWeight: 600, fontSize: 15, textAlign: 'right' }}>{match.away_team}</span>
          <Flag code={match.away_team_code} name={match.away_team} />
        </div>
      </div>

      {/* Bonus questions */}
      {bonusQuestions.length > 0 && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            Bonus predictions
          </div>
          {bonusQuestions.map(q => (
            <BonusRow
              key={q.id}
              q={q}
              match={match}
              isLocked={isLocked}
              value={bonusAnswers[q.id] ?? ''}
              onChange={val => handleBonusChange(q.id, val)}
            />
          ))}
        </div>
      )}

      {/* Save status */}
      {!isLocked && (error || saving || saved) && (
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
          {error  && <span style={{ color: 'var(--red)',   fontSize: 12 }}>{error}</span>}
          {saving && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Saving…</span>}
          {saved  && <span style={{ color: 'var(--green)', fontSize: 12 }}>Saved ✓</span>}
        </div>
      )}

      {/* Points + accuracy for finished matches */}
      {match.status === 'FINISHED' && pred && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AccuracyBadge prediction={pred} match={match} />
            {pred.home_score !== null && (
              <span className="text-muted" style={{ fontSize: 13 }}>
                Votre pronostic : {pred.home_score ?? '-'} – {pred.away_score ?? '-'}
              </span>
            )}
            {pred.points_earned !== null && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 700, color: pred.points_earned > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {Math.round(pred.points_earned)} pts
                </span>
                <button
                  onClick={() => setShowBreakdown(v => !v)}
                  style={{
                    width: 20, height: 20,
                    borderRadius: '50%',
                    background: showBreakdown ? 'var(--accent)' : 'var(--surface2)',
                    color: showBreakdown ? '#000' : 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    fontSize: 14, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1, padding: 0,
                    transition: 'all 0.15s',
                  }}
                  title="Détail des points"
                >
                  {showBreakdown ? '−' : '+'}
                </button>
              </div>
            )}
          </div>
          {showBreakdown && <PointsBreakdown pred={pred} match={match} bonusQuestions={bonusQuestions} />}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === 'FINISHED') return <span className="badge badge-green">Finished</span>;
  if (['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'].includes(status)) {
    const label = status === 'EXTRA_TIME' ? 'Extra Time' : status === 'PENALTY_SHOOTOUT' ? 'Penalties' : 'Live';
    return <span className="badge badge-yellow">{label}</span>;
  }
  if (status === 'POSTPONED') return <span className="badge badge-red">Postponed</span>;
  if (status === 'CANCELLED')  return <span className="badge badge-red">Cancelled</span>;
  if (status === 'SUSPENDED')  return <span className="badge badge-red">Suspended</span>;
  return <span className="badge" style={{ background: 'rgba(139,143,168,0.15)', color: 'var(--text-muted)' }}>Upcoming</span>;
}
