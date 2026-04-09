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
Status: fixed (task02)

**Description**
`registerInstance()` in `nginx.ts` generierte nur einen HTTP-Server-Block auf Port 80. Moodle-Instanzen waren nur über HTTP erreichbar, obwohl ein Wildcard-Zertifikat vorhanden ist. `$CFG->wwwroot` wurde außerdem auf `https://...` gesetzt — Mismatch führte zu Redirect-Schleifen.

**Fix**
HTTP→HTTPS-Redirect (301) + HTTPS-Server-Block mit SSL-Certs aus `CERT_DIR`.

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
