'use strict';
const express  = require('express');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const { Pool } = require('pg');
const path     = require('path');
const fs       = require('fs');

const app = express();
const PORT       = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('FEHLER: JWT_SECRET nicht gesetzt!');
  process.exit(1);
}
const SECRET = JWT_SECRET || 'dev_only_secret_not_for_production';

app.use(express.json({ limit: '1mb' }));

// ── Security Headers ───────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ── Rate Limiting (in-memory, reicht für kleine App) ───────────────
const rateLimits = new Map();
function rateLimit(key, max = 10, windowMs = 60000) {
  const now = Date.now();
  const entry = rateLimits.get(key) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
  entry.count++;
  rateLimits.set(key, entry);
  return entry.count > max;
}
// Cleanup alle 5 Minuten
setInterval(() => {
  const now = Date.now();
  rateLimits.forEach((v, k) => { if (now > v.reset) rateLimits.delete(k); });
}, 5 * 60 * 1000);

// ── PostgreSQL Pool ────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function db(sql, params = []) {
  const client = await pool.connect();
  try { return await client.query(sql, params); }
  finally { client.release(); }
}

// ── Init Database ──────────────────────────────────────────────────
async function initDB() {
  await db(`
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  await db(`
    CREATE TABLE IF NOT EXISTS users (
      id             TEXT PRIMARY KEY,
      username       TEXT UNIQUE NOT NULL,
      nm             TEXT NOT NULL,
      sh             TEXT NOT NULL,
      ini            TEXT NOT NULL,
      role           TEXT NOT NULL CHECK (role IN ('admin','ober','eltern')),
      pw             TEXT NOT NULL,
      must_change_pw BOOLEAN NOT NULL DEFAULT true,
      fam_id         TEXT,
      notes          TEXT NOT NULL DEFAULT '',
      joined         TEXT NOT NULL,
      last_login     TEXT,
      ein            JSONB NOT NULL DEFAULT '[]',
      abm            JSONB NOT NULL DEFAULT '[]'
    )
  `);
  await db(`
    CREATE TABLE IF NOT EXISTS familien (
      id     TEXT PRIMARY KEY,
      name   TEXT NOT NULL,
      kinder JSONB NOT NULL DEFAULT '[]'
    )
  `);
  await db(`
    CREATE TABLE IF NOT EXISTS messen (
      id    TEXT PRIMARY KEY,
      art   TEXT NOT NULL,
      dt    TEXT NOT NULL,
      t     TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      minis JSONB NOT NULL DEFAULT '[]'
    )
  `);
  await db(`
    CREATE TABLE IF NOT EXISTS anns (
      id        TEXT PRIMARY KEY,
      title     TEXT NOT NULL,
      body      TEXT NOT NULL,
      pinned    BOOLEAN NOT NULL DEFAULT false,
      dt        TEXT NOT NULL,
      author_id TEXT
    )
  `);
  // Index für schnellere Username-Suche
  await db(`CREATE INDEX IF NOT EXISTS idx_users_username ON users (username)`);
  await db(`CREATE INDEX IF NOT EXISTS idx_messen_dt ON messen (dt)`);
  console.log('✅ Datenbank-Tabellen bereit');
}

// ── Crypto Helpers ─────────────────────────────────────────────────
async function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  const hash = await pbkdf2Async(pw, salt);
  return JSON.stringify({ salt: salt.toString('base64'), hash });
}
async function verifyPw(pw, stored) {
  try {
    const { salt, hash } = JSON.parse(stored);
    const check = await pbkdf2Async(pw, Buffer.from(salt, 'base64'));
    // Timing-safe Vergleich gegen Timing-Attacks
    return crypto.timingSafeEqual(Buffer.from(check), Buffer.from(hash));
  } catch { return false; }
}
function pbkdf2Async(pw, salt) {
  return new Promise((res, rej) =>
    crypto.pbkdf2(pw, salt, 120000, 32, 'sha256',
      (e, k) => e ? rej(e) : res(k.toString('hex')))
  );
}
function makeToken(user) {
  return jwt.sign({ uid: user.id, role: user.role }, SECRET, { expiresIn: '12h' });
}
function today() { return new Date().toISOString().slice(0, 10); }
function uid()   { return crypto.randomBytes(8).toString('hex'); }

// ── Sanitize & Validate ────────────────────────────────────────────
function sanitize(s, maxLen = 200) {
  if (typeof s !== 'string') return '';
  return s.trim().slice(0, maxLen);
}
function validUsername(s) { return /^[a-z0-9._-]{3,30}$/.test(s); }
function validRole(r) { return ['admin','ober','eltern'].includes(r); }

// ── Row → Safe User Object ─────────────────────────────────────────
function rowToUser(r) {
  if (!r) return null;
  return {
    id: r.id, username: r.username, nm: r.nm, sh: r.sh, ini: r.ini,
    role: r.role, mustChangePw: r.must_change_pw, fam: r.fam_id,
    notes: r.notes || '', joined: r.joined, lastLogin: r.last_login,
    ein: r.ein || [], abm: r.abm || []
  };
}

// ── Auth Middleware ────────────────────────────────────────────────
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Nicht angemeldet' });
  try {
    const p = jwt.verify(h.slice(7), SECRET);
    req.uid = p.uid; req.role = p.role;
    next();
  } catch {
    res.status(401).json({ error: 'Session abgelaufen — bitte neu anmelden' });
  }
}
function adminOnly(req, res, next) {
  if (req.role !== 'admin' && req.role !== 'ober')
    return res.status(403).json({ error: 'Keine Berechtigung' });
  next();
}

// ══════════════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════════════

// ── Setup Status ───────────────────────────────────────────────────
app.get('/api/setup-status', async (_, res) => {
  try {
    const r = await db(`SELECT value FROM config WHERE key = 'setup_done'`);
    res.json({ needed: !r.rows[0] || r.rows[0].value !== 'true' });
  } catch { res.json({ needed: true }); }
});

// ── Setup (Ersteinrichtung) ────────────────────────────────────────
app.post('/api/setup', async (req, res) => {
  if (rateLimit('setup', 5, 60000))
    return res.status(429).json({ error: 'Zu viele Versuche' });
  try {
    const done = await db(`SELECT value FROM config WHERE key = 'setup_done'`);
    if (done.rows[0]?.value === 'true')
      return res.status(403).json({ error: 'Bereits eingerichtet' });

    const parish   = sanitize(req.body.parish, 100);
    const city     = sanitize(req.body.city, 100);
    const username = sanitize(req.body.username, 30).toLowerCase();
    const password = req.body.password || '';

    if (!parish || !username || !password)
      return res.status(400).json({ error: 'Alle Pflichtfelder ausfüllen' });
    if (!validUsername(username))
      return res.status(400).json({ error: 'Benutzername: 3–30 Zeichen, nur a-z 0-9 . _ -' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Passwort mind. 8 Zeichen' });

    const id = 'u_' + uid();
    await db(
      `INSERT INTO users (id,username,nm,sh,ini,role,pw,must_change_pw,joined,ein,abm)
       VALUES ($1,$2,'Administrator','Admin','AD','admin',$3,false,$4,'[]','[]')`,
      [id, username, await hashPw(password), today()]
    );
    await db(
      `INSERT INTO config (key,value) VALUES ('setup_done','true'),('parish',$1),('city',$2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [parish, city]
    );

    const user = { id, username, nm:'Administrator', sh:'Admin', ini:'AD', role:'admin', mustChangePw:false };
    res.json({ token: makeToken(user), user, cfg: { parish, city } });
  } catch(e) {
    console.error('Setup Fehler:', e.message);
    res.status(500).json({ error: 'Einrichtung fehlgeschlagen' });
  }
});

