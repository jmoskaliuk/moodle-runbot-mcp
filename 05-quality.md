# Quality

## Meta

Dieses Dokument verfolgt System-Qualität.
Enthält: Bugs (bugXX) und Testläufe (testXX).
Nicht hier: Ideen, Tasks (→ `04-tasks.md`).

---

## 🐞 Bugs

### bug01 Port-Block hinterließ übrig gebliebene `}`

Feature: feat02
Status: fixed (task01)

**Description**
`provisionInstance()` in `docker.ts` entfernte den `$port = getenv('MOODLE_DOCKER_WEB_PORT')`-Block mit einem Regex, der bei der ersten schließenden `}` stoppte — die äußere `}` des verschachtelten `if`-Blocks blieb in `config.php` zurück (Zeile ~41).

**Reproduction**
1. `provisionInstance()` aufrufen
2. `config.php` der Instanz lesen
3. Zeile ~41 enthält einsames `}`

**Expected**
Kein Port-Block in `config.php`, keine übrig gebliebene `}`.

**Fix**
`removePortBlock()` mit Brace-Counting implementiert statt Regex. Behebt das Problem vollständig.

---

### bug02 nginx generierte nur HTTP, kein HTTPS

Feature: feat03
Status: **reopened** (task14) — Fix in task02 war nie im Code angekommen

**Description**
`registerInstance()` in `nginx.ts` generiert aktuell (Review 2026-04-09) nur einen `listen 80` Server-Block mit `proxy_pass http://127.0.0.1:${port}`. Kein HTTPS-Block, keine SSL-Zertifikate referenziert. Demo-E-Mail verlinkt auf `https://demo-xxx.demo.eledia.ai`, aber nginx hat keinen passenden 443-Server → TLS-Handshake scheitert oder fällt auf Default-Cert zurück.

**Historie**
- task02 (Status done in 04-tasks.md) beschreibt die Lösung — im Code war sie aber nie angekommen oder wurde versehentlich zurückgesetzt (git log zeigt nur Initial commit für nginx.ts).
- 00-master.md verspricht "Wildcard-Zertifikat unter /etc/letsencrypt/live/demo.eledia.ai/" — nginx.ts referenziert es nicht.

**Fix**
task14: HTTP→HTTPS-Redirect (301) auf Port 80 + HTTPS-Server-Block auf Port 443 mit `ssl_certificate` aus `${SSL_CERT_DIR}/fullchain.pem` und `${SSL_CERT_DIR}/privkey.pem`. Default `SSL_CERT_DIR=/etc/letsencrypt/live/${BASE_DOMAIN}`.

---

### bug03 Demo-Start-Fehler ohne Nutzer-Feedback

Feature: feat01
Status: fixed (task07)

**Description**
Wenn `setImmediate`-Handler in `GET /confirm/:token` fehlschlägt (z.B. Docker nicht erreichbar, Port erschöpft), bekommt der Nutzer nur die Loading-Page zu sehen — aber nie eine Weiterleitung oder Fehler-E-Mail. Nutzer wartet unendlich lang.

**Reproduction**
1. Docker-Daemon stoppen
2. Demo-Token-Link aufrufen
3. Loading-Page erscheint, aber nie eine E-Mail

**Expected**
Nutzer bekommt Fehler-E-Mail: "Demo konnte nicht gestartet werden — bitte nochmal versuchen."

**Fix**
→ task07

---

### bug04 instance.url war HTTP statt HTTPS

Feature: feat01, feat03
Status: partially-fixed

**Description**
`index.ts` setzte `instance.url = http://{id}.{BASE_DOMAIN}` obwohl nginx nur HTTPS
serviert. Folge: "Demo bereit"-E-Mail enthielt HTTP-Link (Weiterleitung schlägt fehl),
und `restoreSnapshot()` überschrieb die korrekte HTTPS-wwwroot mit HTTP → Redirect-Schleifen.

**Fix (partial)**
`index.ts:292` baut jetzt `https://` URL wenn `BASE_DOMAIN` gesetzt.

**Noch offen**
`src/tools/instances.ts:20` `instanceUrl()` gibt weiterhin `http://` zurück — Inkonsistenz mit `index.ts`. MCP-Tools wie `instance_status`, `instance_list`, `instance_start` liefern damit eine andere URL als der Demo-Flow per E-Mail verschickt. → siehe bug10 + task16.

---

### bug05 configs.json fehlten db + features

