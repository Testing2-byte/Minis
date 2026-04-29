import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { api } from './api';

// ── Toast ─────────────────────────────────────────────────────────
const _tf = [];
export function toast(msg, type = '', dur = 3500) { _tf.forEach(fn => fn({ msg, type, dur })); }
function ToastContainer() {
  const [toasts, set] = useState([]);
  useEffect(() => {
    const fn = t => { const id = Date.now()+Math.random(); set(p=>[...p,{...t,id}]); setTimeout(()=>set(p=>p.filter(x=>x.id!==id)),t.dur); };
    _tf.push(fn); return ()=>{ const i=_tf.indexOf(fn); if(i>-1)_tf.splice(i,1); };
  }, []);
  return <div className="toast-wrap">{toasts.map(t=><div key={t.id} className={`toast${t.type?' toast-'+t.type:''}`}>{t.msg}</div>)}</div>;
}

// ── Auth Context ──────────────────────────────────────────────────
const Ctx = createContext(null);
function useAuth() { return useContext(Ctx); }
function AuthProvider({ children }) {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } });
  const [cfg,  setCfg]  = useState(() => { try { return JSON.parse(localStorage.getItem('cfg'))||{}; } catch { return {}; } });

  function persist(token, u, c) {
    if (token) localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(u));
    if (c) { localStorage.setItem('cfg', JSON.stringify(c)); setCfg(c); }
    setUser(u);
  }
  async function login(username, password) { const d=await api.login({username,password}); persist(d.token,d.user,d.cfg); return d.user; }
  async function changePw(oldPw, newPw) { const d=await api.changePw({oldPassword:oldPw,newPassword:newPw}); persist(d.token,d.user,null); return d.user; }
  async function updateCfg(body) { const d=await api.updateCfg(body); const n={...cfg,...d.cfg}; localStorage.setItem('cfg',JSON.stringify(n)); setCfg(n); }
  function logout() { localStorage.removeItem('token'); localStorage.removeItem('user'); localStorage.removeItem('cfg'); setUser(null); setCfg({}); }
  return <Ctx.Provider value={{ user, cfg, isAdmin: user?.role==='admin'||user?.role==='ober', login, changePw, updateCfg, logout, setUser }}>{children}</Ctx.Provider>;
}

// ── Helpers ───────────────────────────────────────────────────────
const ML = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const MS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const DS = ['Mo','Di','Mi','Do','Fr','Sa','So'];
const RL = { admin:'Administrator', ober:'Obermini', eltern:'Elternteil' };
const RT = { admin:'tag-amber', ober:'tag-green', eltern:'tag-blue' };
function fmtD(d) { if(!d)return''; const [y,m,day]=d.split('-'); return `${+day}. ${MS[+m-1]} ${y}`; }
function todayStr() { return new Date().toISOString().slice(0,10); }
function dsOf(d) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function Av({ user, size='md' }) { return <div className={`av av-${size} r-${user?.role||'eltern'}`}>{user?.ini||'??'}</div>; }
function DateBadge({ dt, upcoming=true }) {
  const [,m,day]=(dt||'').split('-');
  return <div className={`date-badge${!upcoming?' past':''}`}><div className="date-badge-day">{+day}</div><div className="date-badge-mon">{MS[+m-1]}</div></div>;
}
function Modal({ title, onClose, size, children }) {
  useEffect(()=>{ const esc=e=>e.key==='Escape'&&onClose(); document.addEventListener('keydown',esc); return()=>document.removeEventListener('keydown',esc); },[onClose]);
  return <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}><div className={`modal${size==='lg'?' modal-lg':''}`}><div className="modal-title">{title}</div>{children}</div></div>;
}

// ── Splash ────────────────────────────────────────────────────────
function Splash({ onDone }) {
  const { cfg } = useAuth();
  const [prog, setP] = useState(0);
  const [out, setO] = useState(false);
  useEffect(()=>{ const t1=setTimeout(()=>setP(55),60),t2=setTimeout(()=>setP(100),420),t3=setTimeout(()=>{setO(true);setTimeout(onDone,500);},1050); return()=>[t1,t2,t3].forEach(clearTimeout); },[]);
  return <div className={`splash${out?' out':''}`}><div className="splash-ic">✝</div><div className="splash-title">Ministranten</div><div className="splash-sub">{cfg?.parish||' '}</div><div className="splash-bar"><div className="splash-prog" style={{width:prog+'%'}}/></div></div>;
}

