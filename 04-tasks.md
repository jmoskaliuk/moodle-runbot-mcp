# Tasks

## Meta

Operatives Zentrum des Projekts. Hier beginnt jede Session.
Enthält: neue Beobachtungen, Tasks, Klärungsbedarf, aktive Arbeit, Verifikationsschritte.

---

## ✍️ Quick-Capture für Johannes

Neue Bugs und Feature-Ideen einfach unten in die passende Sektion kopieren.
Format siehe Templates unten.

```markdown
### bugXX <kurzer Titel>
Status: open
Entdeckt: 2026-04-16
Betroffen: <Datei/Feature/URL falls bekannt>
Repro: <was hast du gemacht, was ist passiert, was hättest du erwartet>
Workaround: <falls du einen hast, sonst leer>
```

```markdown
### ideaXX <kurzer Titel>
Datum: 2026-04-16
Wunsch: <ein Satz>
Warum: <welches Problem löst es>
Offen: <was ist dir noch unklar>
```

---

## 🐞 Bugs

Aktuell keine offenen Bugs.

---

## 💡 Ideen

### idea: nginx-Config sauber aufräumen

Der nginx vor dem Node-Backend proxyt `/api/*` mit trailing-slash
(`proxy_pass http://127.0.0.1:3000/;`) und strippt dadurch den
`/api/`-Präfix. Das ist der Grund für die Alias-Routen in `src/index.ts`.
Cleanup-Vorschlag: `proxy_pass http://127.0.0.1:3000;` (ohne trailing slash).
Muss ein Wartungsfenster sein. Low-risk, aber aktuell nicht pressing.

---

## 🆕 New

*(Neue Ideen, Beobachtungen, ungefilterte Einträge hier)*

Aktuell nichts Neues seit dem 2026-04-16 Onlineshop-Konzept-Abschluss.

---

## ❓ Clarification Needed

*(Offene Fragen an Johannes — derzeit Shop-Content)*

- **AGB-Text:** Johannes sagte "AGB nicht kompliziert". Task offen: Johannes
  liefert finalen Text, wird in `templates/agb-v1.md` eingesetzt.
- **AVV-Text:** Bestehende AVV-Vorlage (laut Johannes vorhanden). Task offen:
  Text in `templates/avv-template-v1.md` übertragen, inkl. TOM-Anhang und
  Unterauftragsverarbeiter-Liste.
- **Styleguide für PDF:** Johannes sagte existiert. Muss an die pandoc-Pipeline
  in Woche 2 angedockt werden.

---

## 📋 Tasks

### task37c `local_runbotadmin` Stage 3 — Upload, Plugin-Management, Metadata
Status: open
Feature: feat05, in-Moodle-Admin
Voraussetzung: task37b done

Erweitert die **in-Moodle**-Admin-GUI (nicht zentral, läuft in jeder Demo).
Die zentrale Admin-UI hat seit task43 einen vollständigen Snapshot-Manager —
task37c bleibt nur noch für Zusatz-Features (Plugin-Install in laufender
Instanz, Audit-Logging). Mittlere Priorität, ~10–12 h.

---

### task39 exam2pdf Demo-Bereitschaft: Plugin-Clone + Snapshot auf VPS
Status: open → ersetzbar durch task43
Feature: feat04

Seit task43 (Plugin-Wizard in Admin-UI) kann das manuell geklont werden
über https://demo.eledia.ai/api/admin → "+ Plugin hinzufügen". Bleibt
als Task dokumentiert für den historischen Kontext; das konkrete
`git clone` kann aber wegfallen.

---

### task40 Kategorie-Filter "Prüfungen" im Demo-Portal
Status: open
Feature: feat04

In `demo-portal.html` `catFilters` den Button `pruefungen` ergänzen +
i18n-Strings `filter_exam`. Aufwand: ~15 min.

---

### task42 Bestehende Snapshots auf Moodle 5.1 neu bauen
Status: open → deutlich vereinfacht durch task43b
Feature: feat05, feat14

