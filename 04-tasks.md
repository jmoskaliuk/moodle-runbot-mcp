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

### bug18 Plugin-Detail: „Demo starten"-Flow zeigt `http://localhost:8100`
Status: **fixed 2026-04-09** (commit `4aa961d`, Variante B umgesetzt)
Entdeckt: 2026-04-09 (Johannes)
Betroffen: `webui/plugin-detail.html` Zeilen 699 + 702 (`launch()` → `finish()`)
Repro: Auf der Plugin-Detail-Seite den „Demo starten"-Button drücken. Statt
einer echten `https://demo-<id>.demo.eledia.ai`-URL erscheint im Result-
Panel `http://localhost:8100` als Demo-Link. Öffnet natürlich nicht.

Root cause: Die Funktion hat zwei hardgecodete Fallbacks auf
`http://localhost:8100`:
1. `finish(res.url ?? 'http://localhost:8100', res.instanceId)` — wenn
   die MCP-`instance_start`-Response kein `url`-Feld mitliefert.
2. Catch-Branch: `finish('http://localhost:8100', 'demo-leitnerflow')`
   — bei jedem Fehler im MCP-Call. Verschluckt dabei den echten Fehler.

Das ist der alte Direkt-Launch-Pfad aus den Anfangstagen, der neben
dem eigentlichen `/request-demo → /confirm → /api/demo-status`-Token-
Flow noch existiert. In Dev (ohne `BASE_DOMAIN`) stimmt die URL
zufällig — in Produktion nie.

Fix-Optionen (beim Aufgreifen entscheiden):
- A) Den Direkt-Launch-Pfad reparieren: Fallback auf `res.url` sauber
  erzwingen (Error werfen wenn fehlt) und Catch den echten Fehler
  anzeigen statt einer Fake-URL.
- B) Den Direkt-Launch-Pfad ganz entfernen und den „Demo starten"-
  Button stattdessen auf den Token-Flow umlenken (genauso wie der
  Demo-Request auf der Portal-Startseite), damit es nur noch **einen**
  Demo-Start-Pfad gibt.

Empfehlung: Variante B — zwei parallele Flows sind unnötige Wartungslast
und der Token-Flow ist bereits der getestete Produktions-Pfad. Aber das
ist eine Design-Entscheidung von Johannes, darum zunächst als Bug
aufgenommen, nicht sofort umgesetzt.

**Resolution (2026-04-09, commit `4aa961d`):** Johannes hat sich für
Variante B entschieden. Der alte Direkt-Launch-Pfad in `plugin-detail.html`
wurde ersatzlos gestrichen (`STEPS`, `launch()`, `finish()`, `openDemo()`,
`updateBand()`, `startCountdown()`, `mcpCall()`, `renderSteps()` + alle
hardcoded localhost-Fallbacks raus). `startDemo()` öffnet jetzt dasselbe
Modal wie die Portal-Startseite; `submitForm()` POSTet auf
`/api/request-demo` mit `configId: ITEM.id` und zeigt den „E-Mail wurde
gesendet"-Success-State. Es gibt jetzt genau **einen** Demo-Start-Pfad
in der gesamten Webui. Nebenbei wurde task17 damit komplett erledigt.
Live-Verify ist durch: alle neuen DOM-Elemente da, alte Funktionen
gelöscht (`launch` ist `undefined`).

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
Status: **done 2026-04-09** (Punkte 1–3, 5 alle fertig; Punkt 4 → task21-Nachzügler, rein kosmetisch)
Feature: feat01 (Webui)
Bugs: bug07, bug08, bug12

1. `fetch(MCP, ...)` → `fetch(\`${API}/api/request-demo\`, ...)` (MCP war undefined) — **done** (`mcpCall()` komplett raus)
2. `startDemo()` umbauen: darf nicht `instance_start` direkt aufrufen. Stattdessen dasselbe Modal wie demo-portal.html öffnen, POST auf `/api/request-demo`, "Bitte prüfen Sie Ihr Postfach" anzeigen. — **done**
3. `heroTitle` ↔ `heroDesc` Copy-Paste beheben. — **done 2026-04-09** (`plugin-detail.html` um Zeile 596 — heroTitle=cfg.name, heroDesc=cfg.description; zuvor heroTitle=cfg.description und heroDesc=leer).
4. Hardcoded deutsche Strings auf `data-i18n` umstellen. — verschoben auf task21-Nachzügler (reine Copy-Arbeit, nicht blockierend)
5. Plugin-Detail-Seite in demo-portal.html verlinken (Details-Button auf Karten). — **done 2026-04-09** via task27.

