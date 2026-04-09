# Developer Documentation

## Meta

Dieses Dokument beschreibt die tatsächliche Implementierung.
**Source of Truth für technische Realität** — nicht beabsichtigtes Verhalten (→ `01-features.md`).

---

# System Overview

## Architecture

```
Internet
    ↓ HTTPS (*.demo.eledia.ai)
nginx (Port 443/80)
    ↓ Proxy http://127.0.0.1:{port}
moodle-runbot-mcp (Node.js, Port 3000)
    ├── HTTP API (Express)          ← Demo-Flow, Configs, Pings
    ├── MCP Endpoint (/mcp)         ← KI/CI-Tools
    └── Docker-Compose (per Instanz)
            └── Moodle Webserver + DB
```

**Transport-Modi:**
- `TRANSPORT=http` (Standard für Production): Express-Server auf Port 3000
- `TRANSPORT=stdio`: MCP via stdin/stdout (für direkte KI-Integration)

## Core Components

| Datei | Zweck |
|-------|-------|
| `src/index.ts` | Server-Setup, HTTP-Routen, Demo-Flow-Orchestrierung |
| `src/services/docker.ts` | Moodle-Docker Lifecycle (provision, install, start, stop) |
| `src/services/nginx.ts` | nginx-Config schreiben/löschen, nginx reload |
| `src/services/config.ts` | Plugin-Konfigurationen laden |
| `src/services/tokens.ts` | Demo-Request-Tokens (create, confirm, markStarted) |
| `src/services/email.ts` | E-Mails senden (Bestätigung, Demo-bereit) |
| `src/services/snapshot.ts` | Snapshot-Verwaltung (list, create, restore, delete) |
| `src/services/registry.ts` | Instanz-Registry (speichern, laden, Port-Vergabe) |
| `src/services/cleanup.ts` | Inaktivitäts-Cleanup-Scheduler |
| `src/services/moodleUser.ts` | Demo-Nutzer anlegen, in Kurs einschreiben |
| `src/tools/instances.ts` | MCP-Tools für Instanzen |
| `src/tools/snapshots.ts` | MCP-Tools für Snapshots |
| `src/tools/configs.ts` | MCP-Tools für Configs |
| `src/types.ts` | TypeScript-Typen |

## Key Data Types (`src/types.ts`)

```typescript
MoodleInstance  → laufende Instanz (id, port, urls, dirs, status, timestamps)
DemoRequest     → Token-basierte Anfrage (token, email, name, configId, status)
TestRun         → PHPUnit/Behat-Testlauf (instanceId, type, status, output)
RunbotConfig    → Server-Konfiguration
```

## Environment Variables

| Variable | Zweck | Default |
|----------|-------|---------|
| `TRANSPORT` | `http` oder `stdio` | `stdio` |
| `PORT` | HTTP-Port des Servers | `3000` |
| `BASE_DOMAIN` | Domain für Subdomains | `""` (localhost-Modus) |
| `BASE_URL` | URL des Demo-Portals | `/` |
| `RUNBOT_WORK_DIR` | Basis-Verzeichnis für Instanzen | `/opt/runbot` |
| `PORT_START` / `PORT_END` | Port-Bereich für Instanzen | `8100` / `8199` |
| `NGINX_CONF_DIR` | nginx-Config-Verzeichnis | `/etc/nginx/conf.d` |
| `SSL_CERT_DIR` | TLS-Zertifikats-Verzeichnis | `/etc/letsencrypt/live/${BASE_DOMAIN}` |
| `NODE_ENV` | `development` gibt Token im Response zurück | — |
| `CORS_ORIGINS` | Comma-separierte erlaubte Origins | `*` |

---

# Feature Implementation

---

## feat01 — Self-Service Demo-Anfrage-Flow

**Overview**
Zwei HTTP-Endpoints in `src/index.ts` orchestrieren den vollständigen Flow.

**Endpoints**

`POST /request-demo`
- Input: `{ email, name, configId }`
- Validiert E-Mail (Regex) + Config-Existenz
- Ruft `tokens.createRequest()` → speichert DemoRequest mit zufälligem Token (32 Byte hex)
- Sendet Bestätigungs-E-Mail via `email.sendConfirmationEmail()`
- Response: `{ ok: true }` (Token nur bei `NODE_ENV=development`)

`GET /confirm/:token`
- Validiert Token via `tokens.confirmRequest()`
- Falls abgelaufen/ungültig: HTML-Fehlerseite
- Falls Instanz läuft: direkter `res.redirect(inst.url)`
- Sonst: sendet Loading-HTML sofort (`res.send()`), startet Demo via `setImmediate()` im Hintergrund
- Loading-Page: 5 Schritte mit 10s-Interval-Animation (rein visuell, kein Polling)

**Background Demo-Start (`setImmediate`)**
1. `id` generieren: `demo-{configId}-{3 random hex bytes}`
2. Port allozieren: `registry.allocatePort()`
3. `MoodleInstance`-Objekt bauen, in Registry speichern
4. `docker.provisionInstance()` → clone moodle-docker + moodle, config.php patchen
5. `docker.installPlugin()` falls Config ein Plugin hat
6. `snapshotSvc.getSnapshot()` falls `snapshotId` in Config
7. `docker.startContainers()` → compose up, DB anlegen oder Snapshot restaurieren
8. `moodleUser.createDemoUser()` + `enrollUserInDemoCourse()`
9. `instance.status = "running"`, in Registry speichern
10. `nginxSvc.registerInstance()` → nginx-Config + reload
11. `tokens.markStarted()` → Token-Status auf "started" setzen
12. `email.sendDemoReadyEmail()` → Benachrichtigung an Interessenten