Seit Stage 1B (Rebuild-Button, commit `d9c193f`) ist das ein einziger
Klick im Admin:
1. https://demo.eledia.ai/api/admin → Sektion "Snapshots"
2. Bei `leitnerflow-v1` im Dropdown "LeitnerFlow" wählen
3. 🔄 Rebuild klicken → ~5–10 min Live-Fortschritt im Modal
4. Fertig — Snapshot ist auf Moodle 5.1 migriert
5. Dann `configs.json` `moodleVersion` zurück auf 5.1 setzen (per
   "★ Set Default" im UI, oder manuell)

---

### task45 Automatischer Plugin-Clone im Wizard
Status: done (task43 Stage 1D)
Feature: feat14

task43 Stage 1D implementiert das — der Plugin-Wizard klont das Plugin
automatisch und parst `version.php`. Manueller `git clone` auf dem VPS
entfällt.

---

### task46 Onlineshop Woche 1b — Order-Endpoints + Mail-Templates
Status: **implementiert, pending Verify** (2026-04-17)
Feature: feat15 (Onlineshop, siehe `konzept-onlineshop.md` v0.6)
Voraussetzung: `orders.ts`-Service in place (commit `be97b3a`), Konzept v0.6 bestätigt (`793020e`)

**Umgesetzt (Woche 1b):**

1. Express-Routen — alle dual registriert (`/api/shop/*` + `/shop/*` wegen nginx-Strip):
   - `POST /api/shop/order` — Create Draft + Verify-Mail + Admin-Alert (Rate-Limit 3/15min)
   - `GET /api/shop/verify/:token` — Transitioniert zu ORDER_REVIEW, rendert Review-Stub
   - `POST /api/shop/confirm/:token` — Agreements signen, transitioniert zu CONFIRMED+PROVISIONING, feuert `setImmediate` Background-Job
   - `GET /api/shop/order/:token` — Status-Polling (state, subdomain, instanceUrl, error)
2. Mail-Templates in `src/services/emailTemplates.ts`:
   - `mailVerifyOrder` — Double-Opt-In
   - `mailOrderReview` — Bestätigung + Review-Link (Backup)
   - `mailOrderConfirmed` — Welcome-Mail (Moodle-URL, Admin-Login, Magic-Link)
   - `mailAdminAlertNewOrder` — Odoo-Notify an `post@moskaliuk.com`
3. Send-Wrapper in `src/services/email.ts` (`sendVerifyOrderEmail` etc.)
4. Review-HTML-Stub (`buildShopReviewStub`) mit 2-Checkbox-Confirm-Flow — wird in
   Woche 3 durch `webui/order-review.html` ersetzt.
5. `provisionOrderInstance(orderId)` in index.ts: dedizierter Background-Job,
   pinned-by-default (`pinReason: "order:<id>"`), nutzt den bestehenden Demo-Flow-
   Stack (docker + nginx + snapshot-restore) und die neue Welcome-Mail.

**Offen für Woche 2 (task47):**
- Echte pandoc-PDFs für AGB/AVV ersetzen die `pending-pdf-woche2`-Platzhalter
  in `markAgreementSigned()`
- Random-16-Zeichen-Admin-Passwort via `docker.setAdminPassword()` + SQL-Update
  auf `m_user.password_expired = 1` (bisher nutzt Shop-Flow `demo1234`, identisch
  zum Demo-Kurz-Flow)

**Aufwand:** ~8–10 h (Woche 1b), ~6–8 h (PDF-Pipeline Woche 2)

---

### task47 Onlineshop Woche 2 — PDF-Generator via pandoc
Status: **implementiert, pending Verify** (2026-04-17)
Feature: feat15

**Umgesetzt:**

1. `src/services/contract-pdf.ts` — neuer Service mit:
   - `renderAgbPdf(order, config, { signedAtIso, signerIp })` — lädt
     `templates/agb-v1.md`, substituiert `{{…}}`-Platzhalter, rendert via
     `pandoc -t pdf --pdf-engine=xelatex`, berechnet SHA256.
   - `renderAvvPdf(order, config, …)` — analog für AVV.
   - `ensureContractPdf(order, config, kind, …)` — lazy Wrapper mit
     Cache-Lookup auf `/opt/runbot/contracts/<orderId>/<kind>.pdf`.
   - `findExistingPdf(orderId, kind)` — reiner Disk-Check ohne Render.
