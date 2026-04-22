/* ── Team colours ────────────────────────────────────── */
const TEAM_COLORS = {
  3: '#3671C6', 4: '#E8002D', 1: '#FF8000', 2: '#27F4D2',
  9: '#52E252', 5: '#64C4FF', 8: '#e0e0e0', 6: '#1534cc',
  10: '#FF87EE', 7: '#229971'
};

/* ── State ───────────────────────────────────────────── */
let currentRaceId = null;
let currentUser   = null;

/* ── API helper ──────────────────────────────────────── */
async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `API error ${res.status}`);
  }
  return res.json();
}

/* ── Formatting helpers ──────────────────────────────── */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

function timeAgo(isoStr) {
  const diff  = Date.now() - new Date(isoStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function posLabel(pos) {
  if (pos === 1) return '🥇';
  if (pos === 2) return '🥈';
  if (pos === 3) return '🥉';
  return pos;
}

function posClass(pos) {
  if (pos === 1) return 'gold';
  if (pos === 2) return 'silver';
  if (pos === 3) return 'bronze';
  return '';
}

function teamDot(teamId) {
  const color = TEAM_COLORS[teamId] || '#888';
  return `<span class="team-dot" style="background:${color}"></span>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function userInitials(name) {
  return name.slice(0, 2).toUpperCase();
}

/* ── Auth state ──────────────────────────────────────── */
async function loadSession() {
  try {
    const data = await api('/api/me');
    currentUser = data.user;
  } catch {
    currentUser = null;
  }
  renderAuthUI();
  updateCommentSection();
}

function renderAuthUI() {
  const heroAuth = document.getElementById('hero-auth');
  if (currentUser) {
    heroAuth.innerHTML = `
      <div class="auth-pill">
        <div class="auth-avatar">${userInitials(currentUser.username)}</div>
        <span class="auth-username">${escapeHtml(currentUser.username)}</span>
        <button class="auth-signout-btn" id="signout-btn">Sign out</button>
      </div>
    `;
    document.getElementById('signout-btn').addEventListener('click', handleLogout);
  } else {
    heroAuth.innerHTML = `
      <button class="hero-login-btn" id="hero-login-btn">Log in</button>
    `;
    document.getElementById('hero-login-btn').addEventListener('click', openAuthModal);
  }
}

function updateCommentSection() {
  const form   = document.getElementById('comment-form');
  const prompt = document.getElementById('login-prompt');
  if (!form || !prompt) return;

  if (currentUser) {
    form.classList.remove('hidden');
    prompt.classList.add('hidden');
    const row = document.getElementById('comment-user-row');
    row.innerHTML = `
      <div class="auth-avatar sm">${userInitials(currentUser.username)}</div>
      <span class="posting-as">Posting as <strong>${escapeHtml(currentUser.username)}</strong></span>
    `;
  } else {
    form.classList.add('hidden');
    prompt.classList.remove('hidden');
  }
}

async function handleLogout() {
  await api('/api/logout', { method: 'POST' });
  currentUser = null;
  renderAuthUI();
  updateCommentSection();
}

/* ── Auth Modal ──────────────────────────────────────── */
let authMode = 'login';

function openAuthModal() {
  document.getElementById('auth-overlay').classList.remove('hidden');
  document.getElementById('auth-username').focus();
}

function closeAuthModal() {
  document.getElementById('auth-overlay').classList.add('hidden');
  document.getElementById('auth-error').classList.add('hidden');
  document.getElementById('auth-error').textContent = '';
  document.getElementById('auth-username').value = '';
  document.getElementById('auth-password').value = '';
}

document.getElementById('auth-close').addEventListener('click', closeAuthModal);
document.getElementById('auth-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('auth-overlay')) closeAuthModal();
});

document.querySelectorAll('.auth-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    authMode = btn.dataset.mode;
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('auth-submit').textContent =
      authMode === 'login' ? 'Log in' : 'Create account';
    document.getElementById('auth-error').classList.add('hidden');
  });
});

document.getElementById('login-prompt-btn')?.addEventListener('click', openAuthModal);
document.addEventListener('click', (e) => {
  if (e.target.id === 'login-prompt-btn') openAuthModal();
});

document.getElementById('auth-submit').addEventListener('click', handleAuthSubmit);
document.getElementById('auth-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleAuthSubmit();
});

async function handleAuthSubmit() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl    = document.getElementById('auth-error');
  const btn      = document.getElementById('auth-submit');

  errEl.classList.add('hidden');
  if (!username || !password) {
    errEl.textContent = 'Please fill in all fields.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = authMode === 'login' ? 'Signing in…' : 'Creating account…';

  try {
    const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
    const data = await api(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    currentUser = data.user;
    closeAuthModal();
    renderAuthUI();
    updateCommentSection();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === 'login' ? 'Log in' : 'Create account';
  }
}

/* ── Tab switching ───────────────────────────────────── */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;

    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // FIX: toggle hidden class (not just active) so panels actually show/hide
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById(`tab-${tab}`).classList.remove('hidden');

    if (tab === 'drivers') loadDrivers();
    if (tab === 'teams')   loadTeams();
    if (tab === 'races')   showRaceGrid();
  });
});

document.getElementById('back-btn').addEventListener('click', showRaceGrid);

/* ── Races grid ──────────────────────────────────────── */
async function loadRaces() {
  const grid = document.getElementById('races-grid');
  grid.innerHTML = '<div class="skeleton" style="height:110px"></div>'.repeat(4);

  try {
    const races = await api('/api/races');
    grid.innerHTML = '';
    if (!races.length) {
      grid.innerHTML = '<p style="color:var(--muted)">No races found.</p>';
      return;
    }
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
        <div class="comment-count">
          <strong>${race.comment_count}</strong> comment${race.comment_count !== 1 ? 's' : ''}
        </div>
      `;
      card.addEventListener('click', () => openRace(race.race_id));
      grid.appendChild(card);
    });
  } catch (err) {
    grid.innerHTML = `<p style="color:var(--red)">Failed to load races: ${err.message}</p>`;
  }
}

