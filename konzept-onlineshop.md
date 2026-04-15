# eLeDia Moodle Onlineshop — Konzept v0.2

**Status:** Draft v0.2, 2026-04-15 — **MVP-Scope drastisch geschrumpft**
**Autor:** Johannes (Vision) + Claude (Ausarbeitung)
**Basis:** `moodle-runbot-mcp` (Demo-Plattform)

---

## 0. MVP-Scope v0.2 (NEU — überschreibt Sektion 6–9 für MVP)

**Entscheidung Johannes 2026-04-15:** Runbot übernimmt im MVP **nur**:
1. **Order-Frontend** — Kunde wählt Paket oder Baukasten, füllt Formular aus
2. **Provisioning-Trigger** — nach Bestätigung wird die Moodle-Instanz hochgefahren

**Explizit NICHT im MVP (läuft extern, vermutlich bestehende eLeDia-Plattform):**
- ❌ Zahlungsabwicklung (Stripe/PayPal/Rechnung)
- ❌ Rechnungs-Generierung + Versand
- ❌ AGB/AVV-PDFs + Signing-Flow
- ❌ Support-Tickets + SLA-Verträge
- ❌ Kunden-Dashboard mit Vertragsverwaltung
- ❌ Renewal/Cancellation-Workflows
- ❌ Backup-Management-UI für Kunde

### Drei-Komponenten-Architektur (MVP)

```
┌─────────────────────┐      ┌──────────────────────┐      ┌─────────────────────┐
│ Runbot (shop-UI)    │      │ eLeDia-Bestandsplatt-│      │ Runbot (Provisioner)│
│                     │      │ form (extern)        │      │                     │
│ - Paket/Baukasten   │─────►│ - Rechnung           │─────►│ - Docker-Container  │
│ - Bestell-Formular  │      │ - Zahlung            │      │ - Moodle install    │
│ - Bestätigungsmail  │      │ - AGB-Dialog         │      │ - Subdomain + nginx │
│                     │      │ - Kunden-CRM         │      │ - "Welcome"-Mail    │
│                     │◄─────│ - Support-Tickets    │      │                     │
└─────────────────────┘      └──────────────────────┘      └─────────────────────┘
     POST /api/order                                           Admin triggert
     → Bestellung                                              oder Webhook
                                                               von Bestandsplattform
```

### Schnittstellen zwischen Runbot und Bestandsplattform

**Runbot → Bestandsplattform (Bestellübergabe):**
- **Option A (einfach):** E-Mail an `bestellung@eledia.de` mit strukturierten Feldern (Paket-ID, Kunde, Subdomain-Wunsch). Bestandsplattform verarbeitet manuell.
- **Option B (automatisiert):** Webhook an Bestandsplattform, die übernimmt CRM-Anlage + Zahlung.

**Bestandsplattform → Runbot (Provisioning-Trigger):**
- **Option A (manuell):** Admin-Mitarbeiter klickt im `/admin`-Dashboard auf "Bestellung provisionieren" (nach Zahlungseingang). Neuer Button + neue "Bestellungen"-Sektion im Admin.
- **Option B (Webhook):** Bestandsplattform ruft `POST /api/provisioning/trigger` mit Order-ID auf, Runbot startet den Container.

**Empfehlung für MVP:** Option A überall. Manuelle Eingriffe erlaubt, Komplexität minimal. Automatisierung kommt in Phase 2.

### MVP-Aufwand revidiert

| Komponente | Alte Schätzung (v0.1) | Neue Schätzung (v0.2) |
|---|---|---|
| Shop-Frontend (Paket-Auswahl, Formular) | 2–3 Wochen | 1 Woche |
| Billing-Integration | 3–4 Wochen | **entfällt** |
| Tenant-Registry (persistent) | 2 Wochen | 3 Tage (simpler, weil CRM extern) |
| Kunden-Dashboard | 2–3 Wochen | **entfällt im MVP** |
| Admin-Erweiterung (Bestellungen) | 1 Woche | 1 Woche |
| Provisioning-Scheduler | 2 Wochen | 2 Tage (startContainers läuft eh schon) |
| Legal + AGB + AVV | 4–8 Wochen | **entfällt** (läuft über Bestand) |
| **Gesamt MVP** | **3–4 Monate** | **3–4 Wochen** 🎯 |

### MVP-Featureliste (konkret)

1. **Shop-Frontend** (`webui/shop.html`) — neue Route, separat von `/demo-portal`
   - Paket-Übersicht (lädt aus `configs.json` mit `shop.available: true`)
   - "Jetzt bestellen"-CTA → Formular
   - Formular: Firma, Name, E-Mail, Subdomain-Wunsch, gewünschtes Paket, optionaler Kommentar
   - Submit → `POST /api/order` → Bestätigungsmail

