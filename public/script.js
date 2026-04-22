const TEAM_COLORS = {
  1: '#FF8000', 2: '#27F4D2', 3: '#3671C6', 4: '#E8002D',
  5: '#64C4FF', 6: '#1534cc', 7: '#229971', 8: '#e0e0e0',
  9: '#52E252', 10: '#FF87EE'
};

let currentRaceId = null;
let currentUser   = null;

// ── Helpers ──────────────────────────────────────────────

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `API error ${res.status}`);
  }
  return res.json();
}

const $ = id => document.getElementById(id);
const esc = str => String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const initials = name => name.slice(0, 2).toUpperCase();
const teamDot = id => `<span class="team-dot" style="background:${TEAM_COLORS[id] || '#888'}"></span>`;
const posClass = p => p === 1 ? 'gold' : p === 2 ? 'silver' : p === 3 ? 'bronze' : '';
const posLabel = p => p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : p;

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
}

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (mins < 2)    return 'just now';
  if (mins < 60)   return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

// ── Auth ─────────────────────────────────────────────────

async function loadSession() {
  try { currentUser = (await api('/api/me')).user; }
  catch { currentUser = null; }
  renderAuth();
}

function renderAuth() {
  const heroAuth = $('hero-auth');
  if (currentUser) {
    heroAuth.innerHTML = `
      <div class="auth-pill">
        <div class="auth-avatar">${initials(currentUser.username)}</div>
        <span class="auth-username">${esc(currentUser.username)}</span>
        <button class="auth-signout-btn" id="signout-btn">Sign out</button>
      </div>`;
    $('signout-btn').onclick = async () => {
      await api('/api/logout', { method: 'POST' });
      currentUser = null;
      renderAuth();
    };
  } else {
    heroAuth.innerHTML = `<button class="hero-login-btn" id="hero-login-btn">Log in</button>`;
    $('hero-login-btn').onclick = openAuthModal;
  }

  const form   = $('comment-form');
  const prompt = $('login-prompt');
  if (!form) return;
  if (currentUser) {
    form.classList.remove('hidden');
    prompt.classList.add('hidden');
    $('comment-user-row').innerHTML = `
      <div class="auth-avatar sm">${initials(currentUser.username)}</div>
      <span class="posting-as">Posting as <strong>${esc(currentUser.username)}</strong></span>`;
  } else {
    form.classList.add('hidden');
    prompt.classList.remove('hidden');
  }
}

// ── Auth modal ───────────────────────────────────────────

let authMode = 'login';

function openAuthModal() {
  $('auth-overlay').classList.remove('hidden');
  $('auth-username').focus();
}

function closeAuthModal() {
  $('auth-overlay').classList.add('hidden');
  $('auth-error').classList.add('hidden');
  $('auth-username').value = $('auth-password').value = '';
}

$('auth-close').onclick = closeAuthModal;
$('auth-overlay').onclick = e => { if (e.target === $('auth-overlay')) closeAuthModal(); };
$('auth-password').onkeydown = e => { if (e.key === 'Enter') submitAuth(); };
$('auth-submit').onclick = submitAuth;

document.querySelectorAll('.auth-tab').forEach(btn => {
  btn.onclick = () => {
    authMode = btn.dataset.mode;
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $('auth-submit').textContent = authMode === 'login' ? 'Log in' : 'Create account';
    $('auth-error').classList.add('hidden');
  };
});

document.addEventListener('click', e => {
  if (e.target.id === 'login-prompt-btn') openAuthModal();
});

async function submitAuth() {
  const username = $('auth-username').value.trim();
  const password = $('auth-password').value;
  const errEl = $('auth-error');
  const btn   = $('auth-submit');

  if (!username || !password) {
    errEl.textContent = 'Please fill in all fields.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = authMode === 'login' ? 'Signing in…' : 'Creating account…';
  errEl.classList.add('hidden');

  try {
    const data = await api(authMode === 'login' ? '/api/login' : '/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    currentUser = data.user;
    closeAuthModal();
    renderAuth();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === 'login' ? 'Log in' : 'Create account';
  }
}

// ── Tabs ─────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    $(`tab-${btn.dataset.tab}`).classList.remove('hidden');
    if (btn.dataset.tab === 'drivers') loadDrivers();
    if (btn.dataset.tab === 'teams')   loadTeams();
    if (btn.dataset.tab === 'races')   showRaceGrid();
  };
});

