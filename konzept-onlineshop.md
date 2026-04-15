# eLeDia Moodle Onlineshop — Konzept v0.1

**Status:** Draft, 2026-04-15
**Autor:** Johannes (Vision) + Claude (Ausarbeitung)
**Basis:** `moodle-runbot-mcp` (Demo-Plattform)
**Ziel dieses Dokuments:** Strategische Klärung, bevor irgendein Code geschrieben wird.

---

## 1. Vision

Aus der Runbot-Demo-Plattform wird ein **Self-Service Moodle-Shop**:
Interessent durchläuft autonom den Prozess vom Plugin-Vergleich bis zur
fertig gehosteten, abrechnungsfähigen Moodle-Instanz. Kein manueller
Eingriff durch eLeDia-Mitarbeiter im Normalfall.

### Scope-Abgrenzung (wichtig!)

**Runbot heute:** ephemere 60-Min-Demo, kein Geld, keine Daten-Retention, kein SLA.
**Shop morgen:** dauerhaft betriebene Moodle-Instanz, Rechnungsstellung, Datenschutz, Support-Verpflichtungen.

Das ist ein *Sprung in eine andere Liga*. Der bestehende Code ist die Basis für Provisioning, aber ein Shop braucht zusätzlich:
- Persistente Kunden-Datenbank (Tenants, Rechnungen, Verträge)
- Zahlungs-Integration (Stripe/Mollie)
- Backup + Monitoring + Updates
- AGB, Datenschutzerklärung, AVV, Impressum — juristisch geprüft
- Support-Workflow (Tickets, SLA, Eskalation)

## 2. Zwei Kauf-Pfade

### 2a. Paket (Option 1) — empfohlen für den MVP

Kuratierte Bundles mit abgestimmtem Plugin-Set für konkrete Use-Cases.

Vorschlag für initiale Pakete (Arbeitshypothese):

| Paket | Zielgruppe | Inhalt | User-Limit |
|---|---|---|---|
| **LMS Starter** | Kleine Vereine, Projektgruppen | Vanilla Moodle 5.1 | 50 |
| **Schulungs-LMS** | Weiterbildungsanbieter | Moodle + LeitnerFlow + exam2pdf | 200 |
| **Prüfungs-Suite** | Zertifizierungsstellen | Moodle + exam2pdf + SafeExamBrowser-Integration | 500 |
| **Forschungs-LMS** | Hochschulen, Labs | Moodle + SpinningWheel + GradingSnapshot | 100 |

**Vorteil:** Entscheidungsleicht, klarer Preis, bekannter Support-Scope.
**Nachteil:** Weniger Flexibilität; Kunden mit Spezialbedarf fallen raus.

### 2b. Baukasten (Option 2) — Phase 2+

Freie Plugin-Kombination aus dem Shop-Katalog:

- **Basis wählen:** Moodle-Version (5.1 / 5.0 / 4.5 LTS), DB-Engine (pgsql/mariadb)
- **User-Limit:** 25 / 50 / 100 / 250 / 500 / unlimitiert (wirkt auf Preis)
- **Plugins:** kategorisierte Checkboxliste (Lernen / Prüfung / Reporting / Verwaltung)
- **Dependencies:** automatische Prüfung (z.B. exam2pdf braucht mod_quiz; availability_spinningwheel braucht mod_spinningwheel)
- **Konflikte:** Warnung bei unverträglichen Kombinationen
- **Live-Preis:** aktualisiert sich beim Zusammenstellen

**Vorteil:** Flexibilität, Differentiator gegenüber Mitbewerbern.
**Nachteil:** Support-Matrix explodiert (jede Plugin-Kombi ist eine eigene Wartungseinheit). QA-Aufwand.

### Empfehlung

**Hybrid:** Starte mit 2–3 Paketen (Option A). Baukasten als Phase-2-Feature, sobald Betriebs-Prozesse für Pakete stabil laufen.

## 3. Customer Journey (Happy Path)

### Schritt 1 — Entdecken
- Einstieg auf `shop.eledia.ai` (Separate Subdomain) oder integriert in `demo.eledia.ai`
- Header: "Jetzt kaufen" neben existierendem "Demo starten"
- Auswahl Paket oder Baukasten