2. **Order-Backend** (`src/services/orders.ts` — neuer, schlanker Service)
   - `createOrder(data)` → persistent in `orders.json` (SQLite wäre overkill für MVP)
   - `listOrders()`, `getOrder(id)`, `markProvisioned(id)`
   - Kein Webhook-Empfang im MVP — nur manueller Admin-Trigger

3. **Admin-Dashboard-Erweiterung** — neuer Tab "📦 Bestellungen"
   - Tabelle: Eingang / Firma / Kontakt / Paket / Subdomain / Status
   - Aktionen pro Bestellung:
     - **✅ Provisionieren** — triggert Docker-Provisionierung analog `/confirm/:token`, aber mit langer Laufzeit (Pinned)
     - **📧 Mail erneut senden** — Bestätigungs- oder Willkommensmail
     - **🗑 Ablehnen** — markiert als abgelehnt, Kunde bekommt Absage-Mail

4. **Long-Lived Instances** — kleine Erweiterung der bestehenden Instance-Registry
   - Neues Feld `orderType: "demo" | "shop"`
   - Shop-Instanzen bekommen `pinned: true` + `pinReason: "shop-order:<orderId>"`
   - Cleanup-Scheduler ignoriert sie komplett (funktioniert schon so via pin)
   - Kein auto-Stop, kein `maxAge`

5. **Mail-Templates** — 2 neue Vorlagen (analog bestehende Demo-Mails)
   - "Bestellung eingegangen" (nach Formular-Submit)
   - "Ihre Instanz ist bereit" (nach Admin-Trigger + Install-Ende, mit Login-Daten)

6. **MINIMAL Kundensicht** — kein Dashboard, aber:
   - Die "Instanz ist bereit"-Mail enthält die Moodle-URL, Admin-Login + Passwort-Reset-Link
   - Ab dann kommuniziert der Kunde nur noch mit dem Bestand-Support
   - Runbot ist für den Kunden nach dem Go-Live unsichtbar

### Was bleibt offen (auch im reduzierten MVP)

1. **Subdomain-Strategie:** Automatisch aus Firma ableiten (`acme-gmbh.eledia.ai`) oder Kunde wählt im Formular? Kollisionen?
2. **Admin-Passwort für Kunde:** Zufallsgeneriert + Passwort-Reset-Zwang? (Empfehlung: ja, via `admin/cli/reset_password.php` + Link in Welcome-Mail)
3. **Custom-Domain:** Im MVP eher nicht — Kunde bekommt `firma.eledia.ai`. Custom-Domain = Phase 2.
4. **Abgelehnte Bestellungen:** Auto-Spam-Filter? Manuelle Prüfung? (MVP: manuell via Admin-UI)

---

## 1. Vision (unverändert)

Aus der Runbot-Demo-Plattform wird ein **Self-Service Moodle-Shop** —
mit dem MVP-Scope: nur Order-Annahme + Provisioning.

## 2. Zwei Kauf-Pfade

### 2a. Paket (Option 1) — MVP-Start

Kuratierte Bundles. Arbeitshypothese:

| Paket | Zielgruppe | Inhalt | User-Limit |
|---|---|---|---|
| **LMS Starter** | Vereine, Projektgruppen | Vanilla Moodle 5.1 | 50 |
| **Schulungs-LMS** | Weiterbildner | Moodle + LeitnerFlow + exam2pdf | 200 |
| **Prüfungs-Suite** | Zertifizierer | Moodle + exam2pdf + SafeExamBrowser | 500 |

### 2b. Baukasten (Option 2) — Phase 2+

Freie Plugin-Kombination. Im MVP verzichten — kommt, sobald Pakete laufen.

## 3. Customer Journey (MVP — vereinfacht)

### Schritt 1 — Paket wählen
- shop.eledia.ai (oder `demo.eledia.ai/shop`)
- Paket anklicken

### Schritt 2 — Formular ausfüllen
- Firma, Name, Anschrift (für Rechnung, die extern gemacht wird)
- Kontakt-E-Mail
- Subdomain-Wunsch (z.B. `meine-firma`)
- AGB-Link (zur Einsicht; formeller Vertragsabschluss läuft extern)
- Submit

### Schritt 3 — Bestätigung
- Bestätigungs-E-Mail: "Ihre Bestellung wurde empfangen. Sie erhalten eine Rechnung von eLeDia. Nach Zahlungseingang wird Ihre Instanz bereitgestellt."
- Bestellung landet im Admin-Dashboard als "eingegangen"

