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
      <FloatingBalls />
      <header style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 16px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        {/* Top row: logo + logout */}
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 44 }}>
          <img src="/2026_FIFA_World_Cup.svg.webp" alt="FIFA World Cup 2026" style={{ height: 38, width: 'auto' }} />
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

function FloatingBalls() {
  const balls = [
    { side: 'left',  top: '12%', size: 52, delay: 0,   offset: 18, duration: 4.2 },
    { side: 'left',  top: '33%', size: 66, delay: 1.4, offset: 10, duration: 3.6 },
    { side: 'left',  top: '56%', size: 44, delay: 0.7, offset: 24, duration: 4.8 },
    { side: 'left',  top: '76%', size: 58, delay: 2.1, offset: 14, duration: 3.9 },
    { side: 'right', top: '18%', size: 60, delay: 0.4, offset: 14, duration: 4.5 },
    { side: 'right', top: '40%', size: 48, delay: 1.9, offset: 20, duration: 3.7 },
    { side: 'right', top: '62%', size: 70, delay: 0.2, offset: 8,  duration: 4.1 },
    { side: 'right', top: '82%', size: 50, delay: 2.6, offset: 18, duration: 4.6 },
  ];
  return (
    <div aria-hidden="true">
      {balls.map((b, i) => (
        <img
          key={i}
          src="/1036597_main.webp"
          alt=""
          className="floating-ball"
          style={{
            [b.side]: b.offset,
            top: b.top,
            width: b.size,
            height: b.size,
            animationDuration: `${b.duration}s`,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}
    </div>
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