### Schritt 2 — Konfigurieren
- **Paket:** kurze Bestätigungsseite mit Feature-Liste, User-Limit, Preis
- **Baukasten:** interaktiver Builder mit Live-Preisanzeige, Dependency-Check

### Schritt 3 — Vorher testen (optional)
- "Paket vorher testen" → startet eine 60-Min-Demo (bestehender Runbot-Flow, `snapshotId` = Paket-Snapshot)
- Nach dem Test: "Jetzt kaufen"-CTA im Demo-Portal

### Schritt 4 — Bestellen
- Formular:
  - Name, Firma, Adresse (Rechnungsanschrift)
  - USt-ID (Pflicht für B2B-EU, optional sonst)
  - Kontakt-Mail (Tenant-Admin)
  - Gewünschte Subdomain (`kundenname.eledia.ai`) oder Custom-Domain-Option
  - Ziel-Datenresidenz (DE / EU)
- Zahlungsmethode:
  - Kreditkarte (Stripe)
  - SEPA-Lastschrift (Stripe)
  - PayPal
  - Rechnung + Überweisung (B2B, manuell)
- **Pflicht-Checkboxen:** AGB, Datenschutz, AVV (Link zur PDF)

### Schritt 5 — Double-Opt-In + Zahlung
- Bestätigungs-E-Mail an Kontakt-Adresse mit:
  - AGB/AVV im PDF-Anhang
  - Widerrufsbelehrung (B2C)
  - Link "Bestellung bestätigen + bezahlen"
- Klick auf Link → Stripe-Checkout
- Nach Zahlungseingang → Install-Start

### Schritt 6 — Install + Onboarding
- Progress-Page mit Live-Status (analog Runbot Loading-Page, aber ausführlicher)
  - Container bereitstellen
  - Moodle installieren
  - Plugins installieren
  - Initial-Daten laden (Demo-Kurse je nach Paket)
  - DNS-Eintrag + Zertifikat
  - Admin-Account erstellen
- Bei Fertig: "Willkommen"-E-Mail mit:
  - Admin-Login + Temp-Passwort (Passwort-Reset-Zwang beim ersten Login)
  - Link zum Kunden-Dashboard
  - Erste-Schritte-Guide (PDF)
  - Booking-Link für optionales Onboarding-Call

### Schritt 7 — Betrieb
- Kunden-Dashboard unter `kunde.shop.eledia.ai` (oder `/meine-demo` im Shop):
  - Übersicht: Vertragslaufzeit, User-Count vs. Limit, Backup-Stand, Uptime
  - Plugin-Upgrades (mit Changelog-Anzeige)
  - User-Limit ändern (Upsell-Pfad)
  - Rechnung einsehen + downloaden
  - Ticket eröffnen
  - Daten-Export anfordern (GDPR Art. 20)

### Schritt 8 — Verlängern / Kündigen
- **Autorenewal:** 30 Tage vor Ablauf Reminder-Mail mit Opt-Out-Link
- **Kündigung:** über Dashboard → Bestätigungsmail → nach Frist (Standard: zum Laufzeitende)
- **Grace-Period:** 60 Tage nach Kündigung read-only-Zugang für Daten-Export
- **Nach Grace:** Daten gelöscht, nur Rechnungen + Audit-Log bleiben (§ 147 AO — 10 Jahre)

## 4. Paket-Katalog & Plugin-Marketplace

### Datenstruktur: Erweiterung `configs.json`

```json
{
  "type": "package",
  "id": "schulungs-lms",
  "name": "Schulungs-LMS",
  "description": "Perfekt für Weiterbildner: Moodle + LeitnerFlow + Quiz-Zertifikate",
  "includedPlugins": ["leitnerflow", "exam2pdf"],
  "userLimit": 200,
  "moodleVersion": "5.1",
  "db": "pgsql",
  "phpVersion": "8.3",
  "shop": {
    "priceMonthlyCents": 9900,
    "priceYearlyCents": 99000,
    "yearlyDiscountPct": 17,
    "trialDays": 14,
    "available": true,
    "sortOrder": 20
  },
  "snapshotId": "schulungs-lms-v1"
}
```

