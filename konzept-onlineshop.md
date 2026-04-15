# eLeDia Moodle Onlineshop — Konzept v0.5

**Status:** Draft v0.5, 2026-04-15 — Dashboards klar getrennt (Kunde vs. Internal)
**Autor:** Johannes (Vision) + Claude (Ausarbeitung)
**Basis:** `moodle-runbot-mcp` (Demo-Plattform)

**Änderungen seit v0.4:**
- Internal-Dashboard vs. Kunden-Dashboard klar getrennt (Sektion 6b + 6d)
- Admin-Dashboard bekommt neuen Tab "Shop-Tenants" (Erweiterung bestehendes /api/admin)
- Aufwand bleibt 4–5 Wochen (ist eigentlich schon in Woche 4 drin, nur klarer spezifiziert)

---

## 0. MVP-Scope v0.5 (gültiger Scope)

### 0.1 Was Runbot im MVP macht
1. **Order-Frontend** — Paket-Auswahl + Formular
2. **Double-Opt-In** — Verify-Mail, dann Bestell-Review-Seite
3. **AGB/AVV-Signing** — PDF-Generation + Click-Agreement + Audit-Log
4. **Automatisches Provisioning** — nach Bestätigung direkt Container hochfahren
5. **Odoo-Notification** — E-Mail an `bestellung@eledia.de`
6. **Welcome-Mail** — URL + Admin-Login + Password-Reset-Link + Next-Steps
7. **Kunden-Dashboard** (extern) — Magic-Link, nur eigene Instanz(en)
8. **Internal-Dashboard** (intern) — Erweiterung `/api/admin`: alle Shop-Tenants, alle Orders

### 0.2 Zwei Dashboards — klare Rollentrennung

| Aspekt | Kunden-Dashboard | Internal-Dashboard |
|---|---|---|
| **URL** | `/kunde/:magic-token` | `/api/admin` (HTTP Basic Auth) |
| **Nutzer** | Einzelner Kunde | eLeDia-Mitarbeiter |
| **Sieht** | Nur eigene Instanz(en) | ALLE Instanzen + Orders + Snapshots |
| **Darf** | Nur lesen (Status, AVV-Download) | Lesen + Actions (Stop, Retry-Provision, Override) |
| **Zweck** | Transparenz für Kunde | Monitoring + Troubleshooting + Provisioning-Override |
| **Authentifizierung** | Magic-Link via E-Mail | Basic Auth (bestehend) |
| **Code-Basis** | `webui/customer.html` (neu) | `webui/admin.html` (Erweiterung) |

### 0.3 Johannes-Antworten (aus v0.4)

| # | Frage | Antwort |
|---|---|---|
| 1 | Bestandsplattform | **odoo** |
| 2 | Bestellübergabe | E-Mail zum Start, Webhook an odoo in Phase 2 |
| 3 | Zahlungsdauer | Nicht relevant — Instanz geht vor Zahlung live |
| 4 | Subdomain | Wunscheingabe mit Verfügbarkeits-Check |
| 5 | Welcome-Mail | Person, die Formular ausfüllt |
| 6 | AGB/AVV | Pflicht-Download + Klick, siehe Review-Flow |
| 7 | Spam-Filter | Double-Opt-In via Verify-Mail |
| 8 | Instanz live | Direkt nach Bestätigung + Provisioning |

### 0.4 Customer-Flow (aus v0.4)

Shop-Formular → Verify-Mail → Order-Review (AGB/AVV download) → Confirm → Auto-Provisioning → Welcome-Mail mit Magic-Link zum Kunden-Dashboard.

---

## 1. Vision

Self-Service Moodle-Shop: Kunde durchläuft autonom Paket-Auswahl bis fertige Instanz. Odoo übernimmt Rechnung/CRM. Internal-Dashboard gibt eLeDia die Übersicht.

## 2. Pakete (MVP-Start)

| Paket | Inhalt | User-Limit |
|---|---|---|
| **LMS Starter** | Vanilla Moodle 5.1 | 50 |
| **Schulungs-LMS** | Moodle + LeitnerFlow + exam2pdf | 200 |
| **Prüfungs-Suite** | Moodle + exam2pdf + SafeExamBrowser | 500 |

---

## 6. Komponenten-Details

### 6a. AGB/AVV-Flow (unverändert aus v0.4)

Verify-Mail → Order-Review mit AGB + personalisiertem AVV-PDF → Pflicht-Download + Click-Confirm → Audit-Log.

**Neue Endpoints:**
- `GET /order/review/:token` — Review-HTML
- `GET /api/order/:token/agb.pdf` — mit Download-Counter
- `GET /api/order/:token/avv.pdf` — personalisiert + Counter
- `POST /api/order/:token/confirm` — Final-Confirm + Auto-Provisioning

