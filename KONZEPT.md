# eLeDia Moodle Demo Platform — Konzept & Architektur

**Stand:** April 2026  
**Session:** Vollständig in einem Tag entwickelt mit Claude (claude.ai)

---

## 1. Ausgangssituation & Ziel

### Problem
eLeDia entwickelt Moodle-Plugins (LeitnerFlow, CohortBridge, GradingSnapshot u.a.).
Potenzielle Kunden müssen bisher die Plugins selbst installieren oder Screenshots anschauen —
eine echte Live-Demo war nicht möglich ohne manuellen Aufwand.

### Ziel
Eine **Self-Service Demo-Plattform** bei der Interessenten mit einem Klick (und E-Mail-Bestätigung)
eine vollständige, persönliche Moodle-Instanz mit dem Plugin ihrer Wahl starten können —
ohne Installation, ohne Account, mit echten Demo-Daten.

### Nebenziele
- Leads erfassen (E-Mail + Name)
- Missbrauch verhindern (E-Mail-Bestätigung)
- Persönlicher Login mit eigener E-Mail-Adresse
- Automatisches Cleanup nach 60 Minuten

---

## 2. Gesamtarchitektur

```
Internet
  │
  ▼
nginx (Hetzner VPS)
  ├── demo.eledia.ai          → Demo-Portal (statisches HTML)
  ├── demo.eledia.ai/api/*    → MCP Server (Port 3000)
  ├── demo.eledia.ai/confirm/:token  → Demo-Bestätigung
  └── {instanz-id}.demo.eledia.ai   → Moodle-Instanzen (Ports 8100–8199)
            │
            ▼
    MCP Server (Node.js, Port 3000)
    ├── HTTP Endpoints
    │   ├── GET  /health
    │   ├── GET  /configs          → Plugin-Karten für Portal
    │   ├── POST /request-demo     → E-Mail + Token erstellen
    │   ├── GET  /confirm/:token   → Demo starten
    │   └── POST /ping/:instanceId → Aktivitäts-Timer verlängern
    │
    ├── MCP Tools (11 Tools)
    │   ├── Instanz-Management (8)
    │   ├── Snapshot-Management (3)
    │   └── Config-Management (2)
    │
    └── Services
        ├── docker.ts     → moodlehq/moodle-docker orchestrieren
        ├── snapshot.ts   → pg_dump / pg_restore
        ├── nginx.ts      → per-Instanz nginx-Config
        ├── registry.ts   → Instanz-State (JSON)
        ├── tokens.ts     → Demo-Request-Tokens
        ├── email.ts      → Brevo SMTP
        ├── moodleUser.ts → Moodle-CLI Nutzer anlegen
        ├── cleanup.ts    → Auto-Stop nach 60 Min
        └── config.ts     → configs.json laden
```

---

## 3. Kernkomponenten

### 3.1 MCP Server (`src/index.ts`)

TypeScript-Server mit zwei Transportmodi:
- **HTTP** (Produktion): Express auf Port 3000, Streamable HTTP MCP Transport
- **stdio** (Lokal/Claude Desktop): direkt per stdin/stdout

**Besonderheit:** Der Server ist gleichzeitig ein MCP Server (für Claude-Steuerung)
UND ein regulärer HTTP-Server (für Portal und Demo-Flow). Beide laufen im gleichen Prozess.

### 3.2 Docker-Orchestrierung (`src/services/docker.ts`)

Nutzt **moodlehq/moodle-docker** als Basis — das offizielle Docker-Setup von Moodle HQ.
Kein eigenes Docker-Image nötig.

Für jede Instanz wird geklont:
- `moodle-docker` (moodlehq/moodle-docker) — das Compose-Framework
- `moodle` (moodle/moodle, shallow clone) — der Moodle-Core

**Key Decision:** Statt eigenem Image nutzen wir moodle-docker weil:
- Offizielle, gepflegte Basis
- Alle PHP-Versionen (8.1–8.4) bereits vorbereitet
- Behat + Selenium bereits integriert
- Multi-Instanz via `COMPOSE_PROJECT_NAME` + `MOODLE_DOCKER_WEB_PORT`

### 3.3 Snapshot-System (`src/services/snapshot.ts`)

**Das wichtigste Konzept:** Demo-Instanzen starten aus einem DB-Snapshot statt aus einer leeren Installation.

