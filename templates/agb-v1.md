# Allgemeine Geschäftsbedingungen (AGB)

**STATUS: PLATZHALTER-GERÜST — MUSS VOM FACHANWALT INHALTLICH GEFÜLLT WERDEN.**

Dieses Dokument ist ein strukturiertes Skelett. Der tatsächliche Rechtstext
muss vom IT-Fachanwalt geliefert werden. Die Überschriften-Struktur orientiert
sich an üblichen SaaS-AGB für B2B/B2C.

---

## eLeDia GmbH — AGB für Moodle-Hosting-Shop

**Version:** v1 (Entwurf)
**Stand:** {{datum}}
**Geschäftspartner:** {{firma}} ("Kunde")

---

## § 1 Geltungsbereich

*[Anwalt: hier definieren, für welche Leistungen die AGB gelten — Moodle-
Hosting-Pakete aus dem Shop unter shop.eledia.ai. Abgrenzung zu klassischem
eLeDia-Hosting-Vertrag.]*

## § 2 Vertragsschluss

*[Anwalt: beschreiben, wann der Vertrag zustande kommt:
- Kunde füllt Formular aus
- Bestätigungsmail geht raus
- Kunde lädt AGB + AVV herunter
- Kunde klickt Confirm (= Willenserklärung)
- Instanz wird bereitgestellt
- Rechnung von eLeDia nach Bereitstellung
- Zahlung = endgültiger Vertragsschluss? oder schon bei Confirm?

Wichtig: Bei B2C Widerrufsrecht beachten.]*

## § 3 Leistungsumfang

### 3.1 Bestelltes Paket

Der Kunde hat das Paket **{{paket}}** bestellt mit folgendem Umfang:
- Moodle-Instanz unter `{{subdomain}}`
- Enthaltene Plugins: {{plugins}}
- Maximale Anzahl Benutzer: {{userLimit}}
- Hosting in Deutschland (Hetzner, siehe AVV Anlage 2)

### 3.2 Service Level

*[Anwalt: SLA-Klausel — Verfügbarkeit, geplante Wartungsfenster, Reaktionszeiten
bei Störungen. Alternativ: "Kein SLA im Basis-Paket, Support über Bestands-
plattform eLeDia".]*

### 3.3 Nicht enthalten

*[Anwalt: explizit ausschließen — Custom-Plugin-Entwicklung, Daten-Migration,
Schulungen, User-Mgmt-Support jenseits Moodle-Standard, etc.]*

## § 4 Pflichten des Kunden

*[Anwalt: Nutzungsregeln, insbesondere:
- Keine rechtswidrigen Inhalte
- Eigenverantwortung für hochgeladene Daten
- Passwort-Sicherheit
- Missbrauchsverhinderung (kein Spam-Versand über Moodle-Mailer)
- Urheberrecht an eingebundenen Materialien]*

## § 5 Preise und Zahlung

*[Anwalt: Preis-Klausel. Wichtig:
- Verweis auf aktuell gültige Preisliste (eLeDia-Website)
- Rechnungsstellung über odoo
- Zahlungsziel (14 Tage? 30 Tage?)
- USt-Behandlung (B2C/B2B EU/Nicht-EU)
- Preisänderungsrecht bei Laufzeitverlängerung]*

## § 6 Laufzeit und Kündigung

*[Anwalt:
- Mindestvertragslaufzeit (jährlich? monatlich?)
- Kündigungsfrist
- Form (Textform, E-Mail ausreichend?)
- Außerordentliche Kündigung
- Daten-Export-Recht bei Kündigung (30d, 60d, 90d?)]*

## § 7 Haftung und Gewährleistung

*[Anwalt: Haftungsbegrenzung, insbesondere für:
- Datenverlust (Empfehlung: eLeDia macht tägliche Backups, aber Haftung begrenzt)
- Ausfallzeiten
- Mittelbare Schäden

Wichtig: Haftungsausschluss bei B2C anders als B2B — § 309 BGB-AGB-Kontrolle.]*

## § 8 Datenschutz

Die Verarbeitung personenbezogener Daten in der Moodle-Instanz des Kunden
ist im separaten Auftragsverarbeitungsvertrag (AVV) geregelt. Für die
Verarbeitung der Kunden-Stammdaten (Rechnungs­adresse, Kontakt) gilt die
Datenschutz­erklärung unter https://eledia.de/datenschutz.

## § 9 Wider­rufs­belehrung (nur B2C)

*[Anwalt: vollständige Wider­rufs­belehrung nach § 312g BGB für B2C.

Bei SaaS-Verträgen: Widerruf kann ausgeschlossen werden, wenn Leistung
VOR Ablauf der Widerrufsfrist in Anspruch genommen wird (Ziffer 2 des
§ 356 BGB) — muss vom Kunden explizit zugestimmt werden!]*

## § 10 Schlussbestimmungen

*[Anwalt:
- Gerichtsstand: Berlin (eLeDia-Sitz)
- Anzuwendendes Recht: deutsches Recht
- Salvatorische Klausel
- Vertragssprache: Deutsch]*

---

**Durch Klick auf "Bestellung bestätigen" im Shop am {{datum}} um {{uhrzeit}} UTC
hat {{name}} als {{funktion}} der {{firma}} diese AGB als verbindlich akzeptiert.**

**Audit-Daten:**
- Order-ID: `{{orderId}}`
- Template-Version: `{{version}}`
- PDF-SHA256: `{{sha}}`
- IP-Adresse: `{{ip}}`
