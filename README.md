# Ministranten — Deployment auf Render.com

## Voraussetzungen
- GitHub Account
- Render.com Account (kostenlos)

---

## 1. GitHub Repository erstellen

1. Gehe zu **github.com** → "New repository"
2. Name: `ministranten` → **Private** → "Create"
3. Lade alle Dateien hoch (diesen ganzen Ordner)

**Ordnerstruktur muss so aussehen:**
```
ministranten/
├── package.json
├── render.yaml
├── server/
│   ├── package.json
│   └── index.js
└── client/
    ├── package.json
    ├── public/
    │   └── index.html
    └── src/
        ├── index.js
        ├── index.css
        ├── App.jsx
        └── api.js
```

---

## 2. Render.com deployen

1. Gehe zu **render.com** → "New +" → **"Web Service"**
2. "Connect a repository" → dein GitHub Repo auswählen
3. Einstellungen:
   - **Name:** ministranten
   - **Build Command:** `npm run install && npm run build`
   - **Start Command:** `npm start`
   - **Instance Type:** Free

4. Unter **"Environment Variables"** hinzufügen:
   - `JWT_SECRET` → einen langen zufälligen Text (z.B. 32+ Zeichen)
   - `NODE_ENV` → `production`

5. Unter **"Disks"** → "Add Disk":
   - **Name:** db
   - **Mount Path:** `/data`
   - **Size:** 1 GB

6. → **"Create Web Service"**

Render baut die App automatisch und gibt dir eine URL wie:
`https://ministranten.onrender.com`

---

## 3. Erste Einrichtung

Beim ersten Öffnen der URL erscheint automatisch der **Einrichtungs-Assistent**:
- Pfarreiname eingeben
- Admin-Benutzernamen und Passwort (mind. 8 Zeichen) vergeben
- → "Einrichtung abschließen"

---

## 4. Accounts erstellen

Neue Accounts werden **nur vom Admin erstellt** — keine Selbstregistrierung.

**Admin → Accounts → "Neuer Account":**
- Name, Benutzername, Rolle und Start-Passwort eingeben
- Beim ersten Login muss der Nutzer sein Passwort selbst ändern

---

## Lokal testen

```bash
# Backend starten
cd server && npm install && node index.js

# Frontend starten (neues Terminal)
cd client && npm install && npm start
```

Frontend: http://localhost:3000  
Backend:  http://localhost:3001

---

## Wichtige Hinweise

- **Kostenloser Render-Plan:** App "schläft" nach 15 Min Inaktivität → erster Aufruf dauert ~30 Sek
- **Datenbank:** Liegt als `db.json` im Render-Disk (`/data/db.json`)
- **Backup:** Admin → Einstellungen → "Backup herunterladen"
- **Passwörter:** PBKDF2 mit 100.000 Iterationen — sicher gespeichert