```
Einmalig (Entwickler):
  1. Moodle-Instanz starten
  2. Plugin installieren, Demo-Daten einrichten
  3. snapshot_create → pg_dump → /opt/snapshots/leitnerflow-v1.sql.gz

Jeder Kunden-Klick:
  → pg_restore aus leitnerflow-v1.sql.gz (~5 Sek statt 60 Sek)
  → URL + Kunden-Nutzerdaten anpassen
  → fertig
```

Snapshots werden als `.sql.gz` + `.json` (Metadata) gespeichert:
```
/opt/snapshots/
  leitnerflow-v1.sql.gz    # ~5-20 MB, komprimiert
  leitnerflow-v1.json      # Metadata (Moodle-Version, Plugins, etc.)
```

### 3.4 Konfigurations-System (`configs.json`)

**Single Source of Truth** für alle Plugin-Karten im Portal.

```json
{
  "id": "leitnerflow",
  "name": "LeitnerFlow",
  "plugin": {
    "srcPath": "/opt/plugins/mod_eledialeitnerflow",
    "type": "mod",
    "name": "eledialeitnerflow"
  },
  "snapshotId": "leitnerflow-v1",
  "moodleVersion": "5.0",
  "visible": true
}
```

Neues Plugin hinzufügen = 3 Schritte:
1. Plugin nach `/opt/plugins/` deployen
2. Snapshot erstellen (einmalig)
3. Eintrag in `configs.json` — Karte erscheint sofort im Portal

### 3.5 Demo-Request-Flow (`src/services/tokens.ts` + `email.ts`)

```
POST /request-demo
  → Token generieren (32 Zeichen, URL-safe, 24h gültig)
  → Token in /opt/runbot/tokens.json speichern
  → Bestätigungs-E-Mail via Brevo SMTP

GET /confirm/:token
  → Token validieren
  → Loading-Page sofort anzeigen (HTML)
  → Im Hintergrund: Demo starten (async)
  → Moodle-Nutzer mit Kunden-E-Mail + Name anlegen
  → nginx-Config schreiben
  → "Demo bereit"-E-Mail senden
```

**Key Decision:** Loading-Page sofort senden, Demo asynchron starten.
Browser wartet nicht auf die ~60 Sekunden Demo-Startzeit.

### 3.6 nginx-Management (`src/services/nginx.ts`)

Für jede laufende Instanz schreibt der MCP Server:
```
/etc/nginx/conf.d/demo-pr42-abc123.conf
```
mit `proxy_pass http://127.0.0.1:8142`.
Danach `systemctl reload nginx` → Subdomain sofort erreichbar.

**Key Decision:** Separate Config-Dateien statt Map-File, weil:
- Einfacher zu debuggen
- Kein nginx-Variable-Trick (`set $upstream`) nötig
- Atomares reload: alte Instanz verschwindet, neue erscheint

### 3.7 Auto-Cleanup (`src/services/cleanup.ts`)

Läuft alle 60 Sekunden, stoppt Instanzen wenn:
- **Maximale Laufzeit** überschritten (Standard: 60 Min)
- **Inaktivität** seit X Minuten (Standard: 15 Min, nur wenn `lastActivity` nicht aktualisiert)

Cleanup-Sequenz: `nginx.unregisterInstance` → `docker down -v` → `rm -rf` → Registry-Eintrag löschen.

---

## 4. MCP Tools (vollständige Liste)

| Tool | Beschreibung | Typ |
|------|-------------|-----|
| `instance_start` | Neue Demo-Instanz starten (mit opt. Snapshot) | Schreiben |
| `instance_stop` | Instanz stoppen + löschen | Schreiben |
| `instance_status` | Status + Test-Runs einer Instanz | Lesen |
| `instance_list` | Alle Instanzen auflisten | Lesen |
| `instance_logs` | Container-Logs abrufen | Lesen |
| `instance_run_tests` | PHPUnit oder Behat ausführen | Schreiben |
| `instance_extend` | Demo um 30 Min verlängern (max. 2x) | Schreiben |
| `instance_time_remaining` | Verbleibende Zeit + Verlängerungs-Status | Lesen |
| `snapshot_create` | DB-Snapshot einer laufenden Instanz | Schreiben |
| `snapshot_list` | Alle verfügbaren Snapshots | Lesen |
| `snapshot_delete` | Snapshot löschen | Schreiben |
| `config_list` | Alle Plugin-Konfigurationen | Lesen |
| `config_get` | Einzelne Config + instance_start-Args | Lesen |