// ── Login ──────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (rateLimit('login_' + ip, 20, 60000))
    return res.status(429).json({ error: 'Zu viele Anmeldeversuche. Bitte warte eine Minute.' });

  const username = sanitize(req.body.username, 30).toLowerCase();
  const password = req.body.password || '';
  if (!username || !password)
    return res.status(400).json({ error: 'Benutzername und Passwort eingeben' });

  try {
    const r = await db(`SELECT * FROM users WHERE username = $1`, [username]);
    const row = r.rows[0];

    // Dummy-Hash prüfen falls User nicht existiert (verhindert Username-Enumeration)
    if (!row) {
      await hashPw('dummy_timing_protection');
      return res.status(401).json({ error: 'Benutzername oder Passwort falsch' });
    }
    if (!(await verifyPw(password, row.pw)))
      return res.status(401).json({ error: 'Benutzername oder Passwort falsch' });

    await db(`UPDATE users SET last_login = $1 WHERE id = $2`, [today(), row.id]);
    const cfgR = await db(`SELECT key,value FROM config`);
    const cfg = Object.fromEntries(cfgR.rows.map(r => [r.key, r.value]));
    const user = rowToUser(row);
    res.json({ token: makeToken(user), user, cfg });
  } catch(e) {
    console.error('Login Fehler:', e.message);
    res.status(500).json({ error: 'Anmeldefehler' });
  }
});

