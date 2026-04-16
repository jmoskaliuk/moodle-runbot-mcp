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
| `src/index.ts` | Server-Setup, HTTP-Routen, Demo-Flow-Orchestrierung, Admin-Dashboard, Extend-Codes |
| `src/api/internal.ts` | Internes Backend für `local_runbotadmin` (Snapshots CRUD, Config-Default) |
| `src/services/docker.ts` | Moodle-Docker Lifecycle (provision, install, start, stop, patchConfigForProduction) |
| `src/services/nginx.ts` | nginx-Config schreiben/löschen, nginx reload, Startup-Cleanup |
| `src/services/config.ts` | Plugin-Konfigurationen laden + `updateConfig()`-Helper (atomic write) |
| `src/services/tokens.ts` | Demo-Request-Tokens (create, confirm, markStarted, markExpired) + Phasen-Tracking |
| `src/services/email.ts` | E-Mail-Versand (nodemailer + Brevo SMTP) |
| `src/services/emailTemplates.ts` | HTML-Templates für Bestätigungs-, Demo-bereit-, Fehler-, Extend-Mails |
| `src/services/snapshot.ts` | Snapshot-Verwaltung (list, create, restore, delete) + DB-weites URL-Rewrite |
| `src/services/registry.ts` | Instanz-Registry (speichern, laden, Port-Vergabe) |
| `src/services/cleanup.ts` | Inaktivitäts-Cleanup-Scheduler + `cleanupOrphans()` (Startup) |
| `src/services/moodleUser.ts` | Demo-Nutzer anlegen, in Kurs einschreiben (temp-PHP-Script via `docker exec`) |
| `src/services/github.ts` | GitHub API: Repo-Info, README, Releases, Plugin-Icons (24h TTL-Cache) |
| `src/tools/instances.ts` | MCP-Tools für Instanzen (`instance_start`, `_stop`, `_status`, `_list`, `_extend`, `_logs`) |
| `src/tools/snapshots.ts` | MCP-Tools für Snapshots (`snapshot_list`, `_create`, `_delete`, `snapshot_build`) |
| `src/tools/configs.ts` | MCP-Tools für Configs (`config_list`, `config_get`) |
| `moodle-plugins/local_runbotadmin/` | In-Moodle Admin-Plugin (nutzt `src/api/internal.ts` für Snapshot-Management) |
| `webui/demo-portal.html` | Öffentliches Portal, Plugin-Grid, Demo-Anfrage-Modal |
| `webui/plugin-detail.html` | Plugin-Detailseite, selbes Demo-Anfrage-Modal |
| `webui/admin.html` | Admin-Dashboard (Basic-Auth-geschützt, feat11) |
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
| `DEMO_PASSWORD` | Passwort für admin/teacher/student | `demo1234` |
| `DEMO_STATUS_POLL_MS` | Polling-Intervall Warteseite | `3000` |
| `ADMIN_PASSWORD` | Passwort für `/admin` (HTTP Basic Auth, Pflicht) | — |
| `EXTEND_CODES` | Komma-getrennte Verlängerungscodes | `""` |
| `RUNBOT_INTERNAL_API_KEY` | Auth-Key für `src/api/internal.ts` (wird vom Moodle-Plugin gesetzt) | — |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Brevo-SMTP-Credentials | — |

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
- Bei Demo-Start-Fehler: `email.sendErrorEmail()` wird aufgerufen (non-fatal, eigener catch)

---

## feat02 — Moodle-Instanz-Verwaltung (`src/services/docker.ts`)

**provisionInstance()**
1. `mkdir instanceDir`
2. `git clone --depth 1 moodle-docker` (falls nicht vorhanden)
3. `git clone --depth 1 -b {branch} moodle` (falls nicht vorhanden)
4. `cp config.docker-template.php config.php`
5. `patchConfigForProduction()` hängt einen Override-Block vor `require_once('/lib/setup.php')` ein:
   ```php
   $CFG->wwwroot  = 'https://{id}.{BASE_DOMAIN}';
   $CFG->sslproxy = true;
   $CFG->tool_replace_allowdb = true;   // für snapshot URL-Rewrite
   ```
