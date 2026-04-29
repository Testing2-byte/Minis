import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { api } from './api';

// ── Toast ─────────────────────────────────────────────────────────
const toastListeners = [];
export function toast(msg, type = 'i', dur = 3000) {
  toastListeners.forEach(fn => fn({ msg, type, dur }));
}

function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    const fn = t => {
      const id = Date.now();
      setToasts(p => [...p, { ...t, id }]);
      setTimeout(() => setToasts(p => p.filter(x => x.id !== id)), t.dur);
    };
    toastListeners.push(fn);
    return () => toastListeners.splice(toastListeners.indexOf(fn), 1);
  }, []);
  return (
    <div className="tc">
      {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
    </div>
  );
}

// ── Auth Context ──────────────────────────────────────────────────
const Ctx = createContext(null);
function useAuth() { return useContext(Ctx); }

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } });
  const [cfg,  setCfg]  = useState(() => { try { return JSON.parse(localStorage.getItem('cfg')) || {}; } catch { return {}; } });

  function persist(token, u, c) {
    if (token) localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(u));
    localStorage.setItem('cfg',  JSON.stringify(c));
    setUser(u); setCfg(c);
  }

  async function login(username, password) {
    const d = await api.login({ username, password });
    persist(d.token, d.user, d.cfg);
    return d.user;
  }

  async function changePw(oldPw, newPw) {
    const d = await api.changePw({ oldPassword: oldPw, newPassword: newPw });
    persist(d.token, d.user, cfg);
    return d.user;
  }

  async function updateCfg(body) {
    const d = await api.updateCfg(body);
    const next = { ...cfg, ...d.cfg };
    localStorage.setItem('cfg', JSON.stringify(next));
    setCfg(next);
  }

  function logout() {
    localStorage.clear();
    setUser(null); setCfg({});
  }

  const isAdmin = user?.role === 'admin' || user?.role === 'ober';
  return (
    <Ctx.Provider value={{ user, cfg, isAdmin, login, changePw, updateCfg, logout, setUser }}>
      {children}
    </Ctx.Provider>
  );
}

// ── Helpers ───────────────────────────────────────────────────────
const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const MONTHS_S = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
function fmtD(d) { if(!d) return ''; const [y,m,day]=d.split('-'); return `${+day}. ${MONTHS_S[+m-1]} ${y}`; }
function today() { return new Date().toISOString().slice(0,10); }
const ROLE_LBL = { admin:'Administrator', ober:'Obermini', eltern:'Elternteil' };
const ROLE_TAG = { admin:'am', ober:'gr', eltern:'bl' };
function Av({ u, size='md' }) {
  return <div className={`av ${size} ${u?.role||'eltern'}`}>{u?.ini||'??'}</div>;
}

// ── Splash ────────────────────────────────────────────────────────
function Splash({ onDone }) {
  const { cfg } = useAuth();
  const [prog, setP] = useState(0);
  const [out,  setO] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setP(60), 50);
    const t2 = setTimeout(() => setP(100), 400);
    const t3 = setTimeout(() => { setO(true); setTimeout(onDone, 500); }, 900);
    return () => [t1,t2,t3].forEach(clearTimeout);
  }, []);
  return (
    <div className={`splash${out?' out':''}`}>
      <div className="spl-ic">✝</div>
      <div className="spl-t">Ministranten</div>
      <div className="spl-s">{cfg?.parish || '…'}</div>
      <div className="spl-bar"><div className="spl-prog" style={{ width: prog+'%' }} /></div>
    </div>
  );
}

