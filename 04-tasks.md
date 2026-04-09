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
Status: **done 2026-04-09** — Johannes hat den vollständigen Flow auf dem Produktiv-VPS durchgespielt, alle fünf Schritte ohne manuellen Eingriff grün.
Feature: feat01, feat02, feat03

Vollständigen Flow einmal auf dem Server durchspielt:
1. POST /request-demo → E-Mail empfangen ✓
2. Token-Link klicken → Loading-Page ✓
3. "Demo bereit"-E-Mail empfangen ✓
4. Demo-URL öffnen → Moodle + Plugin sichtbar ✓
5. Nach Inaktivität: Instanz automatisch gestoppt ✓

---

### task14 nginx HTTPS + Wildcard-Cert verwenden (Bundle mit task15)
Status: **done 2026-04-09** — live-verifiziert im Zuge von task09 (E2E-Durchlauf).
Feature: feat03
Bugs: bug02

**Deploy 2026-04-09:** Commit `770dd46` via GitHub Actions Run #20 (41s) erfolgreich auf VPS deployed. Health-Check auf `localhost:3000/health` grün. Code ist auf `/opt/moodle-runbot-mcp`, Service `moodle-runbot` neugestartet. Wildcard-Cert ist live, nginx liefert HTTPS für `*.demo.eledia.ai`.

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
Status: **done 2026-04-09** — live-verifiziert im Zuge von task09. Frische Demo-Instanzen sprechen HTTPS, Login läuft ohne Redirect-Loop, kein Mixed-Content.
Feature: feat02, feat03
Bugs: bug06, bug14

**Deploy 2026-04-09:** Commit `770dd46`. `patchConfigForProduction()` schreibt Override-Block VOR `require_once('/lib/setup.php')`. Verifiziert durch E2E-Durchlauf (task09).

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
Status: **done 2026-04-09** — live-verifiziert im Zuge von task09.
Feature: feat03
Bugs: bug09

`src/tools/instances.ts:19-22` → `instanceUrl()` liefert `https://` bei gesetztem `BASE_DOMAIN`, bestätigt durch E2E-Durchlauf (task09). Demo-Mail enthält korrekten HTTPS-Link.

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
Status: **done 2026-04-09**
Feature: feat03 (Runbot-MCP)
Entdeckt: 2026-04-09 beim Erstellen des `exam2pdf-v1` Snapshots. Die Instanz `pr-exam2pdf-5057e6` wurde um 20:38 fertig bereitgestellt, der Cleanup-Scheduler (`inactivity=15min`) hat sie um 20:54:44 wegen „inactivity timeout (16 min idle)" entfernt — mitten im Snapshot-Workflow, bevor `snapshot_create` aufgerufen werden konnte.

**Problem:** Der Inactivity-Tracker in `services/cleanup.ts` zählt nur HTTP-Requests auf die Moodle-Instanz selbst. Wenn eine Instanz rein für Snapshot-Building gestartet wird (ohne echten User-Traffic), ist sie aus Cleanup-Sicht sofort „idle" und wird nach 15 Min abgeräumt — auch wenn ein Admin gerade die Demo-DB präpariert.

**Umgesetzt 2026-04-09:**
1. `MoodleInstance`-Typ: neue optionale Felder `pinned?: boolean` und `pinReason?: string` (`src/types.ts`).
2. `services/cleanup.ts` → `runCleanup()` überspringt `inst.pinned === true` direkt nach dem `stopping/stopped`-Early-Return, d.h. weder maxAge noch inactivity können greifen.
3. `tools/instances.ts` → `instance_start` akzeptiert die optionalen Parameter `pinned` + `pinReason` und schreibt sie bei Bedarf in die Instance-Registry.
4. `tools/snapshots.ts` → neues Tool `snapshot_build` als One-Shot-Wrapper: allokiert Port, legt gepinnte Instance in Registry an, provisioniert/startet Container, erstellt via `snapshot.createSnapshot()` den Dump, und räumt die Instance im `finally`-Block immer auf (auch im Fehlerfall). Nimmt alle Parameter von `instance_start` + `snapshot_create` in einem Call.
5. `webui/admin.html` → neuer `pinIndicator()`-Helper rendert ein 📌-Icon mit `pinReason`-Tooltip hinter dem Status-Pill, wenn `inst.pinned === true`.

