// Database layer — matches the ER Diagram (Chapter 3.9) and stores
// user, tailor profile, design, and communication records (Chapter 4.1.1).
//
// Uses @libsql/client, which speaks the same SQL as SQLite. Locally (no
// TURSO_DATABASE_URL set) it just reads/writes a local file, exactly like
// before. In production, set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (from a
// free Turso database) so the data survives server restarts on free hosting
// tiers that don't offer persistent disks.
const path = require('node:path');
const { createClient } = require('@libsql/client');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'tailoring.db');

const client = createClient(
  process.env.TURSO_DATABASE_URL
    ? { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: `file:${DB_PATH}` }
);

// Thin compatibility layer so the rest of the codebase can keep using the
// same db.prepare(sql).get(...)/.run(...)/.all(...) shape it always has —
// just with "await" added in front of each call, since network databases
// are inherently asynchronous.
function prepare(sql) {
  return {
    async run(...args) {
      const result = await client.execute({ sql, args });
      return {
        lastInsertRowid: result.lastInsertRowid === undefined || result.lastInsertRowid === null
          ? undefined
          : Number(result.lastInsertRowid),
        changes: result.rowsAffected,
      };
    },
    async get(...args) {
      const result = await client.execute({ sql, args });
      return result.rows[0];
    },
    async all(...args) {
      const result = await client.execute({ sql, args });
      return result.rows;
    },
  };
}

async function init() {
  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      role          TEXT NOT NULL CHECK (role IN ('tailor', 'client')),
      full_name     TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tailor_profiles (
      user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      bio         TEXT DEFAULT '',
      specialty   TEXT DEFAULT '',
      skills      TEXT DEFAULT '',
      phone       TEXT DEFAULT '',
      location    TEXT DEFAULT ''
    );

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

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  try {
    await client.execute("ALTER TABLE tailor_profiles ADD COLUMN skills TEXT DEFAULT ''");
  } catch (e) {
    // Column already exists — nothing to do.
  }

  try {
    await client.execute('ALTER TABLE messages ADD COLUMN edited_at TEXT');
  } catch (e) {
    // Column already exists — nothing to do.
  }
}

module.exports = { prepare, init, client };