### Plugin-Einträge (Erweiterung):

```json
{
  "id": "leitnerflow",
  "shop": {
    "addonPriceMonthlyCents": 900,
    "dependencies": [],
    "conflictsWith": [],
    "available": true
  }
}
```

### Plugin-Source-Wahrheit
- **Kurierter Shop-Katalog:** nur geprüfte, von eLeDia supportete Plugins
- Admin kann im Admin-Dashboard pro Config `shop.available: true` setzen (UI-Erweiterung des Plugin-Wizards)
- Öffentlicher Shop zeigt nur `available: true` an — getrennt vom Demo-Portal-Filter

## 5. Lifecycle — State Machine pro Tenant

```
DRAFT ─ Mail bestätigt ──► TRIAL ─ 14d oder Paid ──► ACTIVE
  │                          │                        │
  │                          └─ unpaid ──► EXPIRED ◄──┘
  │
  └─ 7d abgelaufen ──► DISCARDED (Formular-Spam-Cleanup)

ACTIVE ─ Renewal ──► ACTIVE (Loop)
       ─ Kündigung ──► ACTIVE_CANCELLING ─ Laufzeit-Ende ──► GRACE (60d read-only)
                                                               │
                                                               └─► DELETED
```

### Unterschied zu Runbot-Demo

| Aspekt | Runbot-Demo | Shop-Tenant |
|---|---|---|
| Lifetime | 60 Min | 12+ Monate |
| Cleanup | Auto bei Inaktivität | Nur bei Kündigung |
| Isolation | Dedicated Container | Dedicated Container + eigene DB + eigene Subdomain + eigenes moodledata-Volume |
| Backups | Keine | Tägliches Snapshot, 30d Retention |
| Updates | Nie | Sicherheits-Patches automatisch binnen 72h, Feature-Updates quartalsweise |
| Monitoring | Pro Instanz Basic | Prometheus + Alerting, Statuspage |
| Support | Kein SLA | 48h Response (Standard), 4h (Premium) |

## 6. Technische Architektur

### Wiederverwendung aus Runbot
- ✅ Docker-Provisionierung (`docker.ts`) — funktioniert 1:1 für Shop-Tenants, nur längere Lifetime
- ✅ Snapshot-System als Basis für Paket-Templates (`snapshot.ts`)
- ✅ nginx-Subdomain-Registrierung (`nginx.ts`)
- ✅ Plugin-Wizard als Admin-Backend für Katalog-Pflege
- ✅ Edit-Live-Flow für Paket-Snapshot-Erstellung

### Neu zu bauen
- **Shop-Frontend** (`webui/shop.html` + Builder-JS)
- **Billing-Service** (`src/services/billing.ts` — Stripe-Integration, Webhooks, Invoice-Generation)
- **Tenant-Registry** (`src/services/tenants.ts` — persistente SQLite-Datenbank, später PostgreSQL)
- **Recurring-Scheduler** (Renewal-Reminder, Backup-Trigger, Monitoring-Checks, Cleanup-Grace)
- **Kunden-Dashboard** (`webui/customer.html` — Login, User-Mgmt, Rechnungen, Tickets)
- **Admin-CRM-View** (Erweiterung Admin-Dashboard um Tenants-Tab)

### Infrastruktur-Upgrade nötig?

**Aktueller Stand:** Ein Hetzner-VPS (178.104.171.153) reicht für Demo-Instanzen.

**Für Shop:** Je Tenant permanent Compute + Storage + Backup. Rechnung: 20 Tenants × 2GB RAM × 5GB Disk = 40GB RAM, 100GB Disk. Platzt der aktuelle VPS (vermutlich 32GB RAM) sehr schnell.

**Empfehlung:**
- **Demo-Server bleibt separat** (status quo, unverändert)
- **Production-Cluster** neu: Hetzner Cloud mit Load-Balancer + 2 App-Nodes + Managed PostgreSQL + Object Storage (S3-kompatibel) für Backups
- **Kosten:** geschätzt 150–300€/Monat an Infra-Kosten für die ersten 20–50 Tenants

Das muss in die Pricing-Kalkulation mit rein.