### 6b. Kunden-Dashboard (für Endkunden) — minimal

**URL:** `/kunde/:magic-token` (30d gültig)

**Zeigt:**
- Eigenen Namen + Firma
- Eigene Instanz(en) mit:
  - Paket-Name + Icon
  - Status-Pill (running / starting / down)
  - URL mit "Öffnen"-Button
  - Created-At + Laufzeit
- AVV + AGB als Download (wieder ausdrucken)
- Support-Kontakt: "Fragen? → support@eledia.de"

**Zeigt NICHT:**
- Rechnungen (läuft über odoo)
- Backup-Einstellungen
- User-Mgmt (macht Kunde in Moodle selbst)
- Andere Kunden-Instanzen

**Aktionen:**
- Nur Lesen. Keine Stop/Start/Upgrade-Buttons.
- Support-Anfrage geht an `support@eledia.de` (mailto-Link)

**Technik:**
- `src/services/customers.ts` — Magic-Link, kein Passwort
- `webui/customer.html` — ~300 Zeilen, reduziert

### 6c. Subdomain-Verfügbarkeitscheck (aus v0.4)

`GET /api/subdomain/check?s=<wunsch>` → Prüft Registry + Blacklist + Regex. Frontend zeigt Live-Verfügbarkeit beim Tippen.

### 6d. Internal-Dashboard (für eLeDia-Team) — Erweiterung bestehendes /api/admin

**Status quo:** Das Admin-Dashboard existiert unter `/api/admin` mit Basic Auth. Aktuell zeigt es:
- Instanzen (laufende Docker-Container)
- Tokens (Demo-Anfragen)
- Snapshots (+ Stage 1A–1D Manager)

**Neu in v0.5:** Erweiterung um Shop-Perspektive.

#### 6d.1 Neuer Tab "Shop-Tenants"

Tabelle mit Shop-Instanzen — erweiterte Spalten gegenüber der generellen Instanzen-Tabelle:

| Spalte | Beschreibung |
|---|---|
| Order-ID | `ord-abc123` — Link zum Bestell-Detail |
| Firma | "ACME GmbH" |
| Paket | "Schulungs-LMS" mit Icon |
| Subdomain | `acme-schulung.eledia.ai` — Link |
| Status | running / starting / stopped / error |
| Angelegt | Datum + relative Zeit |
| User | 12 / 200 (genutzt / Limit) |
| Letzte Aktivität | Letzter HTTP-Hit auf die Instanz |
| Actions | Logs, Stop, Restart, "Manual Reprovision" |

**Filter:** Nur Shop | Nur Aktive | Nach Paket | Nach Firma (Search)

**Sort:** Angelegt-Desc (neu zuerst)

#### 6d.2 Neuer Tab "Bestellungen" (Order-Pipeline)

Zeigt alle Orders nach State, unabhängig ob Instanz läuft oder nicht.

| Spalte | Beschreibung |
|---|---|
| Order-ID | `ord-abc123` |
| Eingang | Timestamp |
| Status | DRAFT / PENDING_VERIFICATION / ORDER_REVIEW / CONFIRMED / PROVISIONING / LIVE / TERMINATED / ERROR |
| Firma + Kontakt | "ACME GmbH — Max Mustermann <max@acme.de>" |
| Paket + Subdomain | "Schulungs-LMS → acme-schulung" |
| AVV-Status | signed ✓ / pending / — |
| Odoo-Mail | gesendet / pending / bounced |
| Actions | Details, PDF-Download (AVV), Reprovision (bei ERROR), Abbrechen |

**Aufgabe im Alltag:**
- Morgens im Büro: "Sind die letzten 24h-Bestellungen sauber durchgelaufen?" → Filter "letzte 24h, Status ≠ LIVE"
- Bei E-Mail "Instanz geht nicht": Kunde nennt Firma, Admin sucht Order, sieht State + Logs

#### 6d.3 Erweiterung bestehender "Instanzen"-Tab

- Neuer Filter: "Alle | Nur Shop-Tenants | Nur Demos"
- Neue Spalte: "Typ" — Badge (🛒 Shop / 🧪 Demo)
- Sort nach Typ möglich

#### 6d.4 Übersicht-Stats (optional, oben in /api/admin)

Kleiner Zahlen-Block über allen Tabellen:

```
┌──────────┬──────────┬──────────┬──────────┐
│ Shop     │ Shop     │ Orders   │ Demos    │
│ Instanzen│ diese    │ diese    │ letzte   │
│ aktiv    │ Woche neu│ Woche    │ 24h      │
├──────────┼──────────┼──────────┼──────────┤
│   17     │   3 +    │   5 📬   │   42     │
└──────────┴──────────┴──────────┴──────────┘
```

