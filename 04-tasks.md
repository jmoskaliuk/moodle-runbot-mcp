# Tasks

## Meta

Operatives Zentrum des Projekts. Hier beginnt jede Session.
Enthält: neue Beobachtungen, Tasks, Klärungsbedarf, aktive Arbeit, Verifikationsschritte.

---

## ✍️ Quick-Capture für Johannes

Neue Bugs und Feature-Ideen einfach unten in die passende Sektion kopieren.
Du musst nicht perfekt schreiben — halbfertig ist besser als nichts. Claude
liest diese Sektionen beim nächsten Task automatisch und formuliert bei
Bedarf aus, fragt nach, oder erstellt daraus ausgearbeitete Task-Einträge.

**Bug-Template (unter `## 🐞 Bugs` einfügen):**

```markdown
### bugXX <kurzer Titel>
Status: open
Entdeckt: 2026-04-09
Betroffen: <Datei/Feature/URL falls bekannt>
Repro: <was hast du gemacht, was ist passiert, was hättest du erwartet>
Workaround: <falls du einen hast, sonst leer>
```

**Feature-Template (unter `## 💡 Ideen` einfügen oder direkt nach `01-features.md` → `featXX`):**

```markdown
### ideaXX <kurzer Titel>
Datum: 2026-04-09
Wunsch: <ein Satz — was soll das Produkt tun>
Warum: <kurz — welches Problem löst es>
Offen: <was ist dir noch unklar>
```

Für größere Features lieber direkt in `01-features.md` als `featXX`-Block
(dort steht ein analoges Template oben).

---

## 🐞 Bugs

*(Neue Bug-Beobachtungen hier reinkippen — Claude sortiert und priorisiert
im nächsten Task. Format siehe Quick-Capture oben.)*

---

## 💡 Ideen

*(Halbgare Feature-Gedanken hier. Sobald konkret genug, wandern sie in
`01-features.md` als `featXX`-Block.)*

### idea: nginx-Config sauber aufräumen

Der nginx vor dem Node-Backend proxyt `/api/*` mit trailing-slash
(`proxy_pass http://127.0.0.1:3000/;`) und strippt dadurch den
`/api/`-Präfix vor dem Forward an Express. Das ist der Grund für die
sonderbaren Alias-Routen in `src/index.ts` (`/demo-status/:token`
neben `/api/demo-status/:token`, `/plugininfo/:id` neben
`/api/plugininfo/:id`, historisch auch `/configs` neben
`/api/configs`). Wir haben uns bereits zweimal daran geschnitten:

- Plugin-Detail-Seite: Bis 2026-04-09 wurde `loadPluginData()` still
  mit einer HTML-Antwort statt JSON gefüttert, weil `/api/plugin/:id`
  nach dem Strip als `/plugin/:id` den HTML-Handler getroffen hat.
- Warteseite: Bis 2026-04-09 zeigte sie "Ihre Demo-Anfrage ist
  abgelaufen", weil `/api/demo-status/:token` nach dem Strip auf
  eine nicht existierende Route lief (3x 404 → Error-State).

Beides wurde mit Aliasen entschärft (commit `bd878b9`), aber die
eigentliche Ursache sitzt in `/etc/nginx/sites-enabled/runbot.conf`.
Cleanup-Vorschlag: `proxy_pass http://127.0.0.1:3000;` (ohne
trailing slash) → nginx reicht den vollständigen Pfad durch, Aliase
entfallen. Muss ein Wartungsfenster sein, damit wir die Config mit
`nginx -t` validieren und notfalls auf den Backup zurückfallen können
(`/tmp/runbot-last-failed-nginx.conf`). Low-risk, aber aktuell nicht
pressing — die Aliase funktionieren.

---

## 🆕 New

*(Neue Ideen, Beobachtungen, ungefilterte Einträge hier)*

**Code-Review 2026-04-09** — Vollständiger Durchgang durch Services, Tools, Webui, Setup + Deploy ergab 12 neue/reopened Findings (bug02, bug04 partial, bug06–17). Details in `05-quality.md`. Daraus abgeleitete Tasks: task14–task20. Kritische Bundle für HTTPS-Pfad: task14 + task15 (zusammen bearbeiten, da isoliert nicht testbar).