function showRaceGrid() {
  currentRaceId = null;
  document.getElementById('races-grid').classList.remove('hidden');
  document.getElementById('race-detail').classList.add('hidden');
  loadRaces();
}

/* ── Race detail ─────────────────────────────────────── */
async function openRace(raceId) {
  currentRaceId = raceId;
  document.getElementById('races-grid').classList.add('hidden');
  const detail = document.getElementById('race-detail');
  detail.classList.remove('hidden');

  document.getElementById('detail-round').textContent = '';
  document.getElementById('detail-title').textContent = 'Loading…';
  document.getElementById('detail-sub').textContent = '';
  document.getElementById('results-container').innerHTML = '';
  document.getElementById('comments-list').innerHTML = '';

  try {
    const [race, results, comments] = await Promise.all([
      api(`/api/races/${raceId}`),
      api(`/api/races/${raceId}/results`),
      api(`/api/races/${raceId}/comments`)
    ]);

    document.getElementById('detail-round').textContent =
      `Round ${race.round_number}${race.has_sprint ? ' · Sprint Weekend' : ''}`;
    document.getElementById('detail-title').textContent = race.race_name;
    document.getElementById('detail-sub').textContent =
      [race.track_name, race.location, race.country].filter(Boolean).join(' · ')
      + (race.race_date ? ' · ' + formatDate(race.race_date) : '');

    renderResults(results);
    renderComments(comments);
    updateCommentSection();
  } catch (err) {
    document.getElementById('detail-title').textContent = 'Error loading race';
    document.getElementById('detail-sub').textContent = err.message;
  }
}

function renderResults(results) {
  const container = document.getElementById('results-container');
  if (!results.length) {
    container.innerHTML = '<p class="no-comments">No results yet — race upcoming.</p>';
    return;
  }
  const rows = results.map(r => `
    <tr>
      <td class="pos-cell ${posClass(r.position)}">${posLabel(r.position)}</td>
      <td>
        <span class="driver-code">${r.driver_code}</span>
        <span class="driver-full">${r.first_name} ${r.last_name}</span>
      </td>
      <td>${r.nationality || ''}</td>
      <td>${teamDot(r.team_id)}${r.team_name}</td>
      <td class="pts-cell">${r.points}</td>
    </tr>
  `).join('');
  container.innerHTML = `
    <div class="table-wrap" style="margin-bottom:1.5rem">
      <table class="data-table">
        <thead><tr><th>Pos</th><th>Driver</th><th>Nat</th><th>Team</th><th>Pts</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderComments(comments) {
  const list = document.getElementById('comments-list');
  if (!comments.length) {
    list.innerHTML = '<p class="no-comments">No comments yet. Be the first!</p>';
    return;
  }
  list.innerHTML = comments.map(c => {
    const isOwn = currentUser && currentUser.username === c.author;
    const editedLabel = c.edited_at
      ? `<span class="comment-edited">(edited)</span>` : '';
    return `
      <div class="comment-item" data-comment-id="${c.comment_id}">
        <div class="comment-header">
          <div class="comment-author-row">
            <div class="auth-avatar sm">${userInitials(c.author)}</div>
            <span class="comment-author">${escapeHtml(c.author)}</span>
            ${editedLabel}
          </div>
          <div class="comment-header-right">
            <span class="comment-time">${timeAgo(c.created_at)}</span>
            ${isOwn ? `<button class="comment-edit-btn" data-id="${c.comment_id}" title="Edit comment">✏️</button>` : ''}
          </div>
        </div>
        <div class="comment-body" data-body-id="${c.comment_id}">${escapeHtml(c.body)}</div>
        <div class="comment-edit-area hidden" data-edit-id="${c.comment_id}">
          <textarea class="form-textarea comment-edit-textarea" rows="3">${escapeHtml(c.body)}</textarea>
          <div class="comment-edit-actions">
            <button class="submit-btn comment-save-btn" data-id="${c.comment_id}">Save</button>
            <button class="comment-cancel-btn" data-id="${c.comment_id}">Cancel</button>
          </div>
          <div class="form-error hidden" data-edit-err="${c.comment_id}"></div>
        </div>
      </div>
    `;
  }).join('');

  // Wire up edit/save/cancel buttons
  list.querySelectorAll('.comment-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditMode(btn.dataset.id));
  });
  list.querySelectorAll('.comment-save-btn').forEach(btn => {
    btn.addEventListener('click', () => saveEdit(btn.dataset.id));
  });
  list.querySelectorAll('.comment-cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => closeEditMode(btn.dataset.id));
  });
}

function openEditMode(commentId) {
  document.querySelector(`[data-body-id="${commentId}"]`).classList.add('hidden');
  document.querySelector(`[data-edit-id="${commentId}"]`).classList.remove('hidden');
  document.querySelector(`[data-comment-id="${commentId}"] .comment-edit-btn`).classList.add('hidden');
  const ta = document.querySelector(`[data-edit-id="${commentId}"] textarea`);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

function closeEditMode(commentId) {
  document.querySelector(`[data-body-id="${commentId}"]`).classList.remove('hidden');
  document.querySelector(`[data-edit-id="${commentId}"]`).classList.add('hidden');
  document.querySelector(`[data-comment-id="${commentId}"] .comment-edit-btn`).classList.remove('hidden');
  const errEl = document.querySelector(`[data-edit-err="${commentId}"]`);
  errEl.classList.add('hidden');
  errEl.textContent = '';
}

async function saveEdit(commentId) {
  const ta    = document.querySelector(`[data-edit-id="${commentId}"] textarea`);
  const errEl = document.querySelector(`[data-edit-err="${commentId}"]`);
  const btn   = document.querySelector(`.comment-save-btn[data-id="${commentId}"]`);
  const body  = ta.value.trim();

  errEl.classList.add('hidden');
  if (!body) {
    errEl.textContent = 'Comment cannot be empty.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    await api(`/api/races/${currentRaceId}/comments/${commentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body })
    });
    const comments = await api(`/api/races/${currentRaceId}/comments`);
    renderComments(comments);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

