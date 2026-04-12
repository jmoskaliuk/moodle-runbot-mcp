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
Entdeckt: 2026-04-10
Betroffen: <Datei/Feature/URL falls bekannt>
Repro: <was hast du gemacht, was ist passiert, was hättest du erwartet>
Workaround: <falls du einen hast, sonst leer>
```

**Feature-Template (unter `## 💡 Ideen` einfügen oder direkt nach `01-features.md` → `featXX`):**

```markdown
### ideaXX <kurzer Titel>
Datum: 2026-04-10
Wunsch: <ein Satz — was soll das Produkt tun>
Warum: <kurz — welches Problem löst es>
Offen: <was ist dir noch unklar>
```

Für größere Features lieber direkt in `01-features.md` als `featXX`-Block
(dort steht ein analoges Template oben).

---

## 🐞 Bugs

*(Neue Bug-Beobachtungen hier reinkippen — Claude sortiert und priorisiert
im nächsten Task. Format siehe Quick-Capture oben. Gefixte Bugs wandern in
`05-quality.md` zur dauerhaften Archivierung.)*

Aktuell keine offenen Bugs.

---

## 💡 Ideen

*(Halbgare Feature-Gedanken hier. Sobald konkret genug, wandern sie in
`01-features.md` als `featXX`-Block.)*

### idea: nginx-Config sauber aufräumen

Der nginx vor dem Node-Backend proxyt `/api/*` mit trailing-slash
(`proxy_pass http://127.0.0.1:3000/;`) und strippt dadurch den
`/api/`-Präfix vor dem Forward an Express. Das ist der Grund für die
Alias-Routen in `src/index.ts` (`/demo-status/:token` neben
`/api/demo-status/:token`, `/plugininfo/:id` neben `/api/plugininfo/:id`,
historisch auch `/configs` neben `/api/configs`). Wir haben uns bereits
zweimal daran geschnitten:

- Plugin-Detail-Seite: Bis 2026-04-09 wurde `loadPluginData()` still
  mit einer HTML-Antwort statt JSON gefüttert, weil `/api/plugin/:id`
  nach dem Strip als `/plugin/:id` den HTML-Handler getroffen hat.
- Warteseite: Bis 2026-04-09 zeigte sie "Ihre Demo-Anfrage ist
  abgelaufen", weil `/api/demo-status/:token` nach dem Strip auf
  eine nicht existierende Route lief (3× 404 → Error-State).

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

Aktuell nichts Neues seit dem 2026-04-10-Cleanup.

---

## ❓ Clarification Needed

*(Offene Fragen an Johannes)*

Aktuell keine offenen Fragen.

---

## 📋 Tasks

### task37c `local_runbotadmin` Stage 3 — Upload, Plugin-Management, Metadata
Status: open
Feature: feat05, in-Moodle-Admin
Voraussetzung: task37b done (Stage 2 fertig)

Fortsetzung der in-Moodle-Admin-GUI. Stage 1 (task37) lieferte Create +
List; Stage 2 (task37b) lieferte Download, Delete, Set-Default. Stage 3
ergänzt die noch fehlenden Workflows, damit der externe curl-Workflow
(`project_runbot_snapshots.md`) endgültig abgelöst werden kann.

**Scope**

1. **Snapshot-Upload** vom Admin-Laptop direkt ins `SNAPSHOT_DIR`
   - Neuer Endpoint `POST /api/internal/snapshot/upload` mit `multipart/form-data`
   - Server-seitige Validierung: Size-Limit (z.B. 500 MB), `.sql.gz`-MIME-Prüfung,
     Path-Containment-Check beim Zielpfad, Plugin-Scope-Check gegen rufende Instanz
   - Atomic-Write via `tmp-file + rename`
   - Moodle-UI: Drag-and-Drop-Feld im Snapshots-Tab + Metadata-Eingabe (Label, Description, Plugins)
2. **Plugin-Management-Tab**
   - Install/Update eines Plugins aus GitHub direkt in die laufende Instanz
   - Nutzt `src/services/github.ts` für Release-Lookup
   - Runbot-Backend ruft `docker.installPlugin()` + `purge_caches.php`