**Feature-Ideen 2026-04-09 (Johannes)** — Nach dem ersten End-to-End-Test kamen diese Wünsche auf: Live-Status auf der Warteseite mit Demo-Start-Button und Credentials (feat09 → task22), besseres Logo + Navigation + Sprachtoggle (task21), Plugin-Icons aus GitHub (feat13 → task23), Multi-User-Demos mit Admin/Teacher/Student (feat10 → task24), Admin-Dashboard für laufende Instanzen (feat11 → task25), Code-basierte Demo-Verlängerung auf 1 Tag (feat12 → task26).

---

## ❓ Clarification Needed

- **feat01:** Was passiert wenn Demo-Start fehlschlägt — bekommt der Nutzer eine Fehler-E-Mail? → task07

---

## 📋 Tasks

### task01 config.php-Patch korrekt implementieren
Status: done
Feature: feat02

Regex zum Entfernen des Port-Blocks ließ übrig `}` stehen.
Fix: `removePortBlock()` mit Brace-Counting implementiert.
`$CFG->wwwroot` wird jetzt auf HTTPS-Subdomain gesetzt.

---

### task02 nginx HTTPS konfigurieren
Status: reopened → task14
Feature: feat03

Ursprünglich als "done" markiert, aber Code-Review am 2026-04-09 hat ergeben: Fix war nie im Code angekommen (`src/services/nginx.ts` schreibt nur `listen 80`, kein 443-Block, keine SSL-Certs). Git log zeigt nur einen einzigen Commit für nginx.ts. → siehe task14.

---

### task03 feat04 dokumentieren
Status: done
Feature: feat04

Config-Format: `configs.json` im Root, `DemoConfig`-Struktur mit `plugin`, `snapshotId`, `visible`-Flag.
`03-dev-doc.md` und `01-features.md` aktualisiert.

---

### task04 feat05 Snapshot-System dokumentieren
Status: done
Feature: feat05

Snapshot: `.sql.gz` + `.json` unter `/opt/snapshots/`. pgsql + mariadb/mysql unterstützt.
Restore-Ablauf: DROP/CREATE DB → Import → wwwroot/dataroot setzen → Caches purgen.
`03-dev-doc.md` aktualisiert.

---

### task05 feat06 Cleanup-Scheduler dokumentieren
Status: done
Feature: feat06

Timeouts: 60 Min max, 15 Min Inaktivität, 60s Polling-Interval — alle via Env konfigurierbar.
Cleanup-Sequenz vollständig dokumentiert. `01-features.md` und `03-dev-doc.md` aktualisiert.

---

### task06 feat07 Demo-Nutzerverwaltung dokumentieren + Passwort klären
Status: done
Feature: feat07

Passwort: `demo1234` (hardcoded). Wird aktuell nicht in E-Mail mitgeschickt → bug03 offen.
Demo-Kurs shortname: `"demo"`. `03-dev-doc.md` und `01-features.md` aktualisiert.

---

### task07 Fehler-E-Mail bei fehlgeschlagenem Demo-Start
Status: done
Feature: feat01

`sendErrorEmail()` in `email.ts` implementiert (gleiches Design wie Bestätigungs-E-Mail).
In `index.ts` catch-Block eingebaut — non-fatal (eigener try/catch für E-Mail-Versand).

---

### task08 Demo-Portal Frontend
Status: done
Feature: feat01

`webui/` mit `demo-portal.html`, `plugin-detail.html`, `index.html` bereits vorhanden.
Bugs behoben: `runFlow()` (nicht definiert, JS-Fehler) entfernt, tote MCP-Direktstart-Reste
(`drawSteps`, `bar`, `mcp`-Helper) entfernt. API-URLs auf relative Pfade umgestellt
(`window.location.origin+'/api'` statt hartkodierter Domain).

---

### task10 Bug: instance.url HTTP statt HTTPS
Status: done
Feature: feat01, feat03

`index.ts:258` baute `http://` URL trotz HTTPS-nginx. Betraf Demo-E-Mail-URL und
`restoreSnapshot()` wwwroot-Patch. Fix: `https://` wenn `BASE_DOMAIN` gesetzt.

---

### task11 configs.json Pflichtfelder ergänzen
Status: done
Feature: feat04

`features[]` (Portal-Karten) und `db` (Instanz-Erstellung) fehlten.
Ohne `db` würde `startContainers()` crashen.

---

### task12 setup.sh Placeholder-URLs ersetzen
Status: done

