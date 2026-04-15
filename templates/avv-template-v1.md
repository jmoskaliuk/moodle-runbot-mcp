# Auftragsverarbeitungsvertrag (AVV)

**STATUS: PLATZHALTER-GERÜST NACH ART. 28 DSGVO — MUSS VOM FACHANWALT INHALTLICH GEFÜLLT WERDEN.**

Dieses Dokument ist ein strukturiertes Skelett für einen AVV nach Art. 28
DSGVO. Die Überschriften und Anlagen entsprechen dem BfDI-Muster. Der
tatsächliche Text muss vom IT-Fachanwalt / Datenschutzbeauftragten geliefert
werden.

---

## Auftragsverarbeitungsvertrag

**gemäß Art. 28 Absatz 3 DSGVO**

zwischen

**{{firma}}**
{{strasse}}
{{plz}} {{ort}}
{{land}}
{{ustId}}

vertreten durch {{name}} ({{funktion}}, {{email}})

— nachfolgend "Verantwortlicher" —

und

**eLeDia GmbH**
*[Anwalt: vollständige Anschrift, Handelsregister, vertretungsberechtigte Personen]*

— nachfolgend "Auftragsverarbeiter" —

**— gemeinsam "Parteien" —**

---

## § 1 Gegenstand des Auftrags und Dauer

### 1.1 Gegenstand

Der Auftragsverarbeiter stellt dem Verantwortlichen eine Moodle-Lernmanagement-
System-Instanz im Rahmen des Pakets **{{paket}}** auf Basis seiner Infrastruktur
zur Verfügung und betreibt diese technisch. Im Rahmen des Betriebs werden
folgende personenbezogene Daten verarbeitet:

*[Anwalt: konkrete Verarbeitungstätigkeiten — Hosting der DB, Backup, Monitoring,
Support-Zugriffe.]*

### 1.2 Dauer

Der Auftrag läuft über die gesamte Laufzeit des Hauptvertrags (AGB).
Kündigung analog AGB. Nach Vertragsende: Löschung der Daten nach § 9
dieses AVV.

## § 2 Art und Zweck der Verarbeitung

### 2.1 Art

*[Anwalt: Liste der Verarbeitungshandlungen — Speicherung, Abgleich, Löschung,
Unterhalt, Backup, Transport zwischen Datenzentren.]*

### 2.2 Zweck

Bereitstellung eines Moodle-LMS für den Verantwortlichen zur Durchführung
von E-Learning-Aktivitäten (Kurse, Lernfortschritte, Bewertungen, etc.).

## § 3 Kategorien betroffener Personen und Datenarten (siehe Anlage 3)

**Kategorien betroffener Personen:**
- Lehrende / Trainer/innen
- Lernende / Teilnehmende
- Administratoren der Moodle-Instanz
- ggf. Eltern/Erziehungsberechtigte (bei Minderjährigen)

**Datenarten:**
- Stammdaten: Name, E-Mail, optional Telefon, Rolle
- Kursdaten: Kursbelegung, Anwesenheit, Lernfortschritt
- Leistungsdaten: Bewertungen, Aufgaben-Einreichungen
- Kommunikationsdaten: Forum-Beiträge, Nachrichten
- Technische Daten: IP-Adresse, Session-Cookies, Login-Historie
- *[Anwalt: ggf. weitere je nach eingesetzten Plugins]*

## § 4 Pflichten des Auftragsverarbeiters

*[Anwalt: klassische Art. 28-Pflichten — Weisungsgebundenheit, Vertraulichkeit
der Mitarbeiter, TOM, Mitwirkung bei Betroffenenrechten, Support bei
DSGVO-Pflichten des Verantwortlichen, Meldung von Sicherheitsvorfällen
innerhalb 72h.]*

## § 5 Pflichten des Verantwortlichen

*[Anwalt: Rechtsgrundlage für Verarbeitung, Information der Betroffenen,
Weisungs- und Beurteilungsverantwortung.]*

## § 6 Technische und organisatorische Maßnahmen (TOM)

Ein detaillierter Beschrieb der TOM durch den Auftragsverarbeiter
findet sich in **Anlage 1** dieses Vertrages.

Der Verantwortliche hat die TOM vor Vertragsschluss geprüft und als
angemessen befunden.

