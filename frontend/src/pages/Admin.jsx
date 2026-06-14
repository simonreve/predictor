// Admin page — manage users, scoring config, and sync
// Only visible to admin users
import React, { useState, useEffect } from 'react';
import {
  adminGetUsers, adminCreateUser, adminDeleteUser, adminChangePassword,
  adminGetScoring, adminUpdateScoring,
  adminTriggerSync, adminGetSyncLogs,
  adminGetBonusMatches, adminCreateBonusQuestion, adminDeleteBonusQuestion,
  adminSetBonusAnswer, adminGetBonusSubmissions,
  adminGetQuestionTemplates, adminCreateQuestionTemplate, adminDeleteQuestionTemplate,
  adminAssignTemplates,
} from '../api';

export default function AdminPage() {
  const [tab, setTab] = useState('users');

  const tabs = [
    { key: 'users',   label: 'Users'   },
    { key: 'bonus',   label: 'Bonus'   },
    { key: 'scoring', label: 'Scoring' },
    { key: 'sync',    label: 'Sync'    },
  ];

  return (
    <div className="page">
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Admin Panel</h1>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '7px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500,
              background: tab === t.key ? 'var(--accent)' : 'var(--surface)',
              color: tab === t.key ? '#000' : 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'users'   && <UsersTab />}
      {tab === 'bonus'   && <BonusTab />}
      {tab === 'scoring' && <ScoringTab />}
      {tab === 'sync'    && <SyncTab />}
    </div>
  );
}