## 7. Bezahlung & Recht

### Zahlungsintegration

**Empfehlung:** **Stripe** als primärer Prozessor.
- Kreditkarte + SEPA Direct Debit + Apple Pay / Google Pay
- Stripe Invoicing für Rechnungen + Dunning
- Webhooks für Zahlungs-Events
- Deutsche Dokumentation, SCA-konform, EU-Hosting via Stripe Ireland

**Sekundär:** PayPal (in DE erwartet, höhere Gebühren ~2,5%)

**B2B-Klassiker:** Manuelle Rechnung + Überweisung (SEPA-Vorabprüfung). Kann über Stripe Invoicing automatisiert werden.

### Steuerrecht (DE/EU)

- **B2B EU mit USt-ID:** Reverse-Charge (0% USt beim Verkäufer)
- **B2C EU:** OSS (One-Stop-Shop) — USt-Land nach Kundenwohnsitz
- **B2C DE:** 19% USt
- **Außerhalb EU:** nach Land, oft 0% mit Nachweis

### Rechtliche Pflichten (DE)

Alle **vor Vertragsabschluss** einsehbar und akzeptiert:
- Impressum (§ 5 TMG)
- Datenschutzerklärung (Art. 13 DSGVO)
- AGB
- Widerrufsbelehrung (B2C; bei Dienstleistungen kann Widerruf nach Inbetriebnahme ausgeschlossen werden, wenn Kunde explizit zustimmt)
- Auftragsverarbeitungsvertrag (AVV) nach Art. 28 DSGVO

**Kritisch:** Das muss ein Fachanwalt für IT-Recht prüfen und AGB-Vorlagen liefern. eLeDia hat vermutlich schon welche für Bestandskunden — die sollten die Basis sein.

## 8. Support & Betrieb

### Support-Tiers (Vorschlag)

| Tier | Enthalten | Preis | Response-Time |
|---|---|---|---|
| Community | Online-Doku, FAQ, Community-Forum | inkludiert | — |
| Standard | Ticket-Support Business Hours | +19€/Monat | 48h |
| Premium | Ticket 4h, Telefon, Onboarding-Call | +99€/Monat | 4h |

### Betriebsthemen
- **Backup:** Täglich 2 Uhr UTC, 30d Retention, Restore über Dashboard
- **Monitoring:** Uptime-Checks (Statuspage.io), Perf-Alerts (P95 > 500ms → auto-Ticket)
- **Updates:** Moodle-Security-Patches binnen 72h, Feature-Updates quartalsweise mit Maintenance-Window-Ankündigung
- **Plugin-Updates:** Minor automatisch, Major durch Kunde angefordert (Changelog-Anzeige im Dashboard)

## 9. Pricing-Modelle — 3 Optionen zur Diskussion

### Option A: Flat Monthly pro Paket (einfachstes Modell)

```
LMS Starter       49€/Monat      50 User, Vanilla
Schulungs-LMS     99€/Monat     200 User
Prüfungs-Suite   149€/Monat    500 User
Enterprise      Anfrage
```

### Option B: Basis + Add-ons (granularer)

```
Moodle-Basis:            29€/Monat (50 User)
+ User-Upgrade:          +0,30€/User/Monat (ab 51)
+ Plugin LeitnerFlow:    +9€/Monat
+ Plugin exam2pdf:      +15€/Monat
+ Backup-Retention 90d:  +5€/Monat
+ Premium-Support:      +49€/Monat
```

### Option C: Hybrid (empfohlen)

Pakete als "empfohlene Konfigurationen" mit festem Preis (Option A).
Baukasten für alle, die was Custom wollen (Option B-Style).
Die meisten Kunden nehmen ein Paket — der Baukasten wirkt als Differentiator im Wettbewerb.

## 10. Offene Fragen (an Johannes)

