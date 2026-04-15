# eLeDia Moodle Onlineshop — Konzept v0.3

**Status:** Draft v0.3, 2026-04-15 — AGB/AVV-Signing + Mini-Kunden-Dashboard zurück im MVP
**Autor:** Johannes (Vision) + Claude (Ausarbeitung)
**Basis:** `moodle-runbot-mcp` (Demo-Plattform)

**Änderungen seit v0.2:**
- AGB/AVV-Signing-Flow: jetzt im MVP (Sektion 0.1 + neue Sektion 6a)
- Mini-Kunden-Dashboard: jetzt im MVP (Sektion 0.2 + neue Sektion 6b)
- MVP-Aufwand: 3–4 Wochen → **4–5 Wochen**

---

## 0. MVP-Scope v0.3 (gültiger Scope — überschreibt v0.1)

Runbot im MVP:
1. **Order-Frontend** — Paket-Auswahl + Formular
2. **AGB/AVV-Signing** — digitales Click-Agreement mit PDF-Generierung + Audit-Log
3. **Provisioning-Trigger** — nach Bestätigung Moodle-Instanz hochfahren
4. **Mini-Kunden-Dashboard** — Instanz-Status-Anzeige via Magic-Link-Login

**Weiterhin NICHT im MVP** (läuft extern):
- ❌ Zahlungsabwicklung (Stripe/PayPal)
- ❌ Rechnungs-Generierung + Versand
- ❌ Support-Tickets + SLA
- ❌ Renewal/Cancellation-Workflows
- ❌ Backup-Management-UI für Kunde
- ❌ Plugin-Updates im Kundendashboard

### 0.1 Warum AGB/AVV zurück im MVP

**Rechtliche Pflicht:** DSGVO Art. 28 schreibt einen schriftlichen (Text-Form reicht nach Art. 28 (9) DSGVO) Auftragsverarbeitungsvertrag vor, **bevor** die Verarbeitung beginnt. Da Runbot die Moodle-Instanz provisioniert und betreibt und auf dem Hosting dann personenbezogene Daten (Kursteilnehmer) verarbeitet werden, ist der AVV zwingend.

**Varianten-Vergleich:**

| Option | Beschreibung | Legal-Stärke | MVP-tauglich |
|---|---|---|---|
| A | Checkbox "AGB akzeptiert" mit PDF-Link | für AGB ok, für AVV schwach | nur teilweise |
| **B** | Kunde tippt Firma/Name/Funktion → Server generiert personalisiertes PDF → Click-Agreement + Audit-Log | reicht für AVV (Text-Form) | ✅ **empfohlen** |
| C | Qualifizierte elektronische Signatur (DocuSign/Skribble) | maximal | overkill, ~100€/Mt |
| D | Papier/Fax-Versand + Rückgabe | solide, altmodisch | Friction zu hoch |

**Wichtig:** Die Text-Form nach §126b BGB + Art. 28 (9) DSGVO reicht aus — es **muss keine handschriftliche Unterschrift** sein, solange erkennbar ist, wer (Firma + Name) unterzeichnet hat und der Text unveränderbar dokumentiert ist. Das PDF mit Namen + Zeitstempel + IP + Hash reicht.

### 0.2 Warum Mini-Kunden-Dashboard zurück im MVP

**Scope auf Transparenz reduziert:**
- ✅ Liste der eigenen Instanzen (meist nur 1)
- ✅ Status (running / down / maintenance)
- ✅ URL, Created-At, Paket-Name
- ✅ Download-Link für signierten AVV (wieder ausdrucken falls verloren)
- ❌ Stopp/Restart/Upgrade-Buttons (läuft über Bestands-Support)
- ❌ User-Management (macht Kunde in seiner Moodle-Instanz selbst)
- ❌ Rechnungen/Verträge (läuft über Bestandsplattform)

**Begründung:** Minimum an Self-Service, maximale Reduktion von "ist mein System noch da?"-Support-Anfragen. Weder Billing- noch Feature-Verwaltung duplizieren.

---

## 1. Vision

