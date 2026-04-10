# User Documentation

## Meta

Dieses Dokument beschreibt, wie Nutzer mit dem Produkt interagieren.
**Source of Truth für User Experience** — keine Implementierungsdetails.

---

## Target Users

- **Demo-Interessenten:** potenzielle Kunden von eLeDia, die ein Moodle-Plugin testen wollen
- **eLeDia-Mitarbeiter:** können Snapshots verwalten und Konfigurationen anlegen
- **KI-Systeme / CI-Pipelines:** nutzen MCP-Tools (technische Nutzer, feat08)

---

## Main Use Cases

1. Interessent möchte Plugin ausprobieren ohne eigene Moodle-Installation
2. eLeDia möchte Interessenten einen Link zum Ausprobieren schicken
3. Interessent möchte Demo-Link erneut aufrufen (Instanz läuft noch)

---

## Typical Workflow (Interessent)

1. Interessent öffnet Demo-Portal (`demo.eledia.ai`)
2. Wählt Plugin, gibt Name + E-Mail ein
3. Bestätigungs-E-Mail trifft ein → Link klicken
4. Loading-Page erscheint (ca. 30–60 Sekunden, mit visuellen Fortschrittsschritten)
5. Zweite E-Mail mit Demo-Link trifft ein
6. Interessent öffnet Demo → ist direkt in seiner personalisierten Moodle-Instanz

---

## Key Concepts (Nutzerperspektive)

- **Demo:** eine vollständige Moodle-Umgebung mit vorinstalliertem eLeDia-Plugin, nur für dich
- **Bestätigungs-E-Mail:** Sicherheitsschritt — verhindert, dass Demos für fremde E-Mail-Adressen gestartet werden
- **Demo-Link:** deine persönliche URL, z.B. `https://demo-leitnerflow-abc123.demo.eledia.ai`
- **Gültigkeit:** Demo-Instanzen laufen automatisch ab wenn sie nicht genutzt werden

---

# Feature Usage

---

## Demo anfordern (feat01)

**Was macht es?**
Startet automatisch eine persönliche Moodle-Demo mit dem gewünschten Plugin.

**Wann benutze ich es?**
Wenn du ein eLeDia Moodle-Plugin ausprobieren möchtest, ohne Moodle selbst installieren zu müssen.

**Schritt-für-Schritt**

1. Demo-Portal öffnen
2. Plugin aus der Liste wählen
3. Name und E-Mail-Adresse eingeben
4. „Demo anfordern" klicken
5. E-Mail-Postfach öffnen → Bestätigungs-E-Mail suchen
6. Link in der E-Mail klicken
7. Loading-Page abwarten (30–60 Sekunden)
8. Zweite E-Mail mit Demo-Link öffnen
9. Demo-Link klicken → Moodle öffnet sich

**Expected Result**
Du siehst eine laufende Moodle-Instanz mit installiertem Plugin und vorbereiteten Demo-Daten.

**Limitations / Notes**
- Bestätigungs-Link ist 24 Stunden gültig
- Demo läuft solange du sie nutzt; nach längerer Inaktivität wird sie automatisch beendet

---

## Demo erneut aufrufen (feat01)

**Was macht es?**
Wenn du deinen Demo-Link erneut öffnest, während die Instanz noch läuft, wirst du direkt weitergeleitet — keine neue Demo wird gestartet.

**Wann benutze ich es?**
Du hast den Browser geschlossen und möchtest weitermachen.

**Schritt-für-Schritt**

1. Demo-Link aus der E-Mail erneut öffnen
2. Falls Instanz noch läuft: direkte Weiterleitung zur Demo
3. Falls Instanz abgelaufen: Fehlermeldung mit Link zum Portal → neue Demo anfordern

---

## Demo-Zugang — drei Accounts pro Demo (feat07 + feat10)

**Was macht es?**
Jede Demo-Instanz bringt drei fertige Testnutzer mit: `admin`, `teacher` und `student`.
Alle drei teilen dasselbe Passwort und sind im selben Demo-Kurs eingeschrieben —
mit den jeweils passenden Moodle-Rollen.

**Warum drei Accounts statt einem?**
Viele Plugins zeigen ihren Mehrwert erst im Zusammenspiel mehrerer Rollen
("Admin legt etwas an → Teacher weist dem Kurs zu → Student erlebt es"). Mit
drei vorbereiteten Accounts kannst du diesen Ablauf in einer einzigen Demo
durchspielen, ohne dich aus- und wieder einloggen zu müssen — Moodles "Login
as"-Funktion hilft beim schnellen Rollenwechsel aus der Admin-Sicht.

**Expected Result**
- Drei Accounts sind in Moodle vorhanden: `admin`, `teacher`, `student`
- Alle drei sind im Demo-Kurs enrolled (Admin als Manager, Teacher als Lehrkraft, Student als Kursteilnehmer)
- Das Passwort steht sowohl auf der Warteseite als auch in der "Demo bereit"-E-Mail
- Default-Passwort: `demo1234` (serverseitig via `DEMO_PASSWORD` konfigurierbar)

**Notes**
- Deine eigene E-Mail-Adresse taucht in Moodle **nicht** mehr als Username auf —
  sie wird nur für die Bestätigungs- und "Demo-bereit"-Mail gebraucht.
- Wenn ein Plugin-Snapshot keinen Mehrwert aus dem Multi-User-Modus zieht,
  kann er pro Config via `multiUser: false` auf einen einzelnen Admin
  reduziert werden. Default ist `multiUser: true`.

---

## Live-Status auf der Warteseite (feat09)

**Was macht es?**
Nach dem Klick auf den Bestätigungslink siehst du eine Warteseite, die **echten**
Fortschritt zeigt (nicht nur einen Timer). Sobald die Demo bereit ist, kannst
du sie direkt mit einem Klick öffnen — ohne Umweg über die zweite E-Mail.