/* ── Post comment ────────────────────────────────────── */
document.getElementById('submit-btn').addEventListener('click', async () => {
  const body  = document.getElementById('comment-input').value.trim();
  const errEl = document.getElementById('form-error');
  const btn   = document.getElementById('submit-btn');

  errEl.classList.add('hidden');
  if (!body) { showFormError('Please write a comment.'); return; }

  btn.disabled = true;
  btn.textContent = 'Posting…';

  try {
    const res = await fetch(`/api/races/${currentRaceId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body })
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to post comment');
    }
    document.getElementById('comment-input').value = '';
    const comments = await api(`/api/races/${currentRaceId}/comments`);
    renderComments(comments);
  } catch (err) {
    if (err.message === 'Login required') {
      openAuthModal();
    } else {
      showFormError(err.message);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Post Comment';
  }
});

function showFormError(msg) {
  const errEl = document.getElementById('form-error');
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
}

/* ── Drivers standings ───────────────────────────────── */
async function loadDrivers() {
  const tbody = document.querySelector('#drivers-table tbody');
  tbody.innerHTML = '<tr><td colspan="6"><div class="skeleton"></div></td></tr>';
  try {
    const drivers = await api('/api/standings/drivers');
    tbody.innerHTML = drivers.map(d => `
      <tr>
        <td class="pos-cell ${posClass(d.championship_position)}">${posLabel(d.championship_position)}</td>
        <td>
          <span class="driver-code">${d.driver_code}</span>
          <span class="driver-full">${d.first_name} ${d.last_name}</span>
        </td>
        <td>${d.nationality || ''}</td>
        <td>${teamDot(d.team_id)}${d.team_name || '—'}</td>
        <td style="color:var(--muted)">${d.racing_number}</td>
        <td class="pts-cell">${d.total_points}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--red)">${err.message}</td></tr>`;
  }
}

/* ── Teams standings ─────────────────────────────────── */
async function loadTeams() {
  const tbody = document.querySelector('#teams-table tbody');
  tbody.innerHTML = '<tr><td colspan="4"><div class="skeleton"></div></td></tr>';
  try {
    const teams = await api('/api/standings/teams');
    tbody.innerHTML = teams.map(t => `
      <tr>
        <td class="pos-cell ${posClass(t.championship_position)}">${posLabel(t.championship_position)}</td>
        <td>
          ${teamDot(t.team_id)}
          <strong style="font-weight:600">${t.team_name}</strong>
          <span class="driver-full">${t.full_name}</span>
        </td>
        <td style="color:var(--muted);font-size:12px">${t.engine}</td>
        <td class="pts-cell">${t.total_points}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="color:var(--red)">${err.message}</td></tr>`;
  }
}

/* ── Boot ────────────────────────────────────────────── */
loadSession();
loadRaces();