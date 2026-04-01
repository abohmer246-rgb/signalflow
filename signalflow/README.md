# ⚡ SIGNALFLOW — Live Stock News Filter

Ein Echtzeit-News-Dashboard für Aktien-Trader.

---

## 🚀 In 5 Minuten online stellen

### Was du brauchst:
- Einen **GitHub**-Account → github.com (kostenlos)
- Einen **Vercel**-Account → vercel.com (kostenlos)
- **Node.js** installiert → nodejs.org (LTS Version runterladen)

---

### Schritt 1: Node.js installieren
Gehe auf https://nodejs.org und lade die **LTS-Version** runter. Installiere es ganz normal (alles auf "Weiter" klicken).

### Schritt 2: Projekt lokal testen
Öffne ein Terminal/Eingabeaufforderung im Projektordner und tippe:

```bash
npm install
npm run dev
```

Öffne dann http://localhost:5173 im Browser — du siehst dein Dashboard!

### Schritt 3: GitHub Repository erstellen
1. Gehe auf https://github.com/new
2. Name: `signalflow` (oder was du willst)
3. Klicke "Create repository"
4. Im Terminal:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/DEIN-USERNAME/signalflow.git
git push -u origin main
```

### Schritt 4: Auf Vercel deployen
1. Gehe auf https://vercel.com und logge dich mit GitHub ein
2. Klicke "Add New" → "Project"
3. Wähle dein `signalflow` Repository aus
4. Klicke "Deploy" — FERTIG!
5. Du bekommst eine URL wie `signalflow-abc123.vercel.app`

---

## 🔑 API Keys einrichten (für echte Live-News)

Die App läuft erstmal mit Demo-Daten. Für echte News brauchst du API Keys:

| Quelle | Kosten | Registrierung |
|--------|--------|---------------|
| Finnhub | Kostenlos (60 req/min) | https://finnhub.io/register |
| NewsAPI | Kostenlos (100 req/Tag) | https://newsapi.org/register |
| Alpha Vantage | Kostenlos (25 req/Tag) | https://www.alphavantage.co/support/#api-key |
| X/Twitter API | $100/Monat | https://developer.x.com |

Trage die Keys in Vercel unter **Settings → Environment Variables** ein:
- `VITE_FINNHUB_KEY` = dein Finnhub Key
- `VITE_NEWSAPI_KEY` = dein NewsAPI Key

---

## 📁 Projektstruktur

```
signalflow/
├── index.html          ← Hauptseite
├── package.json        ← Abhängigkeiten
├── vite.config.js      ← Build-Konfiguration
├── .gitignore          ← Dateien die nicht auf GitHub sollen
├── README.md           ← Diese Datei
└── src/
    ├── main.jsx        ← Einstiegspunkt
    └── App.jsx         ← Das komplette Dashboard
```
