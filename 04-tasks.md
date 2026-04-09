# Tasks

## Meta

Operatives Zentrum des Projekts. Hier beginnt jede Session.
Enthält: neue Beobachtungen, Tasks, Klärungsbedarf, aktive Arbeit, Verifikationsschritte.

---

## 🆕 New

*(Neue Ideen, Beobachtungen, ungefilterte Einträge hier)*

**Code-Review 2026-04-09** — Vollständiger Durchgang durch Services, Tools, Webui, Setup + Deploy ergab 12 neue/reopened Findings (bug02, bug04 partial, bug06–17). Details in `05-quality.md`. Daraus abgeleitete Tasks: task14–task20. Kritische Bundle für HTTPS-Pfad: task14 + task15 (zusammen bearbeiten, da isoliert nicht testbar).

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
Status: in-progress
Feature: feat03
Bugs: bug02

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
Status: in-progress
Feature: feat02, feat03
Bugs: bug06, bug14

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
Status: open
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
Status: open
Feature: feat01 (Webui)
Bugs: bug10, bug11

1. `statPlugins` → `statActive` (ID-Mismatch).
2. Hardcoded `6` → `configs.length`.
3. `function close()` → `closeModal()`.

---

### task19 Snapshot leitnerflow-v1 auf VPS erstellen
Status: open
Feature: feat01, feat05
Bugs: bug13

1. Manuell auf VPS: eine Instanz mit leitnerflow starten, Demo-Daten anlegen (Beispiel-Kurs "demo", Testnutzer, ein paar Karten-Decks)
2. `snapshot_create` MCP-Tool aufrufen → `/opt/snapshots/leitnerflow-v1.sql.gz` + `.json`
3. `configs.json` → `snapshotId: "leitnerflow-v1"`
4. Demo-Flow testen: neue Anfrage → Snapshot wird restauriert → Demo startet in < 90s
5. Loading-Page 5 Schritte passen dann zur Realität.

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

## 🔧 In Progress

- task14 nginx HTTPS + Wildcard-Cert (Bundle mit task15)
- task15 docker.ts wwwroot/sslproxy patch (Bundle mit task14)

*(Tasks die gerade aktiv bearbeitet werden)*

---

## 🔎 Verify After Deploy

- [ ] HTTPS-Subdomain erreichbar nach nginx-Fix (task14, feat03)
      Test: `curl -I https://demo-xxx.demo.eledia.ai` → 200 OK oder Moodle-Redirect
- [ ] nginx Pre-Flight: fehlende Cert-Files → Warning im Log, kein Crash
- [ ] `$CFG->wwwroot` zeigt auf `https://{id}.demo.eledia.ai` ohne Port-Suffix (task15, feat02)
      Test: `docker exec runbot-demo-xxx_webserver cat /var/www/html/config.php | grep wwwroot`
- [ ] `$CFG->sslproxy = true` in config.php (task15)
- [ ] Moodle-interne Links kommen als `https://` (kein Mixed-Content im Browser)
- [ ] MCP `instance_status` liefert `https://` URL konsistent mit E-Mail (task16)
- [ ] plugin-detail.html "Demo starten" öffnet Modal, crasht nicht (task17)

---

## ✅ Done

- task01 config.php-Patch: removePortBlock() + wwwroot korrekt
- task02 nginx HTTPS: HTTP→HTTPS-Redirect + Wildcard-Cert

---

## Rules

- Neue Einträge zuerst unter "New" → dann zu Task konvertieren
- Tasks klein halten, klar formuliert
- Abgeschlossene Tasks nach "Done" verschieben, nicht löschen