1. **Zielgruppe:** Bestandskunden-Self-Service, Neuakquise, oder beides?
2. **Verhältnis zum klassischen eLeDia-Hosting:** Konkurrenz, Ergänzung, Ersatz?
3. **Start-Paket-Set:** Mit wie vielen Paketen startest du? (Empfehlung: 2–3)
4. **Trial-Dauer:** 14 Tage? 7? 30?
5. **Laufzeit/Kündigungsfrist:** monatlich / quartalsweise / jährlich? (Empfehlung: jährlich mit 20% Rabatt, monatlich als Option)
6. **Subdomain:** `kunde.eledia.ai` automatisch oder Custom-Domain von Anfang an?
7. **Datenresidenz:** Hetzner DE reicht, oder brauchen manche Kunden ISO-27001-zertifizierte RZ?
8. **Zahlungsarten:** Reicht Stripe, oder muss klassische Rechnung + Überweisung (ohne SEPA-Lastschrift) unterstützt werden?
9. **Upgrade-Pfad:** Kann ein Kunde mid-term sein Paket wechseln? Wie preislich?
10. **Whitelabel:** Soll der Shop auch für Reseller funktionieren (zukünftig)?

## 11. Phased Roadmap

### Phase 0 — Vorbereitung (parallel, kein Code)
- [x] Runbot läuft und ist stabil (aktueller Stand)
- [ ] AGB/Datenschutz/AVV mit Fachanwalt klären → **Johannes offline**
- [ ] Hosting-Angebot-Vergleich: Welche Plugins werden in eLeDia-Bestand am häufigsten gebucht? Welche Preise üblich?
- [ ] Steuerberatung: OSS-Meldung, Rechnungs-Anforderungen
- [ ] Hetzner Cloud-Angebot einholen (Budget für Production-Cluster)

### Phase 1 — MVP (4–6 Wochen)
**Ziel:** Ein Paket ("LMS Starter") kaufbar, Proof-of-Concept Online
- Nur Flat-Pricing, nur Stripe Checkout, nur jährliche Zahlung
- Manueller Provisioning-Trigger durch Admin (Runbot-Infra wiederverwendet)
- Kunden-Dashboard: nur Login + "Meine Instanz"-Übersicht
- Rechnung automatisch via Stripe Invoicing
- Email-Flows (Double-Opt-In, Willkommen, Rechnung)

### Phase 2 — Katalog + Automatisierung (4–6 Wochen)
- 3–4 Pakete + Baukasten-Option
- Automatisches Provisioning nach Zahlungseingang
- Kunden-Dashboard: User-Mgmt, Rechnungen einsehen
- Tenants-Tab im Admin-Dashboard

### Phase 3 — Lifecycle & Support (4–6 Wochen)
- Renewals, Cancellation, Grace-Period, Daten-Export
- Ticket-Integration (E-Mail → Helpdesk, z.B. HelpScout)
- Backup/Restore-Funktion im Dashboard

### Phase 4 — Skalierung (Open End)
- Whitelabel für Reseller
- Custom-Domains mit Let's Encrypt-Automation
- Multi-Region-Hosting

### Aufwandsschätzung
- **Technik MVP→Launch:** ~3–4 Monate Vollzeit für einen Developer
- **Legal + Business:** zusätzlich ~4–8 Wochen, parallel
- **Go-Live realistisch:** Q3/Q4 2026

## 12. Empfohlene nächste Schritte

1. **Konzept-Review:** Johannes liest dieses Dokument, beantwortet die 10 Fragen in Sektion 10.
2. **Marktvalidierung:** 5–10 Gespräche mit potenziellen Käufern (eLeDia-Leads aus den letzten 6 Monaten). Frage: "Würdest du so ein Paket selfservice kaufen? Was ist dir wichtig?"
3. **Legal-Kickoff:** Fachanwalt-Termin zu AGB/AVV/Widerrufsbelehrung.
4. **Steuer-Check:** Steuerberater-Termin zu OSS, Rechnung, USt-Behandlung.
5. **Pricing-Kalkulation:** Infra-Kosten (Hetzner Cloud) + Support-Kosten + Margin → konkrete Preise.
6. **Dann erst:** Technische Architektur-Sessions, konkreter Implementierungsplan.

---

**Wichtig:** Kein Code wird geschrieben, bevor die Fragen in Sektion 10 beantwortet und die Schritte 1–5 in Sektion 12 erledigt sind. Sonst bauen wir in die falsche Richtung und müssen rückspulen.