`yourorg/moodle-runbot-mcp` → `jmoskaliuk/moodle-runbot-mcp`.
Default-Domain auf `demo.eledia.ai` gesetzt.

---

### task13 GitHub Actions CI/CD Workflow
Status: done

`.github/workflows/deploy.yml` erstellt: Push auf main → SSH deploy auf VPS
→ git pull + npm ci + npm run build + systemctl restart + health check.
Benötigt GitHub Secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.

---

### task09 End-to-End-Test: Demo-Flow
Status: open
Feature: feat01, feat02, feat03

Vollständigen Flow einmal auf dem Server durchspielen:
1. POST /request-demo → E-Mail empfangen
2. Token-Link klicken → Loading-Page
3. "Demo bereit"-E-Mail empfangen
4. Demo-URL öffnen → Moodle + Plugin sichtbar
5. Nach Inaktivität: Instanz automatisch gestoppt

---

### task14 nginx HTTPS + Wildcard-Cert verwenden (Bundle mit task15)
Status: deployed, awaiting manual verify
Feature: feat03
Bugs: bug02

**Deploy 2026-04-09:** Commit `770dd46` via GitHub Actions Run #20 (41s) erfolgreich auf VPS deployed. Health-Check auf `localhost:3000/health` grün. Code ist auf `/opt/moodle-runbot-mcp`, Service `moodle-runbot` neugestartet.

`src/services/nginx.ts` generiert aktuell nur einen `listen 80`-Block. Umstellen auf:
1. HTTP-Block (Port 80) → `return 301 https://$host$request_uri;` (nur für ACME-Challenges Passthrough, Rest redirect)
2. HTTPS-Block (Port 443) mit:
   - `ssl_certificate ${CERT_DIR}/fullchain.pem;`
   - `ssl_certificate_key ${CERT_DIR}/privkey.pem;`
   - `proxy_pass http://127.0.0.1:${port};`
   - `proxy_set_header X-Forwarded-Proto https;`
3. `CERT_DIR` per Env `SSL_CERT_DIR` überschreibbar, Default `/etc/letsencrypt/live/${BASE_DOMAIN}`.

Zusätzlich Pre-Flight-Check: wenn `fullchain.pem` nicht existiert, ausführliches `console.error()` mit Hinweis auf `certbot certonly --manual --preferred-challenges dns -d '*.${BASE_DOMAIN}'`.

Wildcard-Cert selbst bleibt manuell (DNS-01-Challenge erfordert interaktive DNS-Bearbeitung). In setup.sh den Hinweis prominent machen.

---

### task15 docker.ts: $CFG->wwwroot + sslproxy patchen (Bundle mit task14)
Status: deployed, awaiting manual verify
Feature: feat02, feat03
Bugs: bug06, bug14

**Deploy 2026-04-09:** Commit `770dd46`. `patchConfigForProduction()` schreibt Override-Block VOR `require_once('/lib/setup.php')`. Verifizierung erfordert echte Demo-Provisionierung (siehe "Verify After Deploy" Abschnitt).

`src/services/docker.ts` → `provisionInstance()` patcht `config.php` nach dem Template-Copy:
1. `composeEnv()` setzt `MOODLE_DOCKER_WEB_HOST = ${instance.id}.${BASE_DOMAIN}` (für Werkzeuge wie Behat, die den Host direkt lesen).
2. Override-Block VOR `require_once(__DIR__ . '/lib/setup.php');` einfügen:
   ```php
   // ── eLeDia Runbot overrides ─────────────────────
   $CFG->wwwroot  = 'https://${instance.id}.${BASE_DOMAIN}';
   $CFG->sslproxy = true;
   // ────────────────────────────────────────────────
   ```
3. Fallback: wenn `require_once(...setup.php...)` nicht gefunden wird → Warning loggen und Block am Ende anfügen.
4. 03-dev-doc.md Abschnitt feat02 korrigieren: `removePortBlock()` existiert nicht; stattdessen Override-Block dokumentieren.

Approach gewählt weil: sauberer als Regex-basiertes Port-Block-Entfernen, robust gegen Template-Änderungen in zukünftigen moodle-docker Versionen.

---

### task16 tools/instances.ts: instanceUrl() auf https
Status: deployed
Feature: feat03
Bugs: bug09