### Schritt 4 — Extern (bei eLeDia)
- eLeDia-Mitarbeiter sieht Bestellung, erstellt Rechnung über Bestandsplattform
- Kunde bezahlt
- eLeDia-Mitarbeiter öffnet Runbot-Admin, klickt "✅ Provisionieren"

### Schritt 5 — Provisioning
- Runbot startet Docker-Container (kann 3–5 Min dauern, weil frische Installation)
- Bei Fertig: automatische "Willkommen"-Mail an Kunde mit URL + Admin-Login

### Schritt 6 — Betrieb
- Kunde nutzt Moodle
- Support/Rechnung/Renewal alles über Bestands-Kanäle
- Runbot administriert nur die technische Instanz

## 4. Paket-Katalog — Struktur

Erweiterung `configs.json`:

```json
{
  "type": "package",
  "id": "schulungs-lms",
  "name": "Schulungs-LMS",
  "description": "Moodle + LeitnerFlow + Quiz-Zertifikate",
  "includedPlugins": ["leitnerflow", "exam2pdf"],
  "userLimit": 200,
  "moodleVersion": "5.1",
  "snapshotId": "schulungs-lms-v1",
  "shop": {
    "available": true,
    "sortOrder": 20,
    "priceInfoUrl": "https://eledia.de/preise/schulungs-lms",
    "trialSnapshotId": "schulungs-lms-trial-v1"
  }
}
```

**Preis explizit NICHT in configs.json** — die Bestandsplattform ist die Single Source of Truth für Preise. Runbot zeigt nur einen Link "Preis anfragen" / "Preise ansehen" (→ Bestandsplattform).

## 5. Lifecycle (MVP)

**Einfachster Lifecycle ohne State-Machine-Schwerarbeit:**

```
ORDER_RECEIVED → ORDER_CONFIRMED → (manuell bei eLeDia) → PROVISIONING → RUNNING
                                                                           │
                                                                           └─► (manuell) TERMINATED
```

- **ORDER_RECEIVED:** Formular abgeschickt, Bestätigungs-Mail raus
- **ORDER_CONFIRMED:** Admin hat im Dashboard "Provisionieren" geklickt
- **PROVISIONING:** Docker läuft hoch
- **RUNNING:** Pinned-Instanz, kein Auto-Cleanup
- **TERMINATED:** Admin hat manuell gestoppt (nach Kündigung, die extern läuft)

Keine GRACE-Period, keine Auto-Renewal, keine Auto-Cancellation — alles extern gesteuert, Runbot macht nur was der Admin im Dashboard klickt.

## 6. Technische Architektur (MVP)

### Wiederverwendung aus Runbot — praktisch 100%
- `docker.ts provisionInstance + startContainers + installPlugin` → funktioniert 1:1
- `snapshot.ts restoreSnapshot` → funktioniert 1:1 (Paket-Snapshots wie Demo-Snapshots)
- `nginx.ts registerInstance` → funktioniert 1:1
- `registry.ts` → Instance gets `pinned: true` → Cleanup-Scheduler lässt sie in Ruhe

### Neu zu bauen (MVP, minimal)
1. `src/services/orders.ts` — ~150 Zeilen, JSON-Persistenz via tmp+rename
2. `src/index.ts` — 4 neue Admin-Endpoints (list/get/trigger-provisioning/reject) + POST /api/order
3. `webui/shop.html` — neue Shop-Landing + Formular (~400 Zeilen)
4. `webui/admin.html` — neuer "Bestellungen"-Tab (~200 Zeilen Erweiterung)
5. `emailTemplates.ts` — 2 neue Mail-Templates

**Kein Database-Umbau, kein Stripe-SDK, kein PDF-Generator.**

### Infrastruktur-Erweiterung nötig?

**Für MVP:** Nein. Der aktuelle Hetzner-VPS reicht für die ersten paar Shop-Instanzen, solange die Demos + Shop-Tenants zusammen unter ~20 Container bleiben.

**Ab ~20 Tenants dauerhaft:** Dann dedizierter Production-VPS + Backups. Ist aber eine zukünftige Entscheidung, kein MVP-Blocker.

---

## 7. Phase 2+ — Das volle Bild (dokumentiert aus v0.1)

*Die folgenden Sektionen bleiben als Referenz für die langfristige Entwicklung. Sie gelten NICHT für den MVP — der läuft über die externe Plattform.*

