# eLeDia Moodle Onlineshop — Konzept v0.4

**Status:** Draft v0.4, 2026-04-15 — **Vollautomatischer Flow, Admin raus aus der Loop**
**Autor:** Johannes (Vision) + Claude (Ausarbeitung)
**Basis:** `moodle-runbot-mcp` (Demo-Plattform)

**Änderungen seit v0.3:**
- Alle 8 Fragen beantwortet (Sektion 0.3)
- Vollautomatischer Flow statt Admin-Approval (Sektion 0.4)
- Subdomain-Verfügbarkeitscheck (Sektion 6c)
- Odoo als Bestandsplattform dokumentiert

---

## 0. MVP-Scope v0.4 (gültiger Scope)

### 0.1 Was Runbot im MVP macht
1. **Order-Frontend** — Paket-Auswahl + Formular
2. **Double-Opt-In** — Verify-Mail, dann Bestell-Review-Seite
3. **AGB/AVV-Signing** — PDF-Generation + Click-Agreement + Audit-Log
4. **Automatisches Provisioning** — nach Bestätigung direkt Container hochfahren
5. **Odoo-Notification** — E-Mail an `bestellung@eledia.de` mit Bestell-Details für Rechnungserstellung
6. **Welcome-Mail** — URL + Admin-Login + Password-Reset-Link + Next-Steps
7. **Mini-Kunden-Dashboard** — Magic-Link-Login, Instanz-Status-Anzeige

### 0.2 Was NICHT im MVP ist (läuft in Odoo / extern)
- ❌ Rechnungs-Generierung + Versand (odoo)
- ❌ Zahlungsabwicklung (odoo)
- ❌ CRM + Kundenstammdaten (odoo)
- ❌ Support-Tickets (odoo oder separat)
- ❌ Renewal/Cancellation (odoo-Workflows)
- ❌ Plugin-Updates im Kundendashboard
- ❌ Backup-Management-UI für Kunde

### 0.3 Johannes-Antworten auf Sektion 8 (2026-04-15)

| # | Frage | Antwort |
|---|---|---|
| 1 | Bestandsplattform | **odoo** |
| 2 | Bestellübergabe | **E-Mail zum Start, Webhook an odoo in Phase 2** |
| 3 | Zahlungsdauer | **Nicht relevant** — Instanz geht vor Zahlung live |
| 4 | Subdomain | **Wunscheingabe** mit Verfügbarkeits-Check |
| 5 | Welcome-Mail-Empfänger | **Person, die Formular ausfüllt** |
| 6 | AGB/AVV | **Pflicht-Download + Klick**, Ablauf siehe 0.4 |
| 7 | Spam-Filter | **Double-Opt-In** via Verify-Mail reicht als Schutz |
| 8 | Wann "live"? | **Direkt nach Bestätigung + Provisioning** — kein Warten auf Zahlung |

### 0.4 Neuer vollautomatischer Customer-Flow

**Key-Insight:** Die Instanz wird VOR Zahlung bereitgestellt. Odoo übernimmt nachgelagert die Rechnungsstellung. Damit entfällt der Admin-Approval-Schritt — alles vollautomatisch.

```
1. Kunde füllt Shop-Formular aus
      ↓
2. Verify-Mail geht an Kunden-E-Mail (Double-Opt-In, Spam-Schutz)
      ↓
3. Kunde klickt Link → Order-Review-Seite (keine Instanz läuft noch)
      - Zeigt: Paket, Subdomain, Rechnungsdaten
      - AGB-PDF-Download-Button (Pflicht vor Bestätigung)
      - AVV-PDF-Download-Button (Pflicht vor Bestätigung)
      - Checkbox: "Ich habe AGB + AVV gelesen und akzeptiert"
      - "Bestellung bestätigen + Instanz starten"-Button (erst enabled
         wenn beide PDFs runtergeladen + Checkbox gesetzt)
      ↓
4. Bestätigung → SOFORT:
      a) Order-Status = CONFIRMED
      b) Auto-Provisioning startet (Docker-Container)
      c) Odoo-Notify-Mail an bestellung@eledia.de mit allen Bestelldaten
      ↓
5. Kunde sieht Loading-Page (analog Demo-Loading, mit echter Progress)
      ↓
6. Nach Provisioning-Ende → Welcome-Mail:
      - Moodle-URL
      - Admin-Login (generiertes starkes Passwort)
      - "Passwort ändern"-Link (direkt zu Moodle /login/change_password.php)
      - Magic-Link zum Kunden-Dashboard
      - Next-Steps-Guide (PDF-Anhang)
      ↓
7. Odoo-Mitarbeiter erstellt Rechnung, sendet sie über odoo raus
      ↓
8. Kunde zahlt über odoo-Prozess (nicht in Runbot sichtbar)
```