`src/tools/instances.ts:19-22` → `instanceUrl()` muss `https://` bei gesetztem `BASE_DOMAIN` liefern, analog zu `src/index.ts:292`. Best practice: Helper in `src/services/registry.ts` oder neuem `src/services/urls.ts` zentralisieren statt an zwei Stellen duplizieren.

---

### task17 plugin-detail.html: MCP-Variable + Demo-Flow-Integration
Status: open
Feature: feat01 (Webui)
Bugs: bug07, bug08, bug12

1. `fetch(MCP, ...)` → `fetch(\`${API}/api/request-demo\`, ...)` (MCP war undefined)
2. `startDemo()` umbauen: darf nicht `instance_start` direkt aufrufen. Stattdessen dasselbe Modal wie demo-portal.html öffnen, POST auf `/api/request-demo`, "Bitte prüfen Sie Ihr Postfach" anzeigen.
3. `heroTitle` ↔ `heroDesc` Copy-Paste beheben.
4. Hardcoded deutsche Strings auf `data-i18n` umstellen.
5. Plugin-Detail-Seite in demo-portal.html verlinken (Details-Button auf Karten).

---

### task18 demo-portal.html: Hero-Stat + globales close() beheben
Status: partial (bug11 fixed, bug10 offen)
Feature: feat01 (Webui)
Bugs: bug10, bug11

1. `statPlugins` → `statActive` (ID-Mismatch). — offen
2. Hardcoded `6` → `configs.length`. — offen
3. `function close()` → `closeModal()`. — **fixed 2026-04-09** (Hotfix nach User-Report)

---

### task19 Snapshot leitnerflow-v1 auf VPS erstellen
Status: runbook ready (requires VPS access)
Feature: feat01, feat05
Bugs: bug13

**Voraussetzung:** task14/15 müssen verified sein, sonst läuft die Seed-Instanz nicht über HTTPS und das könnte die Moodle-URLs im Snapshot verschmutzen.

**Runbook (auf VPS ausführen):**

```bash
# 1) Seed-Instanz über HTTP-API starten (NICHT über request-demo, sonst Token-Dance)
curl -sX POST http://localhost:3000/mcp/call \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"instance_start","arguments":{"configId":"leitnerflow","owner":"seed@eledia.ai"}}' \
  | jq .
# Warten bis status=running (ca. 90-180s bei leerem Cache)
```

```bash
# 2) Demo-Daten anlegen: Kurs "demo-leitnerflow", Testnutzer, 2-3 befüllte Kartensets
#    Manuell über Browser auf https://<instance-id>.demo.eledia.ai als admin:
#    - Site administration → Courses → Add new course "Demo LeitnerFlow"
#    - LeitnerFlow-Aktivität hinzufügen, mit 10-15 Beispielkarten vorbefüllen
#    - Testnutzer "demo1" / "Demo-Password123!" anlegen, in Kurs einschreiben
#    - Einmal "Karten lernen" durchlaufen damit Attempt-History existiert
```

```bash
# 3) Snapshot erstellen (MCP-Tool)
INSTANCE_ID="demo-seed-xxxxxx"  # aus Schritt 1
curl -sX POST http://localhost:3000/mcp/call \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"snapshot_create\",\"arguments\":{\"instanceId\":\"$INSTANCE_ID\",\"snapshotId\":\"leitnerflow-v1\",\"description\":\"LeitnerFlow Demo mit Beispielkurs und -karten\"}}" \
  | jq .

# 4) Snapshot verifizieren
ls -lah /opt/snapshots/leitnerflow-v1*
# Erwartung: leitnerflow-v1.sql.gz (~2-5 MB) + leitnerflow-v1.json (Metadaten)

curl -sX POST http://localhost:3000/mcp/call \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"snapshot_list","arguments":{}}' \
  | jq .
```

```bash
# 5) Seed-Instanz kann jetzt gestoppt werden
curl -sX POST http://localhost:3000/mcp/call \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"instance_stop\",\"arguments\":{\"instanceId\":\"$INSTANCE_ID\"}}"
```

**6) configs.json anpassen (im Repo, nicht auf VPS):**

In `configs.json` den `leitnerflow`-Eintrag ändern:
```diff
-  "snapshotId": null,
+  "snapshotId": "leitnerflow-v1",
```
Commit + Push → GitHub Actions deployed auf VPS.