### Phase 2 — Automatisierung
- Webhook-Integration Bestandsplattform → Runbot (kein manueller Admin-Klick mehr)
- Kunden-Dashboard bei Runbot (nur technische Sicht: "Meine Instanz läuft", "Backup-Stand", keine Vertragsdaten)
- Automatisches Backup-Management

### Phase 3 — Integration
- Ticket-System-Anbindung (wenn Support bei Runbot selbst läuft)
- Plugin-Auto-Updates
- Monitoring-Dashboards

### Phase 4 — Skalierung
- Multi-Tenant-Architektur auf separaten Production-VPS
- Whitelabel für Reseller
- Custom-Domains mit Let's Encrypt

### Billing/Legal/SLA-Themen (aus v0.1 — für später)

Wenn Runbot irgendwann selbst die Abrechnung übernehmen soll, stehen in v0.1 dieses Dokuments alle Details zu:
- Stripe/PayPal-Integration
- VAT-OSS (EU-weit)
- AGB/Datenschutz/AVV
- Support-SLA-Tiers
- Pricing-Modelle (Flat vs. Basis+Addon vs. Hybrid)

Diese Themen sind NICHT Scope des MVP und werden erst relevant, wenn sich rausstellt, dass die Trennung Runbot ↔ Bestandsplattform nicht mehr trägt.

---

## 8. Offene Fragen (MVP-fokussiert)

1. **Welche Bestandsplattform macht die Rechnung + Zahlung?** (Shopify? Internes System? Manuell?)
2. **Wie soll die Bestellübergabe laufen — E-Mail oder Webhook?** (Empfehlung: E-Mail für MVP)
3. **Wie lang dauert der Zahlungsprozess typisch?** (Bestimmt, wie viel Warteinfo der Kunde nach Formular braucht)
4. **Subdomain: automatisch oder Wunsch-Eingabe?** (Empfehlung: Wunsch mit Verfügbarkeits-Check)
5. **Wer bekommt die Welcome-Mail — der technische Admin-Kontakt, der Rechnungskontakt, beide?**
6. **AGB-Link im Shop — zur Info oder muss er geklickt werden?** (Formeller Vertrag läuft extern, Runbot-Formular ist keine Bestellung i.S.d. BGB)
7. **Abgelehnte/verdächtige Bestellungen — automatischer Spam-Filter oder nur manuell?**
8. **Ab wann ist eine Shop-Instanz "live" und Rechnung läuft?** (Mit Provisioning-Start? Mit E-Mail an Kunden?)

## 9. Roadmap v0.2

### Phase 0 — Vorbereitung (diese Woche)
- [ ] Johannes beantwortet Sektion 8
- [ ] Entscheidung Bestandsplattform-Integration (E-Mail vs. Webhook)
- [ ] 1–2 Paket-Definitionen inkl. Snapshot (z.B. "LMS Starter" + "Schulungs-LMS")

### Phase 1 — MVP Implementation (3–4 Wochen)

**Woche 1:** Backend
- `orders.ts` Service
- `POST /api/order` Endpoint
- Admin-Endpoints für Order-Management
- 2 neue Mail-Templates

**Woche 2:** Frontend
- `shop.html` mit Paket-Übersicht + Formular
- Admin-Dashboard-Erweiterung (Bestellungen-Tab)

**Woche 3:** Provisioning-Integration
- `markProvisioned` triggert gleiche Flow wie `/confirm/:token`, aber mit `pinned: true`
- Welcome-Mail nach Install-Ende
- Ende-zu-Ende-Test

**Woche 4:** Polish + Launch
- Landing-Page-Text
- SEO-Grundlagen (Paket-Seiten mit meta-description)
- Eine Pilot-Bestellung durchspielen
- Go-Live mit 1–2 Paketen

### Phase 2 — Nach Launch
- Sobald MVP funktioniert und erste Bestellungen durch sind: Webhook-Integration, Baukasten-Option, mehr Pakete.

---

## 10. Empfohlene nächste Schritte

1. **Diese Woche:** Johannes beantwortet Sektion 8 (die 8 MVP-Fragen)
2. **Diese Woche:** Entscheidung: Welche Pakete starten? Welche Snapshots müssen für die Pakete gebaut werden?
3. **Nächste Woche:** Technische Sessions konkret pro Woche der Phase 1

---

**Kern des v0.2-Shifts:** Der MVP ist ein 3–4-Wochen-Projekt statt 3–4 Monate, weil wir die Schwierigkeiten (Billing, Recht, SLA, Dashboard) an die bestehende eLeDia-Plattform delegieren. Runbot wird ein Provisioning-Werkzeug mit Shop-Frontend — nicht ein vollwertiges SaaS-Business.