Feature: feat04
Status: fixed (task11)

**Description**
`db`-Feld fehlte → `startContainers()` hätte mit `undefined` gecrasht.
`features[]` fehlte → Portal-Karten zeigten keine Feature-Liste.

**Fix**
`db: "pgsql"` und `features[]` in `configs.json` ergänzt.

---

### bug06 docker.ts: $CFG->wwwroot falsch, kein sslproxy

Feature: feat02, feat03
Status: **fixed 2026-04-09** (task15)
Entdeckt: Code-Review 2026-04-09

**Description**
`composeEnv()` in `src/services/docker.ts` setzt `MOODLE_DOCKER_WEB_HOST` nicht.
`provisionInstance()` kopiert `config.docker-template.php` verbatim und patcht nichts.
Folge:
1. `$CFG->wwwroot` wird vom Template auf `http://localhost:${port}` gesetzt (wegen fehlendem Host und per Default ist der Port im wwwroot enthalten).
2. `$CFG->sslproxy` ist nicht gesetzt → Moodle weiß nicht, dass nginx TLS terminiert → interne Links (Assets, Redirects, Cookies) kommen als `http://` raus, obwohl der Browser `https://` spricht → Mixed-Content + Login-Schleifen.

**Reproduction**
1. Instanz frisch provisionieren (ohne Snapshot)
2. `grep wwwroot config.php` → enthält kein `https://demo-xxx.demo.eledia.ai`
3. Browser öffnet `https://demo-xxx.demo.eledia.ai` → Moodle redirectet auf `http://…:81xx` → Mixed-Content-Block

**Expected**
- `$CFG->wwwroot = 'https://demo-xxx.demo.eledia.ai';` (kein Port, kein http)
- `$CFG->sslproxy = true;`

**Fix**
task15: `provisionInstance()` ruft jetzt `patchConfigForProduction()` auf, das nach dem Template-Copy einen Override-Block vor `require_once('/lib/setup.php')` einhängt:
```php
$CFG->wwwroot  = 'https://demo-xxx.demo.eledia.ai';
$CFG->sslproxy = true;
```
`composeEnv()` setzt zusätzlich `MOODLE_DOCKER_WEB_HOST` für Werkzeuge wie Behat, die den Host direkt lesen. Verifiziert 2026-04-09 via frischer Demo-Start ohne Mixed-Content-Warnung und korrektem HTTPS-Redirect.

---

### bug07 plugin-detail.html: undefined MCP-Variable

Feature: feat01 (Webui)
Status: **fixed 2026-04-09** (task17)
Entdeckt: Code-Review 2026-04-09

**Description**
`webui/plugin-detail.html` (~Z. 736) ruft `fetch(MCP, ...)`, aber `MCP` ist nirgends deklariert. Im Script ist nur `const API = window.location.origin` definiert. Ein Klick auf "Demo starten" auf der Detailseite erzeugt `ReferenceError: MCP is not defined`.

**Expected**
`fetch(\`${API}/api/request-demo\`, ...)` — konsistent mit demo-portal.html.

**Fix**
task17: Der gesamte Direkt-Launch-Pfad (`mcpCall()` + `finish()` + Progress-Balken) wurde aus `plugin-detail.html` entfernt. `startDemo()` öffnet jetzt nur noch das Modal (`openModal()`), `submitForm()` postet auf `${API}/request-demo` — identisch zum Portal-Formular. Kein `MCP`-Symbol mehr im Code.

---

### bug08 plugin-detail.html: startDemo umgeht E-Mail-Flow

Feature: feat01 (Webui)
Status: **fixed 2026-04-09** (task17)
Entdeckt: Code-Review 2026-04-09

**Description**
`startDemo()` in `plugin-detail.html` ruft `mcpCall('instance_start', ...)` direkt auf. Das ist das interne MCP-Tool, das sofort eine Instanz startet — ohne E-Mail-Bestätigung, ohne Token, ohne Rate-Limit, ohne Missbrauchsschutz. Die komplette `/request-demo → confirm → demo-ready`-Kette wird übersprungen.

**Expected**
Die Detailseite öffnet dasselbe Modal wie demo-portal.html und postet auf `/api/request-demo`.

**Fix**
task17: Das Modal wurde aus `demo-portal.html` nach `plugin-detail.html` dupliziert und der Token-Flow aktiviert: `POST /api/request-demo` → Bestätigungs-E-Mail → `/confirm/:token` → Loading-Page → Demo-bereit-Mail. Keine Detail-seitigen Instanzen mehr ohne E-Mail-Bestätigung, keine Umgehung des Rate-Limits.

