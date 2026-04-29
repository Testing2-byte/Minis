const express = require('express');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const fs      = require('fs');
const path    = require('path');
const { Pool } = require('pg');

const app = express();
const PORT       = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production';

// PostgreSQL Verbindung
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://datenbank_minis_user:hk6dhhF4MOm4cmQvYS5e8018B9baswF6@dpg-d7mkc837uimc73ct9n8g-a/datenbank_minis',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(express.json({ limit: '5mb' }));

// ── Serve React build ──────────────────────────────────────────────
const CLIENT = path.join(__dirname, '../client/build');
if (fs.existsSync(CLIENT)) {
  app.use(express.static(CLIENT));
}

// ── Database Init ──────────────────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS config (
        id SERIAL PRIMARY KEY,
        setup_done BOOLEAN DEFAULT FALSE,
        parish TEXT,
        city TEXT
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        nm TEXT,
        sh TEXT,
        ini TEXT,
        role TEXT,
        must_change_pw BOOLEAN,
        pw TEXT,
        joined TEXT,
        ein JSONB DEFAULT '[]',
        abm JSONB DEFAULT '[]',
        fam TEXT,
        notes TEXT,
        last_login TEXT
      );
      CREATE TABLE IF NOT EXISTS familien (
        id TEXT PRIMARY KEY,
        name TEXT,
        kinder JSONB DEFAULT '[]'
      );
      CREATE TABLE IF NOT EXISTS messen (
        id TEXT PRIMARY KEY,
        art TEXT,
        dt TEXT,
        t TEXT,
        notes TEXT,
        minis JSONB DEFAULT '[]'
      );
      CREATE TABLE IF NOT EXISTS anns (
        id TEXT PRIMARY KEY,
        title TEXT,
        body TEXT,
        pinned BOOLEAN DEFAULT FALSE,
        dt TEXT,
        author_id TEXT
      );
    `);
    // Initialer Config-Eintrag falls leer
    const res = await client.query('SELECT count(*) FROM config');
    if (parseInt(res.rows[0].count) === 0) {
      await client.query('INSERT INTO config (setup_done, parish, city) VALUES (false, $1, $2)', ['', '']);
    }
  } finally {
    client.release();
  }
}
initDB().catch(console.error);

// ── Crypto helpers ─────────────────────────────────────────────────
async function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  const hash = await pbkdf2(pw, salt);
  return JSON.stringify({ salt: salt.toString('base64'), hash });
}
async function verifyPw(pw, stored) {
  try {
    const { salt, hash } = JSON.parse(stored);
    const check = await pbkdf2(pw, Buffer.from(salt, 'base64'));
    return check === hash;
  } catch { return false; }
}
function pbkdf2(pw, salt) {
  return new Promise((res, rej) =>
    crypto.pbkdf2(pw, salt, 100000, 32, 'sha256', (e, k) =>
      e ? rej(e) : res(k.toString('hex')))
  );
}
function makeToken(user) {
  return jwt.sign({ uid: user.id, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
}
function safe(u) {
  if (!u) return null;
  const { pw, ...rest } = u;
  return rest;
}

// ── Auth middleware ────────────────────────────────────────────────
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Nicht angemeldet' });
  try {
    const p = jwt.verify(h.slice(7), JWT_SECRET);
    req.uid = p.uid; req.role = p.role; next();
  } catch { res.status(401).json({ error: 'Session abgelaufen – bitte neu anmelden' }); }
}
function adminOnly(req, res, next) {
  if (req.role !== 'admin' && req.role !== 'ober')
    return res.status(403).json({ error: 'Nur für Admins' });
  next();
}

// ── Setup ──────────────────────────────────────────────────────────
app.get('/api/setup-status', async (_, res) => {
  const { rows } = await pool.query('SELECT setup_done FROM config LIMIT 1');
  res.json({ needed: !rows[0]?.setup_done });
});

app.post('/api/setup', async (req, res) => {
  const { rows: cfgRows } = await pool.query('SELECT setup_done FROM config LIMIT 1');
  if (cfgRows[0]?.setup_done) return res.status(403).json({ error: 'Bereits eingerichtet' });

  const { parish, city, username, password } = req.body;
  if (!parish || !username || !password)
    return res.status(400).json({ error: 'Alle Felder ausfüllen' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Passwort mind. 8 Zeichen' });

  const id = 'u_' + Date.now();
  const hashed = await hashPw(password);
  
  await pool.query('BEGIN');
  try {
    await pool.query(
      'INSERT INTO users (id, username, nm, sh, ini, role, must_change_pw, pw, joined, ein, abm) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
      [id, username.trim().toLowerCase(), 'Administrator', 'Admin', 'AD', 'admin', false, hashed, today(), '[]', '[]']
    );
    await pool.query('UPDATE config SET setup_done = true, parish = $1, city = $2', [parish, city || '']);
    await pool.query('COMMIT');

    const user = { id, username: username.toLowerCase(), role: 'admin', nm: 'Administrator' };
    res.json({ token: makeToken(user), user, cfg: { parish, city } });
  } catch (e) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});

// ── Auth ───────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Benutzername und Passwort eingeben' });

  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim().toLowerCase()]);
  const user = rows[0];

  if (!user || !(await verifyPw(password, user.pw)))
    return res.status(401).json({ error: 'Benutzername oder Passwort falsch' });

  const { rows: cfg } = await pool.query('SELECT parish, city FROM config LIMIT 1');
  await pool.query('UPDATE users SET last_login = $1 WHERE id = $2', [today(), user.id]);
  
  res.json({ token: makeToken(user), user: safe(user), cfg: cfg[0] });
});

app.post('/api/change-password', auth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8)
    return res.status(400).json({ error: 'Neues Passwort mind. 8 Zeichen' });

  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.uid]);
  const user = rows[0];
  if (!user) return res.status(404).json({ error: 'Nutzer nicht gefunden' });

  if (!user.must_change_pw) {
    if (!oldPassword) return res.status(400).json({ error: 'Aktuelles Passwort eingeben' });
    if (!(await verifyPw(oldPassword, user.pw)))
      return res.status(401).json({ error: 'Aktuelles Passwort falsch' });
  }

  const hashed = await hashPw(newPassword);
  await pool.query('UPDATE users SET pw = $1, must_change_pw = false WHERE id = $2', [hashed, req.uid]);

  res.json({ token: makeToken(user), user: safe({ ...user, must_change_pw: false }) });
});

// ── Config ─────────────────────────────────────────────────────────
app.get('/api/cfg', auth, async (_, res) => {
  const { rows } = await pool.query('SELECT parish, city FROM config LIMIT 1');
  res.json(rows[0]);
});
app.put('/api/cfg', auth, adminOnly, async (req, res) => {
  const { parish, city } = req.body;
  await pool.query('UPDATE config SET parish = $1, city = $2', [parish, city]);
  res.json({ ok: true, cfg: { parish, city } });
});

// ── Users ──────────────────────────────────────────────────────────
app.get('/api/users', auth, async (_, res) => {
  const { rows } = await pool.query('SELECT * FROM users');
  res.json(rows.map(safe));
});

app.post('/api/users', auth, adminOnly, async (req, res) => {
  const { username, nm, role, password, famId, notes } = req.body;
  
  const { rows: exists } = await pool.query('SELECT id FROM users WHERE username = $1', [username.trim().toLowerCase()]);
  if (exists.length > 0)
    return res.status(400).json({ error: 'Benutzername bereits vergeben' });

  const id    = 'u_' + Date.now();
  const parts = nm.trim().split(' ');
  const ini   = ((parts[0]?.[0]||'')+(parts[1]?.[0]||'')).toUpperCase();
  const sh    = parts.length > 1 ? `${parts[0]} ${parts.at(-1)[0]}.` : nm;
  const hashed = await hashPw(password);

  await pool.query(
    'INSERT INTO users (id, username, nm, sh, ini, role, must_change_pw, pw, fam, notes, joined) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
    [id, username.trim().toLowerCase(), nm, sh, ini, role, true, hashed, famId || null, notes || '', today()]
  );
  res.json({ ok: true, id });
});

app.put('/api/users/:id', auth, adminOnly, async (req, res) => {
  const { nm, username, role, password, famId, notes } = req.body;
  let query = 'UPDATE users SET username = $1, role = $2, fam = $3, notes = $4';
  let params = [username.trim().toLowerCase(), role, famId || null, notes || ''];
  
  if (nm) {
    const p = nm.split(' ');
    const ini = ((p[0]?.[0]||'')+(p[1]?.[0]||'')).toUpperCase();
    const sh  = p.length > 1 ? `${p[0]} ${p.at(-1)[0]}.` : nm;
    query += ', nm = $5, ini = $6, sh = $7';
    params.push(nm, ini, sh);
  }

  if (password && password.length >= 4) {
    const hashed = await hashPw(password);
    query += `, pw = $${params.length + 1}, must_change_pw = $${params.length + 2}`;
    params.push(hashed, true);
  }

  params.push(req.params.id);
  query += ` WHERE id = $${params.length}`;
  
  await pool.query(query, params);
  res.json({ ok: true });
});

app.delete('/api/users/:id', auth, adminOnly, async (req, res) => {
  if (req.params.id === req.uid)
    return res.status(400).json({ error: 'Eigenen Account nicht löschbar' });
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ── Familien ───────────────────────────────────────────────────────
app.get('/api/familien', auth, async (_, res) => {
  const { rows } = await pool.query('SELECT * FROM familien');
  const obj = {};
  rows.forEach(r => obj[r.id] = r);
  res.json(obj);
});

app.post('/api/familien', auth, adminOnly, async (req, res) => {
  const id = 'f_' + Date.now();
  await pool.query('INSERT INTO familien (id, name, kinder) VALUES ($1, $2, $3)', [id, req.body.name, JSON.stringify(req.body.kinder || [])]);
  res.json({ ok: true, id });
});

app.put('/api/familien/:id', auth, adminOnly, async (req, res) => {
  await pool.query('UPDATE familien SET name = $1, kinder = $2 WHERE id = $3', [req.body.name, JSON.stringify(req.body.kinder || []), req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/familien/:id', auth, adminOnly, async (req, res) => {
  await pool.query('DELETE FROM familien WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ── Messen ─────────────────────────────────────────────────────────
app.get('/api/messen', auth, async (_, res) => {
  const { rows } = await pool.query('SELECT * FROM messen');
  res.json(rows);
});

app.post('/api/messen', auth, adminOnly, async (req, res) => {
  const id = 'm_' + Date.now();
  const m = { id, minis: [], ...req.body };
  await pool.query('INSERT INTO messen (id, art, dt, t, notes, minis) VALUES ($1, $2, $3, $4, $5, $6)', [id, m.art, m.dt, m.t, m.notes, JSON.stringify(m.minis)]);
  res.json({ ok: true, messe: m });
});

app.put('/api/messen/:id', auth, adminOnly, async (req, res) => {
  const { art, dt, t, notes, minis } = req.body;
  await pool.query('UPDATE messen SET art = $1, dt = $2, t = $3, notes = $4, minis = $5 WHERE id = $6', [art, dt, t, notes, JSON.stringify(minis || []), req.params.id]);

  if (minis) {
    await pool.query("UPDATE users SET ein = (SELECT jsonb_agg(x) FROM jsonb_array_elements_text(ein) x WHERE x::text <> $1) WHERE ein ? $1", [dt]);
    await pool.query("UPDATE users SET ein = COALESCE(ein, '[]'::jsonb) || jsonb_build_array($1) WHERE id = ANY($2)", [dt, minis]);
  }
  res.json({ ok: true });
});

app.delete('/api/messen/:id', auth, adminOnly, async (req, res) => {
  await pool.query('DELETE FROM messen WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ── Abmeldungen ────────────────────────────────────────────────────
app.post('/api/abmeldung', auth, async (req, res) => {
  const entry = { id: 'abm_' + Date.now(), ...req.body };
  await pool.query("UPDATE users SET abm = COALESCE(abm, '[]'::jsonb) || $1::jsonb WHERE id = $2", [JSON.stringify(entry), req.uid]);
  res.json({ ok: true, abm: entry });
});

app.delete('/api/abmeldung/:abmId', auth, async (req, res) => {
  await pool.query("UPDATE users SET abm = (SELECT jsonb_agg(x) FROM jsonb_array_elements(abm) x WHERE x->>'id' <> $1) WHERE id = $2", [req.params.abmId, req.uid]);
  res.json({ ok: true });
});

// ── Ankündigungen ──────────────────────────────────────────────────
app.get('/api/anns', auth, async (_, res) => {
  const { rows } = await pool.query('SELECT * FROM anns ORDER BY pinned DESC, dt DESC');
  res.json(rows);
});

app.post('/api/anns', auth, adminOnly, async (req, res) => {
  const a = { id: 'a_' + Date.now(), dt: today(), author_id: req.uid, ...req.body };
  await pool.query('INSERT INTO anns (id, title, body, pinned, dt, author_id) VALUES ($1, $2, $3, $4, $5, $6)', [a.id, a.title, a.body, a.pinned, a.dt, a.author_id]);
  res.json({ ok: true, ann: a });
});

app.delete('/api/anns/:id', auth, adminOnly, async (req, res) => {
  await pool.query('DELETE FROM anns WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ── Backup ─────────────────────────────────────────────────────────
app.get('/api/backup', auth, adminOnly, async (_, res) => {
  const cfg = await pool.query('SELECT * FROM config');
  const users = await pool.query('SELECT * FROM users');
  const messen = await pool.query('SELECT * FROM messen');
  const familien = await pool.query('SELECT * FROM familien');
  const anns = await pool.query('SELECT * FROM anns');
  
  const data = { cfg: cfg.rows[0], users: users.rows, messen: messen.rows, familien: familien.rows, anns: anns.rows };
  res.setHeader('Content-Disposition', `attachment; filename="backup-${today()}.json"`);
  res.json(data);
});

// ── Catch-all → React ──────────────────────────────────────────────
if (fs.existsSync(CLIENT)) {
  app.get('*', (_, res) => res.sendFile(path.join(CLIENT, 'index.html')));
}

// ── Helpers ────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10); }

app.listen(PORT, () => console.log(`✝  Ministranten läuft auf Port ${PORT}`));