$('back-btn').onclick = showRaceGrid;

// ── Races ────────────────────────────────────────────────

async function loadRaces() {
  const grid = $('races-grid');
  grid.innerHTML = '<div class="skeleton" style="height:110px"></div>'.repeat(4);
  try {
    const races = await api('/api/races');
    grid.innerHTML = '';
    if (!races.length) { grid.innerHTML = '<p style="color:var(--muted)">No races found.</p>'; return; }
    races.forEach(race => {
      const card = document.createElement('div');
      card.className = 'race-card';
      card.innerHTML = `
        ${race.has_sprint ? '<span class="sprint-badge">Sprint</span>' : ''}
        <div class="race-round">Round ${race.round_number}</div>
        <div class="race-name">${race.race_name}</div>
        <div class="race-meta">
          <span>📍 ${race.location ? race.location + ', ' + race.country : '—'}</span>
          <span>📅 ${formatDate(race.race_date)}</span>
          ${race.circuit_length ? `<span>🏁 ${race.circuit_length} km</span>` : ''}
        </div>
        <div class="comment-count"><strong>${race.comment_count}</strong> comment${race.comment_count !== 1 ? 's' : ''}</div>`;
      card.onclick = () => openRace(race.race_id);
      grid.appendChild(card);
    });
  } catch (err) {
    grid.innerHTML = `<p style="color:var(--red)">Failed to load races: ${err.message}</p>`;
  }
}

function showRaceGrid() {
  currentRaceId = null;
  $('races-grid').classList.remove('hidden');
  $('race-detail').classList.add('hidden');
  loadRaces();
}

async function openRace(raceId) {
  currentRaceId = raceId;
  $('races-grid').classList.add('hidden');
  $('race-detail').classList.remove('hidden');
  $('detail-title').textContent = 'Loading…';

  try {
    const [race, results, comments] = await Promise.all([
      api(`/api/races/${raceId}`),
      api(`/api/races/${raceId}/results`),
      api(`/api/races/${raceId}/comments`)
    ]);

    $('detail-round').textContent = `Round ${race.round_number}${race.has_sprint ? ' · Sprint Weekend' : ''}`;
    $('detail-title').textContent = race.race_name;
    $('detail-sub').textContent =
      [race.track_name, race.location, race.country].filter(Boolean).join(' · ')
      + (race.race_date ? ' · ' + formatDate(race.race_date) : '');

    renderResults(results);
    renderComments(comments);
    renderAuth();
  } catch (err) {
    $('detail-title').textContent = 'Error loading race';
    $('detail-sub').textContent = err.message;
  }
}