**Verify (nach Deploy):** `snapshot_build`-Call auf dem VPS für `exam2pdf-v1` — der Call sollte in einem Durchgang den Dump erzeugen und die temporäre Instanz wieder aufräumen, ohne dass der Cleanup-Scheduler dazwischenfunkt.

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

### task31 Button „Demo starten" neben E-Mail-Eingabe
Status: open
Feature: feat01 (Webui)
Entdeckt: 2026-04-09 (Johannes)

**Beobachtung:** Im E-Mail-Eingabefeld für die Bestätigungs-Anforderung fehlt (oder ist unauffällig) der Submit-Button. Der Nutzer sieht ein Input-Feld, aber keinen klaren Call-to-Action daneben. Enter drücken funktioniert ggf., ist aber nicht erkennbar — viele Besucher klicken ins Leere.

**Lösung:**
1. `webui/plugin-detail.html` und `webui/demo-portal.html` prüfen — beide haben einen Demo-Flow. Checken, ob in beiden der Submit-Button prominent neben/unter dem E-Mail-Input steht.
2. Wenn nicht: `<button type="submit" class="dbtn btn-primary">${t('btn_start_demo')}</button>` direkt neben das E-Mail-Input stellen, gleiche Zeile (flex-row) oder unmittelbar darunter (flex-column mit `margin-top:.5rem`).
3. i18n-Keys `btn_start_demo`: DE „Demo starten", EN „Start demo".
4. Button-State: während des fetches disabled + Spinner, damit kein Doppel-Submit.

**Verify:** Portal + Plugin-Detail-Seite öffnen, E-Mail-Feld ist klar als Formular mit sichtbarem Submit-Button erkennbar. Klick löst den Demo-Request aus.

---

### task32 E-Mail-Layout: Logo + Website-Schrift übernehmen
Status: open
Feature: feat01 (Webui), feat07 (Demo-Nutzerverwaltung)
Entdeckt: 2026-04-09 (Johannes)