---

## 5. Datei-Struktur

```
moodle-runbot-mcp/
├── configs.json              ← Plugin-Karten (einzige Konfig-Datei)
├── package.json
├── tsconfig.json
├── setup.sh                  ← Hetzner VPS Setup (einmal ausführen)
├── README.md
│
├── src/
│   ├── index.ts              ← Einstiegspunkt: MCP + HTTP Server
│   ├── types.ts              ← TypeScript-Typen
│   │
│   ├── services/
│   │   ├── docker.ts         ← moodle-docker Orchestrierung
│   │   ├── snapshot.ts       ← pg_dump / pg_restore
│   │   ├── nginx.ts          ← per-Instanz nginx-Config
│   │   ├── registry.ts       ← Instanz-State (JSON-File)
│   │   ├── tokens.ts         ← Demo-Request-Tokens
│   │   ├── email.ts          ← Brevo SMTP (Bestätigung + "Demo bereit")
│   │   ├── moodleUser.ts     ← Moodle-CLI: Nutzer anlegen
│   │   ├── cleanup.ts        ← Auto-Stop-Scheduler
│   │   └── config.ts         ← configs.json laden
│   │
│   └── tools/
│       ├── instances.ts      ← 8 Instanz-Tools
│       ├── snapshots.ts      ← 3 Snapshot-Tools
│       └── configs.ts        ← 2 Config-Tools
│
└── webui/
    ├── demo-portal.html      ← Kunden-Portal (Marketing, Single-Page)
    └── index.html            ← Admin-Dashboard (intern)
```

### Laufzeit-Dateien auf dem Server

```
/opt/runbot/
  registry.json              ← Laufende Instanzen
  tokens.json                ← Demo-Anfragen + Token-Status
  nginx-ports.map            ← (Legacy, nicht mehr aktiv genutzt)

/opt/snapshots/
  leitnerflow-v1.sql.gz
  leitnerflow-v1.json
  cohortbridge-v1.sql.gz
  ...

/opt/plugins/
  mod_eledialeitnerflow/
  local_cohortbridge/
  ...

/etc/nginx/conf.d/
  demo-{instanz-id}.conf     ← Auto-generiert, auto-gelöscht
```

---

## 6. Technologie-Entscheidungen

| Entscheidung | Gewählt | Warum nicht X? |
|---|---|---|
| MCP Server Sprache | TypeScript | Besseres SDK, statische Typen |
| MCP Transport | Streamable HTTP | Remote-Zugriff, skalierbar |
| Docker-Basis | moodlehq/moodle-docker | Offiziell, kein eigenes Image |
| DB-Snapshots | pg_dump/pg_restore | Einfach, bewährt, kein Extra-Tool |
| SMTP | Brevo | Bereits bei eLeDia, Marketing-Integration |
| nginx-Routing | Per-Instance .conf Dateien | Einfacher als Map-File oder Lua |
| State | JSON-Files | Kein DB-Server nötig, einfach zu debuggen |
| Hoster | Hetzner Cloud | Günstig, EU, gute API, stündliche Abrechnung |
| Abrechnungsmodell | CX32 (~14€/Mo) | Reicht für 2-3 parallele Instanzen |

---

## 7. Demo-Kunden-Flow (vollständig)