2. Confirm-Handler (`POST /api/shop/confirm/:token`): ruft jetzt echte
   `renderAgbPdf` + `renderAvvPdf` vor `markAgreementSigned` auf —
   `pdfPath` + `pdfSha256` landen korrekt in `order.agreements[]`.
3. Neuer Endpoint `GET /api/shop/agreement/:token/:type` (dual registriert):
   Streamt das AGB- bzw. AVV-PDF, setzt `X-Runbot-PDF-SHA256`-Header,
   aktualisiert `downloadedAt` in orders.json.
4. Review-Stub: Platzhalter-Disclaimer entfernt (PDFs sind jetzt echt).
5. Placeholder-Mapping deckt ab: `firma, strasse, plz, ort, land, ustId,
   name, funktion, email, paket, plugins, userLimit, subdomain, orderId,
   version, datum, uhrzeit, ip, sha`. Unbekannte Keys → `—` (em-dash).
6. Henne-Ei-`{{sha}}`: Platzhalter wird durch statischen Hinweis
   ersetzt, echter SHA liegt in `order.agreements[].pdfSha256`
   (reicht für §126b BGB + Art. 28 (9) DSGVO).

**VPS-Setup (einmalig, Johannes):**

```bash
apt install pandoc texlive-xetex texlive-fonts-recommended
mkdir -p /opt/runbot/contracts && chown runbot:runbot /opt/runbot/contracts
```

**Offen (Woche 4+):**
- Branding im PDF (Logo-Header, eLeDia-Farbakzente) — aktuell xelatex-Defaults.
- `userLimit` + `plugins` aus strukturierten configs.json-Feldern statt
  Fallback-Text (ergänzt sich mit Woche 3/4 Dashboard-Arbeit).
- Integration mit Customer-Dashboard (task49) — Re-Download signierter PDFs.

**Aufwand:** ~6–8 h (umgesetzt)

---

### task48 Onlineshop Woche 3 — Shop-Frontend
Status: implementiert (commit 29c94a9), pending Verify auf VPS
Feature: feat15

Neue HTML-Seiten in `webui/`:
- `shop.html` — öffentliches Bestellformular (Firma, Signer, Subdomain,
  Paket). Lädt Pakete aus `/api/configs`, POST auf `/api/shop/order`.
- `order-review.html` — Magic-Link-Landingpage. Fetched via `GET
  /api/shop/order/:token` (expanded returning billing+signer+agreements),
  zeigt AGB/AVV-Download + SHA256, 2 Accept-Checkboxes, POST auf
  `/api/shop/confirm/:token` → redirect auf `/shop/confirmed/:token`.
- `shop-confirmed.html` — Polling-Success-Page (3s Intervall). Zeigt
  Progress-Liste, bei LIVE CTA mit `instanceUrl` + Copy-Button, bei
  PROVISION_FAILED Fehler-Box mit `provisioningError`-Detail.

Routing-Änderung: `GET /shop/verify/:token` rendert **nicht mehr** das
alte Inline-HTML (`buildShopReviewStub()`), sondern 302-Redirect auf
`/shop/review/:token`. Die alte Stub-Funktion ist aus `src/index.ts`
entfernt, unused `Order`-Type-Import entfernt.

API-Erweiterung (nicht-breaking): `/api/shop/order/:token` liefert
jetzt zusätzlich `billing`, `contact`, `signer`, `agreements` (ohne
internen `pdfPath`), `configDescription`, `notes` — damit
order-review.html ohne zweiten Roundtrip rendern kann.

Smoke-Tests lokal: alle 3 Static-Routes 200, API-Routen erwartungsgemäß
(404/400 bei unbekanntem Token). `tsc --noEmit` grün. VPS-Verify:
- [ ] GET https://eledia.ai/shop lädt Formular
- [ ] End-to-End: Order → Verify-Mail → /shop/review → Confirm →
      /shop/confirmed zeigt LIVE + instanceUrl nach Provisioning

**Aufwand:** ~6 h (tatsächlich: ~5 h)

**Deferred auf task49/Woche 4:**
- Paket-Preisspalte im Formular (configs.json hat noch keinen Preis)
- Mobile-Touchpoint für Download-Status-Poll (aktuell über Click-Delay)
- Persistenter Formular-State bei Reload (localStorage erlaubt, ist aber
  für das MVP Over-Engineering)

---

### task49 Onlineshop Woche 4 — Customer-Dashboard + Internal-Dashboard-Erweiterung
Status: implementiert, pending Verify auf VPS
Feature: feat15

**Customer-Dashboard** (`webui/customer.html`): ✅
- Magic-Link unter `/kunde/:token` (Token aus `orders.ts → issueCustomerMagicToken`)
- Zeigt Bestelldaten, Paket, Instanz-URL + Status, Vertragsdokumente
- State-abhängige Hero-Pill (CONFIRMED/PROVISIONING/LIVE/FAILED/TERMINATED)
- AGB/AVV-PDF-Downloads mit SHA256-Anzeige (lazy via `ensureContractPdf()`)
- 10s-Polling während CONFIRMED/PROVISIONING, Audit-Trail expandierbar
- Backend: `GET /api/kunde/:token`, `GET /api/kunde/:token/agreement/:type`

**Internal-Dashboard-Erweiterung** (`webui/admin.html`): ✅
- Neue Sektion "Bestellungen" oberhalb von Instanzen
- Filter-Chips mit Live-Counter je State (Alle, Review, Confirmed, Provisioning,
  Live, Failed, Rejected, Terminated, Pending Verification)
- Tabelle: Order-ID, Status, Config, Firma, Subdomain, Kontakt, Erstellt, Aktionen
- Detail-Modal zeigt Billing + Signer + Agreements (SHA256) + Instance + History
- Row-Actions: 👁 Details, 🚫 Ablehnen (CONFIRMED/PROVISION_FAILED), 🗑 Kündigen (LIVE)
- Backend: `GET /api/admin/orders[?state=X]`, `GET /api/admin/orders/:id`,
  `POST /api/admin/orders/:id/reject`, `POST /api/admin/orders/:id/terminate`
- Terminate stoppt Container BEVOR die Order transitioniert — verhindert Orphans

**Deferred auf später:**
- Demo-Verlängerung aus Customer-Dashboard (Extend-Code-Flow) — braucht
  erst produktiven Extend-Flow, noch nicht live getestet.
- Admin "Manuell bestätigen" für Sonderfälle — aktuell über MCP/API.

**Aufwand:** ~8 h (tatsächlich: ~7 h)

---

## 🔄 Active

Aktuell nichts aktiv — nächster Schritt ist task46 (Woche 1b).

---

## 🔎 Verify After Deploy

### task37b Stage 2 — live-verify auf VPS
Status: open (pending manual verification)
Deployed: `b4cb814` (2026-04-10)

Im Moodle-Admin prüfen: Admin-Dashboard → Snapshots-Tab zeigt Tabelle mit
Create/Download/Delete/Set-Default-Buttons. Default-Schutz beim Löschen.

### task38 exam2pdf-Karte — verify auf Portal
Status: open (pending deploy + verify)
Deployed: `32339ad` (2026-04-12), Rollback auf 5.0: `ae0ca2f` (2026-04-15)

### task41 Moodle 5.0→5.1 + Debug-Härtung — verify auf neuer Instanz
Status: rolled back (leitnerflow/exam2pdf wieder auf 5.0)
Deployed: `ba3cd01` (2026-04-14) → Hotfix-Rollback `ae0ca2f` (2026-04-15)

Grund für Rollback: Existierender leitnerflow-v1-Snapshot war auf Moodle 5.0
gebaut, Moodle 5.1-Code triggerte beim Restore den Upgrade-Pfad, der mit
"Error reading from database" scheiterte. **Task42 via Stage 1B-Rebuild
erledigt das jetzt in ~10 Min**, danach kann moodleVersion wieder auf 5.1.

Debug-Overrides (7 `$CFG`-Felder) bleiben in docker.ts aktiv, auch unter 5.0.

### task43 Snapshot-Manager + Plugin-Wizard — verify auf https://demo.eledia.ai/api/admin
Status: open (pending deploy + verify)
Deployed: `007c2f8` (1A), `d9c193f` (1B), `2a67780` (1C), `50fc143`+`2d0fbd5` (1D)

**Stage 1A — List/Download/Delete/Set-Default:**
1. /admin → Sektion "Snapshots" mit Tabelle (id, label, Moodle/PHP/DB-Pills,
   Plugins, Größe, erstellt, verwendet-von)
2. "⬇ Download" streamt `.sql.gz`
3. "★ Set Default" schreibt `snapshotId` in configs.json atomar
4. "🗑 Delete" zeigt Default-Schutz-Dialog (409) wenn Snapshot in Use
5. Versions-Mismatch-Warnung beim Set-Default

**Stage 1B — Rebuild-Button:**
1. Dropdown wählen, 🔄 Rebuild klicken
2. Modal zeigt Phase-Pill + Live-Log (provisioning → installing_plugin →
   starting_containers → restoring_snapshot → **running_upgrade** →
   creating_snapshot → stopping → ✓ done)
3. Seed-Instanz ist pinned, Cleanup-Scheduler ignoriert sie
4. Fehler-Cleanup: Best-effort stop + dir cleanup auch bei Exception

**Stage 1C — Edit-Live:**
1. ✏️ Edit Live öffnet Modal, startet Seed-Instanz
2. Bei State `ready`: Zeile zeigt Banner mit ↗ Demo öffnen + 💾 Save + ✗ Discard
3. Admin editiert manuell in Moodle-Browser
4. 💾 Save → createSnapshot (überschreibt), Instanz stoppt
5. ✗ Discard → Instanz stoppt ohne Speichern
6. Server-Restart-Recovery: Edit-Sessions aus `pinReason: "edit:..."` rekonstruiert

**Stage 1D — Plugin-Wizard:**
1. Oben rechts "+ Plugin hinzufügen"-Button
2. Git-URL eingeben → 🔍 Analysieren → Backend klont + parst version.php
3. Detected-Box zeigt component, type, shortname, release, maturity, path
4. Metadata-Form vorbelegt (id, name, moodleVersion, category nach type)
5. Submit → POST /admin/configs → Kachel erscheint im Portal

### task44 Auto-Clone-Fallback — verify bei nächster neuer Plugin-Demo
Status: open (pending deploy + verify)
Deployed: `103c47b` (2026-04-15)

Problem vor dem Fix: `configs.json`-Einträge mit `plugin.srcPath` konnten
am Demo-Portal vorbeischleichen, ohne dass das Plugin-Repo auf dem VPS
existiert. Folge: `cp -r /opt/plugins/… /tmp/…` scheiterte mit "cannot stat",
Demo blieb hängen. Fix: `ensurePluginSrcPath()` klont das Plugin bei
Bedarf automatisch aus `configs.json.githubRepo` vor `installPlugin()`.

**Verify:**
1. `/opt/plugins/moodle-mod_spinningwheel` löschen (`rm -rf`)
2. https://demo.eledia.ai → Spinning-Wheel-Karte → "Demo starten"
3. Logs zeigen `[plugin] cloning…` vor Start
4. Demo startet erfolgreich
5. `/opt/plugins/moodle-mod_spinningwheel` ist wieder da

### task50 Admin-UI — Pin/Unpin + maxAgeMinutes-Display — verify
Status: open (pending deploy + verify)
Deployed: `ef6e9a7` + `95e1eb1` (2026-04-16)

1. Admin-Dashboard → "Laufende Instanzen"-Tabelle
2. Spalte "Verlängerung" zeigt maxAgeMinutes + remaining time (MM:SS)
3. Jede Zeile hat "📌 Pin" / "📌 Unpin"-Button (je nach State)
4. Pin setzt `pinReason: "admin"` → Instanz wird vom Cleanup-Scheduler ignoriert
5. Unpin räumt die Pin-Flag wieder ab

### Weitere offene Verify-Items
- [ ] nginx Pre-Flight: fehlende Cert-Files → Warning im Log, kein Crash

---

## ✅ Done

*Abgeschlossene Tasks, eine Zeile pro Task.*

**Infrastructure & Core (task01–task13)**
- task01–task13 (siehe git log)

**Code-Review-Bundle 2026-04-09 (task14–task20)**
- task14–task20 (siehe git log)