6. Schreibt config.php zurück

**Hinweis:** Die frühere `removePortBlock()` mit Brace-Counting wurde entfernt
(bug14, task15). Der Override-Block via `patchConfigForProduction()` ist robuster
und lässt das Template unverändert — die Override-Zeilen gewinnen ohnehin, weil
sie nach dem Template evaluiert werden.

**startContainers()**
- `compose up -d`
- `wait_for_db.php` wartet auf PostgreSQL/MariaDB-Readiness
- Falls kein Snapshot: `install_database.php --agree-license --fullname=… --shortname=…`
- Falls Snapshot: kein `install_database.php` — stattdessen `restoreSnapshot()` in `snapshot.ts` (DROP + CREATE + `zcat | psql`/`mysql`)
- Danach `patchConfigForProduction()` ein zweites Mal, weil `install_database.php` die config.php neu schreiben kann

**stopContainers() + cleanupInstanceDir()**
- `compose down -v` (Volumes mit löschen)
- `rm -rf {instanceDir}` nach erfolgreichem `down`
- Bei Fehler: `status = "error"` in Registry, Verzeichnis bleibt liegen → manuell oder `cleanupOrphans()` beim nächsten Startup

**composeEnv()**
- Setzt `MOODLE_DOCKER_WEB_HOST` auf die Instance-URL (für Behat, das den Host direkt liest)
- Setzt `MOODLE_DOCKER_WEB_PORT`, `MOODLE_DOCKER_DB`, `MOODLE_DOCKER_PHP_VERSION`, `MOODLE_DOCKER_BROWSER`

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

**Overview**
Configs werden aus `configs.json` im Projekt-Root geladen. Pfad überschreibbar via `CONFIGS_FILE`-Env-Variable.

**DemoConfig-Struktur**

```typescript
{
  id:            string      // "leitnerflow"
  name:          string      // "LeitnerFlow"
  category:      string      // interne Kategorie
  categoryLabel: string      // Anzeigename der Kategorie
  icon:          string      // Icon-Name oder URL
  iconBg:        string      // Hintergrundfarbe für Icon
  description:   string      // Beschreibungstext für Portal-Karte
  features:      string[]    // Feature-Liste für Portal-Karte
  plugin:        PluginRef | null   // null = Vanilla-Moodle ohne Extra-Plugin
  snapshotId:    string | null      // null = leere Installation
  moodleVersion: string      // "4.5"
  phpVersion:    string      // "8.2"
  db:            string      // "pgsql"
  visible:       boolean     // false = in Portal-Liste versteckt
}
```

**PluginRef-Struktur**
```typescript
{ srcPath: string, type: string, name: string }
// z.B. { srcPath: "/opt/plugins/mod_leitnerflow", type: "mod", name: "eledialeitnerflow" }
```

**API**
- `loadConfigs()` → lädt alle Configs mit `visible !== false`
- `getConfig(id)` → gibt einzelne Config zurück
- `GET /configs` → gibt alle sichtbaren Configs als JSON zurück (für Demo-Portal)

**Constraints**
- `configs.json` wird bei jedem Aufruf neu gelesen (kein Caching)
- Fehler beim Laden wirft Exception mit Pfadangabe

---

## feat05 — Snapshot-System (`src/services/snapshot.ts`)

**Overview**
Snapshots sind komprimierte DB-Dumps (`.sql.gz`) + Metadata-JSON im `SNAPSHOT_DIR`.

**SnapshotMeta-Struktur**
```typescript
{
  id, label, description,
  dbType, moodleVersion, phpVersion,
  plugins: string[],   // ["mod_eledialeitnerflow"]
  sizeBytes, createdAt,
  file: string         // absoluter Pfad zur .sql.gz
}
```