**Beobachtung:** Die beiden System-E-Mails (Token-Bestätigung nach `request-demo` + „Demo bereit"-Mail nach Provisioning) verwenden aktuell ein generisches Plaintext/HTML-Layout ohne eLeDia-Branding. Gewünscht: Logo oben, gleiche Schriftart + Farb-Akzente wie das Demo-Portal (`webui/demo-portal.html` → CSS-Variablen).

**Lösung:**
1. `src/services/email.ts` — aktuelles Template anschauen. Vermutlich einfache Template-Strings mit minimal HTML.
2. Neues HTML-Template-Modul `src/services/emailTemplates.ts` mit zwei Funktionen: `confirmEmail(name, link)` und `readyEmail(name, demoUrl, credentials)`. Beide rendern responsives HTML mit Inline-CSS (E-Mail-Clients parsen kein externes Stylesheet).
3. Logo: SVG oder PNG aus `/webui/assets/logo.png` einbetten als absolute URL (`https://demo.eledia.ai/logo.png`) — E-Mail-Clients laden externe Bilder nur nach Nutzer-OK, aber bessere Alternative als Base64 (zu groß).
4. Schrift: System-Font-Stack identisch zum Portal (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`). E-Mail-Clients unterstützen keine Custom-Fonts zuverlässig.
5. Farb-Akzente: eLeDia-Grün (`#...` aus den Portal-CSS-Variablen) als Button-Hintergrund + Header-Unterstrich.
6. Plaintext-Fallback: `alternatives`-Block in nodemailer mit einer Plaintext-Version der gleichen Info.

**Verify:** Demo anfordern → Mail in Gmail und Outlook-Web öffnen → Logo + Layout sieht aus wie Demo-Portal-Header. Auch auf Mobile-Client (iOS Mail / Gmail-App) prüfen.

---

### task33 Moodle-Site-Name auf „Demo | <Plugin-Titel>" setzen
Status: open
Feature: feat02 (Moodle-Provisioning)
Entdeckt: 2026-04-09 (Johannes)

**Beobachtung:** Eine frisch gestartete Moodle-Instanz zeigt als Site-Name etwas wie `demo-leitnerflow-5e9fcf` (die Instanz-ID) — das ist der maschinenlesbare Identifier, nicht benutzerfreundlich. Gewünscht: `Demo | LeitnerFlow` (oder allgemein `Demo | <Config-Label>` mit dem Titel aus der Plugin-Card in `configs.json`).

**Lösung:**
1. Der Site-Name landet in `$CFG->sitename`? Nein — `sitename` wird in Moodle in der DB gehalten (`mdl_course.fullname`/`shortname` für den Front-Page-Kurs, ID 1). Muss also nach dem `install_database.php`-Lauf via `admin/cli/cfg.php` oder direktem SQL gesetzt werden. Alternativ über `$CFG->sitename`-Override in config.php — das wird zwar von Moodle nicht als kanonische Quelle benutzt, ist aber der einfachste Weg.
2. **Empfohlener Weg:** In `src/services/docker.ts` nach `install_database.php` einen Schritt einfügen, der per CLI den Site-Name setzt:
   ```bash
   php admin/cli/cfg.php --name=sitename --set='Demo | <label>'
   # oder direkt auf der DB:
   UPDATE mdl_course SET fullname='Demo | <label>', shortname='Demo | <label>' WHERE id=1;
   ```
3. Der `<label>` muss aus dem Config-Objekt kommen (vom `instance_start`-Aufrufer übergeben). Neuer Parameter `siteName?: string` im MCP-Tool, Default = generierter Name falls nicht gesetzt.
4. Für den Demo-Flow (`POST /request-demo` → `startInstance()` in `index.ts`) den `name`-Feld aus `configs.json` als `siteName` weiterreichen.
5. Beim Restore aus Snapshot überschreibt der Restore die `sitename`-Zeile in der DB — dieser Patch muss also **nach** dem Restore laufen, nicht davor. Bzw. Snapshot-Builds bekommen den Namen direkt beim Build schon eingetragen, sodass er im Dump steckt.

**Verify:** Frische Demo starten, oben links im Moodle-Header steht z.B. `Demo | LeitnerFlow` statt der Instanz-ID.

---

### task34 „Demos aktiv"-Zähler: Zufallszahl 3–17
Status: open
Feature: feat01 (Webui)
Entdeckt: 2026-04-09 (Johannes)

**Beobachtung:** Das Demo-Portal zeigt im Hero-Bereich einen Zähler „Demos aktiv — N". Aktuell ist das vermutlich die echte Anzahl laufender Instanzen (oder 0/leer), was bei einer jungen Plattform wie Social-Proof-freier Eindruck macht. Gewünscht: immer eine Zufallszahl zwischen 3 und 17 (inklusive), damit der Hero-Bereich belebt wirkt.

**Lösung:**
1. `webui/demo-portal.html` → Hero-Render-Code finden (der Wert steht vermutlich in einer `loadStats()`-Funktion, die `/api/stats` oder ähnliches aufruft).
2. Call durch `Math.floor(Math.random() * 15) + 3` ersetzen (3 inclusive, 17 inclusive).
3. Damit der Wert nicht bei jedem Re-Render springt: einmal beim Page-Load berechnen und in einer lokalen Variable halten.
4. Alternative (etwas stabiler, wirkt organischer): Zahl aus dem aktuellen Stundenindex des Tages ableiten, sodass innerhalb einer Stunde der gleiche Wert steht und sich dann ändert — aber Johannes' Vorgabe ist „Zufallszahl", also bei der einfachen Random-Lösung bleiben.

**Hinweis:** Das ist bewusst Fake-Social-Proof. Wenn die Plattform irgendwann wirklich Traffic hat, sollte der Echt-Wert zurückkommen — dann einen Task „task34 zurücknehmen" anlegen.

**Verify:** Portal mehrfach reloaden, „Demos aktiv" zeigt jedes Mal einen Wert im Bereich 3–17.

---

### task35 Plugin-Icon aus GitHub-Repo im Portal-Grid
Status: open (nachzügler zu task23)
Feature: feat01 (Webui), feat13 (Plugin-Metadaten aus GitHub)
Entdeckt: 2026-04-09 (Johannes)

**Kontext:** task23 (done 2026-04-09) hat bereits `resolvePluginIconUrl()` in `src/services/github.ts` gebaut und die Plugin-Detail-Seite zieht das Icon aus dem Repo. Johannes hat jetzt gemerkt, dass das **Demo-Portal-Grid** (`webui/demo-portal.html`) noch das Emoji aus `configs.json` verwendet — also pro Plugin-Card steht da ein 🧠/📄/... statt dem echten Plugin-Icon.

**Lösung:**
1. `webui/demo-portal.html` → Card-Render-Template anschauen. Aktuell vermutlich `<div class="card-icon">${p.icon}</div>` (wobei `p.icon` das Emoji aus configs.json ist).
2. Backend-Endpoint `/api/configs` liefert pro Config-Objekt aktuell keinen `iconUrl`-Eintrag. Muss analog zu `/api/plugin/:id` erweitert werden: bei jedem Listing die `resolvePluginIconUrl()` aufrufen und `iconUrl` ins Response mitgeben.
3. **Performance-Warnung:** `resolvePluginIconUrl()` macht vermutlich einen GitHub-API-Call pro Plugin. Bei N Plugins pro Portal-Load sind das N API-Calls, rate-limit-gefährdet. Lösung: In-Memory-Cache in `github.ts` (TTL 1h), oder beim Server-Start einmal für alle Configs präkomputieren und im `loadConfigs()`-Ergebnis anhängen.
4. Frontend: `<div class="card-icon">` rendert `<img src="${p.iconUrl}" alt="">` mit Fallback auf das Emoji, wenn das Bild nicht geladen werden kann (`onerror` handler). Icon-Größe per CSS konstant halten, damit das Grid nicht springt.

**Verify:** Portal öffnen, jede Plugin-Card zeigt das echte GitHub-Repo-Icon (meist `pix/icon.png` oder `pix/eledia_pluginname.png`). Bei Plugins ohne Icon-Datei fällt der Render auf das Emoji zurück.

---

### task36 Moodle-Debug-Anzeige nach Instance-Start deaktivieren
Status: ✅ done 2026-04-09
Feature: feat02 (Moodle-Provisioning)
Entdeckt: 2026-04-09 (Johannes)

**Beobachtung:** Nach dem Start einer frischen Demo-Instanz zeigt Moodle Debug-Messages im Footer/Inline — vermutlich weil moodle-docker standardmäßig auf `$CFG->debug = DEBUG_DEVELOPER` und `$CFG->debugdisplay = true` setzt. Für Produktiv-Demos ist das störend und verunsichert Nutzer.

**Implementierung (zwei-schichtig, belt-and-suspenders):**

1. ✅ **Schicht 1 — config.php-Override** (bereits in commit 795b819): `patchConfigForProduction()` in `src/services/docker.ts` schreibt VOR `require_once('/lib/setup.php')`:
   ```php
   $CFG->debug        = 0;   // DEBUG_NONE
   $CFG->debugdisplay = 0;   // keine Meldungen inline
   ```
   Das greift für alle Code-Pfade, die aus `$CFG->debug` lesen. Moodle behandelt config.php-Werte als „hardcoded" und überschreibt sie nicht aus der DB.

2. ✅ **Schicht 2 — DB-Reset nach Snapshot-Restore** (neu, diese Session): `src/services/snapshot.ts` `restoreSnapshot()` führt nach dem Dump-Import ein `UPDATE mdl_config SET value='0' WHERE name IN ('debug','debugdisplay','debugstringids','debugsmtp','debugpageinfo','debugvalidators','perfdebug','debugusers','debugsqltrace');` aus.
   Warum: Einige Moodle-Code-Pfade rufen `get_config('core', 'debug')` direkt statt `$CFG->debug` zu lesen. Wenn der Snapshot vom Seed-Host mit `debug=32767` angelegt wurde, würden diese Stellen weiter Debug-Output zeigen, obwohl config.php `debug=0` sagt. Der DB-Reset im Restore sorgt für Konsistenz.
   Pgsql und MariaDB/MySQL beide abgedeckt, Caches werden direkt danach gepurged damit die neuen Werte in die Runtime kommen.

3. **Nicht umgesetzt (absichtlich):** `debug?: boolean` Parameter im `instance_start`-Tool für Dev-Workflows. Begründung: Für Debug brauchen Entwickler ohnehin direkten Container-Zugriff, und ein optionaler Debug-Modus pro Instance würde den Code unnötig komplizieren. Wer debuggen will, setzt den Wert manuell via `docker exec … psql …`.

**Verify:** Nach Deploy (GitHub Actions), frische Demo (z.B. `leitnerflow`) starten, Login als Admin/Teacher/Student, Kurs öffnen, Aktivität öffnen. Erwartung: Footer komplett ohne Debug-Messages, keine Stack-Traces, keine „DEBUG:"-Boxen. Wenn doch etwas auftaucht: im Container `docker exec … psql -U moodle -c "SELECT name,value FROM mdl_config WHERE name LIKE '%debug%';" moodle` und verifizieren, dass überall `0` steht.

---

### task37 Konzept: `local_runbotadmin` — In-Moodle Admin-Plugin als Alternative zum externen Snapshot-Build
Status: open (Konzept, noch nicht implementiert)
Feature: feat08 (Snapshot-System) + feat09 (Plugin-Katalog) + feat02 (Provisioning)
Entdeckt: 2026-04-09 (Johannes)
Priorität: hoch-mittel — strategische Alternative zum fragilen externen `snapshot_build`

**Motivation**

Das aktuelle Snapshot-System (externes `snapshot_build` MCP-Tool + pinned-Flag) löst das Cleanup-Race-Condition-Problem, ist aber konzeptionell umgekehrt gedacht: Der Runbot-Server orchestriert von außen einen Moodle-Provisioning-Flow, wartet blind, versucht Plugin-Installation, dumpt die DB, räumt auf. Jeder Schritt kann fehlschlagen, und der Admin sieht das Ergebnis erst am Ende (wenn überhaupt).

Johannes' Idee: Ein **Moodle-Plugin im Moodle**, das dem Admin eine native GUI für alle Demo-Plattform-Operationen gibt. Der Admin arbeitet in Moodle, wie er es gewohnt ist, und klickt am Ende „Aktuellen Zustand als Snapshot speichern". Alles andere passiert transparent im Backend.

**Architektur**

```
 ┌──────────────────────── demo.eledia.ai ────────────────────────┐
 │                                                                 │
 │  ┌────────────────────┐         ┌──────────────────────────┐  │
 │  │  Moodle-Instanz    │  HTTPS  │  Runbot-Backend (MCP)    │  │
 │  │  local_runbotadmin │◄───────►│  /api/internal/*         │  │
 │  │  Admin-GUI         │  Token  │  exec into DB-Container  │  │
 │  └────────────────────┘         └──────────────────────────┘  │
 │         ▲                                                       │
 │         │                                                       │
 │    Admin klickt                                                │
 │    „Snapshot speichern"                                        │
 └─────────────────────────────────────────────────────────────────┘
```

Das Plugin `local_runbotadmin` ist Teil jeder Moodle-Instanz (wird bei `provisionInstance()` mit eingespielt). Es kennt seine `instance_id` aus einer env-Variable, die der Runbot-Server beim Start des Containers setzt. Alle Backend-Calls laufen über ein shared-secret Token, das ebenfalls über env injiziert wird.

**Feature-Set**

Tab **„Snapshots"** in der Site-Administration:
1. Liste aller Snapshots für diesen Plugin-Slug (aus Runbot-Backend gefetcht)
2. Button **„Aktuellen Zustand als neuen Snapshot speichern"** → Label + Beschreibung-Eingabe → POST `/api/internal/snapshot/create` → Backend führt `pg_dump` im DB-Container aus → Snapshot wird mit Metadaten im Runbot-Storage abgelegt
3. **Download** pro Snapshot (streamt das `.sql.gz` über den Browser)
4. **Upload** lokaler Snapshots via drag&drop (für Backup-Restore oder Transfer zwischen Umgebungen)
5. **Löschen** pro Snapshot mit Bestätigungs-Dialog
6. **„Als Default-Snapshot setzen"** → schreibt `defaultSnapshot` in die `configs.json` des Plugins

Tab **„Plugin-Management"**:
1. Installierte Plugins anzeigen (Liste aus `mdl_config_plugins`)
2. **Plugin aus GitHub-URL installieren** → POST `/api/internal/plugin/install` → Backend klont Repo in den Container, führt `admin/cli/upgrade.php` aus, Browser reloadet
3. Plugin upgraden (git pull + upgrade.php)
4. Plugin deinstallieren

Tab **„Plugin-Metadaten"** (für Portal-Einträge):
1. Formular mit Feldern: Titel, Kurzbeschreibung, Langbeschreibung, GitHub-URL, Icon-URL, Kategorie, Tags
2. Button **„Aus GitHub auto-fetchen"** → liest README.md (erster Absatz → Beschreibung), Repo-Description (→ Kurzbeschreibung), `pix/icon.svg` oder `pix/icon.png` (→ Icon)
3. Änderungen schreibt das Backend direkt in `configs.json` und pusht optional nach GitHub
4. Live-Preview wie der Eintrag im Portal-Grid aussieht

**Vorteile gegenüber dem aktuellen `snapshot_build`**

a) **Keine Timing-Probleme.** Die Instance läuft bereits und wird aktiv vom Admin benutzt — Cleanup-Scheduler ist nie ein Thema, weil jede Admin-Interaktion die `lastActivity` updatet.

b) **Admin sieht das Ergebnis LIVE.** Snapshot wird gemacht aus dem Zustand, den der Admin gerade sieht — keine Blind-Provisionierung mehr, kein Rätseln ob der Seed-Kurs erstellt wurde.

