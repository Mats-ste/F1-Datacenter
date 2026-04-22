const express = require('express');
const Database = require('better-sqlite3');
const session  = require('express-session');
const path     = require('path');

const app  = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'f1-hub-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 1 week
}));

// Initialize DB
const db = new Database('f1.db');

// ── Auth helpers ─────────────────────────────────────────

const crypto = require('crypto');
const hashPassword = (pw) => crypto.createHash('sha256').update(pw + 'f1-hub-salt').digest('hex');

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Login required' });
  next();
}

// ── Auth Routes ──────────────────────────────────────────

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db.prepare('SELECT user_id, username FROM users WHERE user_id = ?').get(req.session.userId);
  res.json({ user: user || null });
});

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (username.length < 3)    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 6)    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const existing = db.prepare('SELECT user_id FROM users WHERE username = ?').get(username.trim());
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  const info = db.prepare('INSERT INTO users (username, password_hash) VALUES (?,?)')
    .run(username.trim(), hashPassword(password));

  req.session.userId   = info.lastInsertRowid;
  req.session.username = username.trim();
  res.status(201).json({ user: { user_id: info.lastInsertRowid, username: username.trim() } });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user || user.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  req.session.userId   = user.user_id;
  req.session.username = user.username;
  res.json({ user: { user_id: user.user_id, username: user.username } });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ── Data Routes ──────────────────────────────────────────

app.get('/api/races', (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, t.track_name, t.location, t.country, t.circuit_length,
           COUNT(c.comment_id) AS comment_count
    FROM races r
    LEFT JOIN tracks t ON t.track_id = r.track_id
    LEFT JOIN comments c ON c.race_id = r.race_id
    GROUP BY r.race_id
    ORDER BY r.round_number
  `).all();
  res.json(rows);
});

app.get('/api/races/:id', (req, res) => {
  const race = db.prepare(`
    SELECT r.*, t.track_name, t.location, t.country, t.circuit_length
    FROM races r LEFT JOIN tracks t ON t.track_id = r.track_id
    WHERE r.race_id = ?
  `).get(req.params.id);
  if (!race) return res.status(404).json({ error: 'Race not found' });
  res.json(race);
});

app.get('/api/races/:id/results', (req, res) => {
  // 'time' column does not exist in race_results — omitted from SELECT
  const rows = db.prepare(`
    SELECT rr.result_id, rr.race_id, rr.driver_id, rr.position, rr.points,
           d.driver_code, d.first_name, d.last_name, d.nationality,
           d.racing_number, tm.team_name, tm.team_id
    FROM race_results rr
    JOIN drivers d ON d.driver_id = rr.driver_id
    JOIN teams tm ON tm.team_id = d.team_id
    WHERE rr.race_id = ?
    ORDER BY rr.position
  `).all(req.params.id);
  res.json(rows);
});

app.get('/api/races/:id/comments', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM comments WHERE race_id = ? ORDER BY created_at DESC
  `).all(req.params.id);
  res.json(rows);
});

app.post('/api/races/:id/comments', requireAuth, (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Comment body required' });

  const author = req.session.username;
  const info = db.prepare(
    'INSERT INTO comments (race_id, author, body) VALUES (?, ?, ?)'
  ).run(req.params.id, author, body.trim());

  const comment = db.prepare('SELECT * FROM comments WHERE comment_id = ?').get(info.lastInsertRowid);
  res.status(201).json(comment);
});

app.put('/api/races/:id/comments/:commentId', requireAuth, (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Comment body required' });

  const comment = db.prepare('SELECT * FROM comments WHERE comment_id = ?').get(req.params.commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.author !== req.session.username) return res.status(403).json({ error: 'Not your comment' });

  db.prepare('UPDATE comments SET body = ?, edited_at = CURRENT_TIMESTAMP WHERE comment_id = ?')
    .run(body.trim(), req.params.commentId);

  const updated = db.prepare('SELECT * FROM comments WHERE comment_id = ?').get(req.params.commentId);
  res.json(updated);
});

app.get('/api/drivers', (req, res) => {
  const rows = db.prepare(`
    SELECT d.*, t.team_name, t.team_id FROM drivers d
    LEFT JOIN teams t ON t.team_id = d.team_id
    ORDER BY d.points DESC
  `).all();
  res.json(rows);
});

app.get('/api/teams', (req, res) => {
  const rows = db.prepare('SELECT * FROM teams ORDER BY points DESC').all();
  res.json(rows);
});

// ── Standings Routes (uses driver_standings / team_standings tables) ──

app.get('/api/standings/drivers', (req, res) => {
  const rows = db.prepare(`
    SELECT ds.standing_id, ds.championship_position, ds.total_points,
           d.driver_id, d.driver_code, d.first_name, d.last_name,
           d.nationality, d.racing_number,
           t.team_name, t.team_id
    FROM driver_standings ds
    JOIN drivers d ON d.driver_id = ds.driver_id
    LEFT JOIN teams t ON t.team_id = d.team_id
    ORDER BY ds.championship_position
  `).all();
  res.json(rows);
});

app.get('/api/standings/teams', (req, res) => {
  const rows = db.prepare(`
    SELECT ts.standing_id, ts.championship_position, ts.total_points,
           t.team_id, t.team_name, t.full_name, t.engine
    FROM team_standings ts
    JOIN teams t ON t.team_id = ts.team_id
    ORDER BY ts.championship_position
  `).all();
  res.json(rows);
});

app.listen(PORT, () => {
  console.log(`F1 Hub running at http://localhost:${PORT}`);
});