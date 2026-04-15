# eLeDia Moodle Onlineshop — Konzept v0.6

**Status:** Draft v0.6, 2026-04-15 — **Alle Launch-Fragen beantwortet**
**Autor:** Johannes (Vision + Antworten) + Claude (Ausarbeitung)
**Basis:** `moodle-runbot-mcp` (Demo-Plattform) → Onlineshop-Erweiterung

**Änderungen seit v0.5:**
- Alle 8 offenen Fragen aus v0.5 Sektion 10 beantwortet (siehe Sektion 0.5)
- Brand-Constants als `src/brand.ts` committed — Corporate Design ist technisch ready
- AGB/AVV/TOM/Unterauftragsverarbeiter: existieren bei eLeDia, müssen nur in Templates eingesetzt werden
- MVP ist launch-fähig — keine inhaltlichen Blocker mehr, nur noch Implementierung

---

## 0. MVP-Scope v0.6 (finaler Stand)

### 0.1 Was Runbot im MVP macht
1. Order-Frontend (Paket-Auswahl + Formular)
2. Double-Opt-In via Verify-Mail
3. AGB/AVV-Signing mit PDF-Generation + Audit-Log
4. Automatisches Provisioning nach Confirm
5. Odoo-Notify-Mail an `post@moskaliuk.com` (Test) / später `bestellung@eledia.de`
6. Welcome-Mail mit Moodle-URL, Admin-Login, Magic-Link zum Kunden-Dashboard
7. Kunden-Dashboard mit Magic-Link-Login
8. Internal-Dashboard (`/api/admin`) erweitert um Shop-Tenants + Bestellungen-Tabs

### 0.2 Was NICHT im MVP
- Rechnung/Zahlung (läuft in odoo)
- Support-Tickets + SLA (läuft über eLeDia-Bestand)
- Renewal/Cancellation-Automation
- Plugin-Updates im Kundendashboard
- Backup-UI für Kunde

### 0.3 Johannes-Antworten v0.2 (8 Scope-Fragen)

| # | Antwort |
|---|---|
| Bestandsplattform | **odoo** |
| Bestellübergabe | E-Mail MVP, Webhook Phase 2 |
| Zahlungsdauer | Nicht relevant — Instanz geht vor Zahlung live |
| Subdomain | Wunscheingabe mit Verfügbarkeits-Check |
| Welcome-Mail | An Formular-Ausfüllenden |
| AGB/AVV | Pflicht-Download + Klick, via Review-Flow |
| Spam-Filter | Double-Opt-In reicht |
| Instanz live | Direkt nach Confirm + Provisioning |

### 0.4 Vollautomatischer Customer-Flow (aus v0.4)

```
Shop-Formular → Verify-Mail → Order-Review (AGB/AVV download + confirm)
    → Auto-Provisioning → Welcome-Mail mit Magic-Link
```

Kein Admin-Approval-Schritt. Admin-Dashboard dient nur Monitoring + Override bei Fehlern.

### 0.5 Johannes-Antworten v0.6 (8 Launch-Fragen)

| # | Thema | Antwort |
|---|---|---|
| 1 | AGB/AVV-Texte | ✅ **AVV vorhanden**, AGB folgt von Johannes |
| 2 | TOM-Anlage | ✅ **Vorhanden** bei eLeDia |
| 3 | Unterauftragsverarbeiter-Liste | ✅ **Vorhanden** bei eLeDia |
| 4 | Corporate Design PDFs | ✅ **PPTX uploaded**, Farben → `src/brand.ts` |
| 5 | Odoo-E-Mail | `post@moskaliuk.com` (Test), Rechnung am nächsten Arbeitstag |
| 6 | Provisioning-Fehler | Admin-Alert per E-Mail an `post@moskaliuk.com`, eLeDia-Notfallsupport übernimmt |
| 7 | Moodle-Admin-Login | **Random-Passwort + Zwang zu Reset** beim ersten Login, kein Passwordless |
| 8 | PDF-Backup | ✅ **Nicht nötig auf VPS** — PDF wird per Mail an Kunden + `post@moskaliuk.com` verschickt, dort archiviert |

**Damit sind alle Launch-Blocker geklärt.** 🚀

---

## 1. Vision

Self-Service Moodle-Shop: Kunde durchläuft autonom Paket-Auswahl bis fertige Instanz. odoo übernimmt Rechnung/CRM. Internal-Dashboard gibt eLeDia die Übersicht.

## 2. Pakete (MVP-Start — noch zu definieren)

| Paket | Inhalt | User-Limit |
|---|---|---|
| **LMS Starter** | Vanilla Moodle 5.1 | 50 |
| **Schulungs-LMS** | Moodle + LeitnerFlow + exam2pdf | 200 |
| **Prüfungs-Suite** | Moodle + exam2pdf + SafeExamBrowser | 500 |

---

## 3. Brand-Konstanten (NEU v0.6)

Aus `eLeDia_brand_colors.pptx` extrahiert und in `src/brand.ts` als TypeScript-Konstanten abgelegt.

### Kernfarben
- `#353535` schwarz — Standard-Typographie
- `#ffffff` weiß — Hintergrund

### Akzentfarben
- `#ab1d79` lila — Primary CTA (bereits im Admin-UI)
- `#194866` dunkelblau — Headlines, Links
- `#f98012` orange — Warnungen, Highlights
- `#3aadaa` aqua — Success / Aktivitäten
- `#65a1b3` hellblau — Hover-States
- `#669933` grün — Kategorien

### Soft-Colors (Flächen)
- `#f3f5f8` pale cool gray — Page-Background
- `#e9e9e9` hellgrau — Borders
- `#ffecdb` pale orange — Info-Boxes
- `#a9cbd5` super light blue — Info-Boxes

### Typography
- Serif: `Fraunces` (Headlines)
- Sans: `Inter` (Body + UI)
- Mono: `SF Mono` / `Menlo` (Code, IDs)

Die Corporate-Design-Dateien sind im Repo unter `templates/` nicht hinterlegt — sie liegen bei eLeDia. Der Brand-Code in `brand.ts` reicht für technische Implementation (PDF, E-Mail, UI).

---

## 4. Agreement-Texte — Status

### AGB (`templates/agb-v1.md`)
**Status:** Platzhalter-Gerüst committed. Johannes muss den Text einsetzen.
**Struktur:** §1–10 (Geltungsbereich, Vertragsschluss, Leistung, Pflichten, Preise, Laufzeit, Haftung, Datenschutz, Widerruf, Schluss).

### AVV (`templates/avv-template-v1.md`)
**Status:** Platzhalter-Gerüst committed. Johannes hat AVV-Text vorhanden — muss nur in das Template eingesetzt werden.
**Platzhalter beibehalten:** `{{firma}}`, `{{name}}`, `{{funktion}}`, `{{email}}`, `{{paket}}`, `{{subdomain}}`, `{{datum}}`, `{{orderId}}`, `{{sha}}`, `{{ip}}`
**Anlage 1 (TOM):** Vorhanden bei eLeDia — muss eingefügt werden.
**Anlage 2 (Unterauftragsverarbeiter):** Vorhanden bei eLeDia — muss eingefügt werden.

---

## 5. Mail-Templates (Woche 1 Implementation)

Noch zu bauen (Woche 1b der Roadmap):

| Template | Zweck | Empfänger |
|---|---|---|
| `verify-order.html` | Double-Opt-In-Link | Formular-Kontakt |
| `order-confirmed.html` | Bestellung eingegangen + AGB/AVV-PDFs im Anhang | Formular-Kontakt |
| `odoo-notify.html` | Neue Bestellung mit allen Daten | `post@moskaliuk.com` (Test) |
| `welcome.html` | Instanz bereit + Moodle-URL + Admin-Login + Magic-Link | Formular-Kontakt |
| `magic-link.html` | Kunden-Dashboard-Login | Formular-Kontakt (on demand) |
| `admin-alert.html` | Provisioning-Fehler-Alert | `post@moskaliuk.com` |

Alle im Corporate-Design (Fraunces für Headlines, Inter Body, eLeDia-Farben).

---

## 6. Provisioning-Fehler-Flow (v0.6 beantwortet)

Bei `PROVISION_FAILED`:
1. Admin-Alert-Mail an `post@moskaliuk.com` mit Order-ID + Fehlermeldung + Docker-Logs
2. Kunden-Mail: "Wir kümmern uns — Sie hören von uns innerhalb 24h"
3. Admin sieht im Internal-Dashboard den Fehler, triggert manuelle Reprovision oder kontaktiert Kunden
4. Bei erneutem Fehler: Admin entscheidet manuell (Plugin fixen, Config ändern, Refund)

**Keine automatische Retry-Schleife** — ein Fehlschlag muss von Menschen geprüft werden.

---

## 7. Moodle-Admin-Login-Flow (v0.6 beantwortet)

### Generation
- 16-Zeichen Random-Passwort (alphanumerisch + Sonderzeichen)
- Erfüllt Moodle-Default-Policy (min 8 chars, 1 digit, 1 lower, 1 upper, 1 non-alphanumeric)

### Welcome-Mail enthält
- Moodle-URL (z.B. `acme-schulung.eledia.ai`)
- Admin-Username: `admin`
- Temporary-Password: `<generated>`
- Direkt-Link zu `login/change_password.php?expired=1`

### Moodle-Config in Instanz
```php
// In patchConfigForProduction() ergänzen:
$CFG->passwordexpirationwarning = 0; // kein Expire-Warning
// $CFG->forcepasswordchange wird auf Admin-Record gesetzt via SQL nach install_database.php
```

### Nach install_database.php
```sql
UPDATE mdl_user SET password_expired = 1 WHERE username = 'admin';
```

