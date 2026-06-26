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
import ComparePage from './pages/Compare';

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
            <NavItem to="/compare">Compare</NavItem>
            {user.is_admin && <NavItem to="/admin">Admin</NavItem>}
          </nav>
        </div>
      </header>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <Routes>
          <Route path="/" element={<Navigate to="/matches" replace />} />
          <Route path="/matches" element={<MatchesPage />} />
          <Route path="/groups" element={<GroupStandingsPage />} />
          <Route path="/bracket" element={<PlayoffsPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/my-predictions" element={<MyPredictionsPage />} />
          <Route path="/compare" element={<ComparePage />} />
          {user.is_admin && <Route path="/admin" element={<AdminPage />} />}
          <Route path="*" element={<Navigate to="/matches" replace />} />
        </Routes>
      </div>
    </>
  );
}

function FloatingBalls() {
  // left/right as % of viewport width so balls spread across the full page
  const balls = [
    { left: '3%',  top: '8%',  size: 52, delay: 0,   duration: 4.2 },
    { left: '18%', top: '22%', size: 44, delay: 1.1, duration: 3.8 },
    { left: '7%',  top: '42%', size: 66, delay: 0.6, duration: 4.6 },
    { left: '25%', top: '60%', size: 48, delay: 2.0, duration: 3.5 },
    { left: '5%',  top: '76%', size: 58, delay: 1.5, duration: 4.1 },
    { left: '14%', top: '88%', size: 40, delay: 2.8, duration: 3.9 },
    { left: '72%', top: '10%', size: 60, delay: 0.3, duration: 4.4 },
    { left: '85%', top: '28%', size: 46, delay: 1.7, duration: 3.7 },
    { left: '65%', top: '48%', size: 70, delay: 0.9, duration: 4.8 },
    { left: '80%', top: '65%', size: 50, delay: 2.4, duration: 4.0 },
    { left: '90%', top: '80%', size: 62, delay: 0.2, duration: 3.6 },
    { left: '70%', top: '90%', size: 42, delay: 1.9, duration: 4.3 },
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
            left: b.left,
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
