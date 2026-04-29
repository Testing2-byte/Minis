const express = require('express');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const fs      = require('fs');
const path    = require('path');

const app = express();
const PORT       = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production';
const DB_PATH    = process.env.NODE_ENV === 'production'
  ? '/data/db.json'
  : path.join(__dirname, 'db.json');

app.use(express.json({ limit: '5mb' }));

// ── Serve React build ──────────────────────────────────────────────
const CLIENT = path.join(__dirname, '../client/build');
if (fs.existsSync(CLIENT)) {
  app.use(express.static(CLIENT));
}

// ── Database ───────────────────────────────────────────────────────
function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch {
    return {
      setupDone: false,
      cfg: { parish: '', city: '' },
      users: {},
      familien: {},
      messen: [],
      anns: [],
      ferien: []
    };
  }
}
function writeDB(data) {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

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
app.get('/api/setup-status', (_, res) => {
  const db = readDB();
  res.json({ needed: !db.setupDone });
});

app.post('/api/setup', async (req, res) => {
  const db = readDB();
  if (db.setupDone) return res.status(403).json({ error: 'Bereits eingerichtet' });
  const { parish, city, username, password } = req.body;
  if (!parish || !username || !password)
    return res.status(400).json({ error: 'Alle Felder ausfüllen' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Passwort mind. 8 Zeichen' });

  const id = 'u_' + Date.now();
  const p  = (username||'').split(' ');
  db.users[id] = {
    id,
    username: username.trim().toLowerCase(),
    nm: 'Administrator',
    sh: 'Admin',
    ini: 'AD',
    role: 'admin',
    mustChangePw: false,
    pw: await hashPw(password),
    joined: today(),
    ein: [], abm: [], fam: null
  };
  db.cfg      = { parish, city: city || '' };
  db.setupDone = true;
  writeDB(db);

  const token = makeToken(db.users[id]);
  res.json({ token, user: safe(db.users[id]), cfg: db.cfg });
});

// ── Auth ───────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Benutzername und Passwort eingeben' });

  const db   = readDB();
  const user = Object.values(db.users).find(u => u.username === username.trim().toLowerCase());
  if (!user || !(await verifyPw(password, user.pw)))
    return res.status(401).json({ error: 'Benutzername oder Passwort falsch' });

  user.lastLogin = today();
  writeDB(db);
  res.json({ token: makeToken(user), user: safe(user), cfg: db.cfg });
});

app.post('/api/change-password', auth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8)
    return res.status(400).json({ error: 'Neues Passwort mind. 8 Zeichen' });

  const db   = readDB();
  const user = db.users[req.uid];
  if (!user) return res.status(404).json({ error: 'User nicht gefunden' });

  if (!user.mustChangePw) {
    if (!oldPassword) return res.status(400).json({ error: 'Aktuelles Passwort eingeben' });
    if (!(await verifyPw(oldPassword, user.pw)))
      return res.status(401).json({ error: 'Aktuelles Passwort falsch' });
  }

  user.pw           = await hashPw(newPassword);
  user.mustChangePw = false;
  writeDB(db);

  const token = makeToken(user);
  res.json({ token, user: safe(user) });
});

// ── Config ─────────────────────────────────────────────────────────
app.get('/api/cfg', auth, (_, res) => res.json(readDB().cfg));
app.put('/api/cfg', auth, adminOnly, (req, res) => {
  const db = readDB();
  db.cfg = { ...db.cfg, ...req.body };
  writeDB(db);
  res.json({ ok: true, cfg: db.cfg });
});

// ── Users ──────────────────────────────────────────────────────────
app.get('/api/users', auth, (_, res) => {
  res.json(Object.values(readDB().users).map(safe));
});

app.post('/api/users', auth, adminOnly, async (req, res) => {
  const { username, nm, role, password, famId, notes } = req.body;
  if (!username || !nm || !role || !password)
    return res.status(400).json({ error: 'Alle Pflichtfelder ausfüllen' });
  if (password.length < 4)
    return res.status(400).json({ error: 'Passwort mind. 4 Zeichen' });

  const db = readDB();
  if (Object.values(db.users).some(u => u.username === username.trim().toLowerCase()))
    return res.status(400).json({ error: 'Benutzername bereits vergeben' });

  const id    = 'u_' + Date.now();
  const parts = nm.trim().split(' ');
  const ini   = ((parts[0]?.[0]||'')+(parts[1]?.[0]||'')).toUpperCase();
  const sh    = parts.length > 1 ? `${parts[0]} ${parts.at(-1)[0]}.` : nm;

  db.users[id] = {
    id,
    username: username.trim().toLowerCase(),
    nm, sh, ini, role,
    mustChangePw: true,   // ← MUSS PW bei erstem Login ändern
    pw: await hashPw(password),
    fam: famId || null,
    notes: notes || '',
    joined: today(),
    ein: [], abm: []
  };
  writeDB(db);
  res.json({ ok: true, user: safe(db.users[id]) });
});