**UX-Feature-Backlog 2026-04-09 (task21–task30)**
- task21–task30 (siehe git log)

**Lifecycle + Branding-Bundle 2026-04-10 (task29, task31–task36)**
- task29, task31–task36 (siehe git log)

**In-Moodle Admin Plugin (task37, task37b)**
- task37 `local_runbotadmin` Stage 1 — Create + List (commit `5a634cd`)
- task37b `local_runbotadmin` Stage 2 — Download, Delete, Set-Default, atomic updateConfig() (commit `b4cb814`)

**Plugin-Demos (task38)**
- task38 exam2pdf Demo-Karte aktivieren — `configs.json` visible:true (commit `32339ad`)

**Moodle-Version + Debug-Härtung (task41, 2026-04-14)**
- task41 Moodle 5.0→5.1 upgrade + Debug-Settings härten — 7 `$CFG`-Overrides (`ba3cd01`); Hotfix-Rollback `ae0ca2f` wegen Snapshot-Inkompatibilität — Moodle-Code bleibt 5.1-fähig, nur configs.json wieder 5.0 bis task42-Rebuild erfolgt.

**Snapshot-Manager + Plugin-Wizard (task43, 2026-04-15) — feat14**

- task43a Snapshot-Manager Stage 1A — List/Download/Delete/Set-Default. Endpoints `GET /admin/snapshots`, `GET /admin/snapshots/:id/download`, `DELETE /admin/snapshots/:id` mit Default-Schutz, `POST /admin/snapshots/:id/set-default` mit Versions-Mismatch-Warnung. Frontend: Snapshot-Tabelle mit Dropdown + Actions (commit `007c2f8`).
- task43b Snapshot-Manager Stage 1B — Rebuild-Button mit Async-Job-Tracking. Neuer Service `snapshot-rebuild.ts` (später zu `snapshot-admin.ts` gemerged), neue Funktion `docker.runUpgrade()` (`admin/cli/upgrade.php --non-interactive --allow-unstable`). Endpoints `POST /admin/snapshots/rebuild`, `GET /admin/snapshots/jobs/:jobId`. Modal mit Phase-Pill + Live-Log, Polling alle 2s (commit `d9c193f`).
- task43c Snapshot-Manager Stage 1C — Edit-Live-Flow. Service `snapshot-admin.ts` mit EditSession-Map, Shared-Helper `provisionSeedReady()`. Endpoints `POST /admin/snapshots/:id/edit`, `POST /admin/snapshots/:id/save`, `POST /admin/snapshots/:id/discard`. Recovery via `recoverEditSessionsFromRegistry()` beim Server-Start (sucht pinned Instances mit `pinReason:"edit:..."`). Frontend: Edit-Session-Banner pro Snapshot-Zeile wenn aktiv (commit `2a67780`).
- task43d Plugin-Wizard Stage 1D — GUI für "neues Plugin → neue Demo-Kachel". Neuer Service `plugin-install.ts` mit `clonePluginFromGithub()` (parst version.php via Regex), `createConfig()` (atomar append). Endpoints `POST /admin/plugins/install`, `POST /admin/configs`, `GET /admin/configs`, `DELETE /admin/configs/:id`. Frontend: "+ Plugin hinzufügen"-Button in Refresh-Bar öffnet zweistufiges Wizard-Modal mit Auto-Detect + Metadata-Form (commits `50fc143` + `2d0fbd5`).

**Plugin-Demos + Vanilla-Varianten (2026-04-15)**
- vanilla-4.5, vanilla-5.1, vanilla-dev als Demo-Karten (commit `143c052`)
- vanilla-5.1-mariadb als Demo-Karte — MariaDB 10.6 statt PostgreSQL für Kunden-Demos (commit `50fc143`)
- Spinning Wheel (mod_spinningwheel v1.1.0, andreajuettner/moodle-mod_spinningwheel) als Demo-Karte (commit `cdbf2d2`)

