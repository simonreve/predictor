// Root component — handles routing and authentication state
import React, { useState, useEffect, createContext, useContext } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { getMe } from './api';

import LoginPage from './pages/Login';
import RegisterPage from './pages/Register';
import MatchesPage from './pages/Matches';
import LeaderboardPage from './pages/Leaderboard';
import MyPredictionsPage from './pages/MyPredictions';
import AdminPage from './pages/Admin';
import GroupStandingsPage from './pages/GroupStandings';
import PlayoffsPage from './pages/Playoffs';

// Auth context — share the logged-in user across all components
export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);

  // On startup, check if there's a saved token and load the user
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    getMe()
      .then(u => setUser(u))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  function login(token, userData) {
    localStorage.setItem('token', token);
    setUser(userData);
  }

  function logout() {
    localStorage.removeItem('token');
    setUser(null);
  }

  if (loading) return <div className="spinner" style={{ marginTop: 80 }} />;

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {user
        ? <Layout />
        : showRegister
          ? <RegisterPage onShowLogin={() => setShowRegister(false)} />
          : <LoginPage onShowRegister={() => setShowRegister(true)} />
      }
    </AuthContext.Provider>
  );
}

function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <>
      <header style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 16px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        {/* Top row: logo + logout */}
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 44 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--accent)' }}>⚽ WC2026</span>
          <button
            onClick={handleLogout}
            style={{ background: 'none', color: 'var(--text-muted)', fontSize: 13 }}
          >
            {user.name} ↩
          </button>
        </div>
        {/* Bottom row: navigation */}
        <div style={{ maxWidth: 800, margin: '0 auto', paddingBottom: 6 }}>
          <nav style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
            <NavItem to="/matches">Matches</NavItem>
            <NavItem to="/groups">Groups</NavItem>
            <NavItem to="/bracket">Bracket</NavItem>
            <NavItem to="/leaderboard">Rankings</NavItem>
            <NavItem to="/my-predictions">Mine</NavItem>
            {user.is_admin && <NavItem to="/admin">Admin</NavItem>}
          </nav>
        </div>
      </header>

      <Routes>
        <Route path="/" element={<Navigate to="/matches" replace />} />
        <Route path="/matches" element={<MatchesPage />} />
        <Route path="/groups" element={<GroupStandingsPage />} />
        <Route path="/bracket" element={<PlayoffsPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/my-predictions" element={<MyPredictionsPage />} />
        {user.is_admin && <Route path="/admin" element={<AdminPage />} />}
        <Route path="*" element={<Navigate to="/matches" replace />} />
      </Routes>
    </>
  );
}

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        padding: '6px 12px',
        borderRadius: 6,
        fontSize: 14,
        fontWeight: 500,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        color: isActive ? 'var(--accent)' : 'var(--text-muted)',
        background: isActive ? 'rgba(0,212,170,0.1)' : 'transparent',
        transition: 'all 0.15s',
      })}
    >
      {children}
    </NavLink>
  );
}
