-- World Cup 2026 Predictor - Database schema
-- Run once on first startup to create all tables

-- Users table: stores all players in the prediction game
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Matches table: all World Cup 2026 matches synced from football-data.org
CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  api_match_id INTEGER UNIQUE,           -- ID from football-data.org API
  home_team VARCHAR(100) NOT NULL,
  away_team VARCHAR(100) NOT NULL,
  home_team_code VARCHAR(10),            -- e.g. "FRA" for flag lookup
  away_team_code VARCHAR(10),
  kickoff_time TIMESTAMP NOT NULL,
  stage VARCHAR(100) NOT NULL,           -- "GROUP_STAGE", "ROUND_OF_16", etc.
  status VARCHAR(50) DEFAULT 'SCHEDULED', -- SCHEDULED, IN_PLAY, FINISHED
  home_score INTEGER,
  away_score INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Predictions table: each user's prediction for each match
CREATE TABLE IF NOT EXISTS predictions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
  home_score INTEGER NOT NULL,
  away_score INTEGER NOT NULL,
  bonus_prediction_type TEXT,
  bonus_prediction_value TEXT,
  submitted_at TIMESTAMP DEFAULT NOW(),
  points_earned NUMERIC(10, 2) DEFAULT NULL, -- NULL until match is finished
  UNIQUE(user_id, match_id)                  -- one prediction per user per match
);

ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS bonus_prediction_type TEXT;

ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS bonus_prediction_value TEXT;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS group_name VARCHAR(20);

-- Bonus questions set by admin per match
CREATE TABLE IF NOT EXISTS bonus_questions (
  id           SERIAL PRIMARY KEY,
  match_id     INTEGER REFERENCES matches(id) ON DELETE CASCADE,
  type         VARCHAR(20) NOT NULL CHECK (type IN ('country', 'player')),
  question     TEXT NOT NULL,
  correct_answer TEXT,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- User answers to bonus questions
CREATE TABLE IF NOT EXISTS bonus_answers (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  question_id  INTEGER REFERENCES bonus_questions(id) ON DELETE CASCADE,
  answer       TEXT NOT NULL,
  submitted_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, question_id)
);

-- Scoring config table: admin can change these values without touching code
CREATE TABLE IF NOT EXISTS scoring_config (
  key TEXT PRIMARY KEY,
  value NUMERIC NOT NULL,
  description TEXT
);

-- Question templates: admin-defined question pool for random assignment to matches
CREATE TABLE IF NOT EXISTS question_templates (
  id           SERIAL PRIMARY KEY,
  type         VARCHAR(20) NOT NULL CHECK (type IN ('country', 'player')),
  question     TEXT NOT NULL,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- Sync logs table: track each time we called the football-data.org API
CREATE TABLE IF NOT EXISTS sync_logs (
  id SERIAL PRIMARY KEY,
  synced_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(50) NOT NULL,    -- "success" or "error"
  matches_updated INTEGER DEFAULT 0,
  error_message TEXT
);

-- Seed default scoring config values (only insert if not already present)
INSERT INTO scoring_config (key, value, description) VALUES
  ('base_points',            10,  'Base points awarded for any correct prediction'),
  ('multiplier_exact',        3,  'Multiplier for predicting the exact final score'),
  ('multiplier_goal_diff',    2,  'Multiplier for correct winner + correct goal difference'),
  ('multiplier_winner',       1,  'Multiplier for correct winner or draw (any score)'),
  ('multiplier_wrong',        0,  'Multiplier for wrong prediction'),
  ('points_result_correct',   7,  'Points for predicting the correct result category'),
  ('points_goal_diff',        3,  'Points for predicting the correct goal difference'),
  ('points_total_goals',      3,  'Points for predicting the correct total goals')
ON CONFLICT (key) DO NOTHING;

-- Bonus points column added to bonus_answers
ALTER TABLE bonus_answers ADD COLUMN IF NOT EXISTS points_earned NUMERIC DEFAULT NULL;

-- Detailed scoring breakdown stored per prediction for accurate frontend display
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS score_raw_points NUMERIC DEFAULT NULL;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS score_multiplier  NUMERIC DEFAULT NULL;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS bonus_points_earned NUMERIC DEFAULT NULL;

-- Track exact finish time (set when status transitions to FINISHED)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

-- Track when the AI bonus job was run for a match (prevents re-triggering)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS bonus_ai_triggered_at TIMESTAMPTZ;

-- Update points_result_correct to 7 for existing databases
UPDATE scoring_config SET value = 7 WHERE key = 'points_result_correct' AND value = 5;

-- Per-component scoring breakdown stored at score time so the frontend never guesses
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS score_breakdown JSONB DEFAULT NULL;

-- Multiple accepted spellings for bonus questions (mainly for player names)
ALTER TABLE bonus_questions ADD COLUMN IF NOT EXISTS correct_answers TEXT[] DEFAULT '{}';
UPDATE bonus_questions
  SET correct_answers = ARRAY[correct_answer]
  WHERE correct_answer IS NOT NULL AND correct_answer != '' AND correct_answers = '{}';

-- Stage-based score multipliers (stored in scoring_config so admin can edit them)
INSERT INTO scoring_config (key, value, description) VALUES
  ('stage_mult_group_stage',    1,    'Score multiplier — Group Stage'),
  ('stage_mult_round_of_32',    1.25, 'Score multiplier — Round of 32 (16ème de finale)'),
  ('stage_mult_round_of_16',    1.5,  'Score multiplier — Round of 16 (1/8 de finale)'),
  ('stage_mult_quarter_finals', 2,    'Score multiplier — Quarter-Finals'),
  ('stage_mult_semi_finals',    3,    'Score multiplier — Semi-Finals'),
  ('stage_mult_final',          4,    'Score multiplier — Final'),
  ('stage_mult_third_place',    2,    'Score multiplier — Third Place')
ON CONFLICT (key) DO NOTHING;

-- Allow yes/no bonus question type
ALTER TABLE bonus_questions DROP CONSTRAINT IF EXISTS bonus_questions_type_check;
ALTER TABLE bonus_questions ADD CONSTRAINT bonus_questions_type_check
  CHECK (type IN ('country', 'player', 'yesno'));
ALTER TABLE question_templates DROP CONSTRAINT IF EXISTS question_templates_type_check;
ALTER TABLE question_templates ADD CONSTRAINT question_templates_type_check
  CHECK (type IN ('country', 'player', 'yesno'));