// ── Setup ─────────────────────────────────────────────────────────
function Setup({ onDone }) {
  const [f, setF] = useState({ parish:'', city:'', username:'', password:'', pw2:'' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setF(p=>({...p,[k]:e.target.value}));
  async function submit() {
    if(!f.parish||!f.username||!f.password) return setErr('Alle Pflichtfelder ausfüllen');
    if(f.password.length<8) return setErr('Passwort mind. 8 Zeichen');
    if(f.password!==f.pw2) return setErr('Passwörter stimmen nicht überein');
    setBusy(true); setErr('');
    try {
      const d=await api.setup({parish:f.parish.trim(),city:f.city.trim(),username:f.username.trim(),password:f.password});
      localStorage.setItem('token',d.token); localStorage.setItem('user',JSON.stringify(d.user)); localStorage.setItem('cfg',JSON.stringify(d.cfg));
      toast('Einrichtung abgeschlossen!','success'); onDone();
    } catch(e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="auth-wrap"><div className="auth-card auth-card-wide">
      <div className="auth-header"><div className="auth-icon">✝</div><div className="auth-title">Ersteinrichtung</div><div className="auth-sub">Willkommen — richte deine Ministrantenverwaltung ein</div></div>
      <div className="auth-body">
        <div className="section-title">Pfarrei</div>
        <div className="inp-row">
          <div className="fg"><label className="fl">Pfarreiname *</label><input className="inp" placeholder="St. Raphael" value={f.parish} onChange={set('parish')}/></div>
          <div className="fg"><label className="fl">Stadt / Ort</label><input className="inp" placeholder="München" value={f.city} onChange={set('city')}/></div>
        </div>
        <div className="section-title">Administrator-Account</div>
        <div className="fg"><label className="fl">Benutzername * <span style={{fontWeight:400,color:'var(--tx3)'}}>nur a-z 0-9 . _ -</span></label><input className="inp" placeholder="admin" value={f.username} onChange={set('username')} autoComplete="username"/></div>
        <div className="inp-row">
          <div className="fg"><label className="fl">Passwort * (mind. 8 Zeichen)</label><input className="inp" type="password" value={f.password} onChange={set('password')} autoComplete="new-password"/></div>
          <div className="fg"><label className="fl">Wiederholen *</label><input className="inp" type="password" value={f.pw2} onChange={set('pw2')} autoComplete="new-password" onKeyDown={e=>e.key==='Enter'&&submit()}/></div>
        </div>
        {err&&<div className="notice notice-error">{err}</div>}
        <button className="btn btn-primary btn-full" style={{marginTop:6}} onClick={submit} disabled={busy}>{busy?'Wird eingerichtet…':'Einrichtung abschließen →'}</button>
      </div>
    </div></div>
  );
}

// ── Login ─────────────────────────────────────────────────────────
function Login() {
  const { login, cfg } = useAuth();
  const [u, setU] = useState(''); const [p, setP] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit() {
    if(!u||!p) return setErr('Benutzername und Passwort eingeben');
    setBusy(true); setErr('');
    try { await login(u.trim(), p); } catch(e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="auth-wrap"><div className="auth-card">
      <div className="auth-header"><div className="auth-icon">✝</div><div className="auth-title">Ministranten</div><div className="auth-sub">{cfg?.parish}{cfg?.city?` · ${cfg.city}`:''}</div></div>
      <div className="auth-body">
        <div className="fg"><label className="fl">Benutzername</label><input className="inp" autoFocus autoComplete="username" value={u} onChange={e=>setU(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}/></div>
        <div className="fg"><label className="fl">Passwort</label><input className="inp" type="password" autoComplete="current-password" value={p} onChange={e=>setP(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}/></div>
        {err&&<div className="notice notice-error">{err}</div>}
        <button className="btn btn-primary btn-full" onClick={submit} disabled={busy} style={{marginTop:4}}>{busy?'Wird angemeldet…':'Anmelden'}</button>
        <p style={{fontSize:11,color:'var(--tx3)',textAlign:'center',marginTop:18,lineHeight:1.5}}>Kein Account? Wende dich an deinen Administrator.</p>
      </div>
    </div></div>
  );
}

// ── Change Password ───────────────────────────────────────────────
function ChangePw() {
  const { user, changePw, logout } = useAuth();
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit() {
    if(pw.length<8) return setErr('Mind. 8 Zeichen');
    if(pw!==pw2) return setErr('Passwörter stimmen nicht überein');
    setBusy(true); setErr('');
    try { await changePw(null, pw); toast('Passwort gesetzt — willkommen!','success'); } catch(e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="auth-wrap"><div className="auth-card">
      <div className="auth-header"><div className="auth-icon">🔑</div><div className="auth-title">Passwort festlegen</div><div className="auth-sub">Hallo {user?.nm} — wähle ein eigenes Passwort</div></div>
      <div className="auth-body">
        <div className="notice notice-info" style={{marginBottom:20}}>Du meldest dich zum ersten Mal an. Vergib jetzt ein eigenes sicheres Passwort, das nur du kennst.</div>
        <div className="fg"><label className="fl">Neues Passwort <span style={{fontWeight:400,color:'var(--tx3)'}}>mind. 8 Zeichen</span></label><input className="inp" type="password" autoFocus value={pw} onChange={e=>setPw(e.target.value)} autoComplete="new-password"/></div>
        <div className="fg"><label className="fl">Wiederholen</label><input className="inp" type="password" value={pw2} onChange={e=>setPw2(e.target.value)} autoComplete="new-password" onKeyDown={e=>e.key==='Enter'&&submit()}/></div>
        {err&&<div className="notice notice-error">{err}</div>}
        <button className="btn btn-primary btn-full" onClick={submit} disabled={busy}>{busy?'Wird gespeichert…':'Passwort speichern & Anmelden'}</button>
        <button className="btn btn-ghost btn-full" style={{marginTop:8}} onClick={logout}>Abbrechen</button>
      </div>
    </div></div>
  );
}

// ── Nav Config ────────────────────────────────────────────────────
const NAV_E = [{id:'kalender',ic:'📅',lb:'Kalender'},{id:'abmeldung',ic:'🚫',lb:'Abmeldung'},{id:'anns',ic:'📢',lb:'Ankündigungen'}];
const NAV_A = [
  {section:'',items:[{id:'dashboard',ic:'🏠',lb:'Dashboard'},{id:'kalender',ic:'📅',lb:'Kalender'},{id:'anns',ic:'📢',lb:'Ankündigungen'},{id:'abmeldung',ic:'🚫',lb:'Abmeldung'}]},
  {section:'Verwaltung',items:[{id:'accounts',ic:'👤',lb:'Accounts'},{id:'familien',ic:'👨‍👩‍👧‍👦',lb:'Familien'},{id:'messen',ic:'⛪',lb:'Gottesdienste'},{id:'einteilung',ic:'✏️',lb:'Einteilung'},{id:'statistiken',ic:'📊',lb:'Statistiken'}]},
  {section:'System',items:[{id:'einstellungen',ic:'⚙️',lb:'Einstellungen'}]},
];
const ALL_NAV = [...NAV_E,...NAV_A.flatMap(g=>g.items)];

// ── App Shell ─────────────────────────────────────────────────────
function AppShell() {
  const { user, cfg, isAdmin, logout } = useAuth();
  const [page, setPage] = useState(isAdmin?'dashboard':'kalender');
  const [sbOpen, setSb] = useState(false);
  const nav = isAdmin ? NAV_A : [{section:'',items:NAV_E}];
  const pageLabel = ALL_NAV.find(p=>p.id===page)?.lb||'';
  const Page = PM[page]||Dashboard;
  return (
    <div className="shell">
      <div className={`mob-overlay${sbOpen?' on':''}`} onClick={()=>setSb(false)}/>
      <aside className={`sidebar${sbOpen?' open':''}`}>
        <div className="sb-logo">
          <div className="sb-logo-mark">✝</div>
          <div><div className="sb-logo-nm">{cfg?.parish||'Ministranten'}</div><div className="sb-logo-sub">{cfg?.city||''}</div></div>
        </div>
        <div style={{flex:1}}>
          {nav.map(({section,items})=>(
            <div key={section} className="sb-group">
              {section&&<div className="sb-label">{section}</div>}
              {items.map(p=><button key={p.id} className={`sb-btn${page===p.id?' on':''}`} onClick={()=>{setPage(p.id);setSb(false);}}><span className="ic">{p.ic}</span>{p.lb}</button>)}
            </div>
          ))}
        </div>
        <div className="sb-foot">
          <button className="sb-user" onClick={()=>{setPage('einstellungen');setSb(false);}}>
            <Av user={user} size="sm"/>
            <div style={{overflow:'hidden',flex:1}}><div className="sb-user-nm">{user?.nm}</div><div className="sb-user-role">{RL[user?.role]}</div></div>
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>setSb(s=>!s)} style={{fontSize:18,padding:'4px 8px'}}>☰</button>
            <div><div className="topbar-title">{pageLabel}</div><div className="topbar-sub">{cfg?.parish}</div></div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Abmelden</button>
        </header>
        <div className="page"><Page setPage={setPage}/></div>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────
function Dashboard({ setPage }) {
  const [messen,setM]=useState([]); const [users,setU]=useState([]);
  const now=todayStr();
  useEffect(()=>{ api.getMessen().then(setM).catch(()=>{}); api.getUsers().then(setU).catch(()=>{}); },[]);
  const upcoming=[...messen].filter(m=>m.dt>=now).sort((a,b)=>a.dt.localeCompare(b.dt));
  const next=upcoming[0];
  const days=next?Math.max(0,Math.ceil((new Date(next.dt)-new Date(now))/86400000)):null;
  return (
    <div>
      {next&&<div className="hero"><div className="hero-icon">⛪</div><div><div className="hero-title">{next.art}</div><div className="hero-sub">{fmtD(next.dt)} · {next.t} Uhr · {(next.minis||[]).length} Ministranten eingeteilt</div></div><div className="hero-right"><div className="hero-days">{days===0?'Heute':days}</div>{days>0&&<div className="hero-days-label">Tage</div>}</div></div>}
      {!next&&<div className="notice notice-info" style={{marginBottom:18}}>Keine bevorstehenden Gottesdienste. <button className="btn btn-ghost btn-xs" onClick={()=>setPage('messen')}>Jetzt planen →</button></div>}
      <div className="stats">
        <div className="stat"><div className="stat-label">Eltern-Accounts</div><div className="stat-value">{users.filter(u=>u.role==='eltern').length}</div><div className="stat-sub">registrierte Familien</div></div>
        <div className="stat"><div className="stat-label">Kommende Dienste</div><div className="stat-value">{upcoming.length}</div><div className="stat-sub">Gottesdienste geplant</div></div>
        <div className="stat"><div className="stat-label">Leitungsteam</div><div className="stat-value">{users.filter(u=>u.role!=='eltern').length}</div><div className="stat-sub">Admins & Oberminis</div></div>
      </div>
      <div className="card">
        <div className="card-head">📅 Nächste Gottesdienste<button className="btn btn-ghost btn-xs card-head-action" onClick={()=>setPage('einteilung')}>Alle →</button></div>
        {upcoming.length===0&&<div style={{color:'var(--tx3)',fontSize:13}}>Keine bevorstehenden Gottesdienste</div>}
        {upcoming.slice(0,6).map(m=><div key={m.id} className="li"><DateBadge dt={m.dt} upcoming/><div style={{flex:1}}><div className="li-title">{m.art}</div><div className="li-sub">{m.t} Uhr · {(m.minis||[]).length} eingeteilt{m.notes?` · ${m.notes}`:''}</div></div></div>)}
      </div>
    </div>
  );
}

// ── Kalender ──────────────────────────────────────────────────────
function Kalender() {
  const [messen,setM]=useState([]); const [date,setDate]=useState(new Date()); const [sel,setSel]=useState(null);
  const now=todayStr();
  useEffect(()=>{api.getMessen().then(setM).catch(()=>{});},[]);
  const y=date.getFullYear(),mo=date.getMonth();
  const fdow=(new Date(y,mo,1).getDay()+6)%7;
  const dim=new Date(y,mo+1,0).getDate();
  const cells=[];
  for(let i=0;i<fdow;i++) cells.push({d:new Date(y,mo,-fdow+i+1),other:true});
  for(let i=1;i<=dim;i++) cells.push({d:new Date(y,mo,i),other:false});
  while(cells.length%7!==0) cells.push({d:new Date(y,mo+1,cells.length-dim-fdow+1),other:true});
  const msFor=ds=>messen.filter(m=>m.dt===ds);
  const selMs=sel?msFor(sel):[];
  return (
    <div>
      <div className="cal">
        <div className="cal-head">
          <button className="cal-nav" onClick={()=>setDate(new Date(y,mo-1,1))}>‹</button>
          <div className="cal-month">{ML[mo]} {y}</div>
          <button className="cal-nav" onClick={()=>setDate(new Date(y,mo+1,1))}>›</button>
        </div>
        <div className="cal-grid">
          {DS.map(d=><div key={d} className="cal-dn">{d}</div>)}
          {cells.map((c,i)=>{ const ds=dsOf(c.d),ms=msFor(ds); return <div key={i} className={`cal-cell${c.other?' other':''}${ds===now?' today':''}${ms.length?' has-mass':''}`} onClick={()=>setSel(sel===ds?null:ds)}><div className="cal-num">{c.d.getDate()}</div>{ms.slice(0,2).map(m=><div key={m.id} className="cal-event">{m.art}</div>)}</div>; })}
        </div>
      </div>
      {sel&&<div className="card" style={{marginTop:14}}><div className="card-head">📅 {fmtD(sel)}</div>{selMs.length===0&&<div style={{color:'var(--tx3)',fontSize:13}}>Kein Gottesdienst</div>}{selMs.map(m=><div key={m.id} className="li"><div style={{width:36,height:36,background:'var(--ac2)',borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>⛪</div><div><div className="li-title">{m.art}</div><div className="li-sub">{m.t} Uhr · {(m.minis||[]).length} eingeteilt</div></div></div>)}</div>}
    </div>
  );
}

// ── Abmeldung ─────────────────────────────────────────────────────
function Abmeldung() {
  const {user}=useAuth();
  const [abm,setAbm]=useState([]); const [von,setVon]=useState(''); const [bis,setBis]=useState(''); const [gr,setGr]=useState(''); const [err,setErr]=useState(''); const [busy,setBusy]=useState(false);
  useEffect(()=>{api.getUsers().then(us=>{const me=us.find(u=>u.id===user.id);setAbm(me?.abm||[]);}).catch(()=>{});},[]);
  async function submit() {
    if(!von||!bis) return setErr('Von und Bis Datum ausfüllen');
    if(bis<von) return setErr('Bis muss nach Von liegen');
    setBusy(true); setErr('');
    try { const d=await api.addAbm({von,bis,grund:gr.trim()}); setAbm(a=>[...a,d.abm]); setVon('');setBis('');setGr(''); toast('Abmeldung gespeichert','success'); } catch(e){setErr(e.message);} finally{setBusy(false);}
  }
  async function del(id,info) {
    if(!window.confirm(`Abmeldung "${info}" löschen?`)) return;
    try{await api.delAbm(id);setAbm(a=>a.filter(x=>x.id!==id));toast('Gelöscht');}catch(e){toast(e.message,'error');}
  }
  return (
    <div>
      <div className="card" style={{marginBottom:14}}>
        <div className="card-head">🚫 Neue Abmeldung</div>
        <div className="inp-row">
          <div className="fg" style={{marginBottom:0}}><label className="fl">Von</label><input className="inp" type="date" value={von} onChange={e=>setVon(e.target.value)}/></div>
          <div className="fg" style={{marginBottom:0}}><label className="fl">Bis (einschließlich)</label><input className="inp" type="date" value={bis} onChange={e=>setBis(e.target.value)}/></div>
        </div>
        <div className="fg" style={{marginTop:14}}><label className="fl">Grund <span style={{fontWeight:400,color:'var(--tx3)'}}>optional</span></label><input className="inp" placeholder="z.B. Urlaub, Krankheit" value={gr} onChange={e=>setGr(e.target.value)}/></div>
        {err&&<div className="notice notice-error">{err}</div>}
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy?'…':'Abmeldung einreichen'}</button>
      </div>
      <div className="card">
        <div className="card-head">Meine Abmeldungen <span className="tag tag-gray" style={{marginLeft:6}}>{abm.length}</span></div>
        {abm.length===0&&<div style={{color:'var(--tx3)',fontSize:13}}>Keine Abmeldungen eingetragen</div>}
        {[...abm].reverse().map(a=><div key={a.id} className="li"><div style={{flex:1}}><div className="li-title">{fmtD(a.von)} – {fmtD(a.bis)}</div>{a.grund&&<div className="li-sub">{a.grund}</div>}</div><button className="btn btn-danger btn-sm" onClick={()=>del(a.id,`${a.von}–${a.bis}`)}>Löschen</button></div>)}
      </div>
    </div>
  );
}

// ── Ankündigungen ─────────────────────────────────────────────────
function Anns() {
  const {isAdmin}=useAuth();
  const [anns,setAnns]=useState([]); const [modal,setModal]=useState(false); const [f,setF]=useState({title:'',body:'',pinned:false}); const [busy,setBusy]=useState(false);
  const set=k=>e=>setF(p=>({...p,[k]:e.target.type==='checkbox'?e.target.checked:e.target.value}));
  useEffect(()=>{api.getAnns().then(setAnns).catch(()=>{});},[]);
  async function create() {
    if(!f.title.trim()||!f.body.trim()) return;
    setBusy(true);
    try{const d=await api.createAnn({title:f.title.trim(),body:f.body.trim(),pinned:f.pinned});setAnns(a=>[d.ann,...a]);setModal(false);setF({title:'',body:'',pinned:false});toast('Ankündigung erstellt','success');}catch(e){toast(e.message,'error');}finally{setBusy(false);}
  }
  async function del(id,title) {
    if(!window.confirm(`"${title}" löschen?`)) return;
    try{await api.deleteAnn(id);setAnns(a=>a.filter(x=>x.id!==id));toast('Gelöscht');}catch(e){toast(e.message,'error');}
  }
  return (
    <div>
      {isAdmin&&<div style={{display:'flex',justifyContent:'flex-end',marginBottom:16}}><button className="btn btn-primary" onClick={()=>setModal(true)}>+ Ankündigung erstellen</button></div>}
      {anns.length===0&&<div className="card" style={{textAlign:'center',padding:40,color:'var(--tx3)'}}><div style={{fontSize:36,marginBottom:12}}>📢</div><div style={{fontWeight:600}}>Noch keine Ankündigungen</div></div>}
      {anns.map(a=>(
        <div key={a.id} className="card" style={{marginBottom:12,borderLeft:a.pinned?'3px solid var(--am)':undefined}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
            <div><div style={{fontWeight:600,fontSize:14}}>{a.pinned?'📌 ':''}{a.title}</div><div style={{fontSize:11,color:'var(--tx3)',marginTop:3}}>{fmtD(a.dt)}</div></div>
            {isAdmin&&<button className="btn btn-danger btn-sm" onClick={()=>del(a.id,a.title)}>Löschen</button>}
          </div>
          <div style={{fontSize:13,color:'var(--tx2)',lineHeight:1.7,whiteSpace:'pre-wrap'}}>{a.body}</div>
        </div>
      ))}
      {modal&&<Modal title="Neue Ankündigung" onClose={()=>setModal(false)}>
        <div className="fg"><label className="fl">Titel</label><input className="inp" value={f.title} onChange={set('title')} autoFocus/></div>
        <div className="fg"><label className="fl">Text</label><textarea className="inp" rows={5} value={f.body} onChange={set('body')}/></div>
        <div className="toggle-row"><span className="toggle-row-label">📌 Oben anheften</span><label className="toggle"><input type="checkbox" checked={f.pinned} onChange={set('pinned')}/><span className="toggle-slider"/></label></div>
        <div className="modal-footer"><button className="btn" onClick={()=>setModal(false)}>Abbrechen</button><button className="btn btn-primary" onClick={create} disabled={busy}>{busy?'…':'Erstellen'}</button></div>
      </Modal>}
    </div>
  );
}

// ── Accounts ──────────────────────────────────────────────────────
function Accounts() {
  const {user:me}=useAuth();
  const [users,setUsers]=useState([]); const [fams,setFams]=useState({}); const [modal,setModal]=useState(null);
  const [f,setF]=useState({username:'',nm:'',role:'eltern',password:'',famId:'',notes:''}); const [err,setErr]=useState(''); const [busy,setBusy]=useState(false); const [search,setSearch]=useState('');
  const set=k=>e=>setF(p=>({...p,[k]:e.target.value}));
  useEffect(()=>{load();},[]);
  async function load(){const[u,fa]=await Promise.all([api.getUsers(),api.getFamilien()]);setUsers(u);setFams(fa);}
  function openCreate(){setF({username:'',nm:'',role:'eltern',password:'',famId:'',notes:''});setErr('');setModal('new');}
  function openEdit(u){setF({username:u.username,nm:u.nm,role:u.role,password:'',famId:u.fam||'',notes:u.notes||''});setErr('');setModal(u);}
  async function save(){
    setBusy(true);setErr('');
    try{
      if(modal==='new'){if(!f.username||!f.nm||!f.password)return setErr('Alle Pflichtfelder ausfüllen');await api.createUser({...f,famId:f.famId||null});toast(`${f.nm} erstellt`,'success');}
      else{const b={nm:f.nm,username:f.username,role:f.role,notes:f.notes,famId:f.famId||null};if(f.password)b.password=f.password;await api.updateUser(modal.id,b);toast('Gespeichert','success');}
      setModal(null);load();
    }catch(e){setErr(e.message);}finally{setBusy(false);}
  }
  async function del(u){
    if(!window.confirm(`${u.nm} (@${u.username}) wirklich löschen?`))return;
    try{await api.deleteUser(u.id);toast(`${u.nm} gelöscht`);load();}catch(e){toast(e.message,'error');}
  }
  const filtered=users.filter(u=>u.nm.toLowerCase().includes(search.toLowerCase())||u.username.toLowerCase().includes(search.toLowerCase()));
  const icons={admin:'🛡️',ober:'👑',eltern:'👨‍👩‍👧‍👦'};
  return (
    <div>
      <div style={{display:'flex',gap:12,marginBottom:16,alignItems:'center'}}>
        <input className="inp" placeholder="Suchen…" value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:260}}/>
        <button className="btn btn-primary" style={{marginLeft:'auto'}} onClick={openCreate}>+ Neuer Account</button>
      </div>
      {['admin','ober','eltern'].map(role=>{
        const grp=filtered.filter(u=>u.role===role); if(!grp.length)return null;
        return <div key={role} className="card" style={{marginBottom:12}}>
          <div className="card-head">{icons[role]} {RL[role]}s <span className="tag tag-gray" style={{marginLeft:8}}>{grp.length}</span></div>
          {grp.map(u=><div key={u.id} className="li">
            <Av user={u}/>
            <div style={{flex:1,minWidth:0}}><div className="li-title">{u.nm}</div><div className="li-sub">@{u.username}{u.fam&&fams[u.fam]?` · Familie ${fams[u.fam].name}`:''}{u.mustChangePw?' · ⚠ Muss PW ändern':''}</div></div>
            <div className="li-right"><span className={`tag ${RT[u.role]}`}>{RL[u.role]}</span><button className="btn btn-sm" onClick={()=>openEdit(u)}>Bearbeiten</button>{u.id!==me.id&&<button className="btn btn-danger btn-sm" onClick={()=>del(u)}>Löschen</button>}</div>
          </div>)}
        </div>;
      })}
      {modal&&<Modal title={modal==='new'?'Neuer Account':`${modal.nm} bearbeiten`} onClose={()=>setModal(null)}>
        <div className="fg"><label className="fl">Vollständiger Name *</label><input className="inp" placeholder="Maria Müller" value={f.nm} onChange={set('nm')} autoFocus={modal==='new'}/></div>
        <div className="inp-row">
          <div className="fg" style={{marginBottom:0}}><label className="fl">Benutzername *</label><input className="inp" placeholder="mmueller" value={f.username} onChange={set('username')} autoComplete="off"/></div>
          <div className="fg" style={{marginBottom:0}}><label className="fl">Rolle</label><select className="inp" value={f.role} onChange={set('role')}><option value="eltern">Elternteil</option><option value="ober">Obermini</option><option value="admin">Administrator</option></select></div>
        </div>
        <div className="fg" style={{marginTop:14}}>
          <label className="fl">{modal==='new'?'Start-Passwort *':'Neues Passwort'}<span style={{fontWeight:400,color:'var(--tx3)'}}>{modal==='new'?' (mind. 4 Zeichen)':' (leer = unverändert)'}</span></label>
          <input className="inp" type="password" placeholder={modal==='new'?'mind. 4 Zeichen':'Leer = keine Änderung'} value={f.password} onChange={set('password')} autoComplete="new-password"/>
          {modal==='new'&&<div className="fg-hint">⚠ Nutzer muss das Passwort beim ersten Login selbst ändern.</div>}
        </div>
        <div className="fg"><label className="fl">Familie zuweisen</label><select className="inp" value={f.famId} onChange={set('famId')}><option value="">Keine Familie</option>{Object.values(fams).map(fa=><option key={fa.id} value={fa.id}>{fa.name}</option>)}</select></div>
        <div className="fg"><label className="fl">Notizen <span style={{fontWeight:400,color:'var(--tx3)'}}>intern</span></label><input className="inp" placeholder="z.B. Kreuzträger, bevorzugt Sonntagsmesse" value={f.notes} onChange={set('notes')}/></div>
        {err&&<div className="notice notice-error">{err}</div>}
        <div className="modal-footer">
          {modal!=='new'&&modal.id!==me.id&&<button className="btn btn-danger" onClick={()=>{setModal(null);del(modal);}}>Löschen</button>}
          <button className="btn" onClick={()=>setModal(null)}>Abbrechen</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy?'…':'Speichern'}</button>
        </div>
      </Modal>}
    </div>
  );
}

// ── Familien ──────────────────────────────────────────────────────
function Familien() {
  const [fams,setFams]=useState({}); const [users,setUsers]=useState([]); const [modal,setModal]=useState(null);
  const [f,setF]=useState({name:'',kinder:[]}); const [nk,setNk]=useState(''); const [busy,setBusy]=useState(false);
  useEffect(()=>{load();},[]);
  async function load(){const[fa,u]=await Promise.all([api.getFamilien(),api.getUsers()]);setFams(fa);setUsers(u);}
  async function save(){
    if(!f.name.trim())return; setBusy(true);
    try{
      if(modal==='new'){const d=await api.createFamilie({name:f.name.trim(),kinder:f.kinder});setFams(p=>({...p,[d.id]:{id:d.id,name:f.name.trim(),kinder:f.kinder}}));}
      else{await api.updateFamilie(modal.id,{name:f.name.trim(),kinder:f.kinder});setFams(p=>({...p,[modal.id]:{...p[modal.id],name:f.name.trim(),kinder:f.kinder}}));}
      toast('Gespeichert','success');setModal(null);
    }catch(e){toast(e.message,'error');}finally{setBusy(false);}
  }
  async function del(id,name){
    if(!window.confirm(`Familie "${name}" löschen?`))return;
    try{await api.deleteFamilie(id);setFams(p=>{const n={...p};delete n[id];return n;});toast('Gelöscht');}catch(e){toast(e.message,'error');}
  }
  function addKind(){const v=nk.trim();if(v&&!f.kinder.includes(v)){setF(p=>({...p,kinder:[...p.kinder,v]}));setNk('');}}
  return (
    <div>
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:16}}>
        <button className="btn btn-primary" onClick={()=>{setF({name:'',kinder:[]});setModal('new');}}>+ Neue Familie</button>
      </div>
      {Object.keys(fams).length===0&&<div className="card" style={{textAlign:'center',padding:48,color:'var(--tx3)'}}><div style={{fontSize:44,marginBottom:14}}>👨‍👩‍👧‍👦</div><div style={{fontWeight:600,fontSize:15,marginBottom:8}}>Noch keine Familien angelegt</div><div style={{fontSize:13}}>Erstelle eine Familie und weise ihr die Kinder (Ministranten) zu.</div></div>}
      {Object.values(fams).map(fam=>{
        const eltern=users.filter(u=>u.fam===fam.id);
        return <div key={fam.id} className="card" style={{marginBottom:12}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
            <div><div style={{fontWeight:700,fontSize:16}}>Familie {fam.name}</div><div style={{fontSize:12,color:'var(--tx3)',marginTop:3}}>{(fam.kinder||[]).length} {(fam.kinder||[]).length===1?'Kind':'Kinder'} · {eltern.length} Eltern-Account{eltern.length!==1?'s':''}</div></div>
            <div style={{display:'flex',gap:8}}><button className="btn btn-sm" onClick={()=>{setF({name:fam.name,kinder:[...(fam.kinder||[])]});setModal(fam);}}>Bearbeiten</button><button className="btn btn-danger btn-sm" onClick={()=>del(fam.id,fam.name)}>Löschen</button></div>
          </div>
          {(fam.kinder||[]).length>0&&<div style={{marginBottom:14}}><div className="section-title" style={{marginTop:0}}>Kinder</div><div style={{display:'flex',flexWrap:'wrap',gap:8}}>{fam.kinder.map(k=><div key={k} className="chip">👦 {k}</div>)}</div></div>}
          {eltern.length>0&&<div><div className="section-title" style={{marginTop:(fam.kinder||[]).length?undefined:0}}>Eltern-Accounts</div>{eltern.map(u=><div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderTop:'1px solid var(--bd)'}}><Av user={u} size="sm"/><div><div style={{fontSize:13,fontWeight:500}}>{u.nm}</div><div style={{fontSize:11,color:'var(--tx3)'}}>@{u.username}</div></div>{u.mustChangePw&&<span className="tag tag-amber" style={{marginLeft:'auto'}}>⚠ Muss PW ändern</span>}</div>)}</div>}
        </div>;
      })}
      {modal&&<Modal title={modal==='new'?'Neue Familie':`Familie ${modal.name} bearbeiten`} onClose={()=>setModal(null)}>
        <div className="fg"><label className="fl">Familienname *</label><input className="inp" placeholder="z.B. Müller" value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))} autoFocus/></div>
        <div className="fg">
          <label className="fl">Kinder (Ministranten)</label>
          <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>{f.kinder.map(k=><div key={k} className="chip">{k}<button className="chip-rm" onClick={()=>setF(p=>({...p,kinder:p.kinder.filter(x=>x!==k)}))}>×</button></div>)}</div>
          <div style={{display:'flex',gap:8}}><input className="inp" placeholder="Vorname des Kindes" value={nk} onChange={e=>setNk(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),addKind())}/><button className="btn btn-sm" onClick={addKind}>+</button></div>
          <div className="fg-hint">Enter drücken oder auf + klicken</div>
        </div>
        <div className="modal-footer"><button className="btn" onClick={()=>setModal(null)}>Abbrechen</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy?'…':'Speichern'}</button></div>
      </Modal>}
    </div>
  );
}

