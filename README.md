# eLeDia Moodle Runbot

> Self-Service Demo-Plattform für Moodle-Plugins mit integriertem
> Snapshot-Manager, Plugin-Wizard und in Entwicklung befindlichem Onlineshop.

**Live:** https://demo.eledia.ai
**Admin:** https://demo.eledia.ai/api/admin (HTTP Basic Auth)

---

## Was macht der Runbot?

Interessent\*innen können eLeDia-Moodle-Plugins testen, ohne selbst eine
Moodle-Instanz zu betreiben. Pro Anfrage wird vollautomatisch eine
isolierte Moodle-Umgebung bereitgestellt, ein vorkonfigurierter Snapshot
eingespielt und der Zugang per E-Mail verschickt. Nach ~60 Minuten
Inaktivität räumt der Cleanup-Scheduler die Instanz wieder ab.

Der Runbot ist gleichzeitig die technische Basis für den in Planung
befindlichen **Moodle-Onlineshop**, über den Kund\*innen verbindlich
Demo- und Produktiv-Instanzen bestellen können (siehe unten).

---

## Features

**Demo-Portal** (`webui/demo-portal.html`)

Kachel-Ansicht aller Demo-Angebote aus `configs.json`. Pro Karte:
Plugin-Icon aus GitHub, Kurzbeschreibung, Feature-Liste, "Demo starten"-
CTA. Filter nach Kategorie (Lernen, Verwaltung, Prüfungen, Reporting,
Referenz-Moodles). Warteseite mit Live-Polling bis die Instanz bereit ist.

**Snapshot-Manager** (Admin-UI, feat14)

Kompletter GUI-gesteuerter Snapshot-Lifecycle auf
`https://demo.eledia.ai/api/admin`:

- List / Download / Delete / Set-Default mit Default-Schutz und
  Versions-Mismatch-Warnung (Stage 1A)
- **Rebuild-Button** mit asynchronem Job-Tracking und Live-Log —
  migriert einen alten Snapshot in einem Klick auf eine neue
  Moodle-Version (Stage 1B)
- **Edit-Live-Flow** — Seed-Instanz starten, im Browser editieren,
  Save überschreibt den Snapshot, Discard verwirft (Stage 1C)
- **Plugin-Wizard** — Git-URL eingeben, Backend klont und parst
  `version.php`, Metadata-Form wird vorbelegt, Submit erstellt die
  Demo-Kachel (Stage 1D)

**In-Moodle Admin-Plugin** (`moodle-plugins/local_runbotadmin`)

Moodle-Site-Administration bietet das Snapshot-Management auch direkt
aus der laufenden Instanz heraus (Create / Download / Delete /
Set-Default). Auth über `X-Runbot-Internal-Key`. Binary-Streaming via
CURL-Callback hält Gigabyte-Snapshots aus `memory_limit` fern.

**Demo-Karten (Stand 2026-04-16)**

- `leitnerflow` — eLeDia LeitnerFlow (adaptives Lernkartei-System)
- `exam2pdf` — eLeDia Quiz PDF Certificate (Compliance-Nachweis)
- `spinningwheel` — mod_spinningwheel (Andreas Jüttner, v1.1.0)
- `vanilla-4.5` — Moodle 4.5 LTS ohne Zusatzplugins
- `vanilla-5.1` — Moodle 5.1 ohne Zusatzplugins
- `vanilla-5.1-mariadb` — Moodle 5.1 mit MariaDB statt PostgreSQL
- `vanilla-dev` — Moodle main-Branch (unstable, nur Testing)

**Weitere Runbot-Features**

- E-Mail-Versand über Brevo-SMTP mit gebrandetem Template
- Multi-User-Demo-Szenarien (admin / teacher / student) via
  `multiUser`-Flag im Snapshot
- Cleanup-Scheduler mit Pin-Schutz (`pinReason`) für Seed- und
  Edit-Sessions
- Wildcard-TLS über Let's Encrypt auf `*.demo.eledia.ai`
- CI/CD via GitHub Actions — Push auf `main` → SSH-Deploy auf VPS

---

## Architektur