Aus der Runbot-Demo-Plattform wird ein Self-Service Moodle-Shop mit MVP-Scope: Order-Annahme + Agreement-Signing + Provisioning + Transparenz-Dashboard. Billing, Rechnungen, Support laufen über die bestehende eLeDia-Plattform.

## 2. Zwei Kauf-Pfade

### 2a. Paket (MVP-Start)

| Paket | Zielgruppe | Inhalt | User-Limit |
|---|---|---|---|
| **LMS Starter** | Vereine, Projektgruppen | Vanilla Moodle 5.1 | 50 |
| **Schulungs-LMS** | Weiterbildner | Moodle + LeitnerFlow + exam2pdf | 200 |
| **Prüfungs-Suite** | Zertifizierer | Moodle + exam2pdf + SafeExamBrowser | 500 |

### 2b. Baukasten — Phase 2+

Freie Plugin-Kombination. Im MVP weggelassen.

## 3. Customer Journey (MVP v0.3)

### Schritt 1 — Paket wählen
- `shop.eledia.ai` → Paket-Übersicht → Auswahl

### Schritt 2 — Formular ausfüllen
- **Rechnungsanschrift:** Firma, Adresse, USt-ID (für externe Rechnung)
- **AVV-Daten:** Firma, Vor/Nachname, Funktion, E-Mail des Unterzeichnenden
- **Technisch:** gewünschte Subdomain, Kontakt-E-Mail
- Submit → AVV/AGB-Review-Schritt

### Schritt 3 — AGB + AVV signieren (NEU im v0.3)
- Server generiert personalisiertes AVV-PDF mit eingesetzten Daten
- Kunde sieht PDF im Browser + Download-Button + AGB-Link
- Checkbox "Ich, [Name], bestätige als [Funktion] der [Firma], den AVV und die AGB gelesen und akzeptiert zu haben."
- "Bestellung absenden" → Backend speichert Order + AVV-PDF + Audit-Log
- Bestätigungs-E-Mail an Kontakt mit PDF-Anhang

### Schritt 4 — Extern (eLeDia)
- Admin sieht Bestellung im Dashboard, erstellt Rechnung über Bestandsplattform
- Kunde zahlt über Bestandsprozess
- Admin klickt in Runbot-Admin "✅ Provisionieren"

### Schritt 5 — Provisioning
- Docker-Container wird hochgefahren (3–5 Min frisch, oder Paket-Snapshot)
- Welcome-Mail an Kunde mit URL + Admin-Login + **Magic-Link** zum Kunden-Dashboard

### Schritt 6 — Betrieb
- Kunde nutzt Moodle
- Im Kunden-Dashboard sieht er: Status, URL, AVV-Download
- Support/Rechnung/Renewal über Bestandsplattform

---

## 6a. AGB/AVV-Signing-Flow (NEU)

### UX-Flow

```
Formular ausgefüllt ──► Review-Seite ──► AVV gesigned ──► Bestätigungsmail
                           │                     │
                           │                     └─ Order in "ORDER_SIGNED" Status
                           │
                           └─ AVV-PDF serverseitig generiert
                              AGB-Version aus Repo eingefroren
```

### Technische Komponenten

**1. Templates im Repo:**
```
templates/
├── agb-v1.md              # AGB-Text, Markdown, von Anwalt geliefert
├── avv-template-v1.md     # AVV mit {{firma}}, {{name}}, {{funktion}}, {{datum}}, {{paket}} Platzhaltern
└── agreement-styles.css   # Corporate-Styling für PDF-Rendering
```

**2. PDF-Generierung:**
- **Option A:** `pandoc` via child_process + LaTeX (kostenlos, im Docker-Image installierbar, hohe Qualität)
- **Option B:** Node-Library `puppeteer` — HTML-zu-PDF (größerer Footprint, aber flexibler)
- **Option C:** Externer Service (z.B. ConvertAPI, DocRaptor ~0,01€/PDF)

**Empfehlung MVP:** Option A (pandoc) — in moodle-docker bereits verfügbar, zuverlässig, schön.

