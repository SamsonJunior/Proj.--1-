// Shared helpers used across all pages.

const api = {
  async get(pathName) {
    const r = await fetch(pathName, { credentials: 'same-origin' });
    return r.json();
  },
  async send(method, pathName, body) {
    const r = await fetch(pathName, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  async upload(pathName, formData, method = 'POST') {
    const r = await fetch(pathName, { method, credentials: 'same-origin', body: formData });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Upload failed');
    return data;
  },
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Renders a comma-separated skills string (e.g. from tailor_profiles.skills)
// as a row of small skill-tag chips. Returns '' if there are no skills.
function renderSkillTags(skillsStr) {
  const skills = String(skillsStr ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (skills.length === 0) return '';
  return `<div class="skill-tags">${skills.map(s => `<span class="skill-tag">${escapeHtml(s)}</span>`).join('')}</div>`;
}

function timeAgo(isoString) {
  const then = new Date(isoString.replace(' ', 'T') + 'Z');
  const diffMin = Math.floor((Date.now() - then.getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

async function renderNav() {
  const mount = document.getElementById('nav-mount');
  if (!mount) return;
  const { user } = await api.get('/api/me');

  const links = [
    '<li><a href="/index.html">Showcase</a></li>',
    '<li><a href="/tailors.html">Tailors</a></li>',
  ];

  let rightLinks;
  if (!user) {
    rightLinks = `
      <li><a href="/login.html">Log in</a></li>
      <li><a href="/register.html" class="nav-cta">Join Now</a></li>
    `;
  } else {
    const dash = user.role === 'tailor' ? '/tailor-dashboard.html' : '/client-dashboard.html';
    rightLinks = `
      <li class="nav-account" title="Logged in as ${escapeHtml(user.email)}">${escapeHtml(user.email)}</li>
      <li><a href="${dash}">Dashboard</a></li>
      <li><a href="/messages.html">Messages</a></li>
      <li><a href="#" id="logout-btn" class="nav-cta">Log out</a></li>
    `;
  }

  mount.innerHTML = `
    <nav class="nav">
      <div class="nav-inner">
        <a href="/index.html" class="nav-logo">
          <div class="nav-project-label">NSUK EDC Tailoring Showcase &amp; Client Linkage</div>
          <div class="nav-logo-row">
            <img src="/img/nsuk-logo.png" alt="NSUK Logo" class="nav-mark-img">
            <div class="nav-logo-text">
              <span class="nsuk">Nasarawa State University, Keffi</span>
              <span class="edc">EDC Tailoring</span>
            </div>
          </div>
        </a>
        <ul class="nav-links">
          ${links.join('')}
          ${rightLinks}
        </ul>
      </div>
    </nav>
  `;

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await api.send('POST', '/api/logout');
      window.location.href = '/index.html';
    });
  }

  return user;
}