**createSnapshot(instance, id, label, description, plugins)**
- pgsql: `pg_dump -U moodle moodle | gzip > {file}`
- mariadb/mysql: `mysqldump -u moodle -pm@0dl3ing moodle | gzip > {file}`
- Schreibt Metadata als `{id}.json` neben der `.sql.gz`

**restoreSnapshot(instance, snapshotFile)** (aktueller Stand, bug18-fixed)
1. pgsql: DROP + CREATE DATABASE, dann `zcat | psql`
2. mariadb/mysql: `zcat | mysql`
3. **Alte wwwroot aus `mdl_config WHERE name='wwwroot'` lesen** (direkt aus der importierten DB, vor dem Sessions-Truncate)
4. **DB-weites URL-Rewrite:** Falls die alte wwwroot von der neuen Instance-URL abweicht, ruft `restoreSnapshot()` `php admin/tool/replace/cli/replace.php --search=<old> --replace=<new>` auf. Moodles eigenes Search-Replace-Tool kennt alle Spalten inklusive BLOB-Codierungen (`mdl_log`, `mdl_grade_items`, `mdl_backup_controllers`, atto-Inhalte in `mdl_*.intro`). Freigeschaltet via `$CFG->tool_replace_allowdb = true` aus dem `patchConfigForProduction()`-Block.
5. `php admin/cli/cfg.php --name=wwwroot --set="{url}"`
6. `php admin/cli/cfg.php --name=dataroot --set="/var/moodledata"`
7. `php admin/cli/purge_caches.php`
8. Sessions-Tabelle truncaten (keine übernommenen Logins aus dem Seed)

- Schritte 3–4 sind non-fatal (geloggt, nicht geworfen — Restore ist auch ohne Rewrite nutzbar)
- Schritte 5–8 sind non-fatal `.catch(() => {})`

**Storage**
- Verzeichnis: `/opt/snapshots/` (überschreibbar via `SNAPSHOT_DIR`)
- Format: `{id}.sql.gz` + `{id}.json`

**MCP-Tool `snapshot_build`** (task30)
- One-shot-Tool: provisioniert eine frische Instanz, wartet auf Ready, erstellt Snapshot, räumt auf
- `pinned: true`-Flag auf der Build-Instanz schützt sie vor dem Cleanup-Scheduler während des Builds

---

## feat06 — Automatisches Aufräumen (`src/services/cleanup.ts`)

**Timeouts (konfigurierbar via Env)**

| Variable | Default | Bedeutung |
|----------|---------|-----------|
| `DEMO_MAX_AGE_MINUTES` | `60` | Maximale Gesamtlaufzeit einer Instanz |
| `DEMO_INACTIVITY_MINUTES` | `15` | Inaktivitäts-Timeout |
| `CLEANUP_INTERVAL_SECONDS` | `60` | Scheduler-Polling-Intervall |

**Ablauf `runCleanup()`**
- Läuft alle 60s + sofort beim Start
- Prüft jede Instanz: `age > MAX_AGE_MS` oder `inactive > INACTIVITY_MS && status === "running"`
- Cleanup-Sequenz: `status = "stopping"` → `unregisterInstance()` → `stopContainers()` → `cleanupInstanceDir()` → `deleteInstance()`
- Bei Fehler: `status = "error"`, `error`-Feld gesetzt (bleibt in Registry sichtbar)

**`recordActivity(instanceId)`**
- Aktualisiert `inst.lastActivity` auf `new Date().toISOString()`
- Wird über `POST /ping/:instanceId` aufgerufen

**`cleanupOrphans()`** (task20, Startup)
- Wird beim Server-Startup **vor** `runHTTP()` aufgerufen — bevor neue Requests reinkommen
- Gleicht drei Quellen gegen `registry.getAllInstances()` ab:
  1. `docker ps -a --filter "name=runbot-"` → verwaiste Container
  2. `<id>`-Directories unter `RUNBOT_WORK_DIR` → verwaiste Instanz-Verzeichnisse
  3. `runbot-*.conf` in `NGINX_CONF_DIR` → verwaiste nginx-Configs