**3. Neuer Service `src/services/agreements.ts`:**
```typescript
interface SignedAgreement {
  orderId:      string;
  type:         "agb" | "avv";
  templateVersion: string;   // "v1" — aus Repo eingefroren
  signedBy: {
    firma:    string;
    name:     string;
    funktion: string;
    email:    string;
  };
  signedAt:     string;       // ISO
  ipAddress:    string;       // von req.ip
  userAgent:    string;
  pdfPath:      string;       // /opt/runbot/agreements/<orderId>/avv-signed.pdf
  pdfSha256:    string;       // Hash zur Integritätsprüfung
}

export async function generateAvvPdf(order: Order): Promise<string>;
export async function recordAgreement(agreement: SignedAgreement): Promise<void>;
export async function listAgreementsForOrder(orderId: string): Promise<SignedAgreement[]>;
export async function getAgreementPdf(orderId: string, type: "agb" | "avv"): Promise<Buffer>;
```

**4. Persistenz:**
- Metadaten: `/opt/runbot/agreements/index.json` (append-only)
- PDFs: `/opt/runbot/agreements/<orderId>/{agb,avv}-signed.pdf`
- Backup: tägliches Sync in Object-Storage (Phase 2)

**5. Audit-Log:**
Jedes Signing wird zusätzlich in `logs/agreements-audit.log` geschrieben (append-only, nie überschreiben):
```
2026-04-20T10:23:45Z order=ord-abc123 type=avv version=v1 signer="Max Mustermann (CTO, ACME GmbH)" ip=203.0.113.42 sha256=4a7b...
```

### AVV-Template-Aufbau (Platzhalter-Liste)

```markdown
# Auftragsverarbeitungsvertrag

zwischen
**{{firma}}**
vertreten durch {{name}}, {{funktion}}
— nachfolgend "Verantwortlicher" —

und
**eLeDia GmbH**, [Adresse einfügen]
vertreten durch [Geschäftsführer-Name]
— nachfolgend "Auftragsverarbeiter" —

## 1. Gegenstand der Verarbeitung
Der Auftragsverarbeiter stellt dem Verantwortlichen eine Moodle-Instanz
im Rahmen des Pakets **{{paket}}** zur Verfügung. ...

## 2. Art und Zweck
...

## 3. Kategorien betroffener Personen
Lernende, Lehrende, Administratoren in der Moodle-Instanz des Verantwortlichen.

## 4. Technische und organisatorische Maßnahmen (TOM)
Anlage 1.

## 5. Unterauftragsverarbeiter
Anlage 2 — z.B. Hetzner Online GmbH (Hosting DE).

...

**Datum der Annahme:** {{datum}}
**Digitale Annahme durch:** {{name}}, {{funktion}}, {{email}}
**Annahme-IP:** {{ip}}
**Template-Version:** {{version}}
**SHA256 dieses Dokuments:** {{sha}}
```

### Rechtlicher Disclaimer

**Wichtig:** Ich kann das technische Gerüst bauen — **die Texte (AGB, AVV, TOM, Unterauftragsverarbeiter-Liste) müssen von einem IT-Fachanwalt erstellt oder geprüft werden.** eLeDia hat vermutlich schon welche für Bestands-Hosting — die sollten als Basis dienen.

Die Template-Platzhalter (`{{firma}}`, `{{name}}` etc.) gebe ich vor — Johannes + Anwalt füllen mit echten Texten.

### MVP-Aufwand AGB/AVV

- Service + Endpoints: ~3–4 Tage
- PDF-Rendering: 1–2 Tage (pandoc-Setup, Styling)
- Frontend-Review-Seite: 1–2 Tage
- **Gesamt:** ~1 Woche + unabhängig dazu Anwaltskosten + Text-Erstellung

---

## 6b. Mini-Kunden-Dashboard (NEU)

### UX-Flow

```
Kunde bekommt E-Mail mit Magic-Link
    │
    ▼
Klick → GET /kunde/:magic-token (30 Tage gültig)
    │
    ▼
Dashboard zeigt:
    - Meine Instanz(en) mit Status
    - Moodle-URL
    - Created-At, Letzter-Backup-At
    - Download-Link AGB + AVV
    - Support-Kontakt (E-Mail + Tel)
    - Bei Fragen → weiterleitung an eLeDia-Support
```