**Hotfixes 2026-04-15**
- Hotfix vanilla-dev-Start: conditional `--allow-unstable` Flag für `install_database.php` (Dev-Branch ist "unstable") (commit `9eefe23`)
- Hotfix vanilla-5.1-mariadb-Start: `mysqladmin -u root -proot ping` (statt ohne Credentials → "Access denied"/Timeout) (commit `9eefe23`)
- Auto-Clone-Fallback in `/confirm/:token`: `ensurePluginSrcPath()` klont Plugin aus `configs.githubRepo` wenn `plugin.srcPath` fehlt (commit `103c47b`)

**Onlineshop-Konzept (feat15, 2026-04-15 → 2026-04-16)**
- Konzept v0.1 Draft — erster Wurf Moodle-Onlineshop als Erweiterung des Runbot (commit `311fa1b`)
- v0.2 — MVP-Scope drastisch geschrumpft: kein Billing, kein Support-Ticket, nur Provisioning (commit `cd42ea2`)
- v0.3 — AGB/AVV-Signing-Flow + Mini-Kunden-Dashboard zurück im MVP (commit `7b71c81`)
- v0.4 — Johannes-Antworten auf Launch-Blocker, vollautomatischer Flow (Demo geht live bevor Rechnung rausgeht) (commit `5cea3fb`)
- v0.5 — Internal-Dashboard klar vom Kunden-Dashboard getrennt, beide mit eigenen Use Cases (commit `5412dfa`)
- v0.6 **final** — alle 8 Launch-Blocker beantwortet, MVP-Roadmap 4 Wochen festgezurrt, `src/brand.ts` mit eLeDia-CD-Konstanten aus PPTX extrahiert (commit `793020e`)

**Onlineshop Woche 1 Scaffold (feat15, 2026-04-16)**
- Order-Service (`src/services/orders.ts`) — State-Machine DRAFT → PENDING_VERIFICATION → ORDER_REVIEW → CONFIRMED → PROVISIONING → LIVE → TERMINATED, atomic JSON-Persistence in `/opt/runbot/orders.json`, Funktionen `createOrder`, `verifyOrder`, `markAgreementDownloaded`, `markAgreementSigned`, `transitionOrder`, `issueCustomerMagicToken` (commit `be97b3a`)
- Template-Gerüste `templates/agb-v1.md` + `templates/avv-template-v1.md` + `templates/README.md` mit Platzhalter-Syntax (`{{firma}}`, `{{name}}`, `{{funktion}}`, `{{paket}}`, `{{datum}}`, …) für die pandoc-PDF-Pipeline (commit `be97b3a`)
- Corporate-Design-Konstanten `src/brand.ts` — Kern + Akzent + Sekundärfarben, BRAND_FONTS, BRAND_ASSETS, BRAND_CONTACT aus PPTX extrahiert als Single Source of Truth (commit `793020e`)

**Admin-UI-Polish (2026-04-16)**
- maxAgeMinutes + Remaining-Time in "Verlängerung"-Spalte der Admin-Instanz-Tabelle (commit `ef6e9a7`)
- Pin/Unpin-Button pro Instanz-Zeile — manueller Cleanup-Schutz ohne snapshot_build-Tool (commit `95e1eb1`)

**Hotfixes 2026-04-16**
- bug20 SSL-Fix: `configId` und `prId` werden vor der Instance-ID-Konstruktion DNS-sicher sanitisiert (`/[^a-z0-9]/gi → '-'`, lowercase). Verhindert Subdomain-Fehler bei IDs wie `vanilla-4.5` (Punkt → zweite Subdomain-Ebene, nicht von `*.demo.eledia.ai` gedeckt). Betrifft `src/index.ts` (demo-flow) + `src/tools/instances.ts` (MCP-tool).
- bug21 Deployment-Crash (2026-04-16): Commit `315a40e` enthielt versehentlich leere `src/index.ts`, `src/tools/instances.ts`, `src/tools/snapshots.ts`, `webui/admin.html` sowie gelöschte Docs — gefixt durch Restore aus `95e1eb1` + SSL-Fix obendrauf.

---

## Rules

- Neue Einträge zuerst unter "New" → dann zu Task konvertieren
- Tasks klein halten, klar formuliert
- Abgeschlossene Tasks als One-Liner in "Done" archivieren — Volltext-Details in Commit-Message
- Fixed Bugs wandern aus "🐞 Bugs" komplett nach `05-quality.md`