// ── Passwort ändern ────────────────────────────────────────────────
app.post('/api/change-password', auth, async (req, res) => {
  if (rateLimit('changepw_' + req.uid, 5, 60000))
    return res.status(429).json({ error: 'Zu viele Versuche' });

  const { oldPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8)
    return res.status(400).json({ error: 'Neues Passwort mind. 8 Zeichen' });
  if (newPassword.length > 256)
    return res.status(400).json({ error: 'Passwort zu lang' });

  try {
    const r = await db(`SELECT * FROM users WHERE id = $1`, [req.uid]);
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'User nicht gefunden' });

    if (!row.must_change_pw) {
      if (!oldPassword)
        return res.status(400).json({ error: 'Aktuelles Passwort eingeben' });
      if (!(await verifyPw(oldPassword, row.pw)))
        return res.status(401).json({ error: 'Aktuelles Passwort falsch' });
    }

    await db(
      `UPDATE users SET pw = $1, must_change_pw = false WHERE id = $2`,
      [await hashPw(newPassword), req.uid]
    );
    const user = rowToUser({ ...row, must_change_pw: false });
    res.json({ token: makeToken(user), user });
  } catch(e) {
    console.error('ChangePw Fehler:', e.message);
    res.status(500).json({ error: 'Passwort ändern fehlgeschlagen' });
  }
});

// ── Config ─────────────────────────────────────────────────────────
app.get('/api/cfg', auth, async (_, res) => {
  const r = await db(`SELECT key,value FROM config`);
  res.json(Object.fromEntries(r.rows.map(r => [r.key, r.value])));
});