**7) End-to-End-Test:**
- Über https://demo.eledia.ai eine Demo für LeitnerFlow anfordern
- E-Mail klicken → Ladeseite
- Zeit bis "Demo bereit" messen; Ziel: < 90s (statt ~3min bei Neuprovisionierung)
- In der fertigen Demo prüfen ob Seed-Kurs "Demo LeitnerFlow" vorhanden ist
- Loading-Page-Schritte 3/5 ("Kurs vorbereiten...") passt dann inhaltlich

**Fallstricke:**
- Snapshot enthält die `$CFG->wwwroot` der Seed-Instanz. Wenn `wwwroot` als Absolut-String in Moodle-Logs/Sessions/Events gelandet ist, muss `snapshot_restore()` die URL umschreiben. Prüfen ob `src/services/snapshot.ts` das macht — falls nicht, neuer Bug.
- Dateien in `moodledata/` werden im Snapshot NICHT mitgenommen (nur DB). Das ist ok für LeitnerFlow, aber falls der Seed-Kurs Bilder enthält, werden die fehlen. Entweder keine Bilder verwenden oder `moodledata` mitsnapshoten (eigener Task).

---

### task20 Startup-Cleanup für Orphan-Container
Status: open
Feature: feat06
Bugs: bug17

Beim Start von `src/index.ts`:
1. `docker ps --format '{{.Names}}' --filter "name=runbot-"` ausführen
2. Mit `registry.listInstances()` vergleichen
3. Container ohne Registry-Eintrag → `docker compose down -v` + `rm -rf /opt/runbot/<id>` + nginx-Config entfernen
4. `nginx.cleanupAllConfigs()` aufrufen (Funktion existiert bereits, wird nirgends gecallt)
5. Log-Line mit Anzahl entfernter Waisen

---

### task21 Demo-Portal UI-Polish: Logo, Navigation, Sprachtoggle
Status: done (2026-04-09)
Feature: feat01 (Webui)

UI-Verbesserungen am `webui/demo-portal.html` und `webui/plugin-detail.html`:

1. **Logo-Bereich:** Textmarke "eLeDia.runbot" ergänzend zum Bild-Logo. Das Bild allein wird auf kleinen Bildschirmen zu klein erkennbar; Textmarke + Bild = besserer Wiedererkennungswert.
2. **Navigation:** Mehr Luft zwischen Links, Hover-State deutlicher, Sprachtoggle visuell vom Menü trennen (eigene Sektion rechts, kein Nav-Item).
3. **DE/EN-Toggle:** Größer, prominenterer Kontrast, Flaggen-Icons (🇩🇪 🇬🇧) davor. Aktuell versteckt in dunkler Pille im Nav.
4. **Footer-Logo-Größe** angleichen.

---

### task22 Warteseite: Live-Status-Polling + Demo-Start-Button + Credentials
Status: done (2026-04-09) — Backend + Polling + Credentials-Box + Öffnen-Button deployed. Verifizierung via frischen Demo-Request steht aus.
Feature: feat09

**Backend (src/index.ts, src/services/tokens.ts, src/types.ts):**
1. `DemoRequest` um optionales `phase` Feld erweitern.
2. Während `/confirm/:token` Hintergrund-Handler setzt `request.phase` an den entscheidenden Stellen: `provisioning` → `starting_containers` → `restoring_snapshot` → `creating_user` → `running`.
3. Neuer Endpoint: `GET /api/demo-status/:token` → liest Token, mapped auf `{status, phase, url, username, password, pluginName}`. Keine Auth (Token ist schon der Auth).
4. Passwort zentral: Konstante `DEMO_PASSWORD` in `moodleUser.ts` exportieren, im API-Endpoint wiederverwenden.

**Frontend (src/index.ts → buildLoadingPage):**
5. Token als inline JS-Konstante in die Seite schreiben.
6. Polling via `setInterval` alle 3s auf `/api/demo-status/:token`.
7. Phase → Step-Highlighting: echte Status, nicht mehr der Timer-Fake.
8. Bei `status === 'ready'`:
   - Credentials-Box einblenden (E-Mail, `demo1234`, "In Zwischenablage kopieren" Button)
   - "Demo öffnen"-Button (primary, öffnet url im neuen Tab)
   - `document.title` auf "Ihre Demo ist bereit — eLeDia.runbot" setzen
9. Bei `status === 'error'`: Fehlerbox mit Link zurück zum Portal.