## § 7 Unterauftragsverarbeiter

Der Auftragsverarbeiter setzt die in **Anlage 2** genannten Unterauftrags-
verarbeiter ein. Eine Änderung der Liste erfolgt nach vorheriger
Information mit einer Einspruchsfrist von 30 Tagen.

*[Anwalt: genaue Klausel zur Information/Einspruchsrecht.]*

## § 8 Mitwirkung bei Betroffenenrechten

*[Anwalt: Klausel zur Mitwirkung bei Auskünften, Löschung, Datenportabilität.
Insbesondere: wie unterstützt eLeDia den Verantwortlichen technisch
(z.B. User-Export aus Moodle)?]*

## § 9 Datenlöschung nach Vertragsende

*[Anwalt:
- Frist zur Rückgabe der Daten an Verantwortlichen (z.B. 30 Tage)
- Format (DB-Dump? User-Export-ZIP?)
- Anschließende Löschung (auch Backups — nach wieviel Tagen?)
- Bestätigung der Löschung an Verantwortlichen]*

## § 10 Haftung

Haftung richtet sich nach Art. 82 DSGVO.

*[Anwalt: ggf. interne Haftungsverteilung zwischen Verantwortlichem und
Auftragsverarbeiter bei Verstößen.]*

## § 11 Schlussbestimmungen

*[Anwalt: Gerichtsstand, anwendbares Recht (DSGVO bindend), Sprachklausel,
Salvatorische Klausel. Auch: Rang dieser AVV vor AGB bei Datenschutz-Themen.]*

---

## Anlage 1: Technische und Organisatorische Maßnahmen (TOM)

*[**Datenschutzbeauftragter eLeDia:** hier detaillierten TOM-Katalog einfügen.
Struktur nach BfDI-Empfehlung:*

1. *Vertraulichkeit — Zutrittskontrolle, Zugangskontrolle, Zugriffskontrolle, Trennungskontrolle*
2. *Integrität — Weitergabekontrolle, Eingabekontrolle*
3. *Verfügbarkeit und Belastbarkeit — Verfügbarkeitskontrolle, Wiederherstellbarkeit*
4. *Verfahren zur regelmäßigen Überprüfung — Datenschutz-Management, Incident-Response, Datenschutz-Folgenabschätzung*
5. *Auftragskontrolle — Unterauftragsverarbeiter-Kontrolle]*

## Anlage 2: Liste der Unterauftragsverarbeiter

| Unternehmen | Sitz | Tätigkeit |
|---|---|---|
| Hetzner Online GmbH | Gunzenhausen, DE | Infrastruktur-Hosting (physische Server, Rechenzentrum) |
| *[weitere: Brevo für E-Mail-Versand? Cloudflare? andere?]* | | |

*[Datenschutzbeauftragter: vollständige Liste einfügen inklusive Anschrift,
Land der Verarbeitung, Datenschutzbeauftragter.]*

## Anlage 3: Kategorien betroffener Personen und Datenarten

(siehe § 3 oben)

---

## Digitale Annahme-Erklärung (Text-Form nach § 126b BGB)

Dieser AVV wurde am **{{datum}}** durch

**{{name}}**, {{funktion}}
{{firma}}
{{email}}

durch Klick auf den "Bestellung bestätigen"-Button im eLeDia-Onlineshop
(https://shop.eledia.ai) akzeptiert. Gemäß Art. 28 Absatz 9 DSGVO wahrt
die Text-Form die gesetzliche Formanforderung.

**Audit-Metadaten:**
- Order-ID: `{{orderId}}`
- Template-Version: `{{version}}`
- PDF-SHA256: `{{sha}}`
- IP-Adresse des Annehmenden: `{{ip}}`
- Zeitstempel UTC: `{{datum}}T{{uhrzeit}}Z`

Diese digitale Annahme ist juristisch äquivalent zu einer schriftlichen
Unterschrift für AVV-Zwecke nach DSGVO und kann als Beweismittel im
Streitfall vorgelegt werden.

**Archivierung:** Dieses PDF wird vom Auftragsverarbeiter sowie nach
Bedarf vom Verantwortlichen für die gesetzliche Aufbewahrungsfrist
(in Deutschland mindestens 10 Jahre nach § 147 AO) archiviert.
