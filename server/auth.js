// Authentication helpers — password hashing (scrypt) and session tokens,
// using only Node's built-in crypto module (no bcrypt dependency needed).
const crypto = require('node:crypto');
const db = require('./db');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const attemptHash = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(attemptHash, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  return token;
}

function getUserBySession(token) {
  if (!token) return null;
  const row = db.prepare(
    `SELECT users.* FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token = ?`
  ).get(token);
  return row || null;
}

function destroySession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// Parses the "Cookie" header for our session token.
function getSessionTokenFromReq(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const idx = c.indexOf('=');
      return [c.slice(0, idx).trim(), decodeURIComponent(c.slice(idx + 1).trim())];
    })
  );
  return cookies.session || null;
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  getUserBySession,
  destroySession,
  getSessionTokenFromReq,
};