**Wichtig:** Kein Admin-Klick in Runbot nötig. Admin-Dashboard-Bestellungen-Tab bleibt als **Monitoring + Override** für Edge-Cases (Provisioning fehlgeschlagen, manuelles Eingreifen nötig), nicht als regulärer Workflow-Schritt.

### 0.5 Lifecycle-State-Machine v0.4

```
DRAFT ──Formular-Submit──► PENDING_VERIFICATION
                                    │ (Verify-Mail verschickt)
                                    │
                                    │ Klick auf Verify-Link (7d gültig)
                                    ↓
                             ORDER_REVIEW
                                    │ (Kunde sieht Review-Seite)
                                    │
                                    │ AGB+AVV download + confirm click
                                    ↓
                             CONFIRMED
                                    │ (Auto-Provisioning startet,
                                    │  Odoo-Notify-Mail raus)
                                    ↓
                             PROVISIONING
                                    │ (Docker läuft hoch, 3–5 min)
                                    ↓
                             LIVE  ◄──── (Welcome-Mail raus)
                              │
                              │ (manueller Admin-Stop bei Kündigung,
                              │  kein Auto-Renew, kein Auto-Cancel)
                              ↓
                          TERMINATED
```

**Fehlerzustände:**
- `VERIFY_EXPIRED` — Nutzer hat Verify-Link 7 Tage nicht geklickt → Order gelöscht
- `PROVISION_FAILED` — Docker-Fehler → Admin-Nachricht, manuelles Retry im Admin-Dashboard
- `REJECTED` — Admin hat Bestellung abgelehnt (Spam-Verdacht, Konflikt)

---

## 1. Vision (unverändert)

Self-Service Moodle-Shop: Kunde durchläuft autonom Paket-Auswahl bis fertige Instanz. Rechnung läuft separat über odoo.

## 2. Pakete (MVP-Start)

| Paket | Inhalt | User-Limit |
|---|---|---|
| **LMS Starter** | Vanilla Moodle 5.1 | 50 |
| **Schulungs-LMS** | Moodle + LeitnerFlow + exam2pdf | 200 |
| **Prüfungs-Suite** | Moodle + exam2pdf + SafeExamBrowser | 500 |

Baukasten kommt in Phase 2.

## 6a. AGB/AVV-Flow — aktualisiert für v0.4

**Flow gemäß Johannes-Idee (Frage 6):**

1. Kunde füllt Shop-Formular aus (Firma, Name, Funktion, E-Mail, Paket, Subdomain-Wunsch)
2. **Verify-Mail** geht raus (einmaliger Token, 7d gültig)
3. Kunde klickt Verify-Link → **Order-Review-Seite** (`/order/review/:token`)
4. Review-Seite zeigt:
   - **Bestell-Zusammenfassung**: Paket, Subdomain, Rechnungsadresse
   - **AGB-PDF-Download-Button**: "AGB als PDF herunterladen (Pflicht)"
   - **AVV-PDF-Download-Button**: "AVV als PDF herunterladen (Pflicht)" — PDF ist personalisiert mit Firma/Name/Funktion aus dem Formular
   - **Checkbox**: "Ich habe die AGB und den AVV heruntergeladen, gelesen und akzeptiere sie."
   - **Confirm-Button**: "Bestellung bestätigen + Instanz starten" — erst enabled wenn beide PDFs mindestens 1× geladen wurden UND Checkbox gesetzt ist
5. Klick auf Confirm → Backend:
   - Audit-Log-Eintrag mit Order-ID, PDF-SHAs, Timestamp, IP
   - State: `ORDER_REVIEW` → `CONFIRMED`
   - Auto-Provisioning wird gestartet
   - Odoo-Notify-Mail geht raus

**Technische Änderungen gegenüber v0.3:**
- PDF-Downloads werden server-seitig getrackt (Backend-Zähler pro Order-ID)
- Confirm-Button-Freischaltung per Frontend-JS, aber Backend verifiziert
- **Neue Endpoints:**
  - `GET /order/review/:token` → Review-HTML
  - `GET /api/order/:token/agb.pdf` → AGB-Download + Download-Counter
  - `GET /api/order/:token/avv.pdf` → personalisierter AVV-Download + Counter
  - `POST /api/order/:token/confirm` → Final-Confirm, triggert Provisioning

