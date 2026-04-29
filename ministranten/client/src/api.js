const BASE = '';

function tok() { return localStorage.getItem('token') || ''; }

async function req(method, url, body) {
  const r = await fetch(BASE + '/api' + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(tok() ? { Authorization: 'Bearer ' + tok() } : {})
    },
    body: body != null ? JSON.stringify(body) : undefined
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Serverfehler');
  return d;
}

export const api = {
  setupStatus:   ()        => req('GET',  '/setup-status'),
  setup:         b         => req('POST', '/setup', b),
  login:         b         => req('POST', '/login', b),
  changePw:      b         => req('POST', '/change-password', b),
  getCfg:        ()        => req('GET',  '/cfg'),
  updateCfg:     b         => req('PUT',  '/cfg', b),
  getUsers:      ()        => req('GET',  '/users'),
  createUser:    b         => req('POST', '/users', b),
  updateUser:    (id, b)   => req('PUT',  '/users/' + id, b),
  deleteUser:    id        => req('DELETE','/users/' + id),
  getFamilien:   ()        => req('GET',  '/familien'),
  createFamilie: b         => req('POST', '/familien', b),
  updateFamilie: (id, b)   => req('PUT',  '/familien/' + id, b),
  deleteFamilie: id        => req('DELETE','/familien/' + id),
  getMessen:     ()        => req('GET',  '/messen'),
  createMesse:   b         => req('POST', '/messen', b),
  updateMesse:   (id, b)   => req('PUT',  '/messen/' + id, b),
  deleteMesse:   id        => req('DELETE','/messen/' + id),
  addAbm:        b         => req('POST', '/abmeldung', b),
  delAbm:        id        => req('DELETE','/abmeldung/' + id),
  getAnns:       ()        => req('GET',  '/anns'),
  createAnn:     b         => req('POST', '/anns', b),
  deleteAnn:     id        => req('DELETE','/anns/' + id),
};