/* ─── Users tab ────────────────────────────────────────────────────── */
function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [changePwdId, setChangePwdId] = useState(null);
  const [newPwd, setNewPwd] = useState('');

  async function load() {
    try {
      setUsers(await adminGetUsers());
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await adminCreateUser(name, password, isAdmin);
      setName(''); setPassword(''); setIsAdmin(false);
      setSuccess(`User "${name}" created!`);
      load();
    } catch (err) { setError(err.message); }
  }

  async function handleDelete(id, userName) {
    if (!confirm(`Delete user "${userName}"? Their predictions will also be deleted.`)) return;
    try {
      await adminDeleteUser(id);
      load();
    } catch (err) { alert(err.message); }
  }

  async function handleChangePwd(id) {
    try {
      await adminChangePassword(id, newPwd);
      setChangePwdId(null); setNewPwd('');
      setSuccess('Password updated!');
    } catch (err) { alert(err.message); }
  }

  if (loading) return <div className="spinner" />;

  return (
    <div>
      {/* Create user form */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>Add new user</h3>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="text" placeholder="Name" value={name}
              onChange={e => setName(e.target.value)}
              style={{ flex: 1, minWidth: 120 }} required
            />
            <input
              type="text" placeholder="Password" value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ flex: 1, minWidth: 120 }} required
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} />
            Admin account
          </label>
          {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
          {success && <p style={{ color: 'var(--green)', fontSize: 13 }}>{success}</p>}
          <button className="btn" type="submit" style={{ alignSelf: 'flex-start' }}>
            Create user
          </button>
        </form>
      </div>

      {/* User list */}
      <h3 style={{ marginBottom: 10 }}>All users ({users.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users.map(u => (
          <div key={u.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>
                {u.name} {u.is_admin && <span className="badge badge-blue" style={{ fontSize: 10 }}>admin</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {u.total_predictions} predictions · {Math.round(u.total_points)} pts
              </div>
            </div>

            {changePwdId === u.id ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text" placeholder="New password" value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  style={{ width: 130 }}
                />
                <button className="btn" onClick={() => handleChangePwd(u.id)} style={{ padding: '6px 12px', fontSize: 13 }}>Save</button>
                <button className="btn btn-secondary" onClick={() => setChangePwdId(null)} style={{ padding: '6px 12px', fontSize: 13 }}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secondary" onClick={() => { setChangePwdId(u.id); setNewPwd(''); }} style={{ padding: '6px 12px', fontSize: 13 }}>
                  Change pwd
                </button>
                <button className="btn btn-danger" onClick={() => handleDelete(u.id, u.name)} style={{ padding: '6px 12px', fontSize: 13 }}>
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Scoring config tab ────────────────────────────────────────────── */
function ScoringTab() {
  const [config, setConfig] = useState([]);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    adminGetScoring().then(rows => {
      const editableRows = rows.filter(r => r.key === 'points_result_correct' || r.key === 'points_goal_diff' || r.key === 'points_total_goals');
      setConfig(editableRows);
      const v = {};
      editableRows.forEach(r => { v[r.key] = r.value; });
      setValues(v);
    }).finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true); setSuccess('');
    try {
      await adminUpdateScoring(values);
      setSuccess('Saved!');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) { alert(err.message); }
    setSaving(false);
  }

  if (loading) return <div className="spinner" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        className="card"
        style={{
          position: 'relative',
          overflow: 'hidden',
          border: '1px solid rgba(0, 212, 170, 0.2)',
          background: 'linear-gradient(135deg, rgba(0,212,170,0.12), rgba(24,28,43,0.92))',
        }}
      >
        <div style={{ position: 'absolute', inset: -40, background: 'radial-gradient(circle at top right, rgba(0,212,170,0.18), transparent 35%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Scoring formula
              </div>
              <h3 style={{ margin: '6px 0 0', fontSize: 22, lineHeight: 1.2 }}>Result-based points with rarity bonus</h3>
            </div>
            <span className="badge badge-blue" style={{ alignSelf: 'flex-start' }}>Updated system</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
            <MiniStat label="Correct result" value="+5" />
            <MiniStat label="Goal difference" value="+3" />
            <MiniStat label="Total goals" value="+3" />
            <MiniStat label="Rarity range" value="1x - 2x" />
          </div>

          <div style={{ padding: 14, borderRadius: 14, background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>How it works</div>
            <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}>
              final_points = raw_points × rarity_multiplier<br />
              raw_points = 5 + 3 + 3 from the three matching conditions<br />
              rarity_multiplier = 1 + (1 - same_result_predictions / total_predictions)
            </div>
          </div>

          <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            The rarity bonus is based on the predicted result category only, not the exact score. Changes apply the next time finished matches are rescored.
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18 }}>Adjustable point values</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>These values control the three raw point checks.</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {config.map(row => (
            <div key={row.key} style={{ padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{row.key}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{row.description}</div>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={values[row.key] ?? row.value}
                  onChange={e => setValues(v => ({ ...v, [row.key]: parseFloat(e.target.value) }))}
                  style={{ width: 84, textAlign: 'center', fontWeight: 700 }}
                />
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save config'}
          </button>
          {success && <span style={{ color: 'var(--green)', fontSize: 13 }}>{success}</span>}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{value}</div>
    </div>
  );
}

/* ─── Sync tab ─────────────────────────────────────────────────────── */
function SyncTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');

  async function loadLogs() {
    try {
      setLogs(await adminGetSyncLogs());
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadLogs(); }, []);

  async function handleSync() {
    setSyncing(true); setSyncResult('');
    try {
      const result = await adminTriggerSync();
      setSyncResult(`✓ Sync complete — ${result.matchesUpdated} matches updated`);
      loadLogs();
    } catch (err) {
      setSyncResult('✗ Sync failed: ' + err.message);
    }
    setSyncing(false);
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 8 }}>Manual sync</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          Scores sync automatically every 5 minutes. Use this button to force an immediate sync.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn" onClick={handleSync} disabled={syncing}>
            {syncing ? 'Syncing…' : '🔄 Sync now'}
          </button>
          {syncResult && (
            <span style={{ fontSize: 13, color: syncResult.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>
              {syncResult}
            </span>
          )}
        </div>
      </div>

      <h3 style={{ marginBottom: 10 }}>Recent sync logs</h3>
      {loading ? <div className="spinner" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {logs.map(log => (
            <div key={log.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 18 }}>{log.status === 'success' ? '✅' : log.status === 'error' ? '❌' : '⏭️'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {new Date(log.synced_at).toLocaleString()} — {log.status}
                </div>
                {log.error_message && (
                  <div style={{ fontSize: 12, color: 'var(--red)' }}>{log.error_message}</div>
                )}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                {log.matches_updated} updated
              </div>
            </div>
          ))}
          {logs.length === 0 && <p className="text-muted">No sync logs yet.</p>}
        </div>
      )}
    </div>
  );
}

/* ─── Bonus tab ─────────────────────────────────────────────────────── */
function BonusTab() {
  const [subTab, setSubTab] = useState('pending');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {[{ key: 'pending', label: 'À valider' }, { key: 'matches', label: 'Par match' }, { key: 'templates', label: 'Gabarits' }].map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500,
              border: '1px solid var(--border)',
              background: subTab === t.key ? 'var(--accent)' : 'var(--surface2)',
              color: subTab === t.key ? '#000' : 'var(--text-muted)',
            }}
          >{t.label}</button>
        ))}
      </div>
      {subTab === 'pending'   && <BonusPendingPanel />}
      {subTab === 'matches'   && <BonusMatchesPanel />}
      {subTab === 'templates' && <BonusTemplatesPanel />}
    </div>
  );
}

/* Questions on finished/locked matches that still have no correct_answer */
function BonusPendingPanel() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try { setMatches(await adminGetBonusMatches()); }
    catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  if (loading) return <div className="spinner" />;

  const now = new Date();
  // Matches that are finished or past kickoff AND have at least one unanswered question
  const pending = matches
    .filter(m => (m.status === 'FINISHED' || new Date(m.kickoff_time) <= now) && m.bonus_questions.length > 0)
    .map(m => ({ ...m, pending_questions: m.bonus_questions.filter(q => !q.correct_answer) }))
    .filter(m => m.pending_questions.length > 0);

  if (pending.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 32 }}>
        <p style={{ fontSize: 28, marginBottom: 8 }}>✅</p>
        <p style={{ fontWeight: 600 }}>Toutes les questions ont une réponse !</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          Aucune question en attente de validation.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        {pending.reduce((acc, m) => acc + m.pending_questions.length, 0)} question(s) en attente sur {pending.length} match(s).
      </div>
      {pending.map(m => (
        <div key={m.id} className="card">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>{m.home_team} vs {m.away_team}</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.stage}</span>
            {m.status === 'FINISHED' && m.home_score != null && (
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                {m.home_score} – {m.away_score}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {m.pending_questions.map(q => (
              <QuestionRow key={q.id} q={q} match={m} isLocked={true} onDelete={() => {}} onRefresh={load} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BonusMatchesPanel() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [stageFilter, setStageFilter] = useState('all');

  async function load() {
    try { setMatches(await adminGetBonusMatches()); }
    catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const stages = [...new Set(matches.map(m => m.stage))];
  const filtered = stageFilter === 'all' ? matches : matches.filter(m => m.stage === stageFilter);
  const selected = matches.find(m => String(m.id) === String(selectedId)) || null;

  if (loading) return <div className="spinner" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Sélectionner un match</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <button
            onClick={() => setStageFilter('all')}
            style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: '1px solid var(--border)', background: stageFilter === 'all' ? 'var(--accent)' : 'var(--surface2)', color: stageFilter === 'all' ? '#000' : 'var(--text-muted)' }}
          >Tous</button>
          {stages.map(s => (
            <button key={s}
              onClick={() => setStageFilter(s)}
              style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: '1px solid var(--border)', background: stageFilter === s ? 'var(--accent)' : 'var(--surface2)', color: stageFilter === s ? '#000' : 'var(--text-muted)' }}
            >{s}</button>
          ))}
        </div>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8 }}
        >
          <option value="">— Choisir un match —</option>
          {filtered.map(m => (
            <option key={m.id} value={m.id}>
              {m.home_team} vs {m.away_team}  ·  {m.stage}  ·  {new Date(m.kickoff_time).toLocaleDateString()}
              {m.bonus_questions.length > 0 ? ` (${m.bonus_questions.length} Q)` : ''}
            </option>
          ))}
        </select>
      </div>

      {selected && <MatchBonusPanel match={selected} onRefresh={() => load()} />}
    </div>
  );
}

/* ─── Gabarits de questions ─────────────────────────────────────────── */
function BonusTemplatesPanel() {
  const [templates, setTemplates] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('country');
  const [question, setQuestion] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  // Assign controls
  const [stageFilter, setStageFilter] = useState('all');
  const [selectedMatchIds, setSelectedMatchIds] = useState(new Set());
  const [countPerMatch, setCountPerMatch] = useState(1);
  const [skipExisting, setSkipExisting] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState('');

  async function load() {
    try {
      const [t, m] = await Promise.all([adminGetQuestionTemplates(), adminGetBonusMatches()]);
      setTemplates(t);
      setMatches(m);
    } catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!question.trim()) return;
    setAdding(true); setAddError('');
    try {
      await adminCreateQuestionTemplate(type, question.trim());
      setQuestion('');
      load();
    } catch (err) { setAddError(err.message); }
    setAdding(false);
  }

  async function handleDelete(id) {
    if (!confirm('Supprimer ce gabarit ?')) return;
    try { await adminDeleteQuestionTemplate(id); load(); }
    catch (err) { alert(err.message); }
  }

  const stages = [...new Set(matches.map(m => m.stage))];
  const upcomingMatches = matches.filter(m => !['FINISHED', 'CANCELLED', 'POSTPONED'].includes(m.status));
  const filteredMatches = stageFilter === 'all' ? upcomingMatches : upcomingMatches.filter(m => m.stage === stageFilter);

  function toggleMatch(id) {
    setSelectedMatchIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedMatchIds.size === filteredMatches.length) {
      setSelectedMatchIds(new Set());
    } else {
      setSelectedMatchIds(new Set(filteredMatches.map(m => m.id)));
    }
  }

  async function handleAssign() {
    if (selectedMatchIds.size === 0) return;
    if (templates.length === 0) { alert('Aucun gabarit disponible.'); return; }
    setAssigning(true); setAssignResult('');
    try {
      const result = await adminAssignTemplates([...selectedMatchIds], countPerMatch, skipExisting);
      setAssignResult(`✓ ${result.created} question(s) créée(s)${result.skipped ? `, ${result.skipped} match(s) ignoré(s)` : ''}`);
      setSelectedMatchIds(new Set());
      load();
    } catch (err) { setAssignResult('✗ ' + err.message); }
    setAssigning(false);
  }

  if (loading) return <div className="spinner" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Template list + add form */}
      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Gabarits de questions ({templates.length})</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {templates.length === 0 && (
            <p className="text-muted" style={{ fontSize: 13 }}>Aucun gabarit. Créez-en ci-dessous.</p>
          )}
          {templates.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                background: t.type === 'country' ? 'rgba(0,212,170,0.15)' : 'rgba(255,107,53,0.15)',
                color: t.type === 'country' ? 'var(--accent)' : 'var(--accent2)',
              }}>{t.type === 'country' ? 'ÉQUIPE' : 'JOUEUR'}</span>
              <span style={{ flex: 1, fontSize: 14 }}>{t.question}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.type === 'country' ? '+3 pts' : '+5 pts'}</span>
              <button className="btn btn-danger" onClick={() => handleDelete(t.id)} style={{ padding: '3px 8px', fontSize: 12 }}>✕</button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <h4 style={{ marginBottom: 8, fontSize: 14 }}>Ajouter un gabarit</h4>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={type} onChange={e => setType(e.target.value)} style={{ padding: '7px 10px' }}>
                <option value="country">Équipe (+3 pts)</option>
                <option value="player">Joueur (+5 pts)</option>
              </select>
              <input
                type="text"
                placeholder='ex : "Quelle équipe marque en premier ?"'
                value={question}
                onChange={e => setQuestion(e.target.value)}
                style={{ flex: 1, minWidth: 220 }}
                required
              />
            </div>
            {addError && <p style={{ color: 'var(--red)', fontSize: 13 }}>{addError}</p>}
            <button className="btn" type="submit" disabled={adding} style={{ alignSelf: 'flex-start' }}>
              {adding ? 'Ajout…' : 'Ajouter le gabarit'}
            </button>
          </form>
        </div>
      </div>

      {/* Random assignment */}
      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Assignation aléatoire aux matchs</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          Sélectionnez des matchs et attribuez-leur des questions tirées aléatoirement parmi les gabarits.
        </p>

        {/* Stage filter */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <button onClick={() => setStageFilter('all')} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: '1px solid var(--border)', background: stageFilter === 'all' ? 'var(--accent)' : 'var(--surface2)', color: stageFilter === 'all' ? '#000' : 'var(--text-muted)' }}>Tous</button>
          {stages.map(s => (
            <button key={s} onClick={() => setStageFilter(s)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: '1px solid var(--border)', background: stageFilter === s ? 'var(--accent)' : 'var(--surface2)', color: stageFilter === s ? '#000' : 'var(--text-muted)' }}>{s}</button>
          ))}
        </div>

        {/* Match list with checkboxes */}
        <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12 }}>
          <div
            onClick={toggleAll}
            style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontSize: 13, fontWeight: 600 }}
          >
            <input type="checkbox" readOnly checked={filteredMatches.length > 0 && selectedMatchIds.size === filteredMatches.length} style={{ cursor: 'pointer' }} />
            Tout sélectionner ({filteredMatches.length} matchs à venir)
          </div>
          {filteredMatches.map(m => (
            <div
              key={m.id}
              onClick={() => toggleMatch(m.id)}
              style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13, background: selectedMatchIds.has(m.id) ? 'rgba(0,212,170,0.07)' : 'transparent' }}
            >
              <input type="checkbox" readOnly checked={selectedMatchIds.has(m.id)} style={{ cursor: 'pointer' }} />
              <span style={{ flex: 1 }}>{m.home_team} vs {m.away_team}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{m.stage} · {new Date(m.kickoff_time).toLocaleDateString()}</span>
              {m.bonus_questions.length > 0 && <span className="badge badge-blue" style={{ fontSize: 10 }}>{m.bonus_questions.length} Q</span>}
            </div>
          ))}
          {filteredMatches.length === 0 && (
            <p style={{ padding: 12, fontSize: 13, color: 'var(--text-muted)' }}>Aucun match à venir dans cette phase.</p>
          )}
        </div>

        {/* Options */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            Questions par match :
            <input
              type="number" min="1" max={templates.length || 10} value={countPerMatch}
              onChange={e => setCountPerMatch(Number(e.target.value))}
              style={{ width: 56, textAlign: 'center' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={skipExisting} onChange={e => setSkipExisting(e.target.checked)} />
            Ignorer les matchs qui ont déjà des questions
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            className="btn"
            onClick={handleAssign}
            disabled={assigning || selectedMatchIds.size === 0 || templates.length === 0}
          >
            {assigning ? 'Assignation…' : `Assigner aléatoirement (${selectedMatchIds.size} match${selectedMatchIds.size > 1 ? 's' : ''})`}
          </button>
          {assignResult && (
            <span style={{ fontSize: 13, color: assignResult.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>
              {assignResult}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function MatchBonusPanel({ match, onRefresh }) {
  const [type, setType] = useState('country');
  const [question, setQuestion] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const isLocked = new Date() >= new Date(match.kickoff_time);

  async function handleAdd(e) {
    e.preventDefault();
    if (!question.trim()) return;
    setAdding(true); setAddError('');
    try {
      await adminCreateBonusQuestion(match.id, type, question.trim());
      setQuestion('');
      onRefresh();
    } catch (err) { setAddError(err.message); }
    setAdding(false);
  }

  async function handleDelete(id) {
    if (!confirm('Delete this question? All user answers will also be deleted.')) return;
    try { await adminDeleteBonusQuestion(id); onRefresh(); }
    catch (err) { alert(err.message); }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>{match.home_team} vs {match.away_team}</h3>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{match.stage}</span>
        {isLocked && <span className="badge badge-yellow" style={{ fontSize: 10 }}>Locked</span>}
      </div>

      {/* Existing questions */}
      {match.bonus_questions.length === 0 && (
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>No bonus questions yet.</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {match.bonus_questions.map(q => (
          <QuestionRow key={q.id} q={q} match={match} isLocked={isLocked} onDelete={handleDelete} onRefresh={onRefresh} />
        ))}
      </div>

      {/* Add question form */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <h4 style={{ marginBottom: 10, fontSize: 14 }}>Add question</h4>
        <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={type} onChange={e => setType(e.target.value)} style={{ padding: '7px 10px' }}>
              <option value="country">Country (home/away pick)</option>
              <option value="player">Player (text answer)</option>
            </select>
            <input
              type="text"
              placeholder='e.g. "Which team scores first?"'
              value={question}
              onChange={e => setQuestion(e.target.value)}
              style={{ flex: 1, minWidth: 220 }}
              required
            />
          </div>
          {addError && <p style={{ color: 'var(--red)', fontSize: 13 }}>{addError}</p>}
          <button className="btn" type="submit" disabled={adding} style={{ alignSelf: 'flex-start' }}>
            {adding ? 'Adding…' : 'Add question'}
          </button>
        </form>
      </div>
    </div>
  );
}

function QuestionRow({ q, match, isLocked, onDelete, onRefresh }) {
  const [showDecide, setShowDecide] = useState(false);
  const [submissions, setSubmissions] = useState(null);
  const [customAnswer, setCustomAnswer] = useState(q.correct_answer || '');
  const [saving, setSaving] = useState(false);

  async function loadSubmissions() {
    try { setSubmissions(await adminGetBonusSubmissions(q.id)); }
    catch {}
  }

  function toggleDecide() {
    if (!showDecide) loadSubmissions();
    setShowDecide(v => !v);
  }

  async function handleSetAnswer(ans) {
    setSaving(true);
    try {
      await adminSetBonusAnswer(q.id, ans);
      setCustomAnswer(ans);
      onRefresh();
      setShowDecide(false);
    } catch (err) { alert(err.message); }
    setSaving(false);
  }

  const displayCorrect = () => {
    if (!q.correct_answer) return null;
    if (q.type === 'country') {
      if (q.correct_answer === 'home') return match.home_team;
      if (q.correct_answer === 'away') return match.away_team;
      return 'Aucune équipe';
    }
    return q.correct_answer;
  };

  return (
    <div style={{ padding: 12, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
          background: q.type === 'country' ? 'rgba(0,212,170,0.15)' : 'rgba(255,107,53,0.15)',
          color: q.type === 'country' ? 'var(--accent)' : 'var(--accent2)',
        }}>
          {q.type === 'country' ? 'COUNTRY' : 'PLAYER'}
        </span>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{q.question}</span>
        {q.correct_answer && (
          <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
            ✓ {displayCorrect()}
          </span>
        )}
        <button
          onClick={toggleDecide}
          className="btn btn-secondary"
          style={{ padding: '4px 10px', fontSize: 12 }}
        >
          {q.correct_answer ? 'Change answer' : 'Set answer'}
        </button>
        <button
          onClick={() => onDelete(q.id)}
          className="btn btn-danger"
          style={{ padding: '4px 10px', fontSize: 12 }}
        >
          Delete
        </button>
      </div>

      {/* Decide panel */}
      {showDecide && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            Player submissions — click to set as correct answer:
          </div>
          {submissions === null
            ? <div className="spinner" style={{ margin: '8px auto', width: 20, height: 20, borderWidth: 2 }} />
            : submissions.length === 0
            ? <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No submissions yet.</p>
            : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {submissions.map(s => (
                  <button
                    key={s.answer}
                    onClick={() => setCustomAnswer(s.answer)}
                    style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
                      border: '1px solid var(--border)',
                      background: customAnswer === s.answer ? 'var(--accent)' : 'var(--surface)',
                      color: customAnswer === s.answer ? '#000' : 'var(--text)',
                    }}
                  >
                    {q.type === 'country'
                      ? (s.answer === 'home' ? match.home_team : s.answer === 'away' ? match.away_team : 'Aucune équipe')
                      : s.answer
                    }
                    <span style={{ marginLeft: 5, fontSize: 11, opacity: 0.7 }}>×{s.count}</span>
                  </button>
                ))}
              </div>
            )
          }

          {/* Manual input for player type */}
          {q.type === 'player' && (
            <input
              type="text"
              value={customAnswer}
              onChange={e => setCustomAnswer(e.target.value)}
              placeholder="Or type custom answer…"
              style={{ width: '100%', marginBottom: 8 }}
            />
          )}

          {q.type === 'country' && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {['home', 'away', 'none'].map(side => (
                <button
                  key={side}
                  onClick={() => setCustomAnswer(side)}
                  style={{
                    padding: '5px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: customAnswer === side ? 'var(--accent)' : 'var(--surface2)',
                    color: customAnswer === side ? '#000' : 'var(--text)',
                  }}
                >
                  {side === 'none' ? 'Aucune équipe' : side === 'home' ? match.home_team : match.away_team}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn"
              onClick={() => handleSetAnswer(customAnswer)}
              disabled={!customAnswer.trim() || saving}
              style={{ padding: '6px 14px', fontSize: 13 }}
            >
              {saving ? 'Saving…' : 'Confirm answer'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowDecide(false)}
              style={{ padding: '6px 14px', fontSize: 13 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