- Räumt alles ohne Registry-Eintrag weg (selektiv, keine Pauschal-Aktion gegen `cleanupAllConfigs()`)
- Loggt eine Summary mit Container/Dir/Config-Counts

---

## feat07 — Demo-Nutzerverwaltung (`src/services/moodleUser.ts`)

**Wichtig:** Seit feat10 (2026-04-09) werden keine User-spezifischen Accounts
mehr aus der E-Mail-Adresse des Interessenten angelegt. Stattdessen bringt der
Snapshot drei fertige Accounts mit: `admin`, `teacher`, `student`. Die alten
`createDemoUser()`/`enrollUserInDemoCourse()`-Aufrufe sind nur noch für
Non-`multiUser`-Configs aktiv.

**createDemoUser(instance, email, firstName, lastName)** (alt, nur für `multiUser: false`)

**Historie:** Die ursprüngliche Implementierung rief `php admin/cli/create_user.php`
und `php admin/cli/enrol_user.php` auf — diese Dateien existieren in Moodle-Core
aber nicht (bug19). Der Call schlug konsistent mit `Could not open input file`
fehl und ließ die komplette Provisionierung kippen.

**Aktuelle Implementierung (bug19-fix, 2026-04-09):**
- Schreibt ein temporäres PHP-Script in den Moodle-Dir (via `MOODLE_DOCKER_WWWROOT` als `/var/www/html` im Container gemountet)
- Ruft per `docker exec webserver php <script>` auf
- Script nutzt Moodle's native APIs: `user_create_user()`, `user_update_user()`, `$auth->user_update_password()`
- Analog für `enrollUserInDemoCourse` mit `enrol_get_plugin('manual')->enrol_user()`
- Script wird nach Ausführung via `try/finally` wieder entfernt, auch bei Fehlern
- 3-Retry mit 15s Delay bei transienten Fehlern
- Idempotent: `user_exists` / `already_enrolled`-Fehler werden nur geloggt

**Default-Passwort**
- `DEMO_PASSWORD` Env-Variable, Default `demo1234`
- Wird auf der Warteseite angezeigt (feat09) und in der "Demo bereit"-E-Mail (via `emailTemplates.renderReadyEmail()`)

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

---

## feat09 — Live-Status auf der Warteseite (`src/index.ts` + Loading-HTML)

**Overview**
Nach `GET /confirm/:token` rendert der Server `buildLoadingPage()` mit dem Token
als eingebettete JS-Konstante. Die Seite pollt `GET /api/demo-status/:token`
alle 3 s (konfigurierbar via `DEMO_STATUS_POLL_MS`) und zeigt die aktuelle
Phase — *nicht* nur einen blinden Timer wie früher.

**Phase-Tracking**
- Neues Feld `phase` auf `DemoRequest` (persistiert in `tokens.json`)
- Werte: `"provisioning" | "installing_plugin" | "starting_containers" | "restoring_snapshot" | "creating_user" | "running"`
- Wird vom Background-Handler in `GET /confirm/:token` an jedem Übergang via `tokens.setPhase(token, phase)` aktualisiert → überlebt Server-Restart

**Endpoint: `GET /api/demo-status/:token`**
Response-Schema:
```json
{
  "status": "preparing" | "ready" | "error" | "expired",
  "phase": "provisioning" | "installing_plugin" | "starting_containers" | "restoring_snapshot" | "creating_user" | "running",
  "url": "https://demo-leitnerflow-abc.demo.eledia.ai",
  "username": "admin · teacher · student",
  "password": "demo1234",
  "pluginName": "LeitnerFlow"
}
```
- `url`/`username`/`password`/`pluginName` nur befüllt wenn `status === "ready"`
- Token unbekannt: 404 + `{status: "expired"}`