3. **Metadata-Tab**
   - Bearbeitung von Label, Description, Plugins-Liste eines bestehenden Snapshots
   - Neuer Endpoint `POST /api/internal/snapshot/update-metadata`
4. **Rate-Limiting + Audit-Logging**
   - Simple per-Instance-Rate-Limit (z.B. 10 Actions / Minute) gegen Missbrauch
   - Audit-Log nach `logs/runbot-admin-audit.log` mit Timestamp, Instance-ID, Action, Actor
5. **Infrastruktur**
   - Einheitlicher CSRF-Token-Check (bisher: Moodle-`sesskey`, reicht für Stage 2 — Stage 3 braucht evtl. mehr bei Upload)
   - Error-Handling-Overhaul: konsistente deutsche Fehlermeldungen im Plugin-UI

**Aufwand:** ~10–12 h (Upload 4 h, Plugin-Mgmt 3 h, Metadata 1 h, Rate-Limit + Audit 2 h, Infra 2 h)

**Priorität:** mittel — aktuell ist der Stage-2-Funktionsumfang ausreichend
für den täglichen Workflow, Stage 3 ist eine Komfort- und
Robustheits-Ergänzung.

---

### task39 exam2pdf Demo-Bereitschaft: Plugin-Clone + Snapshot auf VPS
Status: open
Feature: feat04
Voraussetzung: task38 done (Config aktiviert)

Die Demo-Karte für `local_eledia_exam2pdf` ist seit Commit `32339ad`
(2026-04-12) in `configs.json` aktiviert (`visible: true`). Damit die Demo
tatsächlich startbar ist, müssen auf dem VPS noch zwei Schritte erfolgen:

**1. Plugin-Repo klonen**
```bash
ssh root@178.104.171.153
git clone https://github.com/jmoskaliuk/local_eledia_exam2pdf.git /opt/plugins/local_eledia_exam2pdf
```

**2. Snapshot `exam2pdf-v1` erstellen**
- Seed-Instanz starten (analog task19-Runbook für leitnerflow):
  ```bash
  curl -sX POST http://localhost:3000/mcp/call \
    -H "Authorization: Bearer $MCP_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"name":"instance_start","arguments":{"configId":"exam2pdf","owner":"seed@eledia.ai"}}' | jq .
  ```
- Im Browser auf der Seed-Instanz Demo-Daten anlegen:
  - Quiz mit 5–10 Beispielfragen (Mix aus MC, Wahr/Falsch, Freitext)
  - Als Student ein Quiz bestehen → PDF wird automatisch erzeugt
  - Plugin-Settings konfigurieren (Ausgabemodus, optionale Felder)
- Snapshot erstellen:
  ```bash
  INSTANCE_ID="..."  # aus Schritt 1
  curl -sX POST http://localhost:3000/mcp/call \
    -H "Authorization: Bearer $MCP_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"snapshot_create\",\"arguments\":{\"instanceId\":\"$INSTANCE_ID\",\"snapshotId\":\"exam2pdf-v1\",\"description\":\"exam2pdf Demo mit Beispiel-Quiz und PDF-Zertifikat\"}}" | jq .
  ```
- Seed-Instanz stoppen
- E2E-Test: Über https://demo.eledia.ai eine exam2pdf-Demo anfordern, prüfen ob Quiz + PDF-Download funktioniert

**Aufwand:** ~1–2 h (inkl. Demo-Daten-Erstellung)

---

### task40 Kategorie-Filter "Prüfungen" im Demo-Portal
Status: open
Feature: feat04
Voraussetzung: task38 done

Die exam2pdf-Karte hat die Kategorie `pruefungen` / "Prüfungen & Compliance".
Im Portal-Frontend existieren aktuell nur Filter für: Alle, Lernen, Verwaltung,
Reporting. Der Filter "Prüfungen" fehlt — die Karte wird zwar bei "Alle"
angezeigt, ist aber nicht einzeln filterbar.

**Fix:**
1. In `demo-portal.html` → `<div id="catFilters">` einen neuen Button ergänzen:
   ```html
   <button class="fbtn" onclick="filter('pruefungen',this)" data-i18n="filter_exam">Prüfungen</button>
   ```
2. i18n-Strings ergänzen:
   - DE: `filter_exam: 'Prüfungen'`
   - EN: `filter_exam: 'Exams'`
3. FALLBACK_CONFIGS um exam2pdf-Eintrag ergänzen (analog LeitnerFlow)

**Aufwand:** ~15 min

---

## 🔄 Active

*(Tasks die gerade aktiv bearbeitet werden)*

Aktuell nichts aktiv.

---

## 🔎 Verify After Deploy

### task37b Stage 2 — live-verify auf VPS
Status: open (pending manual verification)

Deployed via commit `b4cb814` (2026-04-10). Im Browser prüfen:

1. Admin-Dashboard → Snapshots-Tab zeigt Tabelle mit Snapshot-Zeilen
2. Neue Zeilen haben `[Download]`, `[Set Default]`, `[Delete]`-Buttons
3. Aktueller Default hat ★-Badge, keine Delete-/Set-Default-Buttons
4. Download-Button lädt `.sql.gz`-File direkt (kein HTML-Chrome drumherum)
5. Set-Default auf anderen Snapshot ändert `configs.json` atomar, Badge wandert
6. Delete auf Nicht-Default löscht File + Metadata; Bestätigungs-Dialog erscheint
7. Delete auf aktuellen Default → 409 mit freundlicher Fehlermeldung

### task38 exam2pdf-Karte — verify auf Portal
Status: open (pending deploy + verify)

Deployed via commit `32339ad` (2026-04-12). Prüfen:

1. https://demo.eledia.ai → exam2pdf-Karte sichtbar mit 📄-Icon und Beschreibung
2. Kategorie "Prüfungen & Compliance" wird korrekt angezeigt
3. "Demo starten" → E-Mail-Modal öffnet sich (Demo wird erst nach task39 tatsächlich starten können)

### Weitere offene Verify-Items

- [ ] nginx Pre-Flight: fehlende Cert-Files → Warning im Log, kein Crash (muss manuell durch Cert-Rename simuliert werden)

---

## ✅ Done

*Abgeschlossene Tasks, eine Zeile pro Task. Für Volltext-Details siehe
`05-quality.md` (Bugs) oder den jeweiligen Commit.*

**Infrastructure & Core (task01–task13)**
- task01 config.php-Patch: `removePortBlock()` mit Brace-Counter statt Regex (obsoleted durch task15's `patchConfigForProduction()`)
- task02 nginx HTTPS konfigurieren → **reopened als task14** (Fix war nie im Code angekommen)
- task03 feat04 dokumentieren — `DemoConfig`-Struktur + `configs.json`
- task04 feat05 Snapshot-System dokumentieren — `.sql.gz` + `.json`, pgsql/mariadb/mysql
- task05 feat06 Cleanup-Scheduler dokumentieren — 60 min max, 15 min Inaktivität, 60 s Polling
- task06 feat07 Demo-Nutzerverwaltung dokumentieren — teilweise obsoleted durch feat10
- task07 `sendErrorEmail()` bei fehlgeschlagenem Demo-Start — non-fatal catch
- task08 Demo-Portal Frontend — `demo-portal.html`, `plugin-detail.html`, relative API-URLs
- task09 E2E-Test Demo-Flow — 2026-04-09 komplett auf VPS durchgespielt, commit `30157f8`
- task10 `instance.url` auf HTTPS (partial, vollständig in task16)
- task11 `configs.json` Pflichtfelder — `db`, `features[]` ergänzt
- task12 `setup.sh` Placeholder-URLs auf `jmoskaliuk/moodle-runbot-mcp` + `demo.eledia.ai`
- task13 GitHub Actions CI/CD — `.github/workflows/deploy.yml`, Push auf main → SSH deploy

**Code-Review-Bundle 2026-04-09 (task14–task20)**
- task14 nginx HTTPS + Wildcard-Cert — `listen 443 ssl`, `SSL_CERT_DIR`, commit `770dd46` (bundled mit task15)
- task15 `patchConfigForProduction()` — `$CFG->wwwroot`, `$CFG->sslproxy`, `tool_replace_allowdb` (commit `770dd46`, bug06+bug14-fix)
- task16 `tools/instances.ts → instanceUrl()` auf `https://` (bug09-fix)
- task17 `plugin-detail.html` — MCP-Direktstart raus, Token-Flow rein (commit `4aa961d`, bug07+bug08+bug12+bug18-fix, Variante B)
- task18 `demo-portal.html` — `statPlugins`-ID + `close()`→`closeModal()` (bug10+bug11-fix)
- task19 Snapshot `leitnerflow-v1.sql.gz` auf VPS — Cold-Start von ~3 min auf ~5 s reduziert, commit `4c29d5e`
- task20 `cleanupOrphans()` — Startup-Cleanup für verwaiste Container/Dirs/Configs (bug17-fix)

**UX-Feature-Backlog 2026-04-09 (task21–task28, task30)**
- task21 Portal UI-Polish — Logo, Navigation, Sprachtoggle
- task22 Warteseite Live-Status-Polling — `/api/demo-status/:token`, Credentials-Box, Demo-Öffnen-Button (feat09)
- task23 Plugin-Icon aus GitHub — `resolvePluginIconUrl()` in `github.ts`, Plugin-Detailseite (feat13, commit `ee798b0`)
- task24 Multi-User-Demo-Szenarien — admin/teacher/student im Snapshot, `multiUser`-Flag (feat10, commit `795b819`)
- task25 Admin-Dashboard — `webui/admin.html`, Basic Auth, Instanzen + Tokens (feat11, commit `997c608`)
- task26 Extend-Codes — `POST /api/extend-code`, `EXTEND_CODES` Env, 1-Tag-TTL (feat12)
- task27 Details-Link im Demo-Portal — Link zur Plugin-Detail-Seite (commit `0ac642a`)
- task28 Ready-Page + E-Mail UX-Feinschliff — pro-Account-Kopier-Buttons, Spacing (commit `a3eff28`)
- task30 Snapshot-Building-Instanzen schützen — `pinned: true`-Flag, `snapshot_build` One-Shot-Tool (commit `1f98bb4`)

**Lifecycle + Branding-Bundle 2026-04-10 (task29, task31–task36)**
- task29 Token-Status nach Instanz-Stop auf EXPIRED — `tokens.markExpired()`, Cleanup-Scheduler-Integration (commit `b4cb814`)
- task31 "Demo starten"-Button neben E-Mail-Eingabe — prominenter CTA (commit `94177d3`)
- task32 E-Mail-Layout: Logo + Website-Schrift — `emailTemplates.ts` Refactor, Brevo-SMTP (commit `b4cb814`)
- task33 Moodle-Site-Name auf "Demo | <Plugin-Titel>" — `docker.ts` Site-Name-Patch (commit `b4cb814`)
- task34 "Demos aktiv"-Zähler: Fake-Range 3–17 — `statActive` im Portal (commit `94177d3`)
- task35 Plugin-Icon aus GitHub im Portal-Grid — `configsHandler` enrichment via `resolvePluginIconUrl()` (commit `b4cb814`)
- task36 Moodle-Debug-Anzeige deaktivieren nach Instance-Start — `$CFG->debug = 0` (commit `795b819`)

**In-Moodle Admin Plugin (task37, task37b)**
- task37 `local_runbotadmin` MVP — Stage 1: Create + List (commit `5a634cd`)
- task37b `local_runbotadmin` Stage 2 — Download, Delete, Set-Default, atomic `updateConfig()`, binary-streaming (commit `b4cb814`)

**Plugin-Demos (task38)**
- task38 exam2pdf Demo-Karte aktivieren — `configs.json` updated: `visible: true`, Kategorie "Prüfungen & Compliance", Metadaten aktualisiert (commit `32339ad`, 2026-04-12)

---

## Rules

- Neue Einträge zuerst unter "New" → dann zu Task konvertieren
- Tasks klein halten, klar formuliert
- Abgeschlossene Tasks als One-Liner in "Done" archivieren — Volltext-Details gehören in `05-quality.md` (Bugs) oder in die Commit-Message
- Fixed Bugs wandern aus "🐞 Bugs" komplett nach `05-quality.md`