**Legal-Note:** Die Text-Form nach §126b BGB + Art. 28 (9) DSGVO ist gewahrt — das personalisierte AVV-PDF + der dokumentierte Confirm-Click + Audit-Log reichen für B2B-SaaS.

## 6b. Mini-Kunden-Dashboard — unverändert aus v0.3

Magic-Link-Login, Liste Instanzen mit Status + URL, AVV-Download, Support-Kontakt. Keine Steuerung.

## 6c. Subdomain-Verfügbarkeitscheck (NEU in v0.4)

**Warum:** Wenn Kunde einen Wunsch-Namen eingibt, muss Runbot prüfen:
- Bereits vergeben? (andere Instance hat denselben Subdomain)
- Reserviert? (Blacklist für `admin`, `api`, `www`, `mail`, `demo`, `shop`, `eledia`, ...)
- Syntaktisch gültig? (`^[a-z0-9][a-z0-9-]{2,30}[a-z0-9]$` — DNS-Labels)

**Frontend-UX:**
- Formular-Feld "Subdomain" mit Live-Check beim Tippen (`/api/subdomain/check?s=xyz`)
- Grün: "✓ `meine-firma.eledia.ai` ist verfügbar"
- Rot: "✗ bereits vergeben / reserviert / ungültig"
- Vorschlag bei Konflikt: `meine-firma-2`, `meine-firma-lms`

**Backend-Endpoint:**
```typescript
GET /api/subdomain/check?s=<wunsch>
→ { available: true, suggestions?: string[] }
```

Prüft gegen:
- Bestehende Instanzen in Registry (alle `instance.id` aus `registry.ts`)
- Blacklist-Array (hardcoded)
- DNS-Label-Regex

**Race-Condition:** Beim finalen Order-Submit wird nochmal geprüft (zwei Leute können gleichzeitig denselben Namen wählen). Wenn kollidiert: Fehler + Vorschläge.

---

## 7. Odoo-Integration

### 7.1 MVP: E-Mail-basiert

Nach `CONFIRMED`-State triggert Runbot eine E-Mail an `bestellung@eledia.de`:

```
Betreff: Neue Runbot-Bestellung: ACME GmbH — Schulungs-LMS

Neue Shop-Bestellung ist eingegangen und wird aktuell provisioniert.

Rechnungsdaten:
  Firma:     ACME GmbH
  Anschrift: Musterstraße 1, 12345 Musterstadt
  USt-ID:    DE123456789
  Kontakt:   Max Mustermann <max@acme.de>

Bestellung:
  Paket:     Schulungs-LMS
  Subdomain: acme-schulung.eledia.ai
  User-Limit: 200
  Order-ID:  ord-abc123

AVV:
  Personalisiert + gesigned am 2026-04-20 10:23 UTC
  PDF: https://demo.eledia.ai/api/admin/orders/ord-abc123/avv.pdf

Aktion erforderlich:
  Rechnung in Odoo erstellen, Kunde kontaktieren, Zahlungseingang überwachen.
  Instanz läuft bereits — bei Stornierung "Bestellung ablehnen" im Runbot-Admin.
```

eLeDia-Mitarbeiter legt in odoo manuell einen Auftrag an, erstellt Rechnung, versendet sie.

### 7.2 Phase 2: Webhook an Odoo

Später: Direkte Odoo-API-Integration via `xmlrpc` oder `jsonrpc`:

- Erstelle Partner (`res.partner`) wenn noch nicht existent
- Erstelle Sales Order (`sale.order`) mit Produkten = Paket
- Bestätige Order → Rechnung automatisch via odoo-Workflow
- Verknüpfe `odoo_order_id` zurück zu Runbot-Order

Erfordert: odoo-Credentials, API-Zugang. Nicht MVP-kritisch.

---

## 8. MVP-Roadmap v0.4

### Phase 0 — Vorbereitung (diese Woche)
- [ ] AGB + AVV-Texte bei eLeDia sichten (bestehende Vorlagen?) und ggf. vom Anwalt prüfen lassen
- [ ] 1–2 Paket-Snapshots bauen via Admin-UI Edit-Live
- [ ] odoo-Workflow klären: Wer bekommt `bestellung@eledia.de`-Mails? Wie wird zurückgemeldet?

### Phase 1 — MVP Implementation (4–5 Wochen)