**Schritt-für-Schritt**

1. Du klickst auf den Bestätigungslink aus der E-Mail
2. Die Warteseite öffnet sich und zeigt die aktuelle Phase:
   - "Container werden gestartet"
   - "Demo-Daten werden geladen"
   - "Accounts werden vorbereitet"
3. Der Browser-Tab zeigt den Status ebenfalls (`document.title`), damit du in
   einem anderen Tab weiterarbeiten und die Demo im Augenwinkel im Blick haben
   kannst.
4. Sobald die Demo bereit ist, erscheint eine Box mit den drei Account-Namen,
   dem Passwort und einem grünen **"Demo jetzt öffnen"**-Button. Klick öffnet
   die Demo in einem neuen Tab.
5. Die zweite E-Mail ("Demo bereit") läuft parallel, für den Fall dass du die
   Warteseite geschlossen hast.

**Polling**
Die Seite fragt den Server alle 3 Sekunden nach dem aktuellen Status. Kein
manuelles Reload nötig.

**Edge Cases**
- Wenn du die Warteseite schließt und später den Bestätigungslink erneut öffnest,
  zeigt sie den Stand an, an dem sie gerade ist.
- Bei einem Fehler beim Demo-Start zeigt die Seite eine freundliche
  Fehlermeldung mit "Neue Demo anfordern"-Link.

---

## Demo verlängern mit Code (feat12)

**Was macht es?**
Eine Demo läuft im Normalfall 60 Minuten. Wer auf einer Messe oder in einer
Schulung von eLeDia einen Verlängerungscode bekommt, kann damit seine eigene
Demo auf 1 Tag verlängern — ohne dass eLeDia manuell eingreifen muss.

**Wann benutze ich es?**
- Du bist auf einer Messe, hast einen Code-Zettel vom eLeDia-Stand bekommen
- Du bist in einer eLeDia-Schulung und der Trainer hat einen Code ausgegeben
- Du brauchst länger als 60 Minuten, um ein Szenario komplett durchzuspielen

**Schritt-für-Schritt**

1. Auf der Warteseite (oder direkt in der laufenden Demo) gibt es ein kleines
   Eingabefeld "Verlängerungscode eingeben"
2. Code eintippen (z.B. `EDUMA2026`), "Verlängern" klicken
3. Du bekommst eine Bestätigung: "Demo verlängert bis 2026-04-11 16:30"

**Notes**
- Ein Code kann von mehreren Interessenten parallel genutzt werden (er ist
  kein Einmal-Code). Pro Demo-Instanz aber nur einmal anwendbar.
- Alle Codes verlängern einheitlich auf 1 Tag (1440 Minuten) — es gibt aktuell
  keine Pro-Code-Laufzeit.
- Ohne Code endet deine Demo wie gewohnt nach 60 Minuten oder nach 15 Minuten
  Inaktivität.
- Wenn dein Token schon abgelaufen ist, hilft auch kein Code mehr — dann musst
  du eine neue Demo anfordern.

---

## Admin-Dashboard (feat11, eLeDia-intern)

**Zielgruppe**
Nur für eLeDia-Mitarbeiter. Öffentliche Nutzer sehen diesen Bereich nicht.

**Was macht es?**
Interne Übersicht aller gerade laufenden Demo-Instanzen und aktiven Tokens.
Erlaubt das manuelle Verlängern und sofortige Löschen einzelner Instanzen —
ohne SSH auf den Server.

**Zugang**
- URL: `https://demo.eledia.ai/admin`
- Login: HTTP Basic Auth (Browser-Popup). Username: `admin`, Passwort aus
  der internen Runbot-Doku (`ADMIN_PASSWORD`-Env).
- Logout: Browser-Tab schließen (Session wird nicht serverseitig getrackt).

**Was man sieht**
- Tabelle aller laufenden Instanzen: `ID · Config · Requester · Gestartet · Verbleibend · Status · Aktionen`
- Aktionen pro Zeile: "+1 Std verlängern", "Sofort löschen", "Logs anzeigen" (letzte 50 Zeilen)
- Tabelle aller aktiven Tokens aus `tokens.json` mit Status + Ablaufzeit
- Refresh-Button (kein Live-Polling — bewusst schlicht gehalten)

**Nicht enthalten (MVP)**
- Keine Statistik-Ansichten, keine Historie, kein Audit-Log, kein 2FA
- Kein GitHub-OAuth / SSO (ist für Phase 2 geplant, wenn das Dashboard mehr Funktionen bekommt)

---

## Plugin-Icons und Metadaten im Portal (feat13)

**Was macht es?**
Das Demo-Portal zeigt bei jedem Plugin das echte Icon aus dem zugehörigen
GitHub-Repo — nicht nur ein generisches Emoji. Das macht die Plugin-Übersicht
auf einen Blick verständlicher und wirkt als Vertrauenssignal.

**Was man sieht**
- Auf der Portal-Startseite zeigt jede Plugin-Karte oben links das Plugin-Icon
  aus dem GitHub-Repo (`pix/monologo.svg` oder `pix/icon.png` aus dem
  Default-Branch)
- Fehlt ein Icon im Repo, fällt die Karte still auf das Config-Emoji zurück —
  kein kaputtes Bild
- In Plugin-Detailseiten werden zusätzlich Stars + letztes Release angezeigt
  (cached für 24 h, damit das GitHub-API-Rate-Limit nicht gesprengt wird)

**Notes**
- Die Icons werden direkt von `raw.githubusercontent.com` geladen — wir hosten
  nichts mit.
- Damit das funktioniert, muss im Config-Eintrag `githubRepo: "owner/repo"`
  gesetzt sein.