**Alias-Route wegen nginx-Strip**
`/api/`-Prefix wird von nginx gestripped (`proxy_pass http://127.0.0.1:3000/;`),
daher registriert `index.ts` sowohl `GET /api/demo-status/:token` als auch
`GET /demo-status/:token` auf denselben Handler. Ähnlich `/configs` ↔ `/api/configs`
und `/plugin/:id` ↔ `/api/plugin/:id`. Siehe `idea: nginx-Config sauber aufräumen`
in `04-tasks.md` für den Cleanup-Plan.

**Loading-Page JS**
- Schreibt aktuelle Phase in `document.title` → Status im Browser-Tab sichtbar
- Bei `status === "ready"`: blendet Credentials-Box + prominenten "Demo jetzt öffnen"-Button ein (neuer Tab)
- Bei `status === "error"`: freundliche Fehlermeldung + "Neue Demo anfordern"-Link
- Kopier-Buttons pro Account-Zeile (task28, commit `a3eff28`)

**Non-goals**
- Kein WebSocket / SSE (Polling reicht, Kosten/Komplexität niedriger)
- Kein Auto-Login per Token (bewusst manuelle Anmeldung, damit der Nutzer den Rollen-Kontext versteht)

---

## feat10 — Rollenbasierte Demo-Szenarien (Snapshot-basiert)

**Overview**
Statt dynamisch einen Account pro E-Mail anzulegen, liefert jeder Snapshot drei
fertige Accounts mit: `admin`, `teacher`, `student`. Das reduziert die
Fehlerquelle (bug19) und erlaubt Multi-Rollen-Szenarien im Demo-Kurs.

**Config-Flag `multiUser`**
- In `configs.json` pro Plugin-Config: `"multiUser": true` (Default für neue Snapshots)
- `"multiUser": false` → Fallback auf das alte `createDemoUser()`/`enrollUserInDemoCourse()` (mit temp-PHP-Script aus bug19-fix)

**Accounts im Snapshot**
- `admin` (Moodle-Manager-Rolle, systemweit)
- `teacher` (Lehrkraft im Demo-Kurs)
- `student` (Kursteilnehmer im Demo-Kurs)
- Alle drei teilen das `DEMO_PASSWORD` (Default `demo1234`)
- Alle drei sind in denselben Demo-Kurs (shortname `"demo"`) enrolled

**UI-Konsequenzen**
- Warteseite zeigt im "Ready"-Zustand: `Accounts: admin · teacher · student / Passwort: demo1234`
- "Demo bereit"-E-Mail (via `emailTemplates.renderReadyEmail()`) zeigt dieselben drei Account-Namen statt der E-Mail-Adresse
- Kein Rollen-Switcher im MVP — der Nutzer loggt sich manuell ein oder nutzt Moodles "Login as"-Funktion

**Snapshot-Pflicht**
Damit ein Plugin den `multiUser: true`-Modus nutzen kann, muss beim
Snapshot-Build alle drei Accounts bereits angelegt sein. Das Runbook dafür
steht in `scripts/seed-snapshot.sh` und dem Snapshot-Building-Workflow.

---

## feat11 — Admin-Dashboard (`webui/admin.html` + Basic Auth)

**Overview**
Interne Übersicht aller laufenden Instanzen + aktiven Tokens. Nur für
eLeDia-Mitarbeiter, HTTP Basic Auth geschützt.

**Route-Setup in `src/index.ts`**
- `basicAuthMiddleware`: Expressed Middleware, prüft `Authorization`-Header gegen `ADMIN_PASSWORD` Env-Variable
- Server startet **nicht**, wenn `ADMIN_PASSWORD` nicht gesetzt ist (`process.exit(1)` im Startup)
- Geschützte Routen:
  - `GET /admin` → statisches `webui/admin.html`
  - `GET /admin/api/instances` → Snapshot aller `registry.getAllInstances()` + `calculateTimeRemaining()`
  - `GET /admin/api/tokens` → Snapshot aller `tokens.getAllRequests()` mit Status + Ablaufzeit
  - `POST /admin/api/instance/:id/extend` → `expiresAt += 60 min`
  - `DELETE /admin/api/instance/:id` → sofortiges Cleanup (unregister + stop + cleanupDir + deleteFromRegistry)
  - `GET /admin/api/instance/:id/logs?n=50` → letzte 50 Zeilen aus `docker logs`