**MVP-Aufwand Internal-Dashboard-Erweiterung:** ~2–3 Tage
- Tab "Shop-Tenants" — wiederverwendet Instanzen-Tabelle mit Shop-Filter
- Tab "Bestellungen" — neue Komponente, greift auf `orders.ts` zu
- Stats-Block — 4 kleine API-Calls

Passt problemlos in Woche 4 der Roadmap (ist schon als "Admin-Erweiterung" eingeplant, jetzt nur konkreter).

---

## 7. Odoo-Integration (unverändert aus v0.4)

MVP: E-Mail an `bestellung@eledia.de` mit Bestell-Daten + AVV-Link.
Phase 2: Direkter API-Call an odoo (Partner + Sales Order anlegen).

## 8. Lifecycle-State-Machine (unverändert aus v0.4)

DRAFT → PENDING_VERIFICATION → ORDER_REVIEW → CONFIRMED → PROVISIONING → LIVE → TERMINATED

Fehlerzustände: VERIFY_EXPIRED, PROVISION_FAILED, REJECTED.

## 9. MVP-Roadmap v0.5 (unverändert aus v0.4 — 4–5 Wochen)

- **W1:** Order-Backend + Lifecycle + Odoo-Notify-Mail
- **W2:** AGB/AVV-System + PDF-Gen
- **W3:** Shop-Frontend (`shop.html` + `order-review.html`)
- **W4:** Provisioning-Integration + Kunden-Dashboard + **Internal-Dashboard-Erweiterung**
- **W5:** Polish + End-to-End-Test + Launch

## 10. Offene Fragen v0.5

1. **AGB/AVV-Texte** — bei eLeDia vorhanden? Wer liefert sie? (Top-Priorität)
2. **TOM-Anlage** — Technische/Organisatorische Maßnahmen für AVV
3. **Unterauftragsverarbeiter-Liste** — Hetzner, Brevo, weitere?
4. **Corporate Design für PDFs** — Logo, Farben, Fonts
5. **Odoo-Empfänger** — `bestellung@eledia.de` existiert? Wer verarbeitet?
6. **Provisioning-Fehler** — UX bei `PROVISION_FAILED` (Admin-Alert + Kunden-Mail?)
7. **Admin-Passwort für Moodle** — generiert + Reset-Link, oder Passwordless-Login?
8. **PDF-Backup** — Object-Storage nötig (10 Jahre) oder reicht lokaler Server?

## 11. Zusammenfassung v0.5

**Zwei Dashboards, klare Trennung:**
- Kunde sieht **seine** Instanz (Magic-Link, read-only)
- eLeDia sieht **alle** Shop-Tenants + Order-Pipeline + Demos (Admin-Auth, mit Override-Aktionen)

**MVP-Komponenten (komplettes Bild):**

| Komponente | Zweck | Loc |
|---|---|---|
| `orders.ts` | Order-Lifecycle + State-Machine | ~200 |
| `agreements.ts` | AGB/AVV-PDF-Gen + Audit-Log | ~200 |
| `customers.ts` | Magic-Link für Kunden-Dashboard | ~100 |
| `shop.html` | Paket-Übersicht + Formular | ~500 |
| `order-review.html` | AGB/AVV-Download + Confirm | ~300 |
| `customer.html` | Kunden-Dashboard | ~300 |
| `admin.html` Erweiterung | Shop-Tenants + Bestellungen-Tabs | ~300 |
| Subdomain-Check | `/api/subdomain/check` | ~30 |
| Mail-Templates (5) | Verify, Order-Confirm, Welcome, Odoo-Notify, Magic-Link | ~500 (templates) |
| AGB/AVV-Markdown-Templates | Rechtstexte mit Platzhaltern | — (extern) |
| **Gesamt** | **~2500 Zeilen Code** | **4–5 Wochen** |

---

**Key-Messages für Johannes-Review:**

✅ **Kunden-Dashboard + Internal-Dashboard sind getrennt** — unterschiedliche Nutzer, unterschiedliche Rollen, unterschiedliche Aktionen
✅ **Internal-Dashboard ist nur Erweiterung des bestehenden `/api/admin`** — keine neue separate App
✅ **Shop-Instanzen werden als separater Tab sichtbar**, damit Demos nicht mit Production-Tenants vermischt werden
✅ **Bestellungen-Tab macht die Order-Pipeline transparent** — "was läuft gerade durch?", "ist was schiefgelaufen?"

---

*Phase-2+-Themen in v0.1 dokumentiert.*