### Technik

**1. Magic-Link statt Passwort-DB:**
- Keine Registrierung, keine Passwörter
- Link ist token-basiert (64 Zeichen random, 30d gültig)
- Bei Click wird Session-Cookie gesetzt (1h), danach erneuter Link aus Profil
- Wiederholungen: "Neuen Link anfordern" → an Rechnungsmail senden

**2. Neuer Service `src/services/customers.ts`:**
```typescript
interface Customer {
  id:          string;        // gleiche wie Order.customerId
  email:       string;        // Login-Identifikator
  firma:       string;
  name:        string;
  magicTokens: MagicToken[];  // [{token, expiresAt, usedAt?}]
  orderIds:    string[];      // alle Orders dieses Kunden
}

export async function createMagicLink(email: string): Promise<string>;
export async function validateMagicToken(token: string): Promise<Customer | null>;
export async function getCustomerInstances(customerId: string): Promise<InstanceInfo[]>;
```

**3. Neue Frontend-Seite `webui/customer.html` (~300 Zeilen):**
- Styling analog zu admin.html (konsistent)
- Header: Name + Firma + Logout
- Sektion "Meine Instanzen" — Tabelle mit:
  - Paket-Name + Icon
  - Status-Pill (running/starting/down)
  - URL mit "Öffnen"-Button
  - Created-At + Laufzeit
  - Actions: "AVV herunterladen", "Support kontaktieren"
- Keine Stoppen/Upgraden/User-Mgmt-Buttons — das läuft über eLeDia-Support
- Footer: "Bei Fragen: support@eledia.de • Tel +49..."

**4. Neue Endpoints:**
- `POST /api/customer/magic-link` — body: `{email}` → erzeugt Token, sendet Mail
- `GET /kunde/:token` — validiert, setzt Cookie, serviert customer.html
- `GET /api/customer/me` — aktuelle Customer-Daten + Instanzen (Cookie-Auth)
- `GET /api/customer/agreements/:orderId/:type` — AVV/AGB-PDF-Download

**5. Sicherheit:**
- Tokens sind HMAC-signiert (kein Server-State in URL)
- Rate-Limit auf Magic-Link-Anfrage (max. 3 pro Stunde pro E-Mail)
- Cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, Expires nach 1h
- Kein CSRF-relevanter Action möglich (nur Reads)

### MVP-Aufwand Kunden-Dashboard

- Service + Endpoints: ~2–3 Tage
- Frontend: ~2–3 Tage
- Magic-Link-Mail-Template: 0,5 Tage
- **Gesamt:** ~1 Woche

---

## 7. Angepasste MVP-Roadmap v0.3

### Phase 0 — Vorbereitung (diese Woche, kein Code)
- [ ] Johannes beantwortet 8 offene Fragen aus v0.2 Sektion 8
- [ ] Fachanwalt liefert AGB + AVV-Text (eLeDia hat vermutlich schon)
- [ ] Corporate-Styling für PDFs (Logo, Farben)
- [ ] 1–2 Paket-Snapshots bauen (z.B. via Admin-UI Edit-Live)

### Phase 1 — Implementation (4–5 Wochen statt 3–4)

**Woche 1:** Order-Backend
- `orders.ts` + Endpoints
- 2 Mail-Templates
- Admin-Dashboard-Erweiterung (Bestellungen-Tab)

**Woche 2:** AGB/AVV-System
- `agreements.ts` + PDF-Generator via pandoc
- Template-Rendering mit Platzhaltern
- Audit-Log
- Frontend-Review-Seite

**Woche 3:** Shop-Frontend
- `shop.html` + Builder-JS
- Integration mit AVV-Review-Step
- Bestätigungs-Mail mit AVV-Anhang

**Woche 4:** Kunden-Dashboard
- `customers.ts` + Magic-Link
- `customer.html`
- Magic-Link-Mail-Template