// ── Messen ────────────────────────────────────────────────────────
const ARTEN=['Sonntagsmesse','Hochamt','Werktagsmesse','Trauung','Beerdigung','Firmung','Kommunion','Sondergottesdienst'];
function Messen() {
  const [messen,setMessen]=useState([]); const [modal,setModal]=useState(null); const [f,setF]=useState({art:'Sonntagsmesse',dt:'',t:'09:30',notes:''}); const [busy,setBusy]=useState(false);
  const now=todayStr(); const set=k=>e=>setF(p=>({...p,[k]:e.target.value}));
  useEffect(()=>{load();},[]);
  async function load(){const m=await api.getMessen();setMessen([...m].sort((a,b)=>a.dt.localeCompare(b.dt)));}
  async function save(){
    if(!f.dt||!f.t)return; setBusy(true);
    try{
      if(modal==='new'){const d=await api.createMesse(f);setMessen(m=>[...m,d.messe].sort((a,b)=>a.dt.localeCompare(b.dt)));}
      else{await api.updateMesse(modal.id,f);setMessen(m=>m.map(x=>x.id===modal.id?{...x,...f}:x));}
      toast('Gespeichert','success');setModal(null);
    }catch(e){toast(e.message,'error');}finally{setBusy(false);}
  }
  async function del(m){
    if(!window.confirm(`${m.art} am ${fmtD(m.dt)} löschen?`))return;
    try{await api.deleteMesse(m.id);setMessen(ms=>ms.filter(x=>x.id!==m.id));toast('Gelöscht');}catch(e){toast(e.message,'error');}
  }
  function Row({m}){const up=m.dt>=now; return <div className="li"><DateBadge dt={m.dt} upcoming={up}/><div style={{flex:1}}><div className="li-title">{m.art}</div><div className="li-sub">{m.t} Uhr · {(m.minis||[]).length} Ministranten{m.notes?` · ${m.notes}`:''}</div></div><div className="li-right"><button className="btn btn-sm" onClick={()=>{setF({art:m.art,dt:m.dt,t:m.t,notes:m.notes||''});setModal(m);}}>Bearbeiten</button><button className="btn btn-danger btn-sm" onClick={()=>del(m)}>Löschen</button></div></div>;}
  const upcoming=messen.filter(m=>m.dt>=now); const past=[...messen.filter(m=>m.dt<now)].reverse();
  return (
    <div>
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:16}}><button className="btn btn-primary" onClick={()=>{setF({art:'Sonntagsmesse',dt:'',t:'09:30',notes:''});setModal('new');}}>+ Gottesdienst planen</button></div>
      <div className="card" style={{marginBottom:12}}><div className="card-head">⛪ Bevorstehend <span className="tag tag-blue" style={{marginLeft:8}}>{upcoming.length}</span></div>{upcoming.length===0&&<div style={{color:'var(--tx3)',fontSize:13}}>Keine bevorstehenden Gottesdienste</div>}{upcoming.map(m=><Row key={m.id} m={m}/>)}</div>
      {past.length>0&&<div className="card"><div className="card-head">📁 Vergangene <span className="tag tag-gray" style={{marginLeft:8}}>{past.length}</span></div>{past.slice(0,12).map(m=><Row key={m.id} m={m}/>)}</div>}
      {modal&&<Modal title={modal==='new'?'Neuer Gottesdienst':'Gottesdienst bearbeiten'} onClose={()=>setModal(null)}>
        <div className="fg"><label className="fl">Art des Gottesdienstes</label><select className="inp" value={f.art} onChange={set('art')}>{ARTEN.map(a=><option key={a}>{a}</option>)}</select></div>
        <div className="inp-row"><div className="fg" style={{marginBottom:0}}><label className="fl">Datum</label><input className="inp" type="date" value={f.dt} onChange={set('dt')}/></div><div className="fg" style={{marginBottom:0}}><label className="fl">Uhrzeit</label><input className="inp" type="time" value={f.t} onChange={set('t')}/></div></div>
        <div className="fg" style={{marginTop:14}}><label className="fl">Notizen <span style={{fontWeight:400,color:'var(--tx3)'}}>optional</span></label><input className="inp" placeholder="z.B. Trachtenmesse, besonderer Anlass" value={f.notes} onChange={set('notes')}/></div>
        <div className="modal-footer"><button className="btn" onClick={()=>setModal(null)}>Abbrechen</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy?'…':'Speichern'}</button></div>
      </Modal>}
    </div>
  );
}