---

### task18 demo-portal.html: Hero-Stat + globales close() beheben
Status: **done 2026-04-09**
Feature: feat01 (Webui)
Bugs: bug10, bug11

1. ID-Mismatch zwischen `statPlugins` (im JS) und dem Hero-Stat-`<div>` (ohne ID) beheben. — **fixed 2026-04-09** (`id="statPlugins"` auf Line 204 ergänzt, so dass `loadData()`/`fetch`-Catch `P.length` schreiben kann). **Hinweis**: Die ursprüngliche Task-Beschreibung sprach von `statPlugins → statActive`, das wäre aber falsch gewesen — `statActive` zählt „Demos aktiv", nicht Plugins. Der JS-Code war immer korrekt; das DOM hatte schlicht die ID nicht.
2. Hardcoded `6` → `configs.length`. — **fixed 2026-04-09** (Platzhalter `—`, JS ersetzt sofort nach `loadData()`, konsistent mit `statActive`-Platzhalter.)
3. `function close()` → `closeModal()`. — **fixed 2026-04-09** (Hotfix nach User-Report)

Offen als Follow-Up (nicht Teil von task18): `statActive` („Demos aktiv") wird nie befüllt — dafür bräuchte es ein öffentliches Zähl-Endpoint, das anonym die Anzahl laufender Instanzen liefert, ohne IDs/Owner zu leaken. Abgelegt als task27 (Idea, noch nicht angelegt).

---

### task19 Snapshot leitnerflow-v1 auf VPS erstellen
Status: **done 2026-04-09** — leitnerflow-v1.sql.gz (224.7 KB) liegt auf dem VPS unter `/opt/snapshots/`, `configs.json` umgestellt
Feature: feat01, feat05
Bugs: bug13

**Durchgeführt am 2026-04-09:**
- Seed-Instanz `demo-leitnerflow-c371aa` über demo.eledia.ai gestartet
- Seed-Kurs manuell im Browser angelegt (admin/teacher/student, Demo-Kurs, LeitnerFlow-Karten, keine File-Uploads)
- `./scripts/seed-snapshot.sh create-snapshot` erfolgreich → `/opt/snapshots/leitnerflow-v1.sql.gz`
- `./scripts/seed-snapshot.sh stop-instance demo-leitnerflow-c371aa` → sauber aufgeräumt
- `configs.json`: `snapshotId: null` → `"leitnerflow-v1"`

Offen: E2E-Test mit einer frisch aus dem Snapshot gestarteten Demo (Login admin → teacher → student, kein session mismatch). Das macht Johannes von Hand sobald CI den configs.json-Change deployed hat.

**Voraussetzung:** task14/15 müssen verified sein, sonst läuft die Seed-Instanz nicht über HTTPS und das könnte die Moodle-URLs im Snapshot verschmutzen.

**Pre-Snapshot-Checkliste (zwingend, sonst ist der Snapshot am Ende unbrauchbar):**
- [ ] task14 + task15 grün → Seed-Instanz läuft unter `https://demo-seed-….demo.eledia.ai`, sslproxy aktiv
- [ ] `$CFG->wwwroot` in der Seed-Instanz zeigt auf HTTPS-Subdomain ohne Port
- [ ] Seed-Kurs verwendet **keine** File-Uploads, Bilder in Labels, Resource-Module mit Anhängen oder File-Submissions (moodledata wird nicht mit-snapshotted → die Dateien wären in jeder gestarteten Demo futsch)
- [ ] Seed-Kurs nutzt nur Text, HTML-Editor-Inline-Inhalte, LeitnerFlow-Karten (Karten sind 100% DB-basiert)
- [ ] Die drei Demo-Accounts (admin, teacher, student) existieren im Snapshot mit `DEMO_PASSWORD` als Kennwort (siehe feat07 / task24)

**Hinweis zum alten Runbook (vor 2026-04-09):** Die früheren curl-Beispiele in diesem Task waren mehrfach falsch — sie benutzten `/mcp/call` (existiert nicht, richtig ist `/mcp` mit MCP JSON-RPC), `Authorization: Bearer …` (richtig ist `x-api-key: …`) und `instance_start({configId: "leitnerflow"})` (die Config-basierten Starts laufen über `/request-demo` → `/confirm/:token`, nicht über das MCP-Tool — das Tool verlangt `prId`, `branch`, `pluginSrcPath`, `pluginType`, `pluginName`). Das Runbook wurde deshalb komplett umgebaut.

**Runbook (auf VPS ausführen):**

```bash
# 0) Vorbereitung: Helper-Script einsatzbereit machen
cd /opt/moodle-runbot-mcp
chmod +x scripts/seed-snapshot.sh      # liegt nach Deploy im Repo
./scripts/seed-snapshot.sh help        # zeigt alle Commands
./scripts/seed-snapshot.sh list-snapshots  # sollte "(leer)" oder altes
                                            # leitnerflow-v1 zeigen
```

```bash
# 1) Seed-Instanz über das reguläre Demo-Portal starten
#    Im Browser:
#      → https://demo.eledia.ai
#      → LeitnerFlow → "Demo starten"
#      → Vorname: Seed / Nachname: Admin / E-Mail: <eigene@adresse>
#      → Formular absenden
#      → Bestätigungsmail öffnen → Link klicken
#      → Loading-Page zeigt "Demo bereit" nach ca. 90-180s
#
#    Das ist der getestete Happy-Path (feat01/feat06) — einfacher und
#    robuster als einen MCP-Call nachzubauen. Die erzeugte Instanz hat
#    alle Plugin-Dateien, die gepatchte config.php und einen laufenden
#    Admin-Account aus install_database.php.
```

```bash
# 2) Instanz-ID herausfinden
./scripts/seed-snapshot.sh list-instances
#
# Erwartung: eine Zeile mit Status=running, URL=https://pr-demo-….demo.eledia.ai
# Die ID (pr-demo-xxxxxx) merken → wird in Schritt 4 gebraucht.
```

```bash
# 3) Demo-Daten anlegen — MANUELL im Browser, als admin
#
#    Login-URL: siehe Schritt 2 (URL der Instanz)
#    Default-Admin: admin / demo1234    (aus install_database.php)
#
#    Setup-Reihenfolge (strikt einhalten, sonst fehlt später etwas):
#
#    a) Password auf $DEMO_PASSWORD setzen (siehe /etc/moodle-runbot.env,
#       Variable DEMO_PASSWORD). Login-Dialog erzwingt das sowieso.
#
#    b) Zwei weitere User anlegen (Site administration → Users → Add a new user):
#         Username: teacher  / Password: $DEMO_PASSWORD  / Rolle später: Teacher
#         Username: student  / Password: $DEMO_PASSWORD  / Rolle später: Student
#       Wichtig: E-Mail-Adressen so wählen, dass sie NICHT mit dem Username
#       identisch sind (task17-Entscheidung vom 2026-04-09: Login ≠ E-Mail).
#
#    c) Site administration → Courses → Add new course "Demo LeitnerFlow"
#
#    d) Im Kurs: teacher als Teacher, student als Student einschreiben
#
#    e) LeitnerFlow-Aktivität hinzufügen. 10-15 Beispielkarten vorbefüllen,
#       NUR Text (keine Bilder, keine Audio, keine File-Anhänge).
#
#    f) Als student einloggen, einmal "Karten lernen" durchlaufen damit
#       Attempt-History existiert. Wieder ausloggen.
#
#    g) VERBOTEN im Seed-Kurs:
#         - File-Uploads (werden nicht mit-snapshotted → kaputt in jeder Demo)
#         - Bilder in Labels / HTML-Editor
#         - Resource-Module mit angehängten Dateien
#         - Image-Filter
```

```bash
# 4) Snapshot erstellen
INSTANCE_ID="pr-demo-xxxxxx"  # aus Schritt 2

./scripts/seed-snapshot.sh create-snapshot \
  "$INSTANCE_ID" \
  leitnerflow-v1 \
  "LeitnerFlow Demo" \
  "Moodle 5.0 mit LeitnerFlow, Beispielkurs und 15 Karten" \
  mod_eledialeitnerflow

# Erwartung: JSON mit snapshotId, file, sizeFormatted, createdAt
# File-Pfad: /opt/snapshots/leitnerflow-v1.sql.gz
```

```bash
# 5) Snapshot verifizieren
ls -lah /opt/snapshots/leitnerflow-v1*
# Erwartung: leitnerflow-v1.sql.gz (~2-5 MB) + leitnerflow-v1.json (Metadaten)

./scripts/seed-snapshot.sh list-snapshots
# Erwartung: leitnerflow-v1 taucht auf

# Sicherheits-Check: wwwroot-Leaks im Dump?
zcat /opt/snapshots/leitnerflow-v1.sql.gz \
  | grep -Eo "https://pr-demo-[a-z0-9]+\.demo\.eledia\.ai" \
  | sort -u
# Hinweis: ein paar Treffer in mdl_config (siteurl) und mdl_logstore_*
# sind OK. mdl_sessions ist beim Restore leer — wird via TRUNCATE in
# snapshot.ts::restoreSnapshot() bereinigt. Der wwwroot selbst wird
# NICHT aus dem Dump gelesen, sondern aus der per-Instanz gepatchten
# config.php (patchConfigForProduction in docker.ts).
```

```bash
# 6) Seed-Instanz stoppen
./scripts/seed-snapshot.sh stop-instance "$INSTANCE_ID"
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
- Als `admin`, dann `teacher`, dann `student` einloggen (drei Reloads); kein "Invalid login, session mismatch"
- Loading-Page-Schritte 3/5 ("Kurs vorbereiten...") passt dann inhaltlich

**Code-Audit vom 2026-04-09 (`src/services/snapshot.ts`, commit folgt):**

Drei Fallstricke gefunden und behoben, bevor der Snapshot auf dem VPS erstellt wird:

1. **Dead `cfg.php --name=wwwroot`/`--name=dataroot`-Calls entfernt.**
   `$CFG->wwwroot` und `$CFG->dataroot` werden ausschließlich aus `config.php` gelesen, nie aus `mdl_config`. Die CLI-Calls schrieben nur bogus-Rows, die Moodle ignoriert hat. Canonical Patch-Point ist `patchConfigForProduction()` in `src/services/docker.ts`, ausgeführt von `provisionInstance()` **vor** `startContainers()`. Das heißt: Bevor die DB überhaupt existiert, ist die `config.php` schon auf die neue Subdomain umgebogen. Der Restore muss URLs nicht mehr anfassen.

2. **`TRUNCATE mdl_sessions` nach DB-Import eingefügt.**
   Der Seed-Dump enthält Session-Records der Seed-Instanz (anderer wwwroot → andere `sesskey`/`sid`-Kontexte). Ohne Cleanup wirft Moodle beim ersten Login-Versuch auf der neuen Instanz sporadisch "Invalid login, session mismatch". Jetzt wird die Tabelle direkt nach dem `zcat`-Import geleert (pgsql und mariadb/mysql jeweils mit Fallback-Log bei Fehler). Es gibt zum Zeitpunkt des Restores noch keine aktiven Browser-Sessions, also sicher.

3. **Moodledata-Warnung explizit geloggt.**
   `moodledata` ist **nicht** Teil eines Snapshots. Bisher war das nur eine stille Annahme — jetzt gibt `restoreSnapshot()` am Ende eine Log-Zeile aus, die den Operator daran erinnert. Der Header-Kommentar der Datei dokumentiert das ebenso und verweist auf die Pre-Snapshot-Checkliste oben.

Diese drei Fixes laufen mit dem nächsten Deploy auf dem VPS. Für die Snapshot-Erstellung selbst ist keine Code-Änderung mehr nötig — nur die Pre-Snapshot-Checkliste abarbeiten, dann das Runbook.

---

### task20 Startup-Cleanup für Orphan-Container
Status: **done 2026-04-09**
Feature: feat06
Bugs: bug17

Beim Start von `src/index.ts`:
1. `docker ps --format '{{.Names}}' --filter "name=runbot-"` ausführen — **done** (`docker ps -a` + Filter in `cleanupOrphans()` / `src/services/cleanup.ts`)
2. Mit `registry.listInstances()` vergleichen — **done** (`knownIds` Set aus `getAllInstances()`)
3. Container ohne Registry-Eintrag → Container entfernen + `/opt/runbot/<id>` löschen + nginx-Config entfernen — **done**. Verwendet `docker rm -fv` statt `docker compose down -v`, weil wir bei Waisen kein `moodle-docker`-Repo mehr zur Hand haben (compose bräuchte die ENV-Variablen, die wir nicht mehr kennen).
4. ~`nginx.cleanupAllConfigs()` aufrufen~ — **bewusst NICHT aufgerufen**, weil diese Funktion ALLE runbot-*.conf löscht, auch die von gültigen Instanzen. Stattdessen `findOrphanNginxConfigs()` mit Registry-Abgleich + nur die Waisen entfernen.
5. Log-Line mit Anzahl entfernter Waisen — **done** (eine Summary-Zeile mit Container/Dir/Config-Counts + Details darunter).

Zusätzlich als Grundlage für task26 eingebaut: Der `runCleanup()`-Scheduler respektiert jetzt `instance.maxAgeMinutes` (Override) und rechnet die Laufzeit ab `extendedBy.at` statt `createdAt`, damit verlängerte Instanzen korrekt ablaufen. Der `MoodleInstance`-Typ hat die neuen Felder `maxAgeMinutes?: number` und `extendedBy?: {code, at}` bekommen.

**Startup-Reihenfolge in `src/index.ts`:** `cleanupOrphans()` läuft **vor** `runHTTP()`, damit Ports frei sind, bevor `allocatePort()` das erste Mal aufgerufen wird, und **vor** `startCleanupScheduler()`, damit der periodische Job nicht mit der Waisen-Säuberung kollidiert.

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
Status: **done 2026-04-09**
Feature: feat10

**Entscheidung (2026-04-09, Johannes):** Option A — Drei vordefinierte
Accounts im Snapshot, manueller Login, identisches Passwort. Kein Auto-Login,
kein Rollen-Switcher im MVP. Die E-Mail-Adresse des Interessenten taucht
nirgends als Moodle-Username auf.

**Umgesetzt:**
1. `src/index.ts` — `createDemoUser` + `enrollUserInDemoCourse` Calls entfernt ✓
2. `src/index.ts` — `/api/demo-status/:token` sendet `accounts: ["admin","teacher","student"]` ✓
3. `buildLoadingPage` — Creds-Box zeigt Admin/Trainer/Teilnehmer + Passwort-Label ✓ (task28: Wording angepasst)
4. `sendConfirmationEmail` + `sendDemoReadyEmail` — Login-Zeile zeigt Accounts ✓
5. Snapshot `leitnerflow-v1` enthält alle drei Accounts mit DEMO_PASSWORD — **verifiziert durch Johannes E2E-Test 2026-04-09**. Admin/teacher/student alle eingeloggt, kein session mismatch.
6. Config-Flag `multiUser` — verschoben auf Phase 2, aktuell nur ein Plugin
7. Snapshot-Doku in `task19`-Runbook verankert (Pre-Snapshot-Checkliste)

**Non-goals (weiterhin):**
- Kein Rollen-Switcher im Portal (Phase 2)
- Kein Auto-Login via Webservice-Token (Phase 2)
- Keine individuellen Passwörter pro Rolle

**Non-goals (weiterhin):**
- Kein Rollen-Switcher im Portal (Phase 2)
- Kein Auto-Login via Webservice-Token (Phase 2)
- Keine individuellen Passwörter pro Rolle

---

### task25 Admin-Dashboard für laufende Instanzen
Status: **done 2026-04-09**
Feature: feat11

**Entscheidung (2026-04-09, Johannes):** HTTP Basic Auth reicht für den MVP
— die Daten sind nicht kritisch. GitHub OAuth / SSO erst in Phase 2.

**Umgesetzt 2026-04-09:**
- `webui/admin.html`: Zwei Tabellen (Instanzen + Token-Anfragen), Live-Refresh alle 30s, Log-Modal, Extend-Inline-Input (+Zeit-Button mit freier Minuten-Eingabe), Stop-Button (DELETE), Toast-Notifications. Design-System wie demo-portal.html.
- Express-Routen (nginx-Strip-konform, kein `/api/`-Präfix in Express):
  - `GET /admin` → serve `admin.html` (Browser URL: `/api/admin`)
  - `GET /admin/instances` (Browser: `/api/admin/instances`)
  - `GET /admin/tokens` (Browser: `/api/admin/tokens`)
  - `GET /admin/instances/:id/logs` (tail 100)
  - `POST /admin/instances/:id/extend` (Body: `{minutes}`, default 60, max 10080)
  - `DELETE /admin/instances/:id` (nginx → docker → dir → registry, Fehler werden geloggt aber geben trotzdem 200 zurück wenn Registry-Delete klappt)
- `express-basic-auth` als Middleware auf allen `/admin/*`-Routen.
- **ADMIN_PASSWORD Guard:** Server wirft beim Start `process.exit(1)` wenn `ADMIN_PASSWORD` Env-Variable nicht gesetzt. Logging-Hinweis auf `/etc/moodle-runbot.env`.

**VPS Setup nach Deploy:**
```bash
# In /etc/moodle-runbot.env hinzufügen:
ADMIN_PASSWORD=<sicheres-passwort>
systemctl restart moodle-runbot
# Dashboard unter https://demo.eledia.ai/api/admin aufrufen
# Browser fragt nach: Benutzer "admin", Passwort wie gesetzt
```

**Non-goals (MVP):**
- Kein GitHub OAuth (Phase 2)
- Kein 2FA, kein Audit-Log
- Keine Dark-Mode
- Keine Instance-Creation von Hand (der Flow bleibt Self-Service)
- Keine Rollen-Verwaltung für Admins
- Keine CSRF-Tokens (Same-Origin + Basic Auth reicht für internes Tool)

---

### task26 Code-basierte Demo-Verlängerung
Status: **done 2026-04-09** (UI im Loading-Page-Template, Backend in `src/index.ts`, Scheduler in `src/services/cleanup.ts`)
Feature: feat12

**Entscheidung (2026-04-09, Johannes):**
- Codes werden **pre-generated** und auf Anfrage an spezielle Kunden /
  Trainingsteilnehmer ausgegeben (manuell, kein Self-Service).
- **Alle Codes haben im MVP dieselbe Laufzeit: 1 Tag (1440 Min).**
- Format im Env wird vereinfacht: `EXTEND_CODES=EDUMA2026,PRIVATE,TRAIN01`
  (Komma-getrennte Code-Namen, kein `:MINUTEN`-Suffix mehr — TTL ist global).

**Scope:**
1. Env-Variable `EXTEND_CODES` parsen: Komma-getrennte Liste von Code-Namen — **done** (`src/index.ts`, `EXTEND_CODES: Set<string>` mit Uppercase-Normalisierung beim Start, Log-Line wenn Codes geladen)
2. Globale Konstante `EXTEND_CODE_TTL_MINUTES = 1440` (überschreibbar via `EXTEND_CODE_TTL_MINUTES` Env) — **done**
3. Neues Feld in `MoodleInstance`: `extendedBy?: {code: string, at: string}` (nur 1x pro Instanz verwendbar) — **done** (zusätzlich `maxAgeMinutes?: number`, beide in `src/types.ts`)
4. Neue Route `POST /api/extend-code` mit Body `{token: string, code: string}` — **done** (inkl. nginx-Strip-Alias `POST /extend-code`):
   - Token → Request → instanceId → Instance laden ✓
   - Code in `EXTEND_CODES` nachschlagen (case-insensitive) ✓
   - Wenn gültig und Instanz noch nicht verlängert: `instance.extendedBy` + `maxAgeMinutes` setzen, **zusätzlich `lastActivity = now`** — sonst killt `tooIdle` die frisch verlängerte Instanz. Das stand nicht im Task-Scope, fiel beim Schreiben auf.
   - Antwort: `{ok: true, extendedUntil: "...", maxAgeMinutes: 1440}` oder `{error: "..."}`
5. Frontend-Eingabefeld "Verlängerungscode" — **done** im Loading-Page-Template (`buildLoadingPage()` in `src/index.ts`). Aufklappbarer Akkordeon-Block unter der Creds-Box, nur im Ready-State sichtbar. Keyboard: Enter submittet. Nach erfolgreicher Einlösung werden Input + Button disabled. Absichtlich NICHT auf die Portal-Startseite oder die Plugin-Detail-Seite — die haben zu dem Zeitpunkt noch keine Instanz.
6. Cleanup-Scheduler muss individuelle `maxAgeMinutes` respektieren — **done**. `runCleanup()` rechnet ab `extendedBy.at` statt `createdAt`, wenn `maxAgeMinutes` gesetzt ist. Das adressiert den Fallstrick "nach 58 Min verlängert → 2 Min später weg".

**Was noch offen ist (nicht-blockierend):**
- Codes im Admin-Dashboard (task25) als Teil der Live-Anzeige listen
- Rate-Limit für `/api/extend-code` (aktuell ungelimitet — theoretisch könnte jemand Codes per Brute-Force durchprobieren, aber pro Token-Inhaber ist das Risiko niedrig, weil Token selbst schon zufällig ist)

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

**Aktivierung auf VPS:**
Codes werden per systemd-Environment in der Unit gesetzt. Beispiel:
```bash
sudo systemctl edit moodle-runbot
# In der Override-Datei:
[Service]
Environment="EXTEND_CODES=EDUMA2026,PRIVATE,TRAIN01"
# optional (default 1440):
Environment="EXTEND_CODE_TTL_MINUTES=1440"

sudo systemctl restart moodle-runbot
sudo journalctl -u moodle-runbot -n 20 --no-pager | grep extend-codes
# Erwartung: [extend-codes] 3 code(s) loaded, TTL=1440min
```

---

### task28 Ready-Page + Bestätigungs-E-Mail UX-Feinschliff
Status: **done 2026-04-09**
Feature: feat01 (Webui, E-Mail)
Entdeckt: Johannes beim E2E-Test nach task19-Snapshot-Rollout

**1. Spacing in der Creds-Box (Ready-State der Loading-Page)**
Die letzte Account-Zeile (Teilnehmer/in) klebte ohne Abstand an der Passwort-Zeile. Ursache: Das CSS `.cred-row:last-child{margin-bottom:0}` traf nicht nur die Passwort-Zeile (korrekt: hat kein Nachbar), sondern auch die letzte Account-Zeile innerhalb des `#cred-accounts`-Wrapper-Divs (falsch: davor folgt noch eine Passwort-Zeile). Fix: Selektor auf `.creds > .cred-row:last-child` eingeengt, so dass nur direkte Kinder von `.creds` ihren Bottom-Margin verlieren. Die dynamisch in `#cred-accounts` gerenderten Zeilen behalten ihren 8px-Abstand. Zusätzlich `.cred-label min-width` von 80 → 96 px erhöht, damit „Teilnehmer/in:" nicht die Input-Zeile staucht.

**2. Wording: Rolle teacher → „Trainer/in", student → „Teilnehmer/in"**
Im `ACCOUNT_LABELS`-Dictionary in `src/index.ts` (Ready-Page-Inline-Script) angepasst. Die Moodle-Rollen selbst (`teacher`, `student`) bleiben unverändert — nur die deutsche Anzeige-Beschriftung auf der Ready-Page. Grund: zielt auf Erwachsenenbildung (eLeDia-Zielgruppe) statt auf Schul-Terminologie.

**3. „Link gültig bis ..." aus der Bestätigungs-E-Mail entfernt**
Die `/request-demo`-Bestätigungs-E-Mail (`src/services/email.ts`) zeigte eine Zeile „Link gültig bis 10.04.26, 19:15 Uhr". Das ist irreführend: der Link markiert den Token-Ablauf, nicht die Demo-Lebenszeit. Wer den Link 20 Stunden später klickt, bekommt trotzdem eine frische Demo mit voller Laufzeit — die Zeile suggerierte das Gegenteil. Ersatzlos entfernt in HTML- und Plain-Text-Variante. `request.expiresAt` bleibt im Token-Modell, wird aber nicht mehr dem Nutzer kommuniziert.

---

### task29 Token-Status nach Instanz-Stop auf EXPIRED setzen
Status: open
Feature: feat01, feat03
Entdeckt: Admin-Dashboard zeigt Token-Einträge mit Phase "running" für längst gestoppte Instanzen — historisch korrekter Stand, aber irreführend.

**Problem:** Der `DemoRequest`-Eintrag wird nicht aktualisiert wenn eine Instanz gestoppt/abgeräumt wird (weder durch Cleanup-Scheduler noch durch manuelles Stop im Admin-Dashboard). Ergebnis: Token-Tabelle zeigt dauerhaft `phase=running` für Instanzen, die vor Stunden gestoppt wurden.

**Lösung:**
1. `services/tokens.ts` → neue Funktion `expireRequest(token: string)`: setzt `status='expired'` und `phase='stopped'` (oder löscht `phase`).
2. `services/cleanup.ts` → `stopInstance()` ruft `tokens.expireRequest(instance.tokenId)` auf (sofern `instance.tokenId` gesetzt).
3. `src/index.ts` Admin-Route `DELETE /admin/instances/:id` → ebenfalls `tokens.expireRequest(...)` aufrufen.
4. `MoodleInstance`-Typ bekommt optionales Feld `tokenId?: string` — wird beim Erstellen der Instanz aus dem Token befüllt.

**Verify:** Nach Stop einer Instanz im Admin-Dashboard muss der zugehörige Token-Eintrag auf `expired` / `stopped` wechseln.

---

### task30 Snapshot-Building-Instanzen vor Cleanup schützen
Status: open
Feature: feat03 (Runbot-MCP)
Entdeckt: 2026-04-09 beim Erstellen des `exam2pdf-v1` Snapshots. Die Instanz `pr-exam2pdf-5057e6` wurde um 20:38 fertig bereitgestellt, der Cleanup-Scheduler (`inactivity=15min`) hat sie um 20:54:44 wegen „inactivity timeout (16 min idle)" entfernt — mitten im Snapshot-Workflow, bevor `snapshot_create` aufgerufen werden konnte.

**Problem:** Der Inactivity-Tracker in `services/cleanup.ts` zählt nur HTTP-Requests auf die Moodle-Instanz selbst. Wenn eine Instanz rein für Snapshot-Building gestartet wird (ohne echten User-Traffic), ist sie aus Cleanup-Sicht sofort „idle" und wird nach 15 Min abgeräumt — auch wenn ein Admin gerade die Demo-DB präpariert.

**Lösung:**
1. `MoodleInstance`-Typ bekommt optionales Feld `pinned?: boolean` und `pinReason?: string`.
2. `tools/instances.ts` → `instance_start` akzeptiert optionalen Parameter `pinned: boolean` (Default: `false`). Wenn `true`, wird das Feld in der Instance-Registry gesetzt.
3. `services/cleanup.ts` → `checkInactivity()` überspringt Instanzen mit `pinned === true` komplett (weder maxAge noch inactivity triggern Cleanup).
4. `tools/snapshots.ts` → neues Tool `snapshot_build` als Convenience-Wrapper: startet eine gepinnte Instanz, wartet bis ready, ruft `snapshot_create` auf, stoppt die Instanz explizit. Ein-Aufruf-Workflow.
5. Admin-Dashboard: Gepinnte Instanzen bekommen ein 📌-Icon in der Phase-Spalte, damit sichtbar ist warum Cleanup sie ignoriert.

**Verify:** Neue gepinnte Instanz startet, 20 Min nichts tun, Instanz läuft immer noch. `snapshot_build`-Call produziert erfolgreich einen Snapshot ohne manuelle Timing-Koordination.

**Workaround bis zum Fix:** Snapshot innerhalb von 12 Minuten nach `instance_start` auslösen (Puffer zu 15-Min-Timeout).

---

### task27 Details-Link im Demo-Portal auf Plugin-Detail-Seite
Status: **done 2026-04-09**
Feature: feat01 (Webui)

Beim Live-Verify von task17/bug18 am 2026-04-09 gemerkt: Die Plugin-Karten im `demo-portal.html`-Grid haben keinen „Details"-Link, der auf die Plugin-Detail-Seite führt. Die Detail-Seite ist aktuell nur über den Direkt-URL `/api/plugin/:id` erreichbar — und das ist ein nginx-Strip-Artefakt, keine offizielle Route (Express selbst hört auf `/plugin/:id`, was aber nicht durch nginx kommt, weil nginx nur `/api/*` proxyt).

**Umgesetzt 2026-04-09 in `webui/demo-portal.html`:**
1. Neue CSS-Klasse `.card-details` (Zeile 111-113): `margin-left:auto`, sekundär-gemuted, Hover färbt auf Accent, `focus-visible` mit Outline für Tastaturnutzer.
2. Das alte `margin-left:auto` auf `.dbtn` entfernt — das Layout fließt jetzt `pill → card-details (auto-push) → dbtn`, d.h. sowohl der Details-Link als auch der Demo-Button werden nach rechts geschoben und bleiben visuell gruppiert.
3. Neue i18n-Keys: DE `btn_details:'Mehr erfahren →'`, EN `btn_details:'Learn more →'` in beiden Wörterbüchern.
4. Render-Template ergänzt: `<a class="card-details" href="/api/plugin/${p.id}" aria-label="${t('btn_details')} — ${p.name}">${t('btn_details')}</a>` zwischen pill und Demo-Button.

Der `/api/`-Präfix bleibt solange die nginx-Config nicht aufgeräumt ist. Der strukturelle nginx-Cleanup ist als Idee eingetragen, nicht Teil von task27.

---

## 🔧 In Progress

*(derzeit keine — task19 fertig, task17+task27 fertig)*

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
- [x] plugin-detail.html "Demo starten" öffnet Modal, crasht nicht (task17 + bug18 — commit `4aa961d`, live verifiziert)

---

## ✅ Done

- task01 config.php-Patch: removePortBlock() + wwwroot korrekt
- task02 nginx HTTPS: HTTP→HTTPS-Redirect + Wildcard-Cert

---

## Rules

- Neue Einträge zuerst unter "New" → dann zu Task konvertieren
- Tasks klein halten, klar formuliert
- Abgeschlossene Tasks nach "Done" verschieben, nicht löschen