```
1. Kunde besucht demo.eledia.ai
   → Portal lädt Karten aus GET /configs

2. Kunde klickt "Demo starten" bei LeitnerFlow

3. Modal: E-Mail + Name eingeben

4. POST /request-demo
   → Token generiert: "abc123xyz..."
   → tokens.json: { token, email, configId, status: "pending" }
   → Bestätigungs-E-Mail via Brevo SMTP

5. Kunde empfängt E-Mail von "Johannes von eLeDia.ai"
   → Betreff: "Ihre LeitnerFlow Demo — Link zum Starten"
   → Button: "Demo jetzt starten →"
   → Link: https://demo.eledia.ai/confirm/abc123xyz...

6. GET /confirm/abc123xyz...
   → Token validieren + auf "confirmed" setzen
   → Loading-HTML sofort senden (Schritte-Animation)
   → Async im Hintergrund:
     a. Port aus Pool (8100–8199) reservieren
     b. instance_id: "demo-leitnerflow-f3a9bc"
     c. git clone moodle-docker + moodle core
     d. Plugin nach /moodle/mod/eledialeitnerflow/ kopieren
     e. docker compose up -d
     f. pg_restore aus leitnerflow-v1.sql.gz
     g. wwwroot + dataroot in Moodle anpassen
     h. Moodle-Nutzer anlegen: email=kunde@firma.de, pw=demo1234
     i. Kurs-Einschreibung ("demo"-Kurs)
     j. /etc/nginx/conf.d/demo-leitnerflow-f3a9bc.conf schreiben
     k. systemctl reload nginx
     l. tokens.json: { status: "started", instanceId: "..." }
     m. "Demo bereit"-E-Mail senden

7. Kunde empfängt zweite E-Mail
   → Link zu demo-leitnerflow-f3a9bc.demo.eledia.ai
   → Login: ihre@email.de / demo1234

8. Kunde nutzt Demo (60 Minuten)
   → Jede Anfrage an die Subdomain: POST /ping/:instanceId
   → lastActivity wird aktualisiert

9. Nach 60 Min (oder 15 Min Inaktivität):
   → cleanup.ts greift: nginx.conf löschen → docker down -v → rm -rf
   → Registry-Eintrag gelöscht
```

---

## 8. Was noch fehlt (offene Punkte)

### Sofort umsetzbar

- [ ] **Plugin-Repos automatisch klonen** (`setup.sh` erweitern mit `git clone` für alle Plugins)
- [ ] **Snapshots erstellen** — erster manueller Schritt nach Server-Setup
- [ ] **`/confirm/:token` Redirect nach Demo-Start** — aktuell nur Loading-Page, kein automatischer Redirect wenn Demo fertig
- [ ] **SMTP_PASS eintragen** in `/etc/moodle-runbot.env`

### Mittelfristig

- [ ] **Leads-Export** — tokens.json → CSV für Vertrieb
- [ ] **Admin-Dashboard** — `webui/index.html` mit echten Daten verbinden
- [ ] **GitHub Webhook** — bei PR automatisch CI-Instanz starten
- [ ] **Verlängerungs-Button im Portal** — `instance_extend` Tool nutzen
- [ ] **Countdown-Timer** — `instance_time_remaining` ins Portal einbauen
- [ ] **E-Mail Follow-up** — nach Demo-Ende: "Haben Sie Fragen?" über Brevo

### Längerfristig

- [ ] **Wildcard SSL-Zertifikat** für `*.demo.eledia.ai` (certbot + DNS-Challenge)
- [ ] **Warm Pool** — 2-3 Instanzen vorgestartet für sofortigen Start
- [ ] **Plugin-Detailseiten** — wie project52.eledia.ai/plugins/cohort-bridge/
- [ ] **Mehrsprachigkeit** — Portal auf Englisch

---

## 9. Setup-Anleitung (Hetzner VPS)

### Voraussetzungen
- Hetzner-Account
- Domain mit DNS-Zugriff (z.B. `demo.eledia.ai`)
- Brevo-Account mit SMTP-Schlüssel

### Schritt 1: VPS bestellen
```
Hetzner Cloud → Server erstellen
  Typ: CX32 (4 vCPU, 8 GB RAM, ~14€/Mo)
  OS: Ubuntu 24.04
  SSH-Key hinzufügen
```

### Schritt 2: DNS konfigurieren
```
demo.eledia.ai        A    → VPS-IP
*.demo.eledia.ai      A    → VPS-IP
```

### Schritt 3: Setup ausführen
```bash
# Dateien auf den Server kopieren
scp -r moodle-runbot-mcp/ root@VPS-IP:/opt/

# Setup ausführen
ssh root@VPS-IP
cd /opt/moodle-runbot-mcp
DOMAIN=demo.eledia.ai bash setup.sh
```

### Schritt 4: Brevo SMTP-Schlüssel eintragen
```bash
nano /etc/moodle-runbot.env
# SMTP_PASS=HIER_BREVO_SMTP_SCHLUESSEL_EINTRAGEN
systemctl restart moodle-runbot
```