// ── Einteilung ────────────────────────────────────────────────────
function Einteilung() {
  const [messen,setMessen]=useState([]); const [users,setUsers]=useState([]); const [sel,setSel]=useState(null); const [sm,setSm]=useState([]); const [saving,setSaving]=useState(false);
  const now=todayStr();
  useEffect(()=>{Promise.all([api.getMessen(),api.getUsers()]).then(([m,u])=>{setMessen([...m].sort((a,b)=>a.dt.localeCompare(b.dt)));setUsers(u);}).catch(()=>{});},[]);
  function pick(m){setSel(m);setSm([...(m.minis||[])]);}
  function toggle(id){setSm(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);}
  function blocked(uid,dt){const u=users.find(x=>x.id===uid);return(u?.abm||[]).some(a=>dt>=a.von&&dt<=a.bis);}
  async function save(){
    setSaving(true);
    try{await api.updateMesse(sel.id,{...sel,minis:sm});setMessen(m=>m.map(x=>x.id===sel.id?{...x,minis:sm}:x));setSel(s=>({...s,minis:sm}));toast(`Einteilung für ${sel.art} gespeichert`,'success');}
    catch(e){toast(e.message,'error');}finally{setSaving(false);}
  }
  const allM=users.filter(u=>u.role==='eltern'||u.role==='ober');
  const upcoming=messen.filter(m=>m.dt>=now);
  return (
    <div className="g2" style={{alignItems:'flex-start'}}>
      <div className="card">
        <div className="card-head">⛪ Gottesdienst wählen</div>
        {upcoming.length===0&&<div style={{color:'var(--tx3)',fontSize:13}}>Keine bevorstehenden Gottesdienste</div>}
        {upcoming.map(m=><div key={m.id} className="li" style={{cursor:'pointer',borderRadius:8,margin:'0 -8px',padding:'11px 8px',background:sel?.id===m.id?'var(--ac2)':undefined}} onClick={()=>pick(m)}><DateBadge dt={m.dt} upcoming/><div style={{flex:1}}><div className="li-title">{m.art}</div><div className="li-sub">{fmtD(m.dt)} · {m.t} Uhr · {(m.minis||[]).length} eingeteilt</div></div></div>)}
      </div>
      <div className="card">
        {!sel?<div style={{textAlign:'center',padding:'48px 20px',color:'var(--tx3)'}}><div style={{fontSize:32,marginBottom:10}}>👈</div><div>Gottesdienst auswählen</div></div>:<>
          <div className="card-head">✏️ {sel.art} <span className="tag tag-blue" style={{marginLeft:8}}>{sm.length} ausgewählt</span></div>
          <div style={{marginBottom:14,fontSize:12,color:'var(--tx2)'}}>{fmtD(sel.dt)} · {sel.t} Uhr</div>
          {allM.length===0&&<div style={{color:'var(--tx3)',fontSize:13}}>Keine Accounts zum Einteilen</div>}
          {allM.map(u=>{const blk=blocked(u.id,sel.dt),chk=sm.includes(u.id); return <div key={u.id} className="li" onClick={()=>!blk&&toggle(u.id)} style={{cursor:blk?'not-allowed':'pointer',opacity:blk?.45:1,borderRadius:8,margin:'0 -8px',padding:'10px 8px',background:chk?'var(--ac2)':undefined}}>
            <div style={{width:18,height:18,border:`1.5px solid ${chk?'var(--ac)':'var(--bd2)'}`,borderRadius:4,background:chk?'var(--ac)':'var(--sur)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'#fff',fontSize:11,fontWeight:700}}>{chk?'✓':''}</div>
            <Av user={u} size="sm"/>
            <div style={{flex:1}}><div className="li-title">{u.nm}</div>{blk&&<div style={{fontSize:11,color:'var(--rd)'}}>⚠ Abgemeldet</div>}</div>
            <span className={`tag ${RT[u.role]}`}>{RL[u.role]}</span>
          </div>;})}
          <div style={{marginTop:18}}><button className="btn btn-primary btn-full" onClick={save} disabled={saving}>{saving?'Speichert…':'Einteilung speichern'}</button></div>
        </>}
      </div>
    </div>
  );
}

// ── Statistiken ───────────────────────────────────────────────────
function Statistiken() {
  const [users,setU]=useState([]); const [messen,setM]=useState([]);
  const now=todayStr();
  useEffect(()=>{Promise.all([api.getUsers(),api.getMessen()]).then(([u,m])=>{setU(u);setM(m);}).catch(()=>{});},[]);
  const minis=users.filter(u=>u.role==='eltern'||u.role==='ober');
  const maxE=Math.max(...minis.map(u=>(u.ein||[]).length),1);
  const avg=minis.length?(minis.reduce((s,u)=>s+(u.ein||[]).length,0)/minis.length).toFixed(1):0;
  const COLS=['#2563EB','#16A34A','#D97706','#7C3AED','#DC2626','#0891B2','#DB2777'];
  return (
    <div>
      <div className="stats">
        <div className="stat"><div className="stat-label">Gottesdienste gesamt</div><div className="stat-value">{messen.length}</div></div>
        <div className="stat"><div className="stat-label">Eltern-Accounts</div><div className="stat-value">{minis.length}</div></div>
        <div className="stat"><div className="stat-label">Ø Einsätze</div><div className="stat-value">{avg}</div><div className="stat-sub">pro Account</div></div>
        <div className="stat"><div className="stat-label">Kommende Dienste</div><div className="stat-value">{messen.filter(m=>m.dt>=now).length}</div></div>
      </div>
      <div className="card">
        <div className="card-head">📊 Einsätze — Fairness-Übersicht</div>
        {minis.length===0&&<div style={{color:'var(--tx3)',fontSize:13}}>Noch keine Einsätze erfasst</div>}
        {[...minis].sort((a,b)=>(b.ein||[]).length-(a.ein||[]).length).map((u,i)=><div key={u.id} className="fb-row"><div className="fb-name">{u.sh}</div><div className="fb-track"><div className="fb-fill" style={{width:`${((u.ein||[]).length/maxE)*100}%`,background:COLS[i%COLS.length]}}><span>{(u.ein||[]).length}</span></div></div></div>)}
      </div>
    </div>
  );
}

// ── Einstellungen ─────────────────────────────────────────────────
function Einstellungen() {
  const {cfg,updateCfg,changePw}=useAuth();
  const [form,setF]=useState({parish:cfg.parish||'',city:cfg.city||''}); const [pw,setPw]=useState({old:'',new:'',new2:''});
  const [cfgOk,setCfgOk]=useState(false); const [pwErr,setPwErr]=useState(''); const [pwOk,setPwOk]=useState(false);
  const setFk=k=>e=>setF(p=>({...p,[k]:e.target.value})); const setPwk=k=>e=>setPw(p=>({...p,[k]:e.target.value}));
  async function saveCfg(){try{await updateCfg({parish:form.parish.trim(),city:form.city.trim()});setCfgOk(true);setTimeout(()=>setCfgOk(false),2500);}catch(e){toast(e.message,'error');}}
  async function savePw(){
    setPwErr('');setPwOk(false);
    if(pw.new.length<8)return setPwErr('Mind. 8 Zeichen');
    if(pw.new!==pw.new2)return setPwErr('Passwörter stimmen nicht überein');
    try{await changePw(pw.old,pw.new);setPw({old:'',new:'',new2:''});setPwOk(true);setTimeout(()=>setPwOk(false),3000);toast('Passwort geändert','success');}catch(e){setPwErr(e.message);}
  }
  return (
    <div>
      <div className="card" style={{marginBottom:14}}>
        <div className="card-head">⛪ Pfarrei</div>
        <div className="inp-row">
          <div className="fg" style={{marginBottom:0}}><label className="fl">Pfarreiname</label><input className="inp" value={form.parish} onChange={setFk('parish')}/></div>
          <div className="fg" style={{marginBottom:0}}><label className="fl">Stadt / Ort</label><input className="inp" value={form.city} onChange={setFk('city')}/></div>
        </div>
        <button className="btn btn-primary" style={{marginTop:16}} onClick={saveCfg}>{cfgOk?'✓ Gespeichert':'Speichern'}</button>
      </div>
      <div className="card" style={{marginBottom:14}}>
        <div className="card-head">🔑 Passwort ändern</div>
        <div className="fg"><label className="fl">Aktuelles Passwort</label><input className="inp" type="password" value={pw.old} onChange={setPwk('old')} autoComplete="current-password"/></div>
        <div className="inp-row">
          <div className="fg" style={{marginBottom:0}}><label className="fl">Neues Passwort</label><input className="inp" type="password" value={pw.new} onChange={setPwk('new')} autoComplete="new-password"/></div>
          <div className="fg" style={{marginBottom:0}}><label className="fl">Wiederholen</label><input className="inp" type="password" value={pw.new2} onChange={setPwk('new2')} autoComplete="new-password"/></div>
        </div>
        {pwErr&&<div className="notice notice-error" style={{marginTop:10}}>{pwErr}</div>}
        {pwOk&&<div className="notice notice-ok" style={{marginTop:10}}>Passwort erfolgreich geändert!</div>}
        <button className="btn btn-primary" style={{marginTop:14}} onClick={savePw}>Passwort ändern</button>
      </div>
      <div className="card">
        <div className="card-head">💾 Daten-Backup</div>
        <p style={{fontSize:13,color:'var(--tx2)',marginBottom:16,lineHeight:1.6}}>Vollständige Sicherungskopie aller Daten als JSON-Datei. Empfohlen: regelmäßig sichern.</p>
        <a className="btn" href="/api/backup" download>💾 Backup herunterladen</a>
      </div>
    </div>
  );
}

// ── Page Map ──────────────────────────────────────────────────────
const PM={dashboard:Dashboard,kalender:Kalender,abmeldung:Abmeldung,anns:Anns,accounts:Accounts,familien:Familien,messen:Messen,einteilung:Einteilung,statistiken:Statistiken,einstellungen:Einstellungen};

// ── Root ──────────────────────────────────────────────────────────
function Root() {
  const {user}=useAuth();
  const [needed,setNeeded]=useState(null); const [splash,setSplash]=useState(false);
  useEffect(()=>{api.setupStatus().then(d=>setNeeded(d.needed)).catch(()=>setNeeded(false));},[]);
  if(!splash) return <Splash onDone={()=>setSplash(true)}/>;
  if(needed===null) return null;
  if(needed) return <Setup onDone={()=>setNeeded(false)}/>;
  if(!user) return <Login/>;
  if(user.mustChangePw) return <ChangePw/>;
  return <AppShell/>;
}

export default function App() {
  return <AuthProvider><Root/><ToastContainer/></AuthProvider>;
}