**Decisions**
- Polling-Intervall: 3s hart (Env `DEMO_STATUS_POLL_MS` overridebar)
- Keine WebSockets/SSE — zusätzliche Abhängigkeit, nicht nötig
- Status-Mapping: Phase ist authoritativ, URL erst wenn `status === "running"` gesetzt

---

### task23 Plugin-Icon aus GitHub Repo holen
Status: done (2026-04-09) — `resolvePluginIconUrl()` in github.ts, `/api/plugin/:id` liefert `iconUrl`, plugin-detail.html rendert Icon im Preview-Header + Modal. Fallback auf Emoji bei Fehler.
Feature: feat13

**Konzept:** Viele Moodle-Plugins haben ein `pix/monologo.svg` oder `pix/icon.png` im Default-Branch. Das ist das Standard-Plugin-Icon von Moodle. Wir können das im Portal als echtes Icon statt Emoji verwenden.

**Schritte:**
1. `src/services/github.ts` → neue Funktion `resolvePluginIconUrl(ownerRepo, defaultBranch)`:
   - Versucht in dieser Reihenfolge:
     - `pix/monologo.svg`
     - `pix/monologo.png`
     - `pix/icon.svg`
     - `pix/icon.png`
   - Via HEAD-Request auf `https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}`
   - Liefert die erste 200-antwortende URL, sonst `null`
   - Im `fetchPluginData`-Ergebnis unter `repo.iconUrl` aufnehmen
2. `plugin-detail.html` + `demo-portal.html` → wenn `iconUrl` vorhanden, `<img>` statt Emoji rendern.
3. Cachen (über das bestehende 1h-Cache in github.ts).

**Fallstricke:**
- Rate-Limiting: 4 HEAD-Requests pro Plugin-Detail-Fetch. Bei vielen Plugins: Batch vermeiden, serielle Versuche.
- raw.githubusercontent.com redirected bei großen Repos → `fetch()` in Node mit `redirect: 'follow'` nutzen.
- Icons können PNG sein → im Frontend als `<img>` anzeigen, NICHT inline SVG.

---

### task24 Rollenbasierte Demo-Szenarien (Admin/Teacher/Student)
Status: in progress (Snapshot-Fix erforderlich)
Feature: feat10

**Entscheidung (2026-04-09, Johannes):** Option A — Drei vordefinierte
Accounts im Snapshot, manueller Login, identisches Passwort. Kein Auto-Login,
kein Rollen-Switcher im MVP. Die E-Mail-Adresse des Interessenten taucht
nirgends als Moodle-Username auf.

**Scope:**
1. `src/index.ts` — `createDemoUser` + `enrollUserInDemoCourse` Calls entfernt ✓
2. `src/index.ts` — `/api/demo-status/:token` sendet `accounts: ["admin","teacher","student"]` statt `username: request.email` ✓
3. `buildLoadingPage` — Creds-Box zeigt `admin · teacher · student` + statisches Passwort-Label ✓
4. `sendConfirmationEmail` + `sendDemoReadyEmail` — Login-Zeile ersetzt durch Accounts-Zeile ✓
5. **Snapshots überarbeiten:** Alle bestehenden Snapshots (leitnerflow-v1, etc.) müssen die drei Accounts enthalten.
   - `admin` (Site-Administrator, Passwort `demo1234`)
   - `teacher` (Teacher im Demo-Kurs, Passwort `demo1234`)
   - `student` (Student im Demo-Kurs, Passwort `demo1234`)
   - Alle drei sind im Demo-Kurs eingeschrieben mit den passenden Rollen
6. **Config-Flag** `multiUser?: boolean` in `PluginConfig` (Default `true`) — für zukünftige Single-Account-Plugins als Opt-Out
7. **Snapshot-Doku** (`03-dev-doc.md`): Schritt hinzufügen "Accounts anlegen bevor `pg_dump`"
8. **Moodle-Default-Admin:** In alten Snapshots wurde der Admin von moodle-docker aus `MOODLE_DOCKER_PHPUNIT_*` gezogen. Neu: expliziter Seed mit den drei Accounts.

**Pending:**
- Snapshot leitnerflow-v1 regenerieren mit den drei Accounts (VPS-Job, siehe task19)

**Non-goals (weiterhin):**
- Kein Rollen-Switcher im Portal (Phase 2)
- Kein Auto-Login via Webservice-Token (Phase 2)
- Keine individuellen Passwörter pro Rolle

---

