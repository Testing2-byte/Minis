function getToken() { return localStorage.getItem('token') || ''; }

async function request(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {})
    },
    body: body != null ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({ error: 'Ungültige Server-Antwort' }));
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
  return data;
}

export const api = {
  // Setup & Auth
  setupStatus:   ()        => request('GET',    '/setup-status'),
  setup:         b         => request('POST',   '/setup', b),
  login:         b         => request('POST',   '/login', b),
  changePw:      b         => request('POST',   '/change-password', b),

  // Config
  getCfg:        ()        => request('GET',    '/cfg'),
  updateCfg:     b         => request('PUT',    '/cfg', b),

  // Users
  getUsers:      ()        => request('GET',    '/users'),
  createUser:    b         => request('POST',   '/users', b),
  updateUser:    (id, b)   => request('PUT',    '/users/' + id, b),
  deleteUser:    id        => request('DELETE', '/users/' + id),

  // Familien
  getFamilien:   ()        => request('GET',    '/familien'),
  createFamilie: b         => request('POST',   '/familien', b),
  updateFamilie: (id, b)   => request('PUT',    '/familien/' + id, b),
  deleteFamilie: id        => request('DELETE', '/familien/' + id),

  // Messen
  getMessen:     ()        => request('GET',    '/messen'),
  createMesse:   b         => request('POST',   '/messen', b),
  updateMesse:   (id, b)   => request('PUT',    '/messen/' + id, b),
  deleteMesse:   id        => request('DELETE', '/messen/' + id),

  // Abmeldungen
  addAbm:        b         => request('POST',   '/abmeldung', b),
  delAbm:        id        => request('DELETE', '/abmeldung/' + id),

  // Ankündigungen
  getAnns:       ()        => request('GET',    '/anns'),
  createAnn:     b         => request('POST',   '/anns', b),
  deleteAnn:     id        => request('DELETE', '/anns/' + id),
};