```
  Interessent*in          Johannes (Admin)          Kund*in (in Entwicklung)
        │                       │                            │
        ▼                       ▼                            ▼
  demo-portal.html        /api/admin                   shop.html
        │                       │                            │
        └───────────┬───────────┴────────────┬───────────────┘
                    ▼                        ▼
              ┌─────────────────────────────────────┐
              │  Express-Backend (src/index.ts)     │
              │                                     │
              │  • /confirm/:token (Demo-Start)     │
              │  • /admin/snapshots/* (Manager)     │
              │  • /admin/plugins/install (Wizard)  │
              │  • /admin/configs (CRUD)            │
              │  • /api/shop/* (Orders, Woche 1b)   │
              │  • /mcp (MCP-Tool-Endpoint)         │
              └──────────────┬──────────────────────┘
                             ▼
              ┌─────────────────────────────────────┐
              │  Services (src/services/)           │
              │                                     │
              │  • docker.ts — moodle-docker wrapper│
              │  • snapshot.ts — .sql.gz + metadata │
              │  • snapshot-admin.ts — Rebuild+Edit │
              │  • plugin-install.ts — Git-Clone    │
              │  • orders.ts — Order State-Machine  │
              │  • cleanup-scheduler.ts             │
              │  • emailTemplates.ts (Brevo-SMTP)   │
              └──────────────┬──────────────────────┘
                             ▼
              ┌─────────────────────────────────────┐
              │  Docker-Instanzen (moodle-docker)   │
              │  eine pro Demo, auto-cleanup        │
              └─────────────────────────────────────┘
```

**Stack**

- TypeScript / Node.js / Express
- `moodle-docker` (PostgreSQL default, MariaDB optional)
- nginx als TLS-Terminator + Reverse-Proxy
- Hetzner VPS, Ubuntu 24.04
- GitHub Actions für Deploy

---

## Dokumentation

Projektdokumentation ist in fünf thematische DevFlow-Files aufgeteilt
(plus Konzept-Dokumente):

- [`00-master.md`](./00-master.md) — Masterindex
- [`01-features.md`](./01-features.md) — Feature-Backlog (feat01–feat15)
- [`02-user-doc.md`](./02-user-doc.md) — User-Dokumentation
- [`03-dev-doc.md`](./03-dev-doc.md) — Developer-Dokumentation (Architektur, APIs, Deployment)
- [`04-tasks.md`](./04-tasks.md) — Task-Liste, Verify-Items, Done-Archiv
- [`05-quality.md`](./05-quality.md) — Bugfix-Archiv, QA-Checkliste
- [`KONZEPT.md`](./KONZEPT.md) — Produktkonzept Demo-Plattform
- [`konzept-onlineshop.md`](./konzept-onlineshop.md) — Konzept Onlineshop-Erweiterung (v0.6)

---

## Setup auf einem neuen VPS

```bash
# 1. Repo klonen
git clone https://github.com/jmoskaliuk/moodle-runbot-mcp.git /opt/runbot
cd /opt/runbot

# 2. Umgebungsvariablen setzen (siehe setup.sh für Liste)
cp .env.example .env
nano .env   # MCP_API_KEY, BREVO_SMTP_*, ADMIN_USER/PASS, RUNBOT_INTERNAL_API_KEY, …

# 3. Dependencies + Build
npm ci
npm run build

# 4. Alles andere
sudo bash setup.sh    # nginx, systemd, Let's Encrypt, Docker, Plugin-Clones
```

Details und Troubleshooting in [`03-dev-doc.md`](./03-dev-doc.md).

---

## Deployment

Push auf `main` → GitHub Actions → SSH auf VPS → `git pull` +
`npm ci` + `npm run build` + `systemctl restart runbot`. Der Workflow
ist in `.github/workflows/deploy.yml` definiert.

---

## Onlineshop-Erweiterung (in Entwicklung)

Seit 2026-04-15 wird der Runbot um einen Onlineshop-Flow erweitert, der
verbindliche Bestellungen inklusive AGB-/AVV-Signing entgegennimmt und
vollautomatisch in eine Moodle-Instanz überführt.

**Status** (Stand 2026-04-16): Konzept v0.6 finalisiert, Woche 1
Scaffold deployed (`orders.ts`-Service, AGB-/AVV-Templates,
Brand-Konstanten). Woche 1b–4 folgen (siehe
[`04-tasks.md`](./04-tasks.md) → task46–task49).

**Flow**

```
Shop-Formular ─┐
               ▼
       Verify-Mail (Double-Opt-In)
               │
               ▼
       Magic-Link → AGB/AVV-Review
               │
               ▼
       Bestätigung → Auto-Provisioning
               │
               ▼
       Welcome-Mail mit Zugangsdaten
               │
               ▼
       Kunde hat Demo + Kunden-Dashboard
```

**Entscheidende MVP-Punkte**

- Billing läuft in Odoo — nicht im Runbot
- Demo geht live **bevor** die Rechnung rausgeht (Vertrauen > Kontrolle)
- Admin-Alert an post@moskaliuk.com bei jeder neuen Bestellung
- Random-Initialpasswort, Self-Service-Reset
- AGB-/AVV-PDF per Mail + Download im Kunden-Dashboard

Details in [`konzept-onlineshop.md`](./konzept-onlineshop.md).

---

## Kontakt

eLeDia GmbH · Johannes Moskaliuk · https://eledia.de

---

## Lizenz

Projekt-internes Repository. Bei Interesse an einzelnen Modulen als
Open-Source-Komponente: bitte direkt anfragen.