**admin.html**
- Vanilla HTML + kleines inline JS (kein Framework)
- Zwei Tabellen: Instanzen + Tokens
- Refresh-Button (kein Auto-Polling)
- Actions pro Zeile: "+1 Std", "Löschen" (mit `confirm()`), "Logs" (öffnet Modal)
- Basic Auth wird vom Browser in der Session gecached — Logout = Tab schließen

**Non-goals**
- Kein CSRF-Token (Same-Origin + Basic Auth reicht für interne Tools)
- Kein Audit-Log, keine Multi-Admin, kein 2FA (Phase 2)
- Kein GitHub OAuth (Phase 2)

---

## feat12 — Code-basierte Demo-Verlängerung (`src/index.ts`)

**Overview**
Pre-generierte Codes aus `EXTEND_CODES`-Env-Variable erlauben, eine Demo von
60 Min auf 1 Tag (1440 Min) zu verlängern.

**Config**
- `EXTEND_CODES=EDUMA2026,PRIVATE,TRAIN01` (Komma-getrennt, nur Code-Namen)
- Globaler TTL: 1440 Min für alle Codes im MVP — keine pro-Code-Laufzeit
- Distribution manuell (per E-Mail, Messe-Zettel, Whiteboard)

**Endpoint: `POST /api/extend-code`**
- Input: `{ token, code }`
- Validierung:
  - Code existiert in `EXTEND_CODES`? → sonst 400 `{error: "Code ungültig"}`
  - Token existiert + hat zugewiesene Instanz? → sonst 404
  - Token bereits abgelaufen? → 410 `{error: "Demo bereits beendet"}`
  - Dieser Token hat diesen Code schon verwendet? → 409 `{error: "Du hast diese Demo schon verlängert"}`
- Bei Erfolg:
  - `instance.expiresAt = now + 1440 min`
  - `demoRequest.usedExtendCodes.push(code)` (persist in `tokens.json`)
  - Response: `{ ok: true, newExpiresAt: "2026-04-11T16:30:00Z" }`

**Shared Codes, per-Token-Einmal**
Ein Code darf von beliebig vielen Interessenten parallel genutzt werden (er ist
ein "Messe-Code"), aber pro Token nur einmal — daher der `usedExtendCodes[]`-Check.

**UI**
- Kleines Eingabefeld auf der Warteseite und in der laufenden Demo-Seite (via Token-Link)
- Response zeigt "Demo verlängert bis …"

---

## feat13 — Plugin-Metadaten aus GitHub (`src/services/github.ts`)

**Overview**
`github.ts` liefert Repo-Info, Releases und Plugin-Icons für die Portal-Karten
und Plugin-Detailseiten. 24 h TTL-Cache pro Repo, damit das GitHub-API-Rate-Limit
nicht explodiert.

**API**
- `getRepo(owner/repo)` → Stars, letzte Commit-Message, Default-Branch
- `getLatestRelease(owner/repo)` → Tag, Name, Body, Published-Date
- `resolvePluginIconUrl(owner/repo)` → versucht der Reihe nach `pix/monologo.svg`, `pix/monologo.png`, `pix/icon.svg`, `pix/icon.png` auf `main` und dann `master` via HEAD-Request auf `raw.githubusercontent.com` und gibt die erste funktionierende URL zurück (oder `null`)

**Cache**
- In-Memory `Map<string, { value, expiresAt }>`
- TTL: 24 h (`GITHUB_CACHE_TTL_MS`)
- Kein Persistenz — Cache wird bei Server-Restart verworfen (akzeptabel, da die GitHub-Calls billig sind und der erste Call nach Restart eine Warm-up-Latenz von ~200 ms hat)

