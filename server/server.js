// Application layer: routes requests, talks to the database layer (db.js),
// and serves the presentation layer (static files in /public).
// Built entirely on Node's built-in http module — no Express needed.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const db = require('./db');
const auth = require('./auth');
const { parseUrlEncodedOrJson, parseMultipart, saveUploadedFile } = require('./parseBody');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${7 * 24 * 3600}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, role: u.role, full_name: u.full_name, email: u.email };
}

// ---- Static file serving (presentation layer) ----
function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, decodeURIComponent(filePath));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---- API route handlers ----
const routes = [];
function route(method, pattern, handler) {
  const paramNames = [];
  const regex = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  }) + '$');
  routes.push({ method, regex, paramNames, handler });
}

function getCurrentUser(req) {
  const token = auth.getSessionTokenFromReq(req);
  return { token, user: auth.getUserBySession(token) };
}

// -- Registration (Chapter 4.1.2: registration module) --
route('POST', '/api/register', async (req, res) => {
  const body = await parseUrlEncodedOrJson(req);
  const { role, full_name, email, password } = body;
  if (!role || !['tailor', 'client'].includes(role)) return sendJson(res, 400, { error: 'Invalid role' });
  if (!full_name || !email || !password) return sendJson(res, 400, { error: 'All fields are required' });
  if (password.length < 6) return sendJson(res, 400, { error: 'Password must be at least 6 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return sendJson(res, 409, { error: 'An account with this email already exists' });

  const { hash, salt } = auth.hashPassword(password);
  const info = db.prepare(
    'INSERT INTO users (role, full_name, email, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)'
  ).run(role, full_name, email.toLowerCase(), hash, salt);

  if (role === 'tailor') {
    db.prepare('INSERT INTO tailor_profiles (user_id) VALUES (?)').run(info.lastInsertRowid);
  }

  const token = auth.createSession(info.lastInsertRowid);
  setSessionCookie(res, token);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  sendJson(res, 201, { user: publicUser(user) });
});

// -- Login (authentication module) --
route('POST', '/api/login', async (req, res) => {
  const body = await parseUrlEncodedOrJson(req);
  const { email, password } = body;
  if (!email || !password) return sendJson(res, 400, { error: 'Email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !auth.verifyPassword(password, user.password_hash, user.password_salt)) {
    return sendJson(res, 401, { error: 'Invalid email or password' });
  }

  const token = auth.createSession(user.id);
  setSessionCookie(res, token);
  sendJson(res, 200, { user: publicUser(user) });
});

// -- Forgot password: verify identity via email + full name, then set a new password.
// No email server is set up for this project, so this acts as a simple self-service
// reset rather than an emailed reset link. --
route('POST', '/api/forgot-password', async (req, res) => {
  const body = await parseUrlEncodedOrJson(req);
  const { email, full_name, new_password } = body;
  if (!email || !full_name || !new_password) {
    return sendJson(res, 400, { error: 'Email, full name, and a new password are all required' });
  }
  if (new_password.length < 6) {
    return sendJson(res, 400, { error: 'New password must be at least 6 characters' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  const nameMatches = user && user.full_name.trim().toLowerCase() === full_name.trim().toLowerCase();
  if (!user || !nameMatches) {
    return sendJson(res, 401, { error: 'We could not verify an account with that email and full name' });
  }

  const { hash, salt } = auth.hashPassword(new_password);
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, user.id);

  // Invalidate any existing sessions for this account as a safety measure.
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);

  sendJson(res, 200, { ok: true });
});

// -- Logout --
route('POST', '/api/logout', async (req, res) => {
  const { token } = getCurrentUser(req);
  if (token) auth.destroySession(token);
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
});

// -- Current session --
route('GET', '/api/me', async (req, res) => {
  const { user } = getCurrentUser(req);
  if (!user) return sendJson(res, 200, { user: null });
  let profile = null;
  if (user.role === 'tailor') {
    profile = db.prepare('SELECT * FROM tailor_profiles WHERE user_id = ?').get(user.id);
  }
  sendJson(res, 200, { user: publicUser(user), profile });
});

// -- Tailor profile management --
route('PUT', '/api/profile', async (req, res) => {
  const { user } = getCurrentUser(req);
  if (!user) return sendJson(res, 401, { error: 'Not logged in' });
  if (user.role !== 'tailor') return sendJson(res, 403, { error: 'Only tailors have a profile' });

  const body = await parseUrlEncodedOrJson(req);
  const { bio = '', specialty = '', skills = '', phone = '', location = '' } = body;
  db.prepare(
    'UPDATE tailor_profiles SET bio = ?, specialty = ?, skills = ?, phone = ?, location = ? WHERE user_id = ?'
  ).run(bio, specialty, skills, phone, location, user.id);
  sendJson(res, 200, { ok: true });
});

// -- List all tailors (client browsing module) --
route('GET', '/api/tailors', async (req, res) => {
  const tailors = db.prepare(`
    SELECT users.id, users.full_name, users.email,
           tailor_profiles.bio, tailor_profiles.specialty, tailor_profiles.skills,
           tailor_profiles.phone, tailor_profiles.location
    FROM users
    JOIN tailor_profiles ON tailor_profiles.user_id = users.id
    WHERE users.role = 'tailor'
    ORDER BY users.created_at DESC
  `).all();
  sendJson(res, 200, { tailors });
});

// -- Single tailor + their designs --
route('GET', '/api/tailors/:id', async (req, res, params) => {
  const tailor = db.prepare(`
    SELECT users.id, users.full_name, users.email,
           tailor_profiles.bio, tailor_profiles.specialty, tailor_profiles.skills,
           tailor_profiles.phone, tailor_profiles.location
    FROM users JOIN tailor_profiles ON tailor_profiles.user_id = users.id
    WHERE users.id = ? AND users.role = 'tailor'
  `).get(params.id);
  if (!tailor) return sendJson(res, 404, { error: 'Tailor not found' });
  const designs = db.prepare('SELECT * FROM designs WHERE tailor_id = ? ORDER BY created_at DESC').all(params.id);
  sendJson(res, 200, { tailor, designs });
});

// -- Design upload (design upload module) --
route('POST', '/api/designs', async (req, res) => {
  const { user } = getCurrentUser(req);
  if (!user) return sendJson(res, 401, { error: 'Not logged in' });
  if (user.role !== 'tailor') return sendJson(res, 403, { error: 'Only tailors can upload designs' });

  const { fields, files } = await parseMultipart(req);
  const { title, description = '', category = '', price = '' } = fields;
  const imageFile = files.find(f => f.fieldName === 'image');
  if (!title) return sendJson(res, 400, { error: 'Design title is required' });
  if (!imageFile) return sendJson(res, 400, { error: 'A design image is required' });

  const imagePath = saveUploadedFile(imageFile, UPLOADS_DIR);
  const info = db.prepare(
    'INSERT INTO designs (tailor_id, title, description, category, price, image_path) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(user.id, title, description, category, price, imagePath);

  const design = db.prepare('SELECT * FROM designs WHERE id = ?').get(info.lastInsertRowid);
  sendJson(res, 201, { design });
});

// -- Design showcase: all designs (client browsing) --
route('GET', '/api/designs', async (req, res) => {
  const parsed = url.parse(req.url, true);
  const { category, tailor_id } = parsed.query;
  let query = `
    SELECT designs.*, users.full_name AS tailor_name
    FROM designs JOIN users ON users.id = designs.tailor_id
    WHERE 1=1
  `;
  const args = [];
  if (category) { query += ' AND designs.category = ?'; args.push(category); }
  if (tailor_id) { query += ' AND designs.tailor_id = ?'; args.push(tailor_id); }
  query += ' ORDER BY designs.created_at DESC';
  const designs = db.prepare(query).all(...args);
  sendJson(res, 200, { designs });
});

// -- Delete a design (tailor manages own portfolio) --
route('DELETE', '/api/designs/:id', async (req, res, params) => {
  const { user } = getCurrentUser(req);
  if (!user) return sendJson(res, 401, { error: 'Not logged in' });
  const design = db.prepare('SELECT * FROM designs WHERE id = ?').get(params.id);
  if (!design) return sendJson(res, 404, { error: 'Design not found' });
  if (design.tailor_id !== user.id) return sendJson(res, 403, { error: 'Not your design' });
  db.prepare('DELETE FROM designs WHERE id = ?').run(params.id);
  sendJson(res, 200, { ok: true });
});

// -- Edit an existing design (title/category/price/description, optional new image) --
route('PUT', '/api/designs/:id', async (req, res, params) => {
  const { user } = getCurrentUser(req);
  if (!user) return sendJson(res, 401, { error: 'Not logged in' });
  const design = db.prepare('SELECT * FROM designs WHERE id = ?').get(params.id);
  if (!design) return sendJson(res, 404, { error: 'Design not found' });
  if (design.tailor_id !== user.id) return sendJson(res, 403, { error: 'Not your design' });

  const { fields, files } = await parseMultipart(req);
  const { title, description = '', category = '', price = '' } = fields;
  if (!title) return sendJson(res, 400, { error: 'Design title is required' });

  const imageFile = files.find(f => f.fieldName === 'image');
  const imagePath = imageFile ? saveUploadedFile(imageFile, UPLOADS_DIR) : design.image_path;

  db.prepare(
    'UPDATE designs SET title = ?, description = ?, category = ?, price = ?, image_path = ? WHERE id = ?'
  ).run(title, description, category, price, imagePath, params.id);

  const updated = db.prepare('SELECT * FROM designs WHERE id = ?').get(params.id);
  sendJson(res, 200, { design: updated });
});

// -- Client–tailor interaction: send a message --
route('POST', '/api/messages', async (req, res) => {
  const { user } = getCurrentUser(req);
  if (!user) return sendJson(res, 401, { error: 'Not logged in' });

  const body = await parseUrlEncodedOrJson(req);
  const { body: text, design_id } = body;
  let { tailor_id, client_id } = body;
  if (!text) return sendJson(res, 400, { error: 'Message body is required' });

  if (user.role === 'client') {
    client_id = user.id;
    if (!tailor_id) return sendJson(res, 400, { error: 'tailor_id is required' });
  } else if (user.role === 'tailor') {
    tailor_id = user.id;
    if (!client_id) return sendJson(res, 400, { error: 'client_id is required' });
  }

  const info = db.prepare(
    'INSERT INTO messages (client_id, tailor_id, design_id, body, sender_role) VALUES (?, ?, ?, ?, ?)'
  ).run(client_id, tailor_id, design_id || null, text, user.role);

  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
  sendJson(res, 201, { message });
});

// -- Edit a message: only the original sender may edit their own message --
route('PUT', '/api/messages/:id', async (req, res, params) => {
  const { user } = getCurrentUser(req);
  if (!user) return sendJson(res, 401, { error: 'Not logged in' });

  const msgId = Number(params.id);
  const existing = db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId);
  if (!existing) return sendJson(res, 404, { error: 'Message not found' });

  const isOwner = (existing.sender_role === 'client' && existing.client_id === user.id)
    || (existing.sender_role === 'tailor' && existing.tailor_id === user.id);
  if (!isOwner) return sendJson(res, 403, { error: 'You can only edit your own messages' });

  const body = await parseUrlEncodedOrJson(req);
  const { body: text } = body;
  if (!text || !text.trim()) return sendJson(res, 400, { error: 'Message body is required' });

  db.prepare('UPDATE messages SET body = ?, edited_at = datetime(\'now\') WHERE id = ?').run(text.trim(), msgId);
  const updated = db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId);
  sendJson(res, 200, { message: updated });
});

// -- Conversation thread between the logged-in user and another party --
route('GET', '/api/messages/:otherUserId', async (req, res, params) => {
  const { user } = getCurrentUser(req);
  if (!user) return sendJson(res, 401, { error: 'Not logged in' });

  const otherId = Number(params.otherUserId);
  const messages = db.prepare(`
    SELECT * FROM messages
    WHERE (client_id = ? AND tailor_id = ?) OR (client_id = ? AND tailor_id = ?)
    ORDER BY created_at ASC
  `).all(user.id, otherId, otherId, user.id);
  sendJson(res, 200, { messages });
});

// -- Inbox: list distinct conversation partners for the logged-in user --
route('GET', '/api/conversations', async (req, res) => {
  const { user } = getCurrentUser(req);
  if (!user) return sendJson(res, 401, { error: 'Not logged in' });

  let rows;
  if (user.role === 'client') {
    rows = db.prepare(`
      SELECT DISTINCT users.id, users.full_name
      FROM messages JOIN users ON users.id = messages.tailor_id
      WHERE messages.client_id = ?
    `).all(user.id);
  } else {
    rows = db.prepare(`
      SELECT DISTINCT users.id, users.full_name
      FROM messages JOIN users ON users.id = messages.client_id
      WHERE messages.tailor_id = ?
    `).all(user.id);
  }
  sendJson(res, 200, { conversations: rows });
});

// ---- Server ----
const server = http.createServer(async (req, res) => {
  try {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;

    if (pathname.startsWith('/api/')) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = pathname.match(r.regex);
        if (!m) continue;
        const params = {};
        r.paramNames.forEach((name, i) => { params[name] = m[i + 1]; });
        return await r.handler(req, res, params);
      }
      return sendJson(res, 404, { error: 'Not found' });
    }

    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Tailoring Showcase system running at http://localhost:${PORT}`);
});