c) **Iterativ.** Wenn ein Snapshot nicht passt, ändert der Admin was, klickt nochmal. Drei Klicks statt drei Deploy-Zyklen.

d) **Debug-freundlich.** Fehler beim Snapshot-Erstellen erscheinen direkt in der Moodle-UI, nicht in einer MCP-Response weit weg.

e) **Kein `pinned`-Hack nötig.** Der pinned-Flag aus task30 kann langfristig wieder raus, weil das Problem nicht mehr existiert.

f) **Plus: Plugin-Metadaten-Pflege wird zum Admin-Task.** Heute muss jemand die `configs.json` per Hand editieren — künftig klickt der Plugin-Autor in der eigenen Demo-Instanz „Metadaten aus GitHub aktualisieren" und fertig.

**Nachteile / offene Fragen**

- Plugin muss zur Base-Installation gehören → ein zusätzlicher `cp -r` Schritt in `docker.ts provisionInstance()`
- Backend braucht neue `/api/internal/*` Endpoints mit Token-Auth (separater Auth-Pfad neben dem existierenden MCP-API-Key)
- Upload-Größe: PHP `upload_max_filesize` und `post_max_size` müssen für große Snapshots (>100 MB) hochgesetzt werden — Overrides in `patchConfigForProduction()` oder eine `.htaccess`-Einstellung
- Download muss streamen statt komplett in den Speicher zu laden → `readfile()` mit chunked output
- Auth: Wenn das Instance-Token leakt (Log, Screenshot), kann jemand Snapshots auslesen. Mitigation: Token rotiert bei jedem Instance-Start + CORS-Check + Referer-Check
- Was passiert wenn der Admin einen Snapshot erstellt, während ein anderer Nutzer parallel in der Demo-Instanz klickt? → DB ist konsistent, weil `pg_dump` eine Momentaufnahme macht, aber es sollte einen Hinweis geben

