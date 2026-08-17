// Database layer — matches the ER Diagram (Chapter 3.9) and stores
// user, tailor profile, design, and communication records (Chapter 4.1.1).
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'data', 'tailoring.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA foreign_keys = ON;

  -- A single users table holds both actors from the Use Case Diagram
  -- (tailor, client), distinguished by role.
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    role          TEXT NOT NULL CHECK (role IN ('tailor', 'client')),
    full_name     TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Extended profile information for tailors (bio, specialty, contact, etc.)
  CREATE TABLE IF NOT EXISTS tailor_profiles (
    user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio         TEXT DEFAULT '',
    specialty   TEXT DEFAULT '',
    skills      TEXT DEFAULT '',
    phone       TEXT DEFAULT '',
    location    TEXT DEFAULT ''
  );

  -- Tailoring designs uploaded by tailors — the design showcase / portfolio.
  CREATE TABLE IF NOT EXISTS designs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tailor_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT DEFAULT '',
    category     TEXT DEFAULT '',
    price        TEXT DEFAULT '',
    image_path   TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Client–tailor interaction / communication records.
  CREATE TABLE IF NOT EXISTS messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tailor_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    design_id    INTEGER REFERENCES designs(id) ON DELETE SET NULL,
    body         TEXT NOT NULL,
    sender_role  TEXT NOT NULL CHECK (sender_role IN ('tailor', 'client')),
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    edited_at    TEXT
  );

  -- Server-side sessions (simple session-token table, no external deps).
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Lightweight migration: older databases created before the "skills"
// column existed won't have it — add it if missing.
try {
  db.exec('ALTER TABLE tailor_profiles ADD COLUMN skills TEXT DEFAULT \'\'');
} catch (e) {
  // Column already exists — nothing to do.
}

try {
  db.exec('ALTER TABLE messages ADD COLUMN edited_at TEXT');
} catch (e) {
  // Column already exists — nothing to do.
}

module.exports = db;