### task25 Admin-Dashboard für laufende Instanzen
Status: open
Feature: feat11

**Entscheidung (2026-04-09, Johannes):** HTTP Basic Auth reicht für den MVP
— die Daten sind nicht kritisch. GitHub OAuth / SSO erst in Phase 2.

**Scope MVP:**
1. Neue Route `GET /admin` → serve `webui/admin.html` (neue Datei)
2. `webui/admin.html`: Tabelle aller Instanzen + Tabelle aller aktiven Tokens
3. API-Endpoints (alle hinter Basic-Auth-Middleware):
   - `GET /api/admin/instances` → Liste aus `registry.listInstances()` angereichert mit Request-Info
   - `POST /api/admin/instances/:id/extend` → ruft `instance_extend` Tool intern auf
   - `DELETE /api/admin/instances/:id` → ruft cleanup intern auf
   - `GET /api/admin/instances/:id/logs` → `docker compose logs --tail 50`
   - `GET /api/admin/tokens` → alle Einträge aus `tokens.json`
4. **Auth-Middleware:**
   - `app.use('/admin', basicAuth({ users: { admin: ADMIN_PASSWORD } }))`
   - `app.use('/api/admin', basicAuth(...))`
   - `ADMIN_PASSWORD` Env-Variable — Server startet nicht ohne (throw im Bootstrap)
   - Dependency: `express-basic-auth` (npm)
5. Minimale UI: Tabelle mit Aktions-Buttons, kein Fancy-Framework, gleiches Design-System wie demo-portal.html

**Non-goals (MVP):**
- Kein GitHub OAuth (Phase 2)
- Kein 2FA, kein Audit-Log
- Keine Dark-Mode
- Keine Instance-Creation von Hand (der Flow bleibt Self-Service)
- Keine Rollen-Verwaltung für Admins
- Keine CSRF-Tokens (Same-Origin + Basic Auth reicht für internes Tool)

---

### task26 Code-basierte Demo-Verlängerung
Status: open
Feature: feat12

**Entscheidung (2026-04-09, Johannes):**
- Codes werden **pre-generated** und auf Anfrage an spezielle Kunden /
  Trainingsteilnehmer ausgegeben (manuell, kein Self-Service).
- **Alle Codes haben im MVP dieselbe Laufzeit: 1 Tag (1440 Min).**
- Format im Env wird vereinfacht: `EXTEND_CODES=EDUMA2026,PRIVATE,TRAIN01`
  (Komma-getrennte Code-Namen, kein `:MINUTEN`-Suffix mehr — TTL ist global).

**Scope:**
1. Env-Variable `EXTEND_CODES` parsen: Komma-getrennte Liste von Code-Namen
2. Globale Konstante `EXTEND_CODE_TTL_MINUTES = 1440` (überschreibbar via `EXTEND_CODE_TTL_MINUTES` Env)
3. Neues Feld in `MoodleInstance`: `extendedBy?: {code: string, at: string}` (nur 1x pro Instanz verwendbar)
4. Neue Route `POST /api/extend-code` mit Body `{token: string, code: string}`:
   - Token → Request → instanceId → Instance laden
   - Code in `EXTEND_CODES` nachschlagen (case-insensitive)
   - Wenn gültig und Instanz noch nicht verlängert: `instance.extendedBy` setzen, `instance.maxAgeMinutes = EXTEND_CODE_TTL_MINUTES` (override des globalen Defaults)
   - Antwort: `{ok: true, extendedUntil: "2026-04-10T16:30:00Z"}` oder `{error: "..."}`
5. Frontend (Warteseite + innerhalb der laufenden Demo irgendwo): kleines Eingabefeld "Verlängerungscode" im Footer oder in der Creds-Box
6. Cleanup-Scheduler muss individuelle `maxAgeMinutes` respektieren (nicht mehr nur global `DEMO_MAX_AGE_MINUTES`)

**Code-Generation-Workflow (manuell, Admin):**
```bash
# Neuen Code erzeugen (auf der Messe vor dem Event):
CODE=$(openssl rand -hex 4 | tr '[:lower:]' '[:upper:]')
echo $CODE  # → z.B. "A3F89B12"
# Im systemd-Service `EXTEND_CODES=EDUMA2026,A3F89B12` ergänzen + `systemctl restart moodle-runbot`
```