**Config-Verknüpfung**
- In `configs.json` pro Plugin: `"githubRepo": "eledia/moodle-mod_eledialeitnerflow"`
- Ohne `githubRepo`: `iconUrl: null`, Portal fällt auf Config-Emoji zurück

**Endpoint-Integration (`src/index.ts`)**
- `GET /configs` + `GET /api/configs` verwenden einen gemeinsamen `configsHandler`:
  ```typescript
  const configsHandler = async (_req, res) => {
    const all = await loadConfigs();
    const visible = all.filter(c => c.visible !== false);
    const configs = await Promise.all(
      visible.map(async c => {
        const iconUrl = c.githubRepo
          ? await github.resolvePluginIconUrl(c.githubRepo).catch(() => null)
          : null;
        return { ...c, iconUrl };
      })
    );
    res.json({ count: configs.length, configs });
  };
  ```
- `Promise.all()` parallelisiert die Resolver, Cache-Hits kosten <1 ms
- `.catch(() => null)` schluckt 404/Rate-Limit-Fehler, damit ein kaputtes Repo nicht das ganze Portal-Grid kippt
- Portal rendert: `<img src="${p.iconUrl}" onerror="this.parentElement.textContent='${p.icon}'">` als Fallback

---

## In-Moodle Admin: `local_runbotadmin` + `src/api/internal.ts`

**Motivation**
Der manuelle Snapshot-Workflow via curl-Aufrufen ist fragil (siehe Memory
`project_runbot_snapshots.md`). Stattdessen gibt es jetzt ein Moodle-internes
Admin-Plugin, das Snapshots aus der laufenden Demo-Instanz heraus verwaltet —
direkt aus Moodles Site-Administration.

**Backend: `src/api/internal.ts`**
- Express-Subrouter, gemountet unter `/api/internal/*`
- Auth: Header `X-Runbot-Internal-Key` gegen `RUNBOT_INTERNAL_API_KEY`-Env-Variable
- Jede Route ist auf den Plugin-Slug der rufenden Instanz gescoped (Cross-Tenant-Schutz)

**Endpoints**

| Methode | Route | Zweck |
|---------|-------|-------|
| `GET` | `/api/internal/snapshot/list` | Snapshots der rufenden Instanz (plus `defaultSnapshot`, `configId`, per-Snapshot `isDefault` + `downloadUrl`) |
| `GET` | `/api/internal/snapshot/download/:id` | Streamt `.sql.gz`-Binary mit `Content-Disposition: attachment` |
| `POST` | `/api/internal/snapshot/delete` | Löscht Snapshot-File + Metadata; 409 wenn aktueller Default |
| `POST` | `/api/internal/snapshot/create` | Ruft `snapshotSvc.createSnapshot()` auf |
| `POST` | `/api/internal/config/set-default` | `updateConfig()` setzt `snapshotId` auf neuen Default |

**Security**
- Path-Containment-Check gegen Path-Traversal: `path.resolve(SNAPSHOT_DIR, id)` muss mit `SNAPSHOT_DIR` starten
- Plugin-Scope-Check: Snapshot-Metadata `plugins[]` muss den Plugin-Slug der rufenden Instanz enthalten, sonst 404 (kein Sidechannel)
- Default-Schutz: Löschen des aktuellen Default-Snapshots wirft 409 Conflict (würde sonst den nächsten Demo-Start kippen)

