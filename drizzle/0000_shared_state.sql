CREATE TABLE IF NOT EXISTS shared_state (
  id TEXT PRIMARY KEY CHECK (id = 'reppy'),
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
