// All API calls go through this file — easy to find and modify
// The base URL is /api which is proxied to the backend (port 3001)

const BASE = '/api';

// Get the stored JWT token
function getToken() {
  return localStorage.getItem('token');
}

// Base fetch wrapper — adds auth header and handles JSON parsing
async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Auth
export const login = (name, password) =>
  request('/auth/login', { method: 'POST', body: { name, password } });

export const register = (name, password) =>
  request('/auth/register', { method: 'POST', body: { name, password } });

export const getMe = () => request('/auth/me');

// Matches
export const getMatches = () => request('/matches');

// Predictions
export const submitPrediction = (match_id, home_score, away_score, bonus_prediction_type = null, bonus_prediction_value = null) =>
  request('/predictions', {
    method: 'POST',
    body: { match_id, home_score, away_score, bonus_prediction_type, bonus_prediction_value },
  });

export const getMyPredictions = () => request('/predictions/me');

// Leaderboard
export const getLeaderboard = () => request('/leaderboard');

// Group standings & knockout bracket
export const getStandings = () => request('/standings');
export const getBracket = () => request('/standings/bracket');

// Bonus predictions
export const submitBonusAnswer = (question_id, answer) =>
  request('/bonus/answer', { method: 'POST', body: { question_id, answer } });

// Admin — bonus questions
export const adminGetBonusMatches = () => request('/admin/bonus/matches');
export const adminCreateBonusQuestion = (match_id, type, question) =>
  request('/admin/bonus', { method: 'POST', body: { match_id, type, question } });
export const adminDeleteBonusQuestion = (id) =>
  request(`/admin/bonus/${id}`, { method: 'DELETE' });
export const adminSetBonusAnswer = (id, correct_answer) =>
  request(`/admin/bonus/${id}/answer`, { method: 'PUT', body: { correct_answer } });
export const adminGetBonusSubmissions = (id) =>
  request(`/admin/bonus/${id}/submissions`);

// Admin
export const adminGetUsers = () => request('/admin/users');
export const adminCreateUser = (name, password, is_admin = false) =>
  request('/admin/users', { method: 'POST', body: { name, password, is_admin } });
export const adminDeleteUser = (id) =>
  request(`/admin/users/${id}`, { method: 'DELETE' });
export const adminChangePassword = (id, password) =>
  request(`/admin/users/${id}/password`, { method: 'PUT', body: { password } });
export const adminGetScoring = () => request('/admin/scoring');
export const adminUpdateScoring = (updates) =>
  request('/admin/scoring', { method: 'PUT', body: updates });
export const adminGetPredictions = () => request('/admin/predictions');
export const adminTriggerSync = () => request('/admin/sync', { method: 'POST' });
export const adminGetSyncLogs = () => request('/admin/sync-logs');

// Admin — question templates
export const adminGetQuestionTemplates = () => request('/admin/question-templates');
export const adminCreateQuestionTemplate = (type, question) =>
  request('/admin/question-templates', { method: 'POST', body: { type, question } });
export const adminDeleteQuestionTemplate = (id) =>
  request(`/admin/question-templates/${id}`, { method: 'DELETE' });
export const adminAssignTemplates = (match_ids, count_per_match = 1, skip_existing = true) =>
  request('/admin/question-templates/assign', {
    method: 'POST',
    body: { match_ids, count_per_match, skip_existing },
  });