**Woche 1: Order-Backend + Lifecycle**
- `orders.ts` mit State-Machine DRAFT → PENDING_VERIFICATION → ORDER_REVIEW → CONFIRMED → PROVISIONING → LIVE
- Verify-Mail + Verify-Link-Handler
- Odoo-Notify-Mail-Template
- Admin-Dashboard-Tab "Bestellungen" (Monitoring-View, keine regulären Aktionen)

**Woche 2: AGB/AVV-System**
- `agreements.ts` + pandoc-basierter PDF-Generator
- AVV-Template mit Platzhaltern, AGB-Template
- Download-Counter + Audit-Log
- Confirm-Gate (Button erst enabled wenn Downloads getrackt)

**Woche 3: Shop-Frontend**
- `shop.html` mit Paket-Übersicht + Formular
- Subdomain-Live-Check
- `order-review.html` (Zusammenfassung + AGB/AVV-Downloads + Confirm)
- Styling (Corporate Design eLeDia)

**Woche 4: Provisioning-Integration + Kunden-Dashboard**
- `confirmOrder()` → Auto-Provisioning analog `/confirm/:token`, aber mit `pinned: true` + langem Lifetime
- Welcome-Mail mit Magic-Link
- `customers.ts` + Magic-Link-System
- `customer.html` mit Instanz-Liste

**Woche 5: Polish + Launch**
- End-to-End-Test mit 1–2 Pilot-Bestellungen
- Landing-Page-Text + SEO
- Odoo-Workflow-Anbindung dokumentieren
- Go-Live mit 1–2 Paketen

### Phase 2 — Nach Launch (ab ~4 Wochen nach Go-Live)
- Odoo-API-Webhook statt E-Mail
- Baukasten-Option im Shop
- Weitere Pakete
- Kunden-Dashboard-Erweiterungen (Backup-Stand anzeigen)

---

## 9. Offene Fragen v0.4 (verbleibend)

1. **AGB/AVV-Texte**: Hat eLeDia schon welche? Wer im Team hat die Hand drauf? → Johannes klären
2. **TOM-Anlage für AVV**: Bestehend oder müssen wir erstellen?
3. **Unterauftragsverarbeiter-Liste** (Hetzner, Brevo, etc.): Gibt's eine Sammlung?
4. **Corporate Design für PDFs**: Logo-SVG + Farben + Fonts — bei eLeDia verfügbar?
5. **odoo-Zugang**: Wer im Team pflegt die Mails an `bestellung@eledia.de`? Wie ist die Reaktionszeit?
6. **Provisioning-Fehler**: Was passiert bei `PROVISION_FAILED`? Admin kriegt Mail, Kunde kriegt Mail mit "kommen Sie bitte auf uns zu" oder retry-Link?
7. **Passwort-Policy für Admin-Login**: Zufallsgeneriertes starkes Passwort reicht? Oder direkter Magic-Link ohne Passwort?
8. **Rechtssicherheit PDFs**: Sollen die PDFs zusätzlich in S3/Object-Storage gebackupt werden (10+ Jahre)?

---

## 10. Zusammenfassung v0.4

**Das eleganteste am neuen Flow:** Kein Admin-Bottleneck. Alles passiert vollautomatisch zwischen Kundenaktionen.

**Admin-Dashboard-Bestellungen-Tab wird zum Beobachtungsposten:**
- Zeigt alle Orders mit State + History
- Manual-Override bei Fehlern (retry Provisioning, Order ablehnen, Welcome-Mail erneut senden)
- Kein regelmäßiger Click-Workflow mehr

**Technische Neu-Komponenten:**
- `orders.ts` — ~200 Zeilen mit State-Machine
- `agreements.ts` — ~200 Zeilen mit PDF-Gen
- `customers.ts` — ~100 Zeilen mit Magic-Link
- `shop.html` + `order-review.html` + `customer.html` — ~1000 Zeilen Frontend
- Admin-Erweiterung — ~200 Zeilen
- Subdomain-Check-Endpoint — ~30 Zeilen
- 5 neue Mail-Templates
- **Gesamt:** ~2000 Zeilen neuer Code, 4–5 Wochen

**Hauptrisiko:** AGB/AVV-Texte-Verfügbarkeit — wenn eLeDia keine parat hat und der Anwalt 4 Wochen braucht, verzögert das den Launch.

---

*Phase-2+-Themen (Stripe-Integration wenn sich Trennung nicht bewährt, Webhook-Integration mit odoo, Baukasten, Custom-Domains, Whitelabel) sind in v0.1 dieses Dokuments dokumentiert.*