app.put('/api/cfg', auth, adminOnly, async (req, res) => {
  const allowed = ['parish','city'];
  try {
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        const val = sanitize(req.body[key], 100);
        await db(
          `INSERT INTO config (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = $2`,
          [key, val]
        );
      }
    }
    const r = await db(`SELECT key,value FROM config`);
    res.json({ ok:true, cfg: Object.fromEntries(r.rows.map(r=>[r.key,r.value])) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Users ──────────────────────────────────────────────────────────
app.get('/api/users', auth, async (_, res) => {
  const r = await db(`SELECT * FROM users ORDER BY nm`);
  res.json(r.rows.map(rowToUser));
});

app.post('/api/users', auth, adminOnly, async (req, res) => {
  const username = sanitize(req.body.username, 30).toLowerCase();
  const nm       = sanitize(req.body.nm, 100);
  const role     = req.body.role;
  const password = req.body.password || '';
  const famId    = req.body.famId || null;
  const notes    = sanitize(req.body.notes, 500);

  if (!username || !nm || !role || !password)
    return res.status(400).json({ error: 'Alle Pflichtfelder ausfüllen' });
  if (!validUsername(username))
    return res.status(400).json({ error: 'Benutzername: 3–30 Zeichen, nur a-z 0-9 . _ -' });
  if (!validRole(role))
    return res.status(400).json({ error: 'Ungültige Rolle' });
  if (password.length < 4)
    return res.status(400).json({ error: 'Passwort mind. 4 Zeichen' });

  try {
    const ex = await db(`SELECT id FROM users WHERE username = $1`, [username]);
    if (ex.rows.length)
      return res.status(400).json({ error: 'Benutzername bereits vergeben' });

    const id    = 'u_' + uid();
    const parts = nm.trim().split(' ');
    const ini   = ((parts[0]?.[0]||'')+(parts[1]?.[0]||'')).toUpperCase();
    const sh    = parts.length > 1 ? `${parts[0]} ${parts.at(-1)[0]}.` : nm;

    await db(
      `INSERT INTO users (id,username,nm,sh,ini,role,pw,must_change_pw,fam_id,notes,joined,ein,abm)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,'[]','[]')`,
      [id, username, nm, sh, ini, role, await hashPw(password), famId, notes, today()]
    );
    const r = await db(`SELECT * FROM users WHERE id = $1`, [id]);
    res.json({ ok:true, user: rowToUser(r.rows[0]) });
  } catch(e) {
    console.error('CreateUser Fehler:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const r = await db(`SELECT * FROM users WHERE id = $1`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden' });
    const row = r.rows[0];

    const nm       = sanitize(req.body.nm || row.nm, 100);
    const username = req.body.username ? sanitize(req.body.username,30).toLowerCase() : row.username;
    const role     = req.body.role && validRole(req.body.role) ? req.body.role : row.role;
    const notes    = req.body.notes !== undefined ? sanitize(req.body.notes,500) : row.notes;
    const famId    = req.body.famId !== undefined ? req.body.famId || null : row.fam_id;

    const parts = nm.split(' ');
    const ini = ((parts[0]?.[0]||'')+(parts[1]?.[0]||'')).toUpperCase();
    const sh  = parts.length > 1 ? `${parts[0]} ${parts.at(-1)[0]}.` : nm;

    let newPw = row.pw, mustChange = row.must_change_pw;
    if (req.body.password && req.body.password.length >= 4) {
      newPw = await hashPw(req.body.password);
      mustChange = true;
    }

    await db(
      `UPDATE users SET nm=$1,sh=$2,ini=$3,username=$4,role=$5,pw=$6,
       must_change_pw=$7,fam_id=$8,notes=$9 WHERE id=$10`,
      [nm, sh, ini, username, role, newPw, mustChange, famId, notes, req.params.id]
    );
    const upd = await db(`SELECT * FROM users WHERE id = $1`, [req.params.id]);
    res.json({ ok:true, user: rowToUser(upd.rows[0]) });
  } catch(e) {
    console.error('UpdateUser Fehler:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/users/:id', auth, adminOnly, async (req, res) => {
  if (req.params.id === req.uid)
    return res.status(400).json({ error: 'Eigenen Account nicht löschbar' });
  await db(`DELETE FROM users WHERE id = $1`, [req.params.id]);
  res.json({ ok:true });
});

// ── Familien ───────────────────────────────────────────────────────
app.get('/api/familien', auth, async (_, res) => {
  const r = await db(`SELECT * FROM familien ORDER BY name`);
  const obj = {};
  r.rows.forEach(f => { obj[f.id] = { id:f.id, name:f.name, kinder:f.kinder||[] }; });
  res.json(obj);
});

app.post('/api/familien', auth, adminOnly, async (req, res) => {
  const name   = sanitize(req.body.name, 100);
  const kinder = (req.body.kinder||[]).map(k => sanitize(k, 60)).filter(Boolean);
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  const id = 'f_' + uid();
  await db(`INSERT INTO familien (id,name,kinder) VALUES ($1,$2,$3)`, [id, name, JSON.stringify(kinder)]);
  res.json({ ok:true, id });
});

app.put('/api/familien/:id', auth, adminOnly, async (req, res) => {
  const r = await db(`SELECT * FROM familien WHERE id = $1`, [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden' });
  const name   = req.body.name ? sanitize(req.body.name, 100) : r.rows[0].name;
  const kinder = req.body.kinder ? (req.body.kinder).map(k=>sanitize(k,60)).filter(Boolean) : r.rows[0].kinder;
  await db(`UPDATE familien SET name=$1, kinder=$2 WHERE id=$3`, [name, JSON.stringify(kinder), req.params.id]);
  res.json({ ok:true });
});

app.delete('/api/familien/:id', auth, adminOnly, async (req, res) => {
  await db(`DELETE FROM familien WHERE id = $1`, [req.params.id]);
  res.json({ ok:true });
});

// ── Messen ─────────────────────────────────────────────────────────
app.get('/api/messen', auth, async (_, res) => {
  const r = await db(`SELECT * FROM messen ORDER BY dt, t`);
  res.json(r.rows.map(m => ({ id:m.id, art:m.art, dt:m.dt, t:m.t, notes:m.notes, minis:m.minis||[] })));
});

app.post('/api/messen', auth, adminOnly, async (req, res) => {
  const art   = sanitize(req.body.art, 60);
  const dt    = sanitize(req.body.dt, 10);
  const t     = sanitize(req.body.t, 5);
  const notes = sanitize(req.body.notes, 300);
  if (!art || !dt || !t) return res.status(400).json({ error: 'Art, Datum und Uhrzeit erforderlich' });
  const id = 'm_' + uid();
  await db(`INSERT INTO messen (id,art,dt,t,notes,minis) VALUES ($1,$2,$3,$4,$5,'[]')`, [id,art,dt,t,notes]);
  res.json({ ok:true, messe: { id, art, dt, t, notes, minis:[] } });
});

app.put('/api/messen/:id', auth, adminOnly, async (req, res) => {
  try {
    const old = await db(`SELECT * FROM messen WHERE id = $1`, [req.params.id]);
    if (!old.rows[0]) return res.status(404).json({ error: 'Nicht gefunden' });
    const m = old.rows[0];

    const art   = req.body.art   ? sanitize(req.body.art,60)    : m.art;
    const dt    = req.body.dt    ? sanitize(req.body.dt,10)     : m.dt;
    const t     = req.body.t     ? sanitize(req.body.t,5)       : m.t;
    const notes = req.body.notes !== undefined ? sanitize(req.body.notes,300) : m.notes;
    const minis = req.body.minis !== undefined ? req.body.minis : (m.minis||[]);

    await db(`UPDATE messen SET art=$1,dt=$2,t=$3,notes=$4,minis=$5 WHERE id=$6`,
      [art, dt, t, notes, JSON.stringify(minis), req.params.id]);

    // Sync ein-Arrays
    if (req.body.minis !== undefined) {
      const oldMinis = m.minis || [];
      for (const uid of oldMinis) {
        const ur = await db(`SELECT ein FROM users WHERE id=$1`, [uid]);
        if (ur.rows[0]) {
          const ein = (ur.rows[0].ein||[]).filter(d => d !== dt);
          await db(`UPDATE users SET ein=$1 WHERE id=$2`, [JSON.stringify(ein), uid]);
        }
      }
      for (const uid of minis) {
        const ur = await db(`SELECT ein FROM users WHERE id=$1`, [uid]);
        if (ur.rows[0]) {
          const ein = ur.rows[0].ein || [];
          if (!ein.includes(dt)) ein.push(dt);
          await db(`UPDATE users SET ein=$1 WHERE id=$2`, [JSON.stringify(ein), uid]);
        }
      }
    }
    res.json({ ok:true });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/messen/:id', auth, adminOnly, async (req, res) => {
  await db(`DELETE FROM messen WHERE id = $1`, [req.params.id]);
  res.json({ ok:true });
});

// ── Abmeldungen ────────────────────────────────────────────────────
app.post('/api/abmeldung', auth, async (req, res) => {
  const von   = sanitize(req.body.von, 10);
  const bis   = sanitize(req.body.bis, 10);
  const grund = sanitize(req.body.grund, 300);
  if (!von || !bis) return res.status(400).json({ error: 'Von und Bis Datum erforderlich' });
  if (bis < von) return res.status(400).json({ error: 'Bis muss nach Von liegen' });
  try {
    const r = await db(`SELECT abm FROM users WHERE id = $1`, [req.uid]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden' });
    const abm = r.rows[0].abm || [];
    const entry = { id: 'abm_' + uid(), von, bis, grund };
    abm.push(entry);
    await db(`UPDATE users SET abm=$1 WHERE id=$2`, [JSON.stringify(abm), req.uid]);
    res.json({ ok:true, abm: entry });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/abmeldung/:abmId', auth, async (req, res) => {
  try {
    const r = await db(`SELECT abm FROM users WHERE id=$1`, [req.uid]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden' });
    const abm = (r.rows[0].abm||[]).filter(a => a.id !== req.params.abmId);
    await db(`UPDATE users SET abm=$1 WHERE id=$2`, [JSON.stringify(abm), req.uid]);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Ankündigungen ──────────────────────────────────────────────────
app.get('/api/anns', auth, async (_, res) => {
  const r = await db(`SELECT * FROM anns ORDER BY pinned DESC, dt DESC, id DESC`);
  res.json(r.rows.map(a => ({ id:a.id, title:a.title, body:a.body, pinned:a.pinned, dt:a.dt })));
});

app.post('/api/anns', auth, adminOnly, async (req, res) => {
  const title  = sanitize(req.body.title, 200);
  const body   = sanitize(req.body.body, 5000);
  const pinned = !!req.body.pinned;
  if (!title || !body) return res.status(400).json({ error: 'Titel und Text erforderlich' });
  const id = 'a_' + uid();
  await db(`INSERT INTO anns (id,title,body,pinned,dt,author_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, title, body, pinned, today(), req.uid]);
  res.json({ ok:true, ann: { id, title, body, pinned, dt:today() } });
});

app.delete('/api/anns/:id', auth, adminOnly, async (req, res) => {
  await db(`DELETE FROM anns WHERE id = $1`, [req.params.id]);
  res.json({ ok:true });
});

// ── Backup ─────────────────────────────────────────────────────────
app.get('/api/backup', auth, adminOnly, async (_, res) => {
  try {
    const [u,f,m,a,c] = await Promise.all([
      db(`SELECT * FROM users`), db(`SELECT * FROM familien`),
      db(`SELECT * FROM messen ORDER BY dt`), db(`SELECT * FROM anns`),
      db(`SELECT key,value FROM config`)
    ]);
    res.setHeader('Content-Disposition', `attachment; filename="ministranten-backup-${today()}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      users: u.rows.map(rowToUser),
      familien: f.rows,
      messen: m.rows,
      anns: a.rows,
      cfg: Object.fromEntries(c.rows.map(r=>[r.key,r.value]))
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Serve React Build ──────────────────────────────────────────────
const CLIENT = path.join(__dirname, '../client/build');
if (fs.existsSync(CLIENT)) {
  app.use(express.static(CLIENT, { maxAge: '1d' }));
  app.get('*', (_, res) => res.sendFile(path.join(CLIENT, 'index.html')));
}

// ── Error Handler ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unbehandelter Fehler:', err.message);
  res.status(500).json({ error: 'Interner Serverfehler' });
});

// ── Start ──────────────────────────────────────────────────────────
initDB()
  .then(() => app.listen(PORT, () =>
    console.log(`✝  Ministranten läuft auf Port ${PORT} [${process.env.NODE_ENV || 'development'}]`)
  ))
  .catch(e => { console.error('DB Init Fehler:', e.message); process.exit(1); });