**Constraints**
- Silent Fail bei Demo-Start-Fehler (kein Fehler-Feedback an Nutzer — TODO: Fehler-E-Mail)

---

## feat02 — Moodle-Instanz-Verwaltung (`src/services/docker.ts`)

**provisionInstance()**
1. `mkdir instanceDir`
2. `git clone --depth 1 moodle-docker` (falls nicht vorhanden)
3. `git clone --depth 1 -b {branch} moodle` (falls nicht vorhanden)
4. `cp config.docker-template.php config.php`
5. `removePortBlock()`: liest config.php, entfernt Port-Block via Brace-Counter
6. Setzt `$CFG->wwwroot` auf `https://{id}.{BASE_DOMAIN}` oder `http://localhost:{port}`
7. Schreibt config.php zurück

**removePortBlock()**
- Findet Zeile `$port = getenv('MOODLE_DOCKER_WEB_PORT');`
- Zählt `{` und `}` zeilenweise bis `depth <= 0` nach dem Start
- Entfernt auch optionale Leerzeile davor
- Kein Regex — Brace-Counter wegen verschachteltem `if` im Block

**startContainers()**
- `compose up -d`
- `wait_for_db.php`
- Falls kein Snapshot: `install_database.php --agree-license ...`
- Falls Snapshot: DB-Import in `snapshot.ts`

**Branch-Mapping** (`MOODLE_BRANCH_MAP`)
```
"4.3" → MOODLE_403_STABLE
"4.4" → MOODLE_404_STABLE
"4.5" → MOODLE_405_STABLE
"5.0" → MOODLE_500_STABLE
"5.1" → main
```

---

## feat03 — nginx Reverse Proxy (`src/services/nginx.ts`)

**registerInstance(instanceId, port)**
- Baut nginx-Config-String (Template-Literal)
- HTTP-Block: `return 301 https://$host$request_uri`
- HTTPS-Block: `proxy_pass http://127.0.0.1:{port}`, SSL-Certs aus `CERT_DIR`
- Schreibt nach `/etc/nginx/conf.d/demo-{instanceId}.conf`
- `nginx -t && systemctl reload nginx`

**unregisterInstance(instanceId)**
- Löscht `/etc/nginx/conf.d/demo-{instanceId}.conf`
- `systemctl reload nginx`

**cleanupAllConfigs()**
- Löscht alle `demo-*.conf` im NGINX_CONF_DIR
- Gedacht für Server-Neustart

**Constraints**
- Fehler beim nginx-Reload werfen Exception (wird in `registerInstance` gecatcht — non-fatal)
- `NGINX_ENABLED` = false wenn kein `BASE_DOMAIN` gesetzt → kein nginx im lokalen Modus

---

## feat04 — Plugin-Konfigurationssystem (`src/services/config.ts`)

*Implementierungsdetails noch nicht vollständig dokumentiert — `config.ts` lesen.*

**Bekannt:**
- `loadConfigs()` gibt `RunbotConfig[]` zurück
- Configs enthalten: `id`, `name`, `moodleVersion`, `phpVersion`, `db`, `plugin?`, `snapshotId?`
- `GET /configs` gibt alle Configs als JSON zurück (für Demo-Portal)

---

## feat05 — Snapshot-System (`src/services/snapshot.ts`)

*Implementierungsdetails noch nicht vollständig dokumentiert — `snapshot.ts` lesen.*

**Bekannt:**
- `getSnapshot(snapshotId)` → gibt Snapshot-Objekt mit `file`-Pfad zurück
- `restoreSnapshot(instance, file)` → DB-Import in laufenden Container
- MCP-Tools: `snapshot_list`, `snapshot_create`, `snapshot_delete`

---

## feat06 — Automatisches Aufräumen (`src/services/cleanup.ts`)

**Bekannt:**
- `startCleanupScheduler()` → wird beim HTTP-Server-Start aufgerufen
- `recordActivity(instanceId)` → aktualisiert `lastActivity` in Registry
- `POST /ping/:instanceId` → ruft `recordActivity()` auf

*Cleanup-Intervall und Timeout-Konfiguration: `cleanup.ts` lesen.*

---

## feat07 — Demo-Nutzerverwaltung (`src/services/moodleUser.ts`)

**Bekannt:**
- `createDemoUser(instance, email, firstName, lastName)` → legt Moodle-Nutzer an
- `enrollUserInDemoCourse(instance, email)` → schreibt Nutzer in Demo-Kurs ein
- Implementierung vermutlich via `php admin/cli/...` im Webserver-Container

*Passwort-Vergabe und Demo-Kurs-ID: `moodleUser.ts` lesen.*

---

## feat08 — MCP-Tools (`src/tools/`)

**Registrierte Tools:**

| Tool | Datei |
|------|-------|
| `instance_start`, `instance_stop`, `instance_status`, `instance_list` | `instances.ts` |
| `instance_logs`, `instance_run_tests`, `instance_extend`, `instance_time_remaining` | `instances.ts` |
| `snapshot_list`, `snapshot_create`, `snapshot_delete` | `snapshots.ts` |
| `config_list`, `config_get` | `configs.ts` |

**MCP-Endpoint:** `POST /mcp` — stateless, neuer Transport pro Request (`StreamableHTTPServerTransport`)

**Health Check:** `GET /health` → `{ status: "ok", server: "moodle-runbot-mcp-server" }`