**Fallstricke:**
- Cleanup-Scheduler liest aktuell `DEMO_MAX_AGE_MINUTES` global. Für individuelle Max-Age brauchen wir `instance.maxAgeMinutes` als Override im Check.
- Codes könnten leaken → Admin muss Codes regelmäßig rotieren. Dokumentieren im Runbook.
- Wenn `extendedBy` gesetzt ist: das Feld `lastActivity` muss im Cleanup-Job so verstanden werden, dass die Verlängerung **ab dem Moment des Code-Einsatzes** zählt, nicht ab `createdAt`. Sonst wäre eine Instanz, die nach 58 Min verlängert wird, in 24h-2 Min schon wieder weg.

---

## 🔧 In Progress

- task19 leitnerflow-v1 Snapshot auf VPS erstellen (Runbook s.u.)

*(Tasks die gerade aktiv bearbeitet werden)*

---

## 🔎 Verify After Deploy

### task14 + task15 + task16 — manueller Check auf VPS

SSH auf VPS (`178.104.171.153`) und die folgenden Schritte durchgehen. Reihenfolge wichtig, denn Cert muss existieren bevor nginx-Config eine Chance hat.

**1. Wildcard-Cert-Präsenz**
```bash
ls -la /etc/letsencrypt/live/demo.eledia.ai/
# Erwartung: fullchain.pem und privkey.pem vorhanden
# Falls fehlend → siehe setup.sh Schritt 12 für DNS-01 Anleitung
openssl x509 -in /etc/letsencrypt/live/demo.eledia.ai/fullchain.pem -noout -text \
  | grep -A1 "Subject Alternative Name"
# Erwartung: DNS:*.demo.eledia.ai, DNS:demo.eledia.ai
```

**2. DNS-Wildcard-Eintrag**
```bash
dig +short test-xxx.demo.eledia.ai
# Erwartung: 178.104.171.153 (nur wenn A-Wildcard *.demo.eledia.ai existiert)
```

**3. MCP-Service läuft mit neuem Code**
```bash
systemctl status moodle-runbot | head -5
curl -sf http://localhost:3000/health
cd /opt/moodle-runbot-mcp && git log -1 --format='%h %s'
# Erwartung: 770dd46 fix: nginx HTTPS + wildcard cert awareness...
```

**4. End-to-End Demo-Provisionierung (eigentlicher Funktionstest)**

Eine Demo über die öffentliche Seite https://demo.eledia.ai anfordern mit einer echten Mail-Adresse. Dann auf VPS:
```bash
# nginx-Config für die neue Instanz (ID aus Logs nehmen)
INSTANCE=demo-xxxxxx
cat /etc/nginx/sites-enabled/runbot-$INSTANCE.conf
# Erwartung: listen 443 ssl http2; + ssl_certificate ...; + X-Forwarded-Proto https;

# Moodle config.php enthält Override-Block
docker exec runbot-${INSTANCE}_webserver cat /var/www/html/config.php \
  | grep -E "wwwroot|sslproxy"
# Erwartung:
#   $CFG->wwwroot  = 'https://demo-xxxxxx.demo.eledia.ai';
#   $CFG->sslproxy = true;

# HTTPS extern erreichbar
curl -I https://$INSTANCE.demo.eledia.ai
# Erwartung: HTTP/2 200 oder 303 auf /login/index.php
```

**5. Browser-Smoke-Test**
https://demo-xxxxxx.demo.eledia.ai aufrufen, einloggen, DevTools → Network: alle Requests müssen `https://` sein (kein Mixed-Content-Warning).

### Weitere offene Verify-Items

- [ ] nginx Pre-Flight: fehlende Cert-Files → Warning im Log, kein Crash (muss manuell durch Cert-Rename simuliert werden)
- [ ] MCP `instance_status` liefert `https://` URL konsistent mit E-Mail (task16) — in Punkt 4 mit abgedeckt
- [ ] plugin-detail.html "Demo starten" öffnet Modal, crasht nicht (task17 — noch nicht deployed)

---

## ✅ Done

- task01 config.php-Patch: removePortBlock() + wwwroot korrekt
- task02 nginx HTTPS: HTTP→HTTPS-Redirect + Wildcard-Cert

---

## Rules

- Neue Einträge zuerst unter "New" → dann zu Task konvertieren
- Tasks klein halten, klar formuliert
- Abgeschlossene Tasks nach "Done" verschieben, nicht löschen