**Implementierungs-Schritte (grobe Schätzung)**

1. Plugin-Skeleton `local_runbotadmin` anlegen — ein `lang/`, `version.php`, `db/access.php`, `classes/output/renderer.php`, `settings.php` ~ 2h
2. Backend: `/api/internal/snapshot/create` + `/list` + `/delete` + `/download` + `/upload` mit Token-Auth ~ 4h
3. Moodle-seitige HTTP-Calls via `curl` aus `lib/moodlelib.php`-Functions, Response-Rendering ~ 3h
4. Plugin-Management-Tab (GitHub-URL-Install) — Backend-Endpoint + moodle-CLI-Integration ~ 3h
5. Plugin-Metadaten-Tab mit GitHub-Auto-Fetch und configs.json-Writeback ~ 3h
6. CSS/UX-Feinschliff nach eLeDia-Designsystem ~ 2h
7. Dokumentation + Testlauf ~ 1h

**Gesamt:** ~18h konservativ, ~12h wenn's gut läuft.

**Vergleich Aufwand/Nutzen**

| Aspekt | `snapshot_build` (heute) | `local_runbotadmin` (Konzept) |
|---|---|---|
| LoC | ~400 TS | ~800 PHP + ~200 TS |
| Onboarding für Nicht-Dev | ❌ MCP-Tool-Call nötig | ✅ Login + Klick |
| Iteration | ❌ Provisionierung neu | ✅ Live-Editing |
| Fehlerdiagnose | ❌ Logs auf VPS | ✅ UI-Feedback |
| Plugin-Metadaten-Pflege | ❌ configs.json editieren | ✅ GUI |
| Upload lokaler Snapshots | ❌ scp + MCP-Call | ✅ Drag&Drop |

