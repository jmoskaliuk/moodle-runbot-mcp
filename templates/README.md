# Agreement-Templates für eLeDia Onlineshop

**Status:** Gerüst / Platzhalter — **muss vom Fachanwalt inhaltlich gefüllt werden**.

Diese Markdown-Templates werden vom `agreements.ts`-Service (Woche 2 der
MVP-Roadmap) zur Laufzeit mit Kundendaten befullt und als PDF gerendert
(via `pandoc`).

## Dateien

- `agb-v1.md` — Allgemeine Geschäftsbedingungen. Einseitig (nur von eLeDia gestellt, Kunde akzeptiert durch Klick).
- `avv-template-v1.md` — Auftragsverarbeitungsvertrag nach Art. 28 DSGVO. Zweiseitig (zwischen Kunde und eLeDia). Wird pro Bestellung mit Kundendaten personalisiert.

## Platzhalter

Beide Templates nutzen `{{variable}}`-Syntax. Der PDF-Generator ersetzt sie beim Rendering:

| Platzhalter | Quelle | Beispiel |
|---|---|---|
| `{{firma}}` | Order.billing.firma | "ACME GmbH" |
| `{{strasse}}` | Order.billing.strasse | "Musterstraße 1" |
| `{{plz}}` | Order.billing.plz | "12345" |
| `{{ort}}` | Order.billing.ort | "Musterstadt" |
| `{{land}}` | Order.billing.land | "Deutschland" |
| `{{ustId}}` | Order.billing.ustId | "DE123456789" |
| `{{name}}` | Order.signer.name | "Max Mustermann" |
| `{{funktion}}` | Order.signer.funktion | "Geschäftsführer" |
| `{{email}}` | Order.signer.email | "max@acme.de" |
| `{{paket}}` | Config.name | "Schulungs-LMS" |
| `{{plugins}}` | Config.includedPlugins joined | "LeitnerFlow, exam2pdf" |
| `{{userLimit}}` | Config.userLimit | "200" |
| `{{subdomain}}` | Order.subdomainFinal | "acme-schulung.eledia.ai" |
| `{{datum}}` | ISO-Datum der Unterzeichnung | "20.04.2026" |
| `{{version}}` | Template-Version | "v1" |
| `{{sha}}` | SHA256-Hash des generierten PDFs | "4a7b9c…" |
| `{{ip}}` | IP des Signers bei Confirm-Click | "203.0.113.42" |
| `{{orderId}}` | Runbot-Order-ID | "ord-abc123def456" |

## Was der Anwalt liefern muss

### Für beide Templates
1. Kompletten juristischen Text (aktuelle Fassung eLeDia-Hosting nimmt als Basis)
2. Bestätigung Übereinstimmung mit: DSGVO, TMG, BGB, UStG, OSS-Verordnung
3. Wider­rufs­belehrung (B2C) oder Ausschluss (B2B)

### Zusätzlich für AVV (Art. 28 DSGVO)
4. **Anlage 1: Technisch-Organisatorische Maßnahmen (TOM)** — detaillierter Beschrieb der Sicherheits­massnahmen bei eLeDia
5. **Anlage 2: Liste Unterauftrags­verarbeiter** — Hetzner, Brevo, ggf. Cloudflare, andere
6. **Anlage 3: Kategorien betroffener Personen + Datenarten** — z.B. Lernende, Lehrende, Admins; Namen, E-Mail, Kursstand, Noten

## Template-Versionierung

Wenn der Anwalt einen Text aktualisiert:
1. Neue Datei `agb-v2.md` oder `avv-template-v2.md` anlegen
2. Alte Version NICHT löschen (Audit-Trail für schon gesignte AVVs)
3. Im `agreements.ts` Service die Default-Version updaten
4. Neue Bestellungen ab commit-date nutzen v2, alte bleiben auf v1

## PDF-Rendering

**Stack (geplant, Woche 2):**
- `pandoc` + `LaTeX`-Engine (bereits in moodle-docker-Image)
- CSS/LaTeX-Template für Corporate-Design (Logo, Farben, Fonts)
- Output: `/opt/runbot/agreements/<orderId>/{agb,avv}-signed.pdf`

**Alternative:** `puppeteer` (Headless Chrome) — flexibler, aber größerer Footprint.

## Rechtliche Hinweise (nicht juristisch verbindlich!)

- Text-Form nach §126b BGB + Art. 28 (9) DSGVO reicht aus — keine QES nötig
- Dokumentation: generiertes PDF + Hash + Timestamp + IP + User-Agent = ausreichender Beweis
- Archivierung: 10 Jahre nach §147 AO (als Teil der Geschäftsunterlagen)