// ── Setup ─────────────────────────────────────────────────────────
function Setup({ onDone }) {
  const [f, setF] = useState({ parish:'', city:'', username:'', password:'', pw2:'' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }));

  async function submit() {
    if (!f.parish || !f.username || !f.password) return setErr('Alle Pflichtfelder ausfüllen');
    if (f.password.length < 8) return setErr('Passwort mind. 8 Zeichen');
    if (f.password !== f.pw2) return setErr('Passwörter stimmen nicht überein');
    setBusy(true); setErr('');
    try {
      const d = await api.setup({ parish: f.parish, city: f.city, username: f.username, password: f.password });
      localStorage.setItem('token', d.token);
      localStorage.setItem('user', JSON.stringify(d.user));
      localStorage.setItem('cfg',  JSON.stringify(d.cfg));
      toast('Einrichtung abgeschlossen!', 's');
      onDone();
    } catch(e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <div className="login-card" style={{ maxWidth: 460 }}>
        <div className="login-hd">
          <div className="login-ic">✝</div>
          <div className="login-t">Ersteinrichtung</div>
          <div className="login-s">Richte deine Ministrantenverwaltung ein</div>
        </div>
        <div className="login-bd">
          <p style={{ fontSize:11, fontWeight:600, color:'var(--tx3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12 }}>Pfarrei</p>
          <div className="inp2" style={{ marginBottom:14 }}>
            <div className="fg" style={{ marginBottom:0 }}><label className="fl">Pfarreiname *</label><input className="inp" placeholder="St. Raphael" value={f.parish} onChange={set('parish')} /></div>
            <div className="fg" style={{ marginBottom:0 }}><label className="fl">Stadt</label><input className="inp" placeholder="München" value={f.city} onChange={set('city')} /></div>
          </div>
          <p style={{ fontSize:11, fontWeight:600, color:'var(--tx3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12, marginTop:4 }}>Admin-Account</p>
          <div className="fg"><label className="fl">Benutzername *</label><input className="inp" placeholder="admin" value={f.username} onChange={set('username')} autoComplete="username" /></div>
          <div className="inp2">
            <div className="fg" style={{ marginBottom:0 }}><label className="fl">Passwort * (mind. 8)</label><input className="inp" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" /></div>
            <div className="fg" style={{ marginBottom:0 }}><label className="fl">Wiederholen *</label><input className="inp" type="password" value={f.pw2} onChange={set('pw2')} autoComplete="new-password" /></div>
          </div>
          {err && <div className="notice e" style={{ marginTop:14 }}>{err}</div>}
          <button className="btn p w" style={{ marginTop:18 }} onClick={submit} disabled={busy}>{busy ? 'Wird eingerichtet…' : 'Einrichtung abschließen →'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────
function Login() {
  const { login, cfg } = useAuth();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!username || !password) return setErr('Benutzername und Passwort eingeben');
    setBusy(true); setErr('');
    try { await login(username, password); }
    catch(e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-hd">
          <div className="login-ic">✝</div>
          <div className="login-t">Ministranten</div>
          <div className="login-s">{cfg?.parish}{cfg?.city ? ` · ${cfg.city}` : ''}</div>
        </div>
        <div className="login-bd">
          <div className="fg"><label className="fl">Benutzername</label>
            <input className="inp" autoFocus value={username} onChange={e=>setU(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} autoComplete="username" />
          </div>
          <div className="fg"><label className="fl">Passwort</label>
            <input className="inp" type="password" value={password} onChange={e=>setP(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} autoComplete="current-password" />
          </div>
          {err && <div className="notice e">{err}</div>}
          <button className="btn p w" onClick={submit} disabled={busy} style={{ marginTop:4 }}>{busy ? 'Anmelden…' : 'Anmelden'}</button>
          <p style={{ fontSize:11, color:'var(--tx3)', textAlign:'center', marginTop:16 }}>Kein Account? Wende dich an den Administrator.</p>
        </div>
      </div>
    </div>
  );
}

// ── Change Password (Erster Login) ────────────────────────────────
function ChangePw() {
  const { user, changePw, logout } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (pw.length < 8) return setErr('Mind. 8 Zeichen');
    if (pw !== pw2)    return setErr('Passwörter stimmen nicht überein');
    setBusy(true); setErr('');
    try { await changePw(null, pw); toast('Passwort gesetzt — willkommen!', 's'); }
    catch(e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-hd">
          <div className="login-ic">🔑</div>
          <div className="login-t">Passwort festlegen</div>
          <div className="login-s">Hallo {user?.nm} — wähle dein eigenes Passwort</div>
        </div>
        <div className="login-bd">
          <div className="notice i" style={{ marginBottom:18 }}>
            Dies ist dein erster Login. Bitte vergib ein eigenes sicheres Passwort.
          </div>
          <div className="fg"><label className="fl">Neues Passwort (mind. 8 Zeichen)</label>
            <input className="inp" type="password" autoFocus value={pw} onChange={e=>setPw(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="fg"><label className="fl">Wiederholen</label>
            <input className="inp" type="password" value={pw2} onChange={e=>setPw2(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} autoComplete="new-password" />
          </div>
          {err && <div className="notice e">{err}</div>}
          <button className="btn p w" onClick={submit} disabled={busy}>{busy?'…':'Passwort speichern & Anmelden'}</button>
          <button className="btn gh w" style={{ marginTop:8 }} onClick={logout}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────
function Dashboard({ setPage }) {
  const [messen, setM] = useState([]);
  const [users,  setU] = useState([]);
  useEffect(() => { api.getMessen().then(setM); api.getUsers().then(setU); }, []);

  const now     = today();
  const upcoming = [...messen].filter(m=>m.dt>=now).sort((a,b)=>a.dt.localeCompare(b.dt));
  const next    = upcoming[0];
  const days    = next ? Math.max(0,Math.ceil((new Date(next.dt)-new Date())/86400000)) : null;

  return (
    <div>
      {next && (
        <div className="hero">
          <div style={{ fontSize:36 }}>⛪</div>
          <div><div className="hero-t">{next.art}</div><div className="hero-s">{fmtD(next.dt)} · {next.t} Uhr · {(next.minis||[]).length} eingeteilt</div></div>
          <div className="hero-r"><div className="hero-d">{days===0?'Heute':days}</div>{days>0&&<div className="hero-dl">Tage</div>}</div>
        </div>
      )}
      <div className="sg">
        <div className="sc"><div className="sl">Eltern-Accounts</div><div className="sv">{users.filter(u=>u.role==='eltern').length}</div></div>
        <div className="sc"><div className="sl">Gottesdienste</div><div className="sv">{messen.filter(m=>m.dt>=now).length}</div></div>
        <div className="sc"><div className="sl">Leitungsteam</div><div className="sv">{users.filter(u=>u.role==='ober'||u.role==='admin').length}</div></div>
      </div>
      <div className="card">
        <div className="ch">📅 Nächste Gottesdienste</div>
        {upcoming.length===0 && <div style={{ color:'var(--tx3)',fontSize:13 }}>Keine bevorstehenden Gottesdienste</div>}
        {upcoming.slice(0,5).map(m => (
          <div key={m.id} className="li">
            <div style={{ width:44,height:44,background:'var(--ac2)',borderRadius:10,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
              <div style={{ fontSize:16,fontWeight:700,color:'var(--ac)' }}>{m.dt.slice(8)}</div>
              <div style={{ fontSize:9,color:'var(--ac)',fontWeight:600 }}>{MONTHS_S[+m.dt.slice(5,7)-1]}</div>
            </div>
            <div style={{ flex:1 }}>
              <div className="li-t">{m.art}</div>
              <div className="li-s">{m.t} Uhr · {(m.minis||[]).length} eingeteilt{m.notes?` · ${m.notes}`:''}</div>
            </div>
          </div>
        ))}
        <button className="btn gh sm" style={{ marginTop:8 }} onClick={()=>setPage('einteilung')}>Alle →</button>
      </div>
    </div>
  );
}

// ── Kalender ──────────────────────────────────────────────────────
function Kalender() {
  const [messen, setM] = useState([]);
  const [date,   setD] = useState(new Date());
  const [sel,    setSel] = useState(null);
  useEffect(() => { api.getMessen().then(setM); }, []);

  const y=date.getFullYear(), mo=date.getMonth();
  const first=new Date(y,mo,1);
  const startDow=(first.getDay()+6)%7;
  const daysInMo=new Date(y,mo+1,0).getDate();
  const now=today();
  function ds(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function messenFor(s){ return messen.filter(m=>m.dt===s); }

  const cells=[];
  for(let i=0;i<startDow;i++) cells.push({other:true,d:new Date(y,mo,-startDow+i+1)});
  for(let i=1;i<=daysInMo;i++) cells.push({d:new Date(y,mo,i)});
  while(cells.length%7!==0) cells.push({other:true,d:new Date(y,mo+1,cells.length-daysInMo-startDow+1)});

  const selMs=sel?messenFor(sel):[];

  return (
    <div>
      <div className="cal">
        <div className="cal-hd">
          <button className="cal-nb" onClick={()=>setD(new Date(y,mo-1,1))}>‹</button>
          <div className="cal-mn">{MONTHS[mo]} {y}</div>
          <button className="cal-nb" onClick={()=>setD(new Date(y,mo+1,1))}>›</button>
        </div>
        <div className="cal-gr">
          {['Mo','Di','Mi','Do','Fr','Sa','So'].map(d=><div key={d} className="cal-dn">{d}</div>)}
          {cells.map((c,i)=>{
            const s=ds(c.d), ms=messenFor(s);
            return (
              <div key={i} className={`cal-dc${c.other?' om':''}${s===now?' tod':''}${ms.length?' hm':''}`} onClick={()=>setSel(sel===s?null:s)}>
                <div className="cal-n">{c.d.getDate()}</div>
                {ms.slice(0,2).map(m=><div key={m.id} className="cal-ev">{m.art}</div>)}
              </div>
            );
          })}
        </div>
      </div>
      {sel && (
        <div className="card" style={{ marginTop:12 }}>
          <div className="ch">📅 {fmtD(sel)}</div>
          {selMs.length===0 && <div style={{ color:'var(--tx3)',fontSize:13 }}>Kein Gottesdienst</div>}
          {selMs.map(m=>(
            <div key={m.id} className="li">
              <div style={{ width:36,height:36,background:'var(--ac2)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18 }}>⛪</div>
              <div><div className="li-t">{m.art}</div><div className="li-s">{m.t} Uhr · {(m.minis||[]).length} eingeteilt</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Abmeldung ─────────────────────────────────────────────────────
function Abmeldung() {
  const { user } = useAuth();
  const [abm, setAbm] = useState([]);
  const [von, setVon] = useState('');
  const [bis, setBis] = useState('');
  const [grund, setGr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { api.getUsers().then(us=>{ const u=us.find(x=>x.id===user.id); setAbm(u?.abm||[]); }); }, []);

  async function submit() {
    if(!von||!bis) return setErr('Von und Bis ausfüllen');
    if(bis<von) return setErr('Bis muss nach Von liegen');
    setBusy(true); setErr('');
    try {
      const r = await api.addAbm({ von, bis, grund });
      setAbm(a=>[...a, r.abm]);
      setVon(''); setBis(''); setGr('');
      toast('Abmeldung gespeichert','s');
    } catch(e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function del(id) {
    if(!window.confirm('Abmeldung löschen?')) return;
    try { await api.delAbm(id); setAbm(a=>a.filter(x=>x.id!==id)); toast('Gelöscht'); }
    catch(e) { toast(e.message,'e'); }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom:14 }}>
        <div className="ch">🚫 Neue Abmeldung</div>
        <div className="inp2">
          <div className="fg" style={{ marginBottom:0 }}><label className="fl">Von</label><input className="inp" type="date" value={von} onChange={e=>setVon(e.target.value)} /></div>
          <div className="fg" style={{ marginBottom:0 }}><label className="fl">Bis</label><input className="inp" type="date" value={bis} onChange={e=>setBis(e.target.value)} /></div>
        </div>
        <div className="fg" style={{ marginTop:14 }}><label className="fl">Grund (optional)</label><input className="inp" placeholder="z.B. Urlaub" value={grund} onChange={e=>setGr(e.target.value)} /></div>
        {err && <div className="notice e">{err}</div>}
        <button className="btn p" onClick={submit} disabled={busy}>{busy?'…':'Abmeldung einreichen'}</button>
      </div>
      <div className="card">
        <div className="ch">Meine Abmeldungen</div>
        {abm.length===0 && <div style={{ color:'var(--tx3)',fontSize:13 }}>Keine Abmeldungen</div>}
        {abm.map(a=>(
          <div key={a.id} className="li">
            <div style={{ flex:1 }}><div className="li-t">{fmtD(a.von)} – {fmtD(a.bis)}</div>{a.grund&&<div className="li-s">{a.grund}</div>}</div>
            <button className="btn d sm" onClick={()=>del(a.id)}>Löschen</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Ankündigungen ─────────────────────────────────────────────────
function Anns() {
  const { isAdmin } = useAuth();
  const [anns, setAnns] = useState([]);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ title:'', body:'', pinned:false });
  const [busy, setBusy] = useState(false);
  const set = k => e => setF(p=>({...p,[k]:e.target.type==='checkbox'?e.target.checked:e.target.value}));
  useEffect(() => { api.getAnns().then(setAnns); }, []);

  async function create() {
    if(!f.title||!f.body) return;
    setBusy(true);
    try { const d=await api.createAnn(f); setAnns(a=>[d.ann,...a]); setShow(false); setF({title:'',body:'',pinned:false}); }
    catch(e) { toast(e.message,'e'); }
    finally { setBusy(false); }
  }
  async function del(id) {
    if(!window.confirm('Löschen?')) return;
    try { await api.deleteAnn(id); setAnns(a=>a.filter(x=>x.id!==id)); }
    catch(e) { toast(e.message,'e'); }
  }

  return (
    <div>
      {isAdmin && <div style={{ display:'flex',justifyContent:'flex-end',marginBottom:16 }}><button className="btn p" onClick={()=>setShow(true)}>+ Ankündigung</button></div>}
      {anns.length===0 && <div className="card" style={{ textAlign:'center',padding:40,color:'var(--tx3)' }}>Noch keine Ankündigungen</div>}
      {anns.map(a=>(
        <div key={a.id} className="card" style={{ marginBottom:12,borderLeft:a.pinned?'3px solid var(--am)':undefined }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8 }}>
            <div><div style={{ fontWeight:600,fontSize:14 }}>{a.pinned?'📌 ':''}{a.title}</div><div style={{ fontSize:11,color:'var(--tx3)',marginTop:2 }}>{fmtD(a.dt)}</div></div>
            {isAdmin && <button className="btn d sm" onClick={()=>del(a.id)}>Löschen</button>}
          </div>
          <div style={{ fontSize:13,color:'var(--tx2)',lineHeight:1.7,whiteSpace:'pre-wrap' }}>{a.body}</div>
        </div>
      ))}
      {show && (
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setShow(false)}>
          <div className="modal">
            <div className="modal-t">Neue Ankündigung</div>
            <div className="fg"><label className="fl">Titel</label><input className="inp" value={f.title} onChange={set('title')} /></div>
            <div className="fg"><label className="fl">Text</label><textarea className="inp" rows={5} value={f.body} onChange={set('body')} /></div>
            <div className="tgl-r"><span style={{ fontSize:13,color:'var(--tx2)' }}>📌 Oben anheften</span><label className="tgl"><input type="checkbox" checked={f.pinned} onChange={set('pinned')}/><span className="tgl-sl"/></label></div>
            <div className="modal-f"><button className="btn" onClick={()=>setShow(false)}>Abbrechen</button><button className="btn p" onClick={create} disabled={busy}>{busy?'…':'Erstellen'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Accounts ──────────────────────────────────────────────────────
function Accounts() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [fams, setFams]   = useState({});
  const [modal, setModal] = useState(null);
  const [f, setF] = useState({ username:'', nm:'', role:'eltern', password:'', famId:'', notes:'' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const set = k => e => setF(p=>({...p,[k]:e.target.value}));

  useEffect(() => { load(); }, []);
  async function load() { const [u,f]=await Promise.all([api.getUsers(),api.getFamilien()]); setUsers(u); setFams(f); }

  function openCreate() { setF({username:'',nm:'',role:'eltern',password:'',famId:'',notes:''}); setErr(''); setModal('create'); }
  function openEdit(u)  { setF({username:u.username,nm:u.nm,role:u.role,password:'',famId:u.fam||'',notes:u.notes||''}); setErr(''); setModal(u); }

  async function save() {
    if(modal==='create') {
      if(!f.username||!f.nm||!f.password) return setErr('Alle Pflichtfelder ausfüllen');
      if(f.password.length<4) return setErr('Passwort mind. 4 Zeichen');
      setBusy(true); setErr('');
      try { await api.createUser({...f,famId:f.famId||null}); toast(`${f.nm} erstellt`,'s'); setModal(null); load(); }
      catch(e) { setErr(e.message); }
      finally { setBusy(false); }
    } else {
      setBusy(true); setErr('');
      try {
        const body={nm:f.nm,username:f.username,role:f.role,notes:f.notes,famId:f.famId||null};
        if(f.password) body.password=f.password;
        await api.updateUser(modal.id,body);
        toast('Gespeichert','s'); setModal(null); load();
      } catch(e) { setErr(e.message); }
      finally { setBusy(false); }
    }
  }
  async function del(u) {
    if(!window.confirm(`${u.nm} löschen?`)) return;
    try { await api.deleteUser(u.id); toast(`${u.nm} gelöscht`); load(); }
    catch(e) { toast(e.message,'e'); }
  }

  const filtered=users.filter(u=>u.nm.toLowerCase().includes(search.toLowerCase())||u.username.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16 }}>
        <input className="inp" placeholder="Suchen…" value={search} onChange={e=>setSearch(e.target.value)} style={{ maxWidth:260 }} />
        <button className="btn p" onClick={openCreate}>+ Neuer Account</button>
      </div>
      {['admin','ober','eltern'].map(role=>{
        const grp=filtered.filter(u=>u.role===role);
        if(!grp.length) return null;
        return (
          <div key={role} className="card" style={{ marginBottom:12 }}>
            <div className="ch">{role==='admin'?'🛡️':role==='ober'?'👑':'👨‍👩‍👧‍👦'} {ROLE_LBL[role]}s <span className="tag gy" style={{ marginLeft:8 }}>{grp.length}</span></div>
            {grp.map(u=>(
              <div key={u.id} className="li">
                <Av u={u} />
                <div style={{ flex:1,minWidth:0 }}>
                  <div className="li-t">{u.nm}</div>
                  <div className="li-s">@{u.username}{u.fam&&fams[u.fam]?` · Familie ${fams[u.fam].name}`:''}{u.mustChangePw?' · ⚠ Muss PW ändern':''}</div>
                </div>
                <span className={`tag ${ROLE_TAG[u.role]}`}>{ROLE_LBL[u.role]}</span>
                <button className="btn sm" onClick={()=>openEdit(u)}>Bearbeiten</button>
                {u.id!==me.id && <button className="btn d sm" onClick={()=>del(u)}>Löschen</button>}
              </div>
            ))}
          </div>
        );
      })}
      {modal && (
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="modal">
            <div className="modal-t">{modal==='create'?'Neuer Account':`${modal.nm} bearbeiten`}</div>
            <div className="fg"><label className="fl">Vollständiger Name *</label><input className="inp" placeholder="Maria Müller" value={f.nm} onChange={set('nm')} /></div>
            <div className="inp2">
              <div className="fg" style={{ marginBottom:0 }}><label className="fl">Benutzername *</label><input className="inp" placeholder="mmueller" value={f.username} onChange={set('username')} autoComplete="off" /></div>
              <div className="fg" style={{ marginBottom:0 }}><label className="fl">Rolle</label><select className="inp" value={f.role} onChange={set('role')}><option value="eltern">Elternteil</option><option value="ober">Obermini</option><option value="admin">Administrator</option></select></div>
            </div>
            <div className="fg" style={{ marginTop:14 }}>
              <label className="fl">{modal==='create'?'Start-Passwort *':'Neues Passwort (leer = unverändert)'}</label>
              <input className="inp" type="password" placeholder={modal==='create'?'mind. 4 Zeichen':'Leer = keine Änderung'} value={f.password} onChange={set('password')} autoComplete="new-password" />
              {modal==='create' && <div style={{ fontSize:11,color:'var(--tx3)',marginTop:4 }}>⚠ Nutzer muss Passwort beim ersten Login ändern.</div>}
            </div>
            <div className="fg">
              <label className="fl">Familie zuweisen</label>
              <select className="inp" value={f.famId} onChange={set('famId')}><option value="">Keine Familie</option>{Object.values(fams).map(fa=><option key={fa.id} value={fa.id}>{fa.name}</option>)}</select>
            </div>
            <div className="fg"><label className="fl">Notizen</label><input className="inp" placeholder="z.B. Kreuzträger" value={f.notes} onChange={set('notes')} /></div>
            {err && <div className="notice e">{err}</div>}
            <div className="modal-f">
              {modal!=='create'&&modal.id!==me.id&&<button className="btn d" onClick={()=>{setModal(null);del(modal);}}>Löschen</button>}
              <button className="btn" onClick={()=>setModal(null)}>Abbrechen</button>
              <button className="btn p" onClick={save} disabled={busy}>{busy?'…':'Speichern'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Familien ──────────────────────────────────────────────────────
function Familien() {
  const [fams, setFams] = useState({});
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null);
  const [f, setF] = useState({ name:'', kinder:[] });
  const [newKind, setNK] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.getFamilien().then(setFams); api.getUsers().then(setUsers); }, []);

  async function save() {
    if(!f.name) return;
    setBusy(true);
    try {
      if(modal==='create') { const d=await api.createFamilie(f); setFams(p=>({...p,[d.id]:{id:d.id,...f}})); }
      else { await api.updateFamilie(modal.id,f); setFams(p=>({...p,[modal.id]:{...p[modal.id],...f}})); }
      toast('Gespeichert','s'); setModal(null);
    } catch(e) { toast(e.message,'e'); }
    finally { setBusy(false); }
  }
  async function del(id,name) {
    if(!window.confirm(`Familie ${name} löschen?`)) return;
    try { await api.deleteFamilie(id); setFams(p=>{const n={...p};delete n[id];return n;}); toast('Gelöscht'); }
    catch(e) { toast(e.message,'e'); }
  }
  function addKind() { const v=newKind.trim(); if(v&&!f.kinder.includes(v)){setF(p=>({...p,kinder:[...p.kinder,v]}));setNK('');} }
  function rmKind(k) { setF(p=>({...p,kinder:p.kinder.filter(x=>x!==k)})); }

  return (
    <div>
      <div style={{ display:'flex',justifyContent:'flex-end',marginBottom:16 }}><button className="btn p" onClick={()=>{setF({name:'',kinder:[]});setModal('create');}}>+ Neue Familie</button></div>
      {Object.keys(fams).length===0 && <div className="card" style={{ textAlign:'center',padding:40,color:'var(--tx3)' }}><div style={{ fontSize:40,marginBottom:12 }}>👨‍👩‍👧‍👦</div><div style={{ fontWeight:600 }}>Noch keine Familien</div></div>}
      {Object.values(fams).map(fam=>{
        const eltern=users.filter(u=>u.fam===fam.id);
        return (
          <div key={fam.id} className="card" style={{ marginBottom:12 }}>
            <div style={{ display:'flex',justifyContent:'space-between',marginBottom:14 }}>
              <div>
                <div style={{ fontWeight:600,fontSize:15 }}>Familie {fam.name}</div>
                <div style={{ fontSize:12,color:'var(--tx3)',marginTop:2 }}>{(fam.kinder||[]).length} Kinder · {eltern.length} Eltern-Account{eltern.length!==1?'s':''}</div>
              </div>
              <div style={{ display:'flex',gap:8 }}>
                <button className="btn sm" onClick={()=>{setF({name:fam.name,kinder:[...(fam.kinder||[])]});setModal(fam);}}>Bearbeiten</button>
                <button className="btn d sm" onClick={()=>del(fam.id,fam.name)}>Löschen</button>
              </div>
            </div>
            {(fam.kinder||[]).length>0 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11,color:'var(--tx3)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8 }}>Kinder (Ministranten)</div>
                <div style={{ display:'flex',flexWrap:'wrap',gap:8 }}>
                  {fam.kinder.map(k=><div key={k} style={{ background:'var(--ac2)',color:'var(--ac)',borderRadius:20,padding:'4px 12px',fontSize:12,fontWeight:500 }}>👦 {k}</div>)}
                </div>
              </div>
            )}
            {eltern.length>0 && (
              <div>
                <div style={{ fontSize:11,color:'var(--tx3)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8 }}>Eltern-Accounts</div>
                {eltern.map(u=>(
                  <div key={u.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'6px 0',borderTop:'1px solid var(--bd)' }}>
                    <Av u={u} size="sm" /><div><div style={{ fontSize:13,fontWeight:500 }}>{u.nm}</div><div style={{ fontSize:11,color:'var(--tx3)' }}>@{u.username}</div></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {modal && (
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="modal">
            <div className="modal-t">{modal==='create'?'Neue Familie':'Familie bearbeiten'}</div>
            <div className="fg"><label className="fl">Familienname *</label><input className="inp" placeholder="z.B. Müller" value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))} /></div>
            <div className="fg">
              <label className="fl">Kinder</label>
              <div style={{ display:'flex',flexWrap:'wrap',gap:6,marginBottom:8 }}>
                {f.kinder.map(k=>(
                  <span key={k} style={{ display:'inline-flex',alignItems:'center',gap:4,background:'var(--ac2)',color:'var(--ac)',borderRadius:20,padding:'3px 10px',fontSize:12 }}>
                    {k}<button onClick={()=>rmKind(k)} style={{ border:'none',background:'none',cursor:'pointer',color:'var(--ac)',fontSize:14,lineHeight:1 }}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ display:'flex',gap:8 }}>
                <input className="inp" placeholder="Vorname" value={newKind} onChange={e=>setNK(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addKind()} />
                <button className="btn sm" onClick={addKind}>Hinzufügen</button>
              </div>
            </div>
            <div className="modal-f"><button className="btn" onClick={()=>setModal(null)}>Abbrechen</button><button className="btn p" onClick={save} disabled={busy}>{busy?'…':'Speichern'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Messen ────────────────────────────────────────────────────────
function Messen() {
  const [messen, setM] = useState([]);
  const [modal,  setMo] = useState(null);
  const [f, setF] = useState({ art:'Sonntagsmesse', dt:'', t:'09:30', notes:'' });
  const [busy, setBusy] = useState(false);
  const ARTEN=['Sonntagsmesse','Hochamt','Werktagsmesse','Trauung','Beerdigung','Firmung','Kommunion','Sondergottesdienst'];
  const set = k => e => setF(p=>({...p,[k]:e.target.value}));
  const now = today();
  useEffect(()=>{ api.getMessen().then(m=>setM([...m].sort((a,b)=>a.dt.localeCompare(b.dt)))); },[]);

  async function save() {
    if(!f.dt||!f.t) return;
    setBusy(true);
    try {
      if(modal==='create') { const d=await api.createMesse(f); setM(m=>[...m,d.messe].sort((a,b)=>a.dt.localeCompare(b.dt))); }
      else { await api.updateMesse(modal.id,f); setM(m=>m.map(x=>x.id===modal.id?{...x,...f}:x)); }
      setMo(null);
    } catch(e) { toast(e.message,'e'); }
    finally { setBusy(false); }
  }
  async function del(m) {
    if(!window.confirm(`${m.art} löschen?`)) return;
    try { await api.deleteMesse(m.id); setM(ms=>ms.filter(x=>x.id!==m.id)); }
    catch(e) { toast(e.message,'e'); }
  }

  function Row({ m }) {
    return (
      <div className="li">
        <div style={{ width:44,height:44,background:m.dt>=now?'var(--ac2)':'var(--sur2)',borderRadius:10,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
          <div style={{ fontSize:15,fontWeight:700,color:m.dt>=now?'var(--ac)':'var(--tx3)' }}>{m.dt.slice(8)}</div>
          <div style={{ fontSize:9,color:m.dt>=now?'var(--ac)':'var(--tx3)',fontWeight:600 }}>{MONTHS_S[+m.dt.slice(5,7)-1]}</div>
        </div>
        <div style={{ flex:1 }}><div className="li-t">{m.art}</div><div className="li-s">{m.t} Uhr · {(m.minis||[]).length} eingeteilt{m.notes?` · ${m.notes}`:''}</div></div>
        <button className="btn sm" onClick={()=>{setF({art:m.art,dt:m.dt,t:m.t,notes:m.notes||''});setMo(m);}}>Bearbeiten</button>
        <button className="btn d sm" onClick={()=>del(m)}>Löschen</button>
      </div>
    );
  }

  const upcoming=messen.filter(m=>m.dt>=now), past=[...messen.filter(m=>m.dt<now)].reverse();
  return (
    <div>
      <div style={{ display:'flex',justifyContent:'flex-end',marginBottom:16 }}><button className="btn p" onClick={()=>{setF({art:'Sonntagsmesse',dt:'',t:'09:30',notes:''});setMo('create');}}>+ Gottesdienst</button></div>
      <div className="card" style={{ marginBottom:12 }}><div className="ch">⛪ Bevorstehend ({upcoming.length})</div>{upcoming.length===0&&<div style={{ color:'var(--tx3)',fontSize:13 }}>Keine</div>}{upcoming.map(m=><Row key={m.id} m={m}/>)}</div>
      {past.length>0&&<div className="card"><div className="ch">📁 Vergangen</div>{past.slice(0,10).map(m=><Row key={m.id} m={m}/>)}</div>}
      {modal && (
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setMo(null)}>
          <div className="modal">
            <div className="modal-t">{modal==='create'?'Neuer Gottesdienst':'Gottesdienst bearbeiten'}</div>
            <div className="fg"><label className="fl">Art</label><select className="inp" value={f.art} onChange={set('art')}>{ARTEN.map(a=><option key={a}>{a}</option>)}</select></div>
            <div className="inp2"><div className="fg" style={{ marginBottom:0 }}><label className="fl">Datum</label><input className="inp" type="date" value={f.dt} onChange={set('dt')} /></div><div className="fg" style={{ marginBottom:0 }}><label className="fl">Uhrzeit</label><input className="inp" type="time" value={f.t} onChange={set('t')} /></div></div>
            <div className="fg" style={{ marginTop:14 }}><label className="fl">Notizen</label><input className="inp" placeholder="Optional" value={f.notes} onChange={set('notes')} /></div>
            <div className="modal-f"><button className="btn" onClick={()=>setMo(null)}>Abbrechen</button><button className="btn p" onClick={save} disabled={busy}>{busy?'…':'Speichern'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Einteilung ────────────────────────────────────────────────────
function Einteilung() {
  const [messen, setM] = useState([]);
  const [users,  setU] = useState([]);
  const [sel,    setSel] = useState(null);
  const [selMinis, setSM] = useState([]);
  const [saving, setSaving] = useState(false);
  const now = today();
  useEffect(()=>{ Promise.all([api.getMessen(),api.getUsers()]).then(([m,u])=>{ setM([...m].sort((a,b)=>a.dt.localeCompare(b.dt))); setU(u); }); },[]);

  function pick(m) { setSel(m); setSM([...(m.minis||[])]); }
  function toggle(id) { setSM(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]); }
  function blocked(uid,dt) { const u=users.find(x=>x.id===uid); return (u?.abm||[]).some(a=>dt>=a.von&&dt<=a.bis); }

  async function save() {
    setSaving(true);
    try { await api.updateMesse(sel.id,{ ...sel, minis:selMinis }); setM(m=>m.map(x=>x.id===sel.id?{...x,minis:selMinis}:x)); setSel(p=>({...p,minis:selMinis})); toast('Einteilung gespeichert','s'); }
    catch(e) { toast(e.message,'e'); }
    finally { setSaving(false); }
  }

  const allMinis=users.filter(u=>u.role==='eltern'||u.role==='ober');
  const upcoming=messen.filter(m=>m.dt>=now);
  return (
    <div className="g2" style={{ alignItems:'flex-start' }}>
      <div className="card">
        <div className="ch">⛪ Gottesdienste</div>
        {upcoming.length===0&&<div style={{ color:'var(--tx3)',fontSize:13 }}>Keine bevorstehenden</div>}
        {upcoming.map(m=>(
          <div key={m.id} className="li" style={{ cursor:'pointer',background:sel?.id===m.id?'var(--ac2)':undefined,margin:'0 -20px',padding:'11px 20px' }} onClick={()=>pick(m)}>
            <div style={{ flex:1 }}><div className="li-t">{m.art}</div><div className="li-s">{fmtD(m.dt)} · {m.t} · {(m.minis||[]).length} eingeteilt</div></div>
          </div>
        ))}
      </div>
      <div className="card">
        {!sel&&<div style={{ color:'var(--tx3)',fontSize:13,textAlign:'center',padding:20 }}>← Gottesdienst wählen</div>}
        {sel&&<>
          <div className="ch">✏️ {sel.art} — {fmtD(sel.dt)}</div>
          <div style={{ marginBottom:14,fontSize:13,color:'var(--tx2)' }}>{selMinis.length} ausgewählt</div>
          {allMinis.map(u=>{
            const blk=blocked(u.id,sel.dt), checked=selMinis.includes(u.id);
            return (
              <div key={u.id} onClick={()=>!blk&&toggle(u.id)} className="li" style={{ cursor:blk?'not-allowed':'pointer',opacity:blk?.45:1,background:checked?'var(--ac2)':undefined,margin:'0 -20px',padding:'10px 20px' }}>
                <div style={{ width:18,height:18,border:`1.5px solid ${checked?'var(--ac)':'var(--bd2)'}`,borderRadius:4,background:checked?'var(--ac)':'var(--sur)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'#fff',fontSize:11 }}>{checked?'✓':''}</div>
                <div style={{ flex:1 }}><div className="li-t">{u.nm}</div>{blk&&<div style={{ fontSize:11,color:'var(--rd)' }}>Abgemeldet</div>}</div>
                <span className={`tag ${ROLE_TAG[u.role]}`}>{ROLE_LBL[u.role]}</span>
              </div>
            );
          })}
          <div style={{ marginTop:16 }}><button className="btn p w" onClick={save} disabled={saving}>{saving?'Speichert…':'Einteilung speichern'}</button></div>
        </>}
      </div>
    </div>
  );
}

// ── Statistiken ───────────────────────────────────────────────────
function Statistiken() {
  const [users, setU] = useState([]);
  const [messen, setM] = useState([]);
  useEffect(()=>{ Promise.all([api.getUsers(),api.getMessen()]).then(([u,m])=>{ setU(u); setM(m); }); },[]);
  const minis=users.filter(u=>u.role==='eltern'||u.role==='ober');
  const maxE=Math.max(...minis.map(u=>(u.ein||[]).length),1);
  const COLORS=['#2563EB','#16A34A','#D97706','#7C3AED','#DC2626','#0891B2'];
  const now=today();
  return (
    <div>
      <div className="sg">
        <div className="sc"><div className="sl">Gottesdienste gesamt</div><div className="sv">{messen.length}</div></div>
        <div className="sc"><div className="sl">Eltern-Accounts</div><div className="sv">{minis.length}</div></div>
        <div className="sc"><div className="sl">Ø Einsätze</div><div className="sv">{minis.length?Math.round(minis.reduce((s,u)=>s+(u.ein||[]).length,0)/minis.length*10)/10:0}</div></div>
      </div>
      <div className="card">
        <div className="ch">📊 Einsätze pro Account</div>
        {[...minis].sort((a,b)=>(b.ein||[]).length-(a.ein||[]).length).map((u,i)=>(
          <div key={u.id} className="fb-r">
            <div className="fb-n">{u.sh}</div>
            <div className="fb-t"><div className="fb-f" style={{ width:`${((u.ein||[]).length/maxE)*100}%`,background:COLORS[i%COLORS.length] }}><span>{(u.ein||[]).length}</span></div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Einstellungen ─────────────────────────────────────────────────
function Einstellungen() {
  const { cfg, updateCfg, changePw } = useAuth();
  const [form, setF] = useState({ parish:cfg.parish||'', city:cfg.city||'' });
  const [pw, setPw] = useState({ old:'', new:'', new2:'' });
  const [cfgOk, setCfgOk] = useState(false);
  const [pwErr, setPwErr] = useState('');
  const [pwOk, setPwOk] = useState(false);
  const setFk = k => e => setF(p=>({...p,[k]:e.target.value}));
  const setPwk = k => e => setPw(p=>({...p,[k]:e.target.value}));

  async function saveCfg() { try { await updateCfg(form); setCfgOk(true); setTimeout(()=>setCfgOk(false),2000); } catch(e) { toast(e.message,'e'); } }
  async function savePw() {
    setPwErr(''); setPwOk(false);
    if(pw.new.length<8) return setPwErr('Mind. 8 Zeichen');
    if(pw.new!==pw.new2) return setPwErr('Stimmen nicht überein');
    try { await changePw(pw.old,pw.new); setPw({old:'',new:'',new2:''}); setPwOk(true); setTimeout(()=>setPwOk(false),3000); }
    catch(e) { setPwErr(e.message); }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom:14 }}>
        <div className="ch">⛪ Pfarrei</div>
        <div className="inp2">
          <div className="fg" style={{ marginBottom:0 }}><label className="fl">Pfarreiname</label><input className="inp" value={form.parish} onChange={setFk('parish')} /></div>
          <div className="fg" style={{ marginBottom:0 }}><label className="fl">Stadt</label><input className="inp" value={form.city} onChange={setFk('city')} /></div>
        </div>
        <button className="btn p" style={{ marginTop:14 }} onClick={saveCfg}>{cfgOk?'✓ Gespeichert':'Speichern'}</button>
      </div>

      <div className="card" style={{ marginBottom:14 }}>
        <div className="ch">🔑 Passwort ändern</div>
        <div className="fg"><label className="fl">Aktuelles Passwort</label><input className="inp" type="password" value={pw.old} onChange={setPwk('old')} autoComplete="current-password" /></div>
        <div className="inp2">
          <div className="fg" style={{ marginBottom:0 }}><label className="fl">Neues Passwort</label><input className="inp" type="password" value={pw.new} onChange={setPwk('new')} autoComplete="new-password" /></div>
          <div className="fg" style={{ marginBottom:0 }}><label className="fl">Wiederholen</label><input className="inp" type="password" value={pw.new2} onChange={setPwk('new2')} autoComplete="new-password" /></div>
        </div>
        {pwErr&&<div className="notice e" style={{ marginTop:10 }}>{pwErr}</div>}
        {pwOk&&<div className="notice s" style={{ marginTop:10 }}>Passwort geändert!</div>}
        <button className="btn p" style={{ marginTop:14 }} onClick={savePw}>Passwort ändern</button>
      </div>

      <div className="card">
        <div className="ch">💾 Backup</div>
        <p style={{ fontSize:13,color:'var(--tx2)',marginBottom:14 }}>Lade eine Sicherungskopie aller Daten herunter.</p>
        <a className="btn" href="/api/backup" download>💾 Backup herunterladen</a>
      </div>
    </div>
  );
}

// ── App Shell ─────────────────────────────────────────────────────
const PAGES_ELTERN  = [{ id:'kalender',ic:'📅',lb:'Kalender' },{ id:'abmeldung',ic:'🚫',lb:'Abmeldung' },{ id:'anns',ic:'📢',lb:'Ankündigungen' }];
const PAGES_ADMIN   = [
  { section:'', items:[{ id:'dashboard',ic:'🏠',lb:'Dashboard' },{ id:'kalender',ic:'📅',lb:'Kalender' },{ id:'anns',ic:'📢',lb:'Ankündigungen' },{ id:'abmeldung',ic:'🚫',lb:'Abmeldung' }] },
  { section:'Verwaltung', items:[{ id:'accounts',ic:'👤',lb:'Accounts' },{ id:'familien',ic:'👨‍👩‍👧‍👦',lb:'Familien' },{ id:'messen',ic:'⛪',lb:'Gottesdienste' },{ id:'einteilung',ic:'✏️',lb:'Einteilung' },{ id:'statistiken',ic:'📊',lb:'Statistiken' }] },
  { section:'System', items:[{ id:'einstellungen',ic:'⚙️',lb:'Einstellungen' }] }
];
const PAGE_COMPS = { dashboard:Dashboard,kalender:Kalender,abmeldung:Abmeldung,anns:Anns,accounts:Accounts,familien:Familien,messen:Messen,einteilung:Einteilung,statistiken:Statistiken,einstellungen:Einstellungen };

function AppShell() {
  const { user, cfg, logout, isAdmin } = useAuth();
  const [page, setPage] = useState(isAdmin ? 'dashboard' : 'kalender');
  const [sidebarOpen, setSO] = useState(false);
  const Comp = PAGE_COMPS[page] || Dashboard;
  const nav = isAdmin ? PAGES_ADMIN : [{ section:'', items:PAGES_ELTERN }];
  const pageLabel = [...PAGES_ELTERN,...PAGES_ADMIN.flatMap(g=>g.items)].find(p=>p.id===page)?.lb || '';

  return (
    <div className="shell">
      <div className={`mob-ov${sidebarOpen?' on':''}`} onClick={()=>setSO(false)} />
      <aside className={`sidebar${sidebarOpen?' open':''}`}>
        <div className="sb-logo">
          <div className="sb-logo-ic">✝</div>
          <div><div className="sb-logo-nm">{cfg?.parish||'Ministranten'}</div><div className="sb-logo-sm">{cfg?.city||''}</div></div>
        </div>
        <nav style={{ flex:1 }}>
          {nav.map(({ section, items }) => (
            <div key={section}>
              {section && <div className="sb-sec">{section}</div>}
              {items.map(p => (
                <button key={p.id} className={`sb-it${page===p.id?' on':''}`} onClick={()=>{ setPage(p.id); setSO(false); }}>
                  <span className="ic">{p.ic}</span>{p.lb}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div>
          <button className="sb-user" onClick={()=>{ setPage('einstellungen'); setSO(false); }}>
            <Av u={user} size="sm" />
            <div style={{ overflow:'hidden' }}><div className="sb-un">{user?.nm}</div><div className="sb-ur">{ROLE_LBL[user?.role]}</div></div>
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div style={{ display:'flex',alignItems:'center',gap:10 }}>
            <button className="btn gh sm" onClick={()=>setSO(s=>!s)} style={{ display:'none' }} id="mob-menu">☰</button>
            <div><div style={{ fontWeight:600,fontSize:16 }}>{pageLabel}</div><div style={{ fontSize:11,color:'var(--tx3)' }}>{cfg?.parish}</div></div>
          </div>
          <button className="btn gh sm" onClick={logout}>Abmelden</button>
        </header>
        <div className="content"><Comp setPage={setPage} /></div>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────
function Root() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [splashDone, setSplash] = useState(false);

  useEffect(() => {
    api.setupStatus().then(d => setStatus(d)).catch(() => setStatus({ needed: false }));
  }, []);

  if (!splashDone) return <Splash onDone={() => setSplash(true)} />;
  if (status === null) return null;
  if (status.needed) return <Setup onDone={() => setStatus({ needed: false })} />;
  if (!user) return <Login />;
  if (user.mustChangePw) return <ChangePw />;
  return <AppShell />;
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
      <ToastContainer />
    </AuthProvider>
  );
}