**Atomic Config-Writes (`src/services/config.ts`)**
Neuer Helper `updateConfig(id, mutator)` mit tmp-file + rename-Pattern:
```typescript
export async function updateConfig(id, mutator) {
  const all = JSON.parse(await fs.readFile(CONFIG_FILE, "utf-8"));
  const idx = all.findIndex(c => c.id === id);
  if (idx < 0) throw new Error(`Config '${id}' nicht gefunden`);
  mutator(all[idx]);
  const tmp = `${CONFIG_FILE}.tmp.${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(all, null, 2), "utf-8");
  await fs.rename(tmp, CONFIG_FILE);  // atomic on POSIX
  return all[idx];
}
```
Verhindert Half-Written-Files bei parallelen Schreibern oder Crash mitten im Write.

**Moodle-Plugin: `moodle-plugins/local_runbotadmin/`**
- Component: `local_runbotadmin`
- Sichtbar unter `Site administration → Plugins → Local plugins → Runbot Admin`
- Version: `2026041001`, Release `0.2.0-snapshot-actions`

**Dateien**
- `version.php`, `lib.php`, `settings.php` — Standard-Plugin-Bootstrap
- `classes/api_client.php` — Curl-Wrapper um `/api/internal/*`-Endpoints, setzt `X-Runbot-Internal-Key`-Header
- `index.php` — Haupt-Admin-Page mit Snapshots-Tab
- `lang/{de,en}/local_runbotadmin.php` — String-Pack
- `styles.css` — `.runbotadmin-*`-Klassen

**Snapshots-Tab (`index.php`)**
- Tabelle aller Snapshots der aktuellen Instanz (aus `/api/internal/snapshot/list`)
- Pro Zeile: `ID | Label | Size | Created | Default | Actions`
- Actions: `[Download]` (neuer Tab), `[Set Default]`, `[Delete]` (mit JS-`confirm()`)
- Aktueller Default trägt Badge `★ Default`, bekommt keine Set-Default/Delete-Buttons

**Action-Routing (kritisch: Reihenfolge!)**
```php
if ($action === 'download') {
    // Streams binary — MUSS vor $OUTPUT->header() laufen,
    // sonst kontaminiert Moodles Page-Chrome den Binary-Stream
    $apiclient->stream_snapshot_download($id);
    exit;
}
$PAGE->set_url(...);
echo $OUTPUT->header();
// ... Rest der HTML-Ausgabe
```

**Binary-Streaming (`classes/api_client.php → stream_snapshot_download`)**
- Curl mit `CURLOPT_WRITEFUNCTION` → bytes 1:1 an PHP-Output durchreichen
- `CURLOPT_HEADERFUNCTION` → liest `Content-Disposition` aus der Backend-Response und emittet denselben Header an den Moodle-User-Browser
- Keine Pufferung — Gigabyte-Snapshots streamen durch, ohne `memory_limit` zu sprengen

**Stage 3 (deferred, task37c)**
- Snapshot-Upload vom Admin-Laptop
- Plugin-Management-Tab (Install/Update von GitHub)
- Metadata-Tab (Label, Description, Plugins bearbeiten)
- Rate-Limiting + Audit-Logging der Actions

---

## Webui (`webui/`)

Statische HTML-Dateien, vom nginx aus `$APP_DIR/webui/` serviert. Kein Build-Schritt nötig.

| Datei | Zweck |
|-------|-------|
| `demo-portal.html` | Hauptportal — Plugin-Karten, Demo-Anfrage-Modal |
| `plugin-detail.html` | Detailseite für einzelne Plugins |
| `index.html` | MCP-Debug-Interface (internes Tool) |

**demo-portal.html**
- Lädt Plugin-Karten via `GET /api/configs` beim Seitenstart
- Fallback-Configs (hardcoded) wenn Server nicht erreichbar
- Klick auf "Demo starten" → Modal mit E-Mail-Formular
- Modal sendet `POST /api/request-demo` → zeigt "Bitte prüfen Sie Ihr Postfach"
- API-Basis: `window.location.origin + '/api'` (relativ, kein hartkodiertes Domain)

**nginx-Routing**
- `GET /` → `webui/demo-portal.html` (statisch)
- `location /api/` → `proxy_pass http://127.0.0.1:3000/` (MCP-Server, `/api/`-Prefix wird gestripped)
