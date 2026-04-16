# Features

## Meta

Dieses Dokument definiert, was das Produkt tun soll.
Es ist die **Source of Truth für beabsichtigtes Verhalten** — keine Implementierungsdetails.

---

## ✍️ Feature-Template für Johannes

Neue Feature-Ideen unten als `featXX`-Block anhängen (XX = nächste freie
Nummer). Du musst nicht alles ausfüllen — Claude ergänzt Non-goals, offene
Fragen etc. im nächsten Task. Halbfertig ist besser als nichts.

```markdown
### featXX <prägnanter Titel>

**Goal**
<ein bis zwei Sätze — was soll das Produkt können, und für wen>

**Behavior** (vorläufig okay)
- <stichpunktartig beschreiben was der Nutzer sieht/tut>
- <was das System im Hintergrund macht>

**Open Questions**
- <Dinge die du bewusst offen lässt, damit Claude nachfragt>

**Non-goals** (optional)
- <was explizit NICHT dazugehört — hilft Scope-Creep zu vermeiden>
```

Für ganz frühe Ideen reicht auch ein Eintrag in `04-tasks.md → 💡 Ideen`.
Sobald du merkst "das wird ein Feature", wandert der Eintrag hierher.

---

## Product Overview

### Purpose
Interessenten können eLeDia Moodle-Plugins selbstständig testen, ohne eigene Moodle-Installation. Sie geben nur ihre E-Mail-Adresse ein — der Rest läuft vollautomatisch.

### Core Concepts
- **Demo-Instanz:** vollständige Moodle-Umgebung in Docker, für einen Interessenten isoliert
- **Demo-Konfiguration:** definiert welches Plugin, welche Moodle-Version, welche Demo-Daten
- **Token-Flow:** E-Mail-Bestätigung verhindert Missbrauch und ermöglicht späteres Wiederaufrufen
- **Snapshot:** vorbereiteter DB-Dump mit Demo-Daten, der den Start beschleunigt

### Key Features
feat01 → Self-Service Demo-Anfrage-Flow  
feat02 → Moodle-Instanz-Verwaltung (Docker)  
feat03 → nginx Reverse Proxy (HTTPS-Subdomain)  
feat04 → Plugin-Konfigurationssystem  
feat05 → Snapshot-System  
feat06 → Automatisches Aufräumen (Inaktivitäts-Timer)  
feat07 → Demo-Nutzerverwaltung  
feat08 → MCP-Tools (CI/Testing-Modus)  
feat09 → Live-Status auf der Warteseite (Polling + Demo-Start-Button + Credentials)  
feat10 → Rollenbasierte Demo-Szenarien (Admin, Teacher, Student im selben Moodle)  
feat11 → Admin-Dashboard (alle laufenden Instanzen, löschen/verlängern)  
feat12 → Code-basierte Demo-Verlängerung (60 Min → 1 Tag)  
feat13 → Plugin-Metadaten aus GitHub (Icon, Stars, letztes Release)  
feat14 → Snapshot-Manager (zentrale GUI + In-Moodle-Plugin)  
feat15 → Moodle-Onlineshop (Self-Service Paket-Bestellung + Auto-Provisioning)

---