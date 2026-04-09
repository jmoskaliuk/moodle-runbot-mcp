# Tasks

## Meta

Operatives Zentrum des Projekts. Hier beginnt jede Session.
Enthält: neue Beobachtungen, Tasks, Klärungsbedarf, aktive Arbeit, Verifikationsschritte.

---

## 🆕 New

*(Neue Ideen, Beobachtungen, ungefilterte Einträge hier)*

---

## ❓ Clarification Needed

- **feat04:** Welches Format und Verzeichnis für Plugin-Configs? (`src/services/config.ts` noch nicht dokumentiert)
- **feat07:** Welches Passwort bekommt der Demo-Nutzer? Wird es in der "Demo bereit"-E-Mail mitgeschickt?
- **feat06:** Wie lang ist der Inaktivitäts-Timeout? Ist er konfigurierbar?
- **feat01:** Was passiert wenn Demo-Start fehlschlägt — bekommt der Nutzer eine Fehler-E-Mail?

---

## 📋 Tasks

### task01 config.php-Patch korrekt implementieren
Status: done
Feature: feat02

Regex zum Entfernen des Port-Blocks ließ übrig `}` stehen.
Fix: `removePortBlock()` mit Brace-Counting implementiert.
`$CFG->wwwroot` wird jetzt auf HTTPS-Subdomain gesetzt.

---

### task02 nginx HTTPS konfigurieren
Status: done
Feature: feat03

HTTP-Only nginx-Config auf HTTPS umgestellt.
HTTP→HTTPS-Redirect + HTTPS-Block mit Wildcard-Zertifikat.
`CERT_DIR` via `SSL_CERT_DIR` überschreibbar.

---

### task03 feat04 dokumentieren
Status: open
Feature: feat04

`src/services/config.ts` lesen und `03-dev-doc.md` → feat04-Abschnitt vervollständigen.
Config-Format in `01-features.md` → feat04 klären.

---

### task04 feat05 Snapshot-System dokumentieren
Status: open
Feature: feat05

`src/services/snapshot.ts` lesen und `03-dev-doc.md` → feat05-Abschnitt vervollständigen.

---

### task05 feat06 Cleanup-Scheduler dokumentieren
Status: open
Feature: feat06

`src/services/cleanup.ts` lesen: Timeout-Wert, Scheduler-Intervall, Cleanup-Logik.
`03-dev-doc.md` → feat06-Abschnitt vervollständigen.

---

### task06 feat07 Demo-Nutzerverwaltung dokumentieren + Passwort klären
Status: open
Feature: feat07

`src/services/moodleUser.ts` lesen.
Klären: welches Passwort bekommt Demo-Nutzer? Wird es in E-Mail mitgeteilt?
`02-user-doc.md` und `03-dev-doc.md` aktualisieren.

---

### task07 Fehler-E-Mail bei fehlgeschlagenem Demo-Start
Status: open
Feature: feat01

Aktuell: Silent Fail wenn Demo-Start in `setImmediate` fehlschlägt.
Nutzer bekommt keine Rückmeldung.
→ `email.sendErrorEmail()` implementieren und in Fehler-Handler einbauen.

---

### task08 Demo-Portal Frontend
Status: open
Feature: feat01

Frontend (HTML/JS) für `demo.eledia.ai` noch nicht im Repo sichtbar.
Klären: existiert bereits als separates Repo oder muss noch erstellt werden?
Benötigt: GET `/configs`, POST `/request-demo`.

---

### task09 End-to-End-Test: Demo-Flow
Status: open
Feature: feat01, feat02, feat03

Vollständigen Flow einmal auf dem Server durchspielen:
1. POST /request-demo → E-Mail empfangen
2. Token-Link klicken → Loading-Page
3. "Demo bereit"-E-Mail empfangen
4. Demo-URL öffnen → Moodle + Plugin sichtbar
5. Nach Inaktivität: Instanz automatisch gestoppt

---

## 🔧 In Progress

*(Tasks die gerade aktiv bearbeitet werden)*

---

## 🔎 Verify After Deploy

- [ ] HTTPS-Subdomain erreichbar nach nginx-Fix (feat03)
- [ ] config.php enthält keine übrig gebliebene `}` mehr (feat02)
- [ ] `$CFG->wwwroot` zeigt auf `https://{id}.demo.eledia.ai` (feat02)

---

## ✅ Done

- task01 config.php-Patch: removePortBlock() + wwwroot korrekt
- task02 nginx HTTPS: HTTP→HTTPS-Redirect + Wildcard-Cert

---

## Rules

- Neue Einträge zuerst unter "New" → dann zu Task konvertieren
- Tasks klein halten, klar formuliert
- Abgeschlossene Tasks nach "Done" verschieben, nicht löschen
