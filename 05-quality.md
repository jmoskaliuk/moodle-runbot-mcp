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
Status: open (task15)
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
task15: `provisionInstance()` hängt nach dem Template-Copy einen Override-Block vor `require_once('/lib/setup.php')` ein. `composeEnv()` setzt zusätzlich `MOODLE_DOCKER_WEB_HOST` für Werkzeuge wie Behat, die den Host direkt lesen.

---

### bug07 plugin-detail.html: undefined MCP-Variable

Feature: feat01 (Webui)
Status: open (task17)
Entdeckt: Code-Review 2026-04-09

**Description**
`webui/plugin-detail.html` (~Z. 736) ruft `fetch(MCP, ...)`, aber `MCP` ist nirgends deklariert. Im Script ist nur `const API = window.location.origin` definiert. Ein Klick auf "Demo starten" auf der Detailseite erzeugt `ReferenceError: MCP is not defined`.

**Expected**
`fetch(\`${API}/api/request-demo\`, ...)` — konsistent mit demo-portal.html.

**Fix**
task17: Wie demo-portal.html → `API` benutzen, `startDemo()` muss zusätzlich den kompletten request-demo-Flow aufrufen, nicht `instance_start` direkt.

---

### bug08 plugin-detail.html: startDemo umgeht E-Mail-Flow

Feature: feat01 (Webui)
Status: open (task17)
Entdeckt: Code-Review 2026-04-09

**Description**
`startDemo()` in `plugin-detail.html` ruft `mcpCall('instance_start', ...)` direkt auf. Das ist das interne MCP-Tool, das sofort eine Instanz startet — ohne E-Mail-Bestätigung, ohne Token, ohne Rate-Limit, ohne Missbrauchsschutz. Die komplette `/request-demo → confirm → demo-ready`-Kette wird übersprungen.

**Expected**
Die Detailseite öffnet dasselbe Modal wie demo-portal.html und postet auf `/api/request-demo`.

**Fix**
task17: Modal aus demo-portal.html extrahieren oder duplizieren, plugin-detail.html um den Flow erweitern.

---

### bug09 tools/instances.ts: instanceUrl() ist http

Feature: feat03
Status: open (task16)
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
task16: `http://` → `https://` wenn `BASE_DOMAIN` gesetzt.

---

### bug10 demo-portal.html: statPlugins-ID existiert nicht

Feature: feat01 (Webui)
Status: open (task18)
Entdeckt: Code-Review 2026-04-09

**Description**
Code ruft `document.getElementById('statPlugins')` auf, aber das Element im DOM heißt `statActive`. Der Stat wird nie aktualisiert. Zusätzlich ist die Hero-Stat "Plugins verfügbar" hardcoded auf `6`, obwohl `configs.json` nur einen Eintrag enthält.

**Fix**
task18: ID konsistent auf `statActive` bringen, Hardcoded-6 durch `configs.length` ersetzen.

---

### bug11 demo-portal.html: globales `function close()`

Feature: feat01 (Webui)
Status: open (task18)
Entdeckt: Code-Review 2026-04-09

**Description**
`webui/demo-portal.html` deklariert ein globales `function close()`, das `window.close` schattet. Kann Browser-Interaktionen oder Libraries brechen.

**Fix**
task18: Umbenennen in `closeModal()`.

---

### bug12 plugin-detail.html: Hero-Title/Desc Copy-Paste

Feature: feat01 (Webui)
Status: open (task17)
Entdeckt: Code-Review 2026-04-09

**Description**
`loadPluginData()` setzt `heroTitle.textContent = cfg.description` und `heroDesc.textContent = ''`. Der Titel sollte der Plugin-Name (oder ein Marketing-Headline) sein, die Description gehört darunter.

**Fix**
task17: `heroTitle = cfg.name`, `heroDesc = cfg.description`.

---

### bug13 configs.json snapshotId null → 3–5 Min Fresh-Install

Feature: feat01, feat05
Status: open (task19)
Entdeckt: Code-Review 2026-04-09

**Description**
`configs.json` → `leitnerflow.snapshotId = null`. Jeder Demo-Start läuft durch `install_database.php` (3–5 Min frisch). Die Loading-Page animiert aber 5 Schritte à 10s (~50s) und die Bestätigungs-E-Mail verspricht "1–2 Minuten".

**Fix**
task19: Snapshot `leitnerflow-v1` auf VPS bauen, in configs.json referenzieren.

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
Status: open (task20)
Entdeckt: Code-Review 2026-04-09

**Description**
Wenn der Node-Prozess während einer Provisionierung abstürzt, bleiben Docker-Container + `runbot-*`-Compose-Projekte + `/opt/runbot/demo-*`-Verzeichnisse + nginx-Configs zurück. Der Cleanup-Scheduler findet sie nicht, weil kein Registry-Eintrag existiert.

**Fix**
task20: Beim Server-Start `docker ps --filter "name=runbot-"` gegen `registry.json` abgleichen und Waisen entfernen. Zusätzlich `nginx.cleanupAllConfigs()` aufrufen — die Funktion existiert bereits, wird aber nirgends gecallt.

---

## 🧪 Tests

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
Result: pending

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