---

### bug09 tools/instances.ts: instanceUrl() ist http

Feature: feat03
Status: **fixed 2026-04-09** (task16)
Entdeckt: Code-Review 2026-04-09

**Description**
`src/tools/instances.ts:19-22`:
```typescript
function instanceUrl(instance: MoodleInstance): string {
  if (BASE_DOMAIN) return `http://${instance.id}.${BASE_DOMAIN}`;
  return `http://localhost:${instance.webPort}`;
}
```
`index.ts:292` baut dagegen `https://`. MCP-Clients (instance_start/status/list) bekommen eine andere URL als Demo-Flow-Nutzer.

**Fix**
task16: `instanceUrl()` liefert jetzt `https://${instance.id}.${BASE_DOMAIN}` wenn `BASE_DOMAIN` gesetzt ist, sonst weiterhin `http://localhost:${webPort}` (lokaler Dev-Modus ohne TLS). Damit sind `index.ts` und `tools/instances.ts` konsistent. Verifiziert 2026-04-09 im aktuellen Code.

---

### bug10 demo-portal.html: statPlugins-ID existiert nicht

Feature: feat01 (Webui)
Status: **fixed 2026-04-09** (task18)
Entdeckt: Code-Review 2026-04-09

**Description**
Code ruft `document.getElementById('statPlugins')` auf, aber das Element im DOM hat gar keine ID (nur die Nachbar-Stat „Demos aktiv" hat `id="statActive"`). Der Stat wird daher nie aktualisiert. Zusätzlich ist die Hero-Stat „Plugins verfügbar" hardcoded auf `6`, obwohl `configs.json` inzwischen einen anderen Count hat.

**Fix**
task18: `id="statPlugins"` an das fehlende `<div class="stat-val">` angeheftet und Hardcoded-`6` durch `—` ersetzt. `loadData()` ruft `document.getElementById('statPlugins').textContent = P.length` sowohl im Success- als auch im Fallback-Pfad — d.h. der Stat zeigt jetzt immer die tatsächliche Länge von `configs.json` bzw. der `FALLBACK_CONFIGS`. `statActive` („Demos aktiv") bleibt vorerst auf `—` stehen (eigenes Follow-Up, das ein öffentliches Zähl-Endpoint braucht).

---

### bug11 demo-portal.html: globales `function close()`

Feature: feat01 (Webui)
Status: fixed (hotfix 2026-04-09)
Entdeckt: Code-Review 2026-04-09
Behoben: Hotfix 2026-04-09 nach User-Report "Schließen-Button reagiert nicht"

**Description**
`webui/demo-portal.html` deklarierte ein globales `function close()`. In inline-HTML-Event-Handlern (`onclick="close()"`) wird die Scope-Chain `element → document → window` durchlaufen, und `document.close()` existiert als Method (zum Schließen von `document.open()`-Streams). Daher wurde statt der globalen Function immer `document.close()` aufgerufen — ein effektiver No-Op. Modal liess sich nicht mehr schließen, weder per X-Icon noch per Schließen-Button noch per Overlay-Click noch per Escape.

**Repro**
1. https://demo.eledia.ai öffnen
2. "Jetzt starten" auf einer Plugin-Karte
3. E-Mail eintragen, "Bestätigungslink senden"
4. Im "E-Mail wurde gesendet" State: X, "Schließen" oder Klick neben das Modal → nichts passiert

**Fix**
`function close()` → `function closeModal()`, alle `onclick="close()"` und das Escape-Key-Handler entsprechend umgestellt. Deployed in Commit TBD.

---

### bug12 plugin-detail.html: Hero-Title/Desc Copy-Paste

Feature: feat01 (Webui)
Status: **fixed 2026-04-09** (task17)
Entdeckt: Code-Review 2026-04-09

**Description**
`loadPluginData()` setzt `heroTitle.textContent = cfg.description` und `heroDesc.textContent = ''`. Der Titel sollte der Plugin-Name (oder ein Marketing-Headline) sein, die Description gehört darunter.

**Fix**
task17: `heroTitle = cfg.name`, `heroDesc = cfg.description`. Umgesetzt in `webui/plugin-detail.html` um Zeile 596. `heroName` (Breadcrumb-Span) bleibt ebenfalls `cfg.name` — damit ist die Bread­crumb-Navi konsistent mit der H1.

---

### bug13 configs.json snapshotId null → 3–5 Min Fresh-Install

Feature: feat01, feat05
Status: **fixed 2026-04-09** (task19)
Entdeckt: Code-Review 2026-04-09

**Description**
`configs.json` → `leitnerflow.snapshotId = null`. Jeder Demo-Start läuft durch `install_database.php` (3–5 Min frisch). Die Loading-Page animiert aber 5 Schritte à 10s (~50s) und die Bestätigungs-E-Mail verspricht "1–2 Minuten".

**Fix**
task19: Snapshot `leitnerflow-v1.sql.gz` (224.7 KB) liegt auf dem VPS unter `/opt/snapshots/`, erstellt via `scripts/seed-snapshot.sh create-snapshot` aus einer frisch provisionierten Seed-Instanz. `configs.json` → `leitnerflow.snapshotId = "leitnerflow-v1"`. Cold-Start via `instance_start(snapshotId=...)` spielt den Dump per `zcat | psql` in ~5 Sekunden statt ~3 Minuten ein. E2E-Verifikation durch Johannes parallel zu diesem Commit.

---

### bug14 03-dev-doc.md: veraltete Referenz auf removePortBlock

Feature: feat02
Status: fixed (in task15)
Entdeckt: Code-Review 2026-04-09

**Description**
`03-dev-doc.md` beschreibt `provisionInstance()` als Aufrufer von `removePortBlock()` mit Brace-Counter — diese Funktion existiert aber im aktuellen `docker.ts` gar nicht. Doku ist aspirational, Code kopiert das Template verbatim (siehe bug06).

**Fix**
task15 aktualisiert sowohl Code als auch Doku.

---

### bug15 Keine Locks auf registry.json / tokens.json

Feature: feat01
Status: known-limitation

**Description**
`src/services/registry.ts` und `src/services/tokens.ts` machen Read-Modify-Write auf File-Ebene ohne Locking. Zwei gleichzeitige `POST /request-demo` oder parallele Cleanup-Writes können Einträge verlieren.

**Akzeptiert für v1** — Single-Node Server, Traffic niedrig. Doku-Vermerk in 03-dev-doc.md (feat06/feat01).

---

### bug16 Keine Auth auf /api/request-demo außer Rate-Limit

Feature: feat01
Status: known-limitation

**Description**
Nur `express-rate-limit` (5 Requests / 15 Min pro IP). Keine Captcha, keine E-Mail-Domain-Allowlist. Koordinierter Angriff über mehrere IPs möglich.

**Akzeptiert für v1** — niedrige Missbrauchswahrscheinlichkeit bei B2B-Zielgruppe. Später Turnstile/hCaptcha nachrüsten.

---

### bug17 Kein Startup-Cleanup für Orphan-Container

Feature: feat06
Status: **fixed 2026-04-09** (task20)
Entdeckt: Code-Review 2026-04-09

**Description**
Wenn der Node-Prozess während einer Provisionierung abstürzt, bleiben Docker-Container + `runbot-*`-Compose-Projekte + `/opt/runbot/demo-*`-Verzeichnisse + nginx-Configs zurück. Der Cleanup-Scheduler findet sie nicht, weil kein Registry-Eintrag existiert.

**Fix**
task20: Neue Funktion `cleanupOrphans()` in `src/services/cleanup.ts`. Wird aus `src/index.ts` **vor** `runHTTP()` aufgerufen — noch bevor der HTTP-Server Anfragen annimmt und bevor der Cleanup-Scheduler läuft. Gleicht `docker ps -a --filter "name=runbot-"`, alle `<id>`-Directories unter `RUNBOT_WORK_DIR` und alle `runbot-*.conf` in `NGINX_CONF_DIR` gegen `registry.getAllInstances()` ab. Bewusst NICHT verwendet wird `nginx.cleanupAllConfigs()` — das würde auch Configs von gültigen Instanzen wegräumen. Stattdessen selektiv nur Waisen. Loggt eine Summary mit Container/Dir/Config-Counts.

---

### bug19 moodleUser.ts ruft nicht-existierende CLI-Skripte auf

Feature: feat01
Status: fixed (2026-04-09)
Entdeckt: Verify-Lauf task14, Service-Log `demo-leitnerflow-7408b5`, `demo-leitnerflow-fae033`

**Description**
`src/services/moodleUser.ts` rief `php admin/cli/create_user.php` und `php admin/cli/enrol_user.php` auf. Diese Dateien existieren in Moodle-Core nicht — weder in 4.x noch in 5.x (waren nie Standard-CLI-Skripte, vielleicht Copy-Paste aus einem Plugin-Repo). Der Container antwortete konsistent mit `Could not open input file: admin/cli/create_user.php`, alle 3 Retries schlugen fehl, Provisionierung brach ab, `nginx.writeInstanceConfig()` wurde nie aufgerufen. Deswegen hatten auch die 6 orphan-Verzeichnisse in `/opt/runbot/` nie eine nginx-Config.

Hätte früher auffallen müssen: task02 Verify war nie wirklich durchgelaufen, weil schon Schritt "User anlegen" vorher geknallt hat. Die "Ready"-Mails die vorher kamen, waren wahrscheinlich von einem früheren Code-Stand mit anderer Logik.

**Log-Auszug**
```
[moodleUser] createDemoUser attempt 1/3 failed:
  stdout: Could not open input file: admin/cli/create_user.php
```

**Fix**
Temporäres PHP-Script in den Moodle-Dir schreiben (der via `MOODLE_DOCKER_WWWROOT` im Container als `/var/www/html` gemountet ist), dann per `docker exec webserver php <script>` aufrufen. Das Script benutzt Moodle's native `user_create_user()` + `user_update_user()` + `$auth->user_update_password()` APIs. Analog für `enrollUserInDemoCourse` mit `enrol_get_plugin('manual')->enrol_user()`.

Script wird nach Ausführung via try/finally wieder entfernt, auch bei Fehlern.

Deployed im Commit TBD.

---

### bug18 Snapshot-Restore macht kein DB-weites URL-Rewrite

Feature: feat05
Status: **fixed 2026-04-09** (src/services/snapshot.ts + src/services/docker.ts)
Entdeckt: 2026-04-09 beim Schreiben des task19-Runbooks

**Description**
`restoreSnapshot()` machte kein Search-Replace auf die DB-Inhalte. Moodle speichert absolute URLs in diversen Tabellen (`mdl_log`, `mdl_grade_items`, `mdl_backup_controllers`, atto-editor-Inhalte in `mdl_*.intro`-Feldern). Nach einem Snapshot-Restore zeigten diese noch auf den Seed-Host.

**Fix (2026-04-09)**
Neuer Schritt 3 in `restoreSnapshot()`:
1. Alte wwwroot direkt aus `mdl_config WHERE name='wwwroot'` lesen (nach dem Dump-Import, vor dem Sessions-Truncate)
2. Mit der neuen Instanz-URL vergleichen
3. Falls abweichend: `admin/tool/replace/cli/replace.php --search=<old> --replace=<new>` aufrufen — Moodles eigenes Search-Replace-Tool das alle Spalten kennt inkl. BLOB-Codierungen
4. Fehler werden geloggt aber NICHT weitergegeben (wwwroot kommt aus config.php, Restore ist auch ohne Rewrite funktional)

Zusätzlich: `$CFG->tool_replace_allowdb = true` in den Override-Block in `patchConfigForProduction()` aufgenommen, damit das CLI-Tool freigeschaltet ist.

Leitnerflow-v1-Snapshot: Das Rewrite findet einen Diff zwischen dem Seed-URL und dem neuen Instanz-URL und führt den Replace durch. Bei clean seeds (keine File-Uploads, keine eingebetteten Bilder) ist das eine No-Op auf Inhaltsebene, räumt aber trotzdem Log-Einträge auf.

---

## 🧪 Tests

---

### bug19 TypeScript-Build schlug fehl: express-basic-auth fehlte

Feature: infra
Status: **fixed 2026-04-19** (npm ci)
Entdeckt: Code-Review 2026-04-19

**Description**
`npm run build` brach mit `TS2307: Cannot find module 'express-basic-auth'` ab.
`express-basic-auth` war in `dependencies` deklariert, aber die `node_modules/` waren
nicht installiert (kein `npm ci` nach letztem Clone oder Env-Wechsel).
`express-basic-auth` liefert keine eigenen TypeScript-Deklarationen — daher fehlen
Typen auch nach `npm ci` ohne weitere Maßnahmen, aber `skipLibCheck: true` im
`tsconfig.json` verhindert Typ-Fehler aus transitiven Depencencies. Eigener Import-Fehler
wird durch das fehlende Modul selbst verursacht, nicht durch die Typen.

**Fix**
`npm ci` ausgeführt — alle Abhängigkeiten installiert. Build läuft seitdem fehlerfrei.

**Prävention**
→ siehe Devflow-Abschnitt "Local Dev Quickstart" in `03-dev-doc.md`. CI-Workflow
(`deploy.yml`) führt `npm ci` bereits aus, trifft also Production nicht.

---

### bug20 mysql-Passwort im Shell-Log sichtbar (mysqldump / mysql)

Feature: feat05
Status: **open** (low risk, VPS-intern)
Entdeckt: Code-Review 2026-04-19

**Description**
`snapshot.ts` und `docker.ts` bauen Shell-Befehle mit hartem Passwort in der Kommandozeile:
```
mysqldump -u moodle -pm@0dl3ing moodle | gzip > …
mysql -u moodle -pm@0dl3ing moodle
mysqladmin -u root -proot ping
```
Passwörter erscheinen in `/proc/<pid>/cmdline`, `ps aux`-Output und im Node-stderr-Log.

**Risiko**
Niedrig: VPS-interne Demo-Instanzen, Passwörter gelten nur für die kurzlebige
MariaDB-Container-Instanz, kein externer Zugriff. Kein Production-Daten-Exposure.

**Workaround**
`MYSQL_PWD`-Umgebungsvariable oder `--defaults-file=/tmp/my.cnf` würde das Passwort
aus dem Prozess-Cmdline entfernen. Für MVP akzeptiert; Track als Hardening-Item.

---

### bug21 Shell-Injektion in cleanup.ts: docker rm -fv mit ungepaddeten Namen

Feature: cleanup
Status: **open** (low risk, intern)
Entdeckt: Code-Review 2026-04-19

**Description**
`cleanup.ts` baut `docker rm -fv ${names.join(' ')}`. Container-Namen kommen aus
`docker ps --format '{{.Names}}'` mit einem Filter — aber ein Container-Name mit Leerzeichen
oder Shell-Metazeichen würde zu ungültigem Command führen. In der Praxis generiert
`composeProject` nur `[a-z0-9-]`-Namen, daher kein realer Exploit-Pfad.

**Fix**
Defensive Absicherung: Namen durch `names.map(n => n.replace(/[^a-z0-9._-]/gi, ''))` filtern
oder als separate Array-Argumente via `execFileAsync` übergeben.

---

### test01 Verify: config.php nach Patch

Feature: feat02
Result: pending

**Steps**
1. `provisionInstance()` auf lokalem Server ausführen
2. `cat {instanceDir}/moodle/config.php` lesen
3. Prüfen: kein `$port = getenv(...)` Block vorhanden
4. Prüfen: keine einsame `}` auf eigenständiger Zeile
5. Prüfen: `$CFG->wwwroot` enthält `https://{id}.demo.eledia.ai`

---

### test02 Verify: HTTPS-Subdomain erreichbar

Feature: feat03
Result: pending

**Steps**
1. Demo-Instanz starten
2. `curl -I https://{id}.demo.eledia.ai` ausführen
3. Erwarteter Response: `200 OK` oder Moodle-Login-Redirect
4. Prüfen: kein Mixed-Content-Warning im Browser
5. Prüfen: HTTP-URL → 301 auf HTTPS

---

### test03 End-to-End Demo-Flow

Feature: feat01
Result: **passed 2026-04-09** (Johannes, E2E aus Snapshot `leitnerflow-v1`)

**Steps**
1. `POST /request-demo` mit gültiger E-Mail + configId
2. Bestätigungs-E-Mail empfangen → Token-Link prüfen
3. Token-Link aufrufen → Loading-Page erscheint
4. Warten bis "Demo bereit"-E-Mail eintrifft
5. Demo-Link öffnen → Moodle mit Plugin sichtbar
6. Mit Demo-Nutzer einloggen
7. Plugin in Moodle navigieren

**Expected**
Kompletter Flow ohne manuellen Eingriff, Demo startet in < 90 Sekunden.

**Ergebnis 2026-04-09**
Flow komplett durchgelaufen. Cold-Start aus Snapshot nur wenige Sekunden statt 3–5 Min. Alle drei Accounts (admin/teacher/student) funktionieren. Kleinerer UI-Befund in der Creds-Box (Spacing + Wording) → siehe task28.
