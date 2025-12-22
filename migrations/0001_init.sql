-- 0001_init.sql
-- Leaderboard schema for Cloudflare D1 (SQLite)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  mode_key TEXT NOT NULL,
  score10 REAL NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  above_avg INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attempts_user_created ON attempts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attempts_mode_created ON attempts(mode_key, created_at);

CREATE TABLE IF NOT EXISTS user_stats (
  user_id TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  above_avg_count INTEGER NOT NULL DEFAULT 0,
  avg_score10 REAL NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