### Schritt 5: SSL-Zertifikat
```bash
certbot --nginx -d demo.eledia.ai
# Wildcard (für Subdomains):
certbot certonly --manual --preferred-challenges dns -d '*.demo.eledia.ai'
```

### Schritt 6: Plugins deployen
```bash
mkdir -p /opt/plugins
git clone https://github.com/eledia/mod_eledialeitnerflow /opt/plugins/mod_eledialeitnerflow
# ... weitere Plugins
```

### Schritt 7: Ersten Snapshot erstellen
```
# Via Claude (MCP-Tool) oder manuell:
1. instance_start({ configId: "leitnerflow", snapshotId: undefined })
2. Einloggen, Demo-Daten einrichten
3. snapshot_create({ instanceId: "...", snapshotId: "leitnerflow-v1", ... })
4. instance_stop(...)
```

### Schritt 8: Portal deployen
```bash
cp webui/demo-portal.html /opt/moodle-runbot-mcp/webui/
# nginx zeigt bereits auf /opt/moodle-runbot-mcp/webui/
```

---

## 10. Entwicklungs-Workflow

### Lokal starten
```bash
cd moodle-runbot-mcp
npm install
npm run build

# HTTP-Modus (für Portal-Entwicklung)
TRANSPORT=http PORT=3000 RUNBOT_WORK_DIR=/tmp/runbot-test \
  BASE_DOMAIN="" NODE_ENV=development \
  node dist/index.js

# Portal öffnen
open webui/demo-portal.html
```

### Nach Code-Änderungen
```bash
npm run build
systemctl restart moodle-runbot   # auf dem Server
```

### Logs
```bash
journalctl -u moodle-runbot -f    # Live-Logs
journalctl -u moodle-runbot -n 50 # Letzte 50 Zeilen
```

### MCP Inspector (Tool-Testing)
```bash
npx @modelcontextprotocol/inspector http://localhost:3000/mcp
```

---

## 11. Umgebungsvariablen (vollständig)

| Variable | Standard | Beschreibung |
|---|---|---|
| `TRANSPORT` | `stdio` | `http` für Produktion |
| `PORT` | `3000` | MCP Server Port |
| `RUNBOT_WORK_DIR` | `/opt/runbot` | Basis-Verzeichnis für Instanzen |
| `PORT_START` | `8100` | Erster Moodle-Port |
| `PORT_END` | `8199` | Letzter Moodle-Port (max. 100 Instanzen) |
| `BASE_DOMAIN` | `` | z.B. `demo.eledia.ai` |
| `BASE_URL` | `https://demo.eledia.ai` | Für E-Mail-Links |
| `SNAPSHOT_DIR` | `/opt/snapshots` | Snapshot-Speicherort |
| `CONFIGS_FILE` | `../../configs.json` | Pfad zur Plugin-Konfig |
| `DEMO_MAX_AGE_MINUTES` | `60` | Demo-Laufzeit |
| `DEMO_INACTIVITY_MINUTES` | `15` | Inaktivitäts-Timeout |
| `MAX_EXTENSIONS` | `2` | Max. Verlängerungen |
| `EXTEND_MINUTES` | `30` | Minuten pro Verlängerung |
| `CORS_ORIGINS` | `*` | Erlaubte Origins |
| `SMTP_HOST` | `smtp-relay.brevo.com` | Brevo SMTP Host |
| `SMTP_PORT` | `587` | SMTP Port (STARTTLS) |
| `SMTP_USER` | `johannes.moskaliuk@eledia.ai` | Brevo Login |
| `SMTP_PASS` | `` | Brevo SMTP-Schlüssel |
| `FROM_EMAIL` | `johannes.moskaliuk@eledia.ai` | Absender-E-Mail |
| `FROM_NAME` | `Johannes von eLeDia.ai` | Absender-Name |
| `TOKEN_TTL_HOURS` | `24` | Token-Gültigkeit |
| `NODE_ENV` | `production` | `development` = Token in Response |
| `NGINX_CONF_DIR` | `/etc/nginx/conf.d` | nginx-Config-Verzeichnis |

---

*Dokumentation erstellt: April 2026*  
*Entwickelt mit: Claude Sonnet (claude.ai)*