**Keine Passwordless-Lösung** — Moodle-Standard nutzt Session-Auth, Custom-Plugin wäre Overkill.

---

## 8. PDF-Archivierung (v0.6 beantwortet)

**Server-side Archivierung entfällt.**

Der Fluss:
1. PDF wird zur Laufzeit aus `templates/*.md` + Order-Daten generiert
2. PDF wird in E-Mail-Anhang verpackt
3. Empfänger: Kunde (`signer.email`) + Admin (`post@moskaliuk.com` / später `bestellung@eledia.de`)
4. Beide Seiten archivieren das PDF selbst gemäß ihrer Aufbewahrungsfrist (§147 AO)
5. Auf dem VPS bleibt nur eine Referenz (Hash + Metadaten in `orders.json`) — nicht das PDF

**Vorteil:** Kein 10-Jahre-Storage-Problem auf dem VPS, kein DSGVO-Löschkonflikt.
**Nachteil:** Kein zentrales Admin-Archiv — aber das hat die Bestandsplattform (E-Mail-Backup).

---

## 9. MVP-Roadmap v0.6

### ✅ Phase 0 — Vorbereitung (erledigt)
- [x] Konzept v0.6 final
- [x] Johannes-Antworten dokumentiert
- [x] `src/brand.ts` mit Corporate-Design-Konstanten
- [x] Template-Gerüste (AGB + AVV) committed
- [x] `src/services/orders.ts` mit State-Machine
- [ ] AGB-Text in `agb-v1.md` einsetzen (Johannes)
- [ ] AVV-Text in `avv-template-v1.md` einsetzen (Johannes)
- [ ] TOM + Unterauftragsverarbeiter-Anlagen einsetzen (Johannes)

### Phase 1 — MVP Implementation (4 Wochen)

**Woche 1b (restliche Tage):** Order-Endpoints + Mail-Templates
- `POST /api/order` + `POST /order/verify/:token` + `POST /api/order/:token/confirm`
- Admin-Dashboard-Tab "Bestellungen"
- 5 Mail-Templates (Verify, Order-Confirmed, Odoo-Notify, Welcome, Magic-Link, Admin-Alert)
- `src/services/email-templates/*` via `brand.ts`

**Woche 2:** AGB/AVV-PDF-System
- `src/services/agreements.ts` + pandoc-basierter PDF-Generator
- Template-Rendering mit Platzhaltern aus `orders.ts`
- Download-Counter + Audit-Log-Integration
- Confirm-Gate im Backend

**Woche 3:** Shop-Frontend
- `webui/shop.html` mit Paket-Übersicht + Formular + Subdomain-Check
- `webui/order-review.html` mit AGB/AVV-Downloads + Confirm
- Corporate-Design-konform via `brand.ts`-Farben

**Woche 4:** Kunden-Dashboard + Internal-Dashboard-Erweiterung
- `webui/customer.html` + Magic-Link-System (`src/services/customers.ts`)
- Admin-Dashboard: neuer Tab "Shop-Tenants" + Filter
- Provisioning-Integration mit Auto-Pin + Welcome-Mail
- End-to-End-Test
- Launch

---

## 10. Launch-Checkliste

Nach Implementation (vor Go-Live):

- [ ] AGB-Text vom Anwalt final geprüft
- [ ] AVV-Text vom DSB final geprüft
- [ ] TOM + Unterauftragsverarbeiter aktuell
- [ ] Testbestellung mit echtem Ablauf (Mail → Review → Confirm → Provisioning → Welcome)
- [ ] PDF-Download in Testbestellung funktioniert + Hash dokumentiert
- [ ] Odoo-Notify-Mail kommt bei `post@moskaliuk.com` an
- [ ] Provisioning-Fehler-Flow simuliert (z.B. invalid plugin) — Alert-Mail kommt an
- [ ] Rechtshinweis zur Text-Form-Gültigkeit im Impressum
- [ ] Preis-Kommunikation geklärt (Shop ohne Preis vs. mit Preis vs. "Preis auf Anfrage")
- [ ] Marketing: Shop-URL, Launch-Kommunikation, SEO-Basics

---

## 11. Zusammenfassung v0.6

**Alle konzeptionellen Entscheidungen sind getroffen. MVP ist launch-fähig.**

**Was fehlt noch:**
1. Text-Einsatz in AGB/AVV-Templates (Johannes, ~1h)
2. Code-Implementation (4 Wochen Dev)
3. Legal-Final-Review (Anwalt) parallel zu Dev

**Kritische Pfade:**
- AGB-Text-Lieferung durch Anwalt ← potenziell langwierig
- Ansonsten: nur Dev-Arbeit

---

*Phase-2+-Themen (Stripe, Renewal, Custom-Domains, Whitelabel, API-Integration Odoo) sind in v0.1 dokumentiert. Für MVP bewusst ausgeklammert.*