**Woche 5:** Integration + Polish
- Provisioning-Trigger integriert mit bestehender Runbot-Infra
- Welcome-Mail erweitert (Magic-Link + Admin-Login)
- Ende-zu-Ende-Test mit Pilot-Bestellung
- Landing-Page-Text + Launch-Prep

---

## 8. Offene Fragen (v0.3 aktualisiert)

### Aus v0.2 (noch offen)
1. **Bestandsplattform-Identifizierung:** Welche Plattform macht die Rechnung? (Integration Detail)
2. **Bestellübergabe:** E-Mail oder Webhook? (Empfehlung: E-Mail MVP)
3. **Subdomain:** Auto aus Firma oder Wunsch-Eingabe? (Empfehlung: Wunsch mit Check)
4. **Welcher Kontakt bekommt Welcome-Mail?** (Empfehlung: technischer Kontakt = Formular-E-Mail)
5. **Spam-Filter:** Automatisch oder manuell? (Empfehlung: manuell im MVP)

### Neu in v0.3
6. **AGB/AVV-Texte:** Hat eLeDia schon welche im Bestand? Kann ich die Templates im Repo anlegen, Johannes füllt Inhalt?
7. **TOM-Anlage (Technische & Organisatorische Maßnahmen):** Nötig für AVV — gibt es schon eine TOM-Dokumentation bei eLeDia?
8. **Unterauftragsverarbeiter:** Wer ist in der Liste außer Hetzner? (Brevo für E-Mail? GitHub als Code-Host?)
9. **PDF-Rendering:** pandoc (MVP-empfohlen) oder Puppeteer? (Puppeteer ist flexibler, aber braucht Chrome im Container)
10. **Magic-Link-TTL:** 30 Tage praktikabel oder zu lang? (Security vs. Convenience)
11. **Kunden-Dashboard bei falschem Login:** "E-Mail nicht gefunden" zeigen oder immer "Link gesendet" (Security through obscurity)?

---

## 9. Zusammenfassung der Architektur v0.3

**Drei Komponenten:**

```
┌────────────────────────────┐    ┌────────────────────────┐    ┌──────────────────────────┐
│ RUNBOT (erweitert)         │    │ eLeDia-Bestand (extern)│    │ Kunde                    │
│                            │    │                        │    │                          │
│ • Shop-Frontend            │───►│ • Rechnung             │◄──►│ • Zahlung                │
│ • AVV-Signing + PDF-Gen    │    │ • Zahlungsabwicklung   │    │ • Moodle-Nutzung         │
│ • Order-Management         │    │ • Support-Tickets      │    │ • Mini-Dashboard (Read)  │
│ • Provisioning (Docker)    │    │ • Vertragsverwaltung   │    │ • Support über Bestand   │
│ • Mini-Kunden-Dashboard    │    │ • Renewals             │    │                          │
│                            │    │                        │    │                          │
└────────────────────────────┘    └────────────────────────┘    └──────────────────────────┘
```

**Runbot neu (auf Basis bestehender Infra):**
- ~150 Zeilen `orders.ts`
- ~200 Zeilen `agreements.ts` + Templates + PDF-Gen
- ~150 Zeilen `customers.ts` + Magic-Link
- ~400 Zeilen `shop.html` + Review-Seite
- ~300 Zeilen `customer.html`
- ~200 Zeilen Admin-Erweiterung für Bestellungen-Tab
- 4–5 neue Mail-Templates
- **Gesamt:** ~1500 Zeilen neuer Code, 4–5 Wochen Implementation

**Keine** Billing-Logic, keine Stripe-Integration, keine Renewal-Engine, keine Ticket-System-Integration — das alles bleibt bei der Bestandsplattform.

---

**Wichtig:** Die AGB/AVV-Texte müssen vom Fachanwalt kommen. Ich bereite das technische Gerüst vor, aber ohne juristisch sauberen Input wird die Plattform nicht launch-fähig.

---

*Phase-2+-Themen (Stripe-Integration, Renewal-Engine, Custom-Domains, Whitelabel, volle Support-SLA) sind in v0.1 dieses Dokuments dokumentiert und werden relevant, wenn sich die Trennung Runbot ↔ Bestandsplattform als zu aufwändig erweist.*