app.put('/api/users/:id', auth, adminOnly, async (req, res) => {
  const db   = readDB();
  const user = db.users[req.params.id];
  if (!user) return res.status(404).json({ error: 'Nicht gefunden' });

  const { nm, username, role, password, famId, notes } = req.body;
  if (nm) {
    user.nm = nm;
    const p = nm.split(' ');
    user.ini = ((p[0]?.[0]||'')+(p[1]?.[0]||'')).toUpperCase();
    user.sh  = p.length > 1 ? `${p[0]} ${p.at(-1)[0]}.` : nm;
  }
  if (username) user.username = username.trim().toLowerCase();
  if (role)     user.role     = role;
  if (notes !== undefined) user.notes = notes;
  if (famId !== undefined) user.fam   = famId || null;
  if (password && password.length >= 4) {
    user.pw           = await hashPw(password);
    user.mustChangePw = true;
  }
  writeDB(db);
  res.json({ ok: true, user: safe(user) });
});

app.delete('/api/users/:id', auth, adminOnly, (req, res) => {
  if (req.params.id === req.uid)
    return res.status(400).json({ error: 'Eigenen Account nicht löschbar' });
  const db = readDB();
  if (!db.users[req.params.id]) return res.status(404).json({ error: 'Nicht gefunden' });
  delete db.users[req.params.id];
  writeDB(db);
  res.json({ ok: true });
});

// ── Familien ───────────────────────────────────────────────────────
app.get('/api/familien', auth, (_, res) => res.json(readDB().familien || {}));

app.post('/api/familien', auth, adminOnly, (req, res) => {
  const db = readDB();
  if (!db.familien) db.familien = {};
  const id = 'f_' + Date.now();
  db.familien[id] = { id, ...req.body, kinder: req.body.kinder || [] };
  writeDB(db);
  res.json({ ok: true, id });
});

app.put('/api/familien/:id', auth, adminOnly, (req, res) => {
  const db = readDB();
  if (!db.familien?.[req.params.id]) return res.status(404).json({ error: 'Nicht gefunden' });
  db.familien[req.params.id] = { ...db.familien[req.params.id], ...req.body };
  writeDB(db);
  res.json({ ok: true });
});

app.delete('/api/familien/:id', auth, adminOnly, (req, res) => {
  const db = readDB();
  delete db.familien?.[req.params.id];
  writeDB(db);
  res.json({ ok: true });
});

// ── Messen ─────────────────────────────────────────────────────────
app.get('/api/messen', auth, (_, res) => res.json(readDB().messen || []));

app.post('/api/messen', auth, adminOnly, (req, res) => {
  const db = readDB();
  const m  = { id: 'm_' + Date.now(), minis: [], ...req.body };
  db.messen.push(m);
  writeDB(db);
  res.json({ ok: true, messe: m });
});

app.put('/api/messen/:id', auth, adminOnly, (req, res) => {
  const db  = readDB();
  const idx = db.messen.findIndex(m => m.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Nicht gefunden' });

  const old = db.messen[idx];
  db.messen[idx] = { ...old, ...req.body };

  // Sync ein-arrays when minis change
  if (req.body.minis !== undefined) {
    const dt = db.messen[idx].dt;
    Object.values(db.users).forEach(u => { u.ein = (u.ein||[]).filter(d => d !== dt); });
    req.body.minis.forEach(uid => {
      if (db.users[uid]) {
        if (!db.users[uid].ein) db.users[uid].ein = [];
        if (!db.users[uid].ein.includes(dt)) db.users[uid].ein.push(dt);
      }
    });
  }
  writeDB(db);
  res.json({ ok: true });
});

app.delete('/api/messen/:id', auth, adminOnly, (req, res) => {
  const db = readDB();
  db.messen = db.messen.filter(m => m.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// ── Abmeldungen ────────────────────────────────────────────────────
app.post('/api/abmeldung', auth, (req, res) => {
  const db   = readDB();
  const user = db.users[req.uid];
  if (!user) return res.status(404).json({ error: 'Nicht gefunden' });
  if (!user.abm) user.abm = [];
  const entry = { id: 'abm_' + Date.now(), ...req.body };
  user.abm.push(entry);
  writeDB(db);
  res.json({ ok: true, abm: entry });
});

app.delete('/api/abmeldung/:abmId', auth, (req, res) => {
  const db   = readDB();
  const user = db.users[req.uid];
  if (!user) return res.status(404).json({ error: 'Nicht gefunden' });
  user.abm = (user.abm||[]).filter(a => a.id !== req.params.abmId);
  writeDB(db);
  res.json({ ok: true });
});

// ── Ankündigungen ──────────────────────────────────────────────────
app.get('/api/anns', auth, (_, res) => res.json(readDB().anns || []));

app.post('/api/anns', auth, adminOnly, (req, res) => {
  const db = readDB();
  const a  = { id: 'a_' + Date.now(), dt: today(), authorId: req.uid, ...req.body };
  if (!db.anns) db.anns = [];
  db.anns.unshift(a);
  writeDB(db);
  res.json({ ok: true, ann: a });
});

app.delete('/api/anns/:id', auth, adminOnly, (req, res) => {
  const db = readDB();
  db.anns  = (db.anns||[]).filter(a => a.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// ── Backup ─────────────────────────────────────────────────────────
app.get('/api/backup', auth, adminOnly, (_, res) => {
  const db = readDB();
  res.setHeader('Content-Disposition', `attachment; filename="backup-${today()}.json"`);
  res.json(db);
});

// ── Catch-all → React ──────────────────────────────────────────────
if (fs.existsSync(CLIENT)) {
  app.get('*', (_, res) => res.sendFile(path.join(CLIENT, 'index.html')));
}

// ── Helpers ────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10); }

app.listen(PORT, () => console.log(`✝  Ministranten läuft auf Port ${PORT}`));