function renderResults(results) {
  const container = $('results-container');
  if (!results.length) {
    container.innerHTML = '<p class="no-comments">No results yet — race upcoming.</p>';
    return;
  }
  container.innerHTML = `
    <div class="table-wrap" style="margin-bottom:1.5rem">
      <table class="data-table">
        <thead><tr><th>Pos</th><th>Driver</th><th>Nat</th><th>Team</th><th>Pts</th></tr></thead>
        <tbody>${results.map(r => `
          <tr>
            <td class="pos-cell ${posClass(r.position)}">${posLabel(r.position)}</td>
            <td><span class="driver-code">${r.driver_code}</span> <span class="driver-full">${r.first_name} ${r.last_name}</span></td>
            <td>${r.nationality || ''}</td>
            <td>${teamDot(r.team_id)}${r.team_name}</td>
            <td class="pts-cell">${r.points}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── Comments ─────────────────────────────────────────────

function renderComments(comments) {
  const list = $('comments-list');
  if (!comments.length) {
    list.innerHTML = '<p class="no-comments">No comments yet. Be the first!</p>';
    return;
  }
  list.innerHTML = comments.map(c => {
    const isOwn = currentUser?.username === c.author;
    return `
      <div class="comment-item" data-cid="${c.comment_id}">
        <div class="comment-header">
          <div class="comment-author-row">
            <div class="auth-avatar sm">${initials(c.author)}</div>
            <span class="comment-author">${esc(c.author)}</span>
            ${c.edited_at ? '<span class="comment-edited">(edited)</span>' : ''}
          </div>
          <div class="comment-header-right">
            <span class="comment-time">${timeAgo(c.created_at)}</span>
            ${isOwn ? `<button class="comment-edit-btn" title="Edit">✏️</button>` : ''}
          </div>
        </div>
        <div class="comment-body">${esc(c.body)}</div>
        <div class="comment-edit-area hidden">
          <textarea class="form-textarea comment-edit-textarea" rows="3">${esc(c.body)}</textarea>
          <div class="comment-edit-actions">
            <button class="submit-btn comment-save-btn">Save</button>
            <button class="comment-cancel-btn">Cancel</button>
          </div>
          <div class="form-error hidden"></div>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.comment-item').forEach(item => {
    const cid     = item.dataset.cid;
    const body    = item.querySelector('.comment-body');
    const area    = item.querySelector('.comment-edit-area');
    const ta      = item.querySelector('textarea');
    const errEl   = item.querySelector('.form-error');
    const editBtn  = item.querySelector('.comment-edit-btn');
    const saveBtn  = item.querySelector('.comment-save-btn');
    const cancelBtn = item.querySelector('.comment-cancel-btn');

    editBtn?.addEventListener('click', () => {
      body.classList.add('hidden');
      area.classList.remove('hidden');
      editBtn.classList.add('hidden');
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });

    cancelBtn?.addEventListener('click', () => {
      body.classList.remove('hidden');
      area.classList.add('hidden');
      editBtn.classList.remove('hidden');
      errEl.classList.add('hidden');
    });

    saveBtn?.addEventListener('click', async () => {
      const text = ta.value.trim();
      if (!text) { errEl.textContent = 'Comment cannot be empty.'; errEl.classList.remove('hidden'); return; }
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      errEl.classList.add('hidden');
      try {
        await api(`/api/races/${currentRaceId}/comments/${cid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text })
        });
        renderComments(await api(`/api/races/${currentRaceId}/comments`));
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    });
  });
}

$('submit-btn').onclick = async () => {
  const input = $('comment-input');
  const errEl = $('form-error');
  const btn   = $('submit-btn');
  const body  = input.value.trim();

  errEl.classList.add('hidden');
  if (!body) { errEl.textContent = 'Please write a comment.'; errEl.classList.remove('hidden'); return; }

  btn.disabled = true;
  btn.textContent = 'Posting…';
  try {
    await api(`/api/races/${currentRaceId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body })
    });
    input.value = '';
    renderComments(await api(`/api/races/${currentRaceId}/comments`));
  } catch (err) {
    if (err.message === 'Login required') openAuthModal();
    else { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Post Comment';
  }
};

// ── Standings ────────────────────────────────────────────

async function loadDrivers() {
  const tbody = document.querySelector('#drivers-table tbody');
  tbody.innerHTML = '<tr><td colspan="6"><div class="skeleton"></div></td></tr>';
  try {
    const drivers = await api('/api/standings/drivers');
    tbody.innerHTML = drivers.map(d => `
      <tr>
        <td class="pos-cell ${posClass(d.championship_position)}">${posLabel(d.championship_position)}</td>
        <td><span class="driver-code">${d.driver_code}</span> <span class="driver-full">${d.first_name} ${d.last_name}</span></td>
        <td>${d.nationality || ''}</td>
        <td>${teamDot(d.team_id)}${d.team_name || '—'}</td>
        <td style="color:var(--muted)">${d.racing_number}</td>
        <td class="pts-cell">${d.total_points}</td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--red)">${err.message}</td></tr>`;
  }
}

async function loadTeams() {
  const tbody = document.querySelector('#teams-table tbody');
  tbody.innerHTML = '<tr><td colspan="4"><div class="skeleton"></div></td></tr>';
  try {
    const teams = await api('/api/standings/teams');
    tbody.innerHTML = teams.map(t => `
      <tr>
        <td class="pos-cell ${posClass(t.championship_position)}">${posLabel(t.championship_position)}</td>
        <td>${teamDot(t.team_id)}<strong>${t.team_name}</strong> <span class="driver-full">${t.full_name}</span></td>
        <td style="color:var(--muted);font-size:12px">${t.engine}</td>
        <td class="pts-cell">${t.total_points}</td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="color:var(--red)">${err.message}</td></tr>`;
  }
}

// ── Boot ─────────────────────────────────────────────────
loadSession();
loadRaces();