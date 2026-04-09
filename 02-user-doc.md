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

## Demo-Zugang (feat07)

**Was macht es?**
Du bekommst einen eigenen Nutzer-Account in deiner Demo-Instanz.

**Expected Result**
- Nutzer mit deinem Namen und deiner E-Mail-Adresse ist in Moodle angelegt
- Du bist in den Demo-Kurs eingeschrieben

**Notes**
- Login-Daten (Passwort) kommen in der "Demo bereit"-E-Mail *(TODO: Passwort aktuell nicht in E-Mail — offen)*