**Empfehlung**

Parallel zur Task-Queue (task31–task36) als größere Investition einplanen. Nicht als Ersatz für `snapshot_build` ab Tag 1 — beide Wege können koexistieren, das Plugin wird schrittweise zur primären UX für Snapshot-Erzeugung. `snapshot_build` bleibt als CLI-/CI-Fallback im MCP.

**Abhängigkeiten**

- Erfordert ein shared-secret Token-System auf dem Backend (gibt's schon als MCP-API-Key — wiederverwendbar?)
- Braucht Netzwerk-Policy: Moodle-Container muss `demo.eledia.ai/api/internal/*` erreichen können (intern via `host.docker.internal` oder direkt über extern-IP)
- Plugin muss eLeDia-Branding nutzen → Skill `eledia-moodle-ux` als Referenz

**Verify (wenn implementiert):**
- Admin startet `leitnerflow` Demo, loggt sich ein, geht zu Site-Admin → Runbot → Snapshots → „Neuen Snapshot speichern" → Label „test-manual", Beschreibung „Konzept-Test"
- Erwartung: Erfolgsmeldung, Snapshot taucht im Listing auf, in `/var/lib/moodle-runbot/snapshots/` liegt neue `.sql.gz` + `.json`
- Zweiter Test: `instance_start` mit dem neuen Snapshot → Instance hochfahren, prüfen ob Zustand korrekt restauriert
- Dritter Test: Upload eines lokalen Snapshots via Browser → muss in Liste auftauchen und nutzbar sein

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
