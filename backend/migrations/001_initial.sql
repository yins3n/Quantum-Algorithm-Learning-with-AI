-- Reference migration for fresh PostgreSQL deployments.
-- SQLite applies the equivalent schema in backend.app.db() for the pilot.
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    preferences TEXT NOT NULL DEFAULT '{}',
    skills TEXT NOT NULL DEFAULT '{}',
    recent_errors TEXT NOT NULL DEFAULT '[]',
    password_hash TEXT,
    display_name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id),
    passed INTEGER NOT NULL,
    feedback TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tutor_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id),
    message TEXT NOT NULL,
    response TEXT NOT NULL,
    created_at TEXT NOT NULL
);
