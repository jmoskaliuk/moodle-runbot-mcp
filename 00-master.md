# eLeDia.OS — Master

## 1. Project Meta

- **Name:** moodle-runbot-mcp
- **Goal:** Self-Service Demo-Plattform für eLeDia Moodle-Plugins — Interessenten können Plugins ohne eigene Moodle-Installation testen
- **Short Description:** MCP-Server + HTTP-API, der auf Anfrage vollständige Moodle-Docker-Instanzen provisioniert, mit Plugin und Demo-Daten bestückt und nach Inaktivität automatisch aufräumt
- **Tech Stack:** TypeScript/Node.js, moodlehq/moodle-docker, nginx, Hetzner VPS (Ubuntu 24.04), GitHub Actions CI/CD

---

## 2. Session Start (für AI)

1. Dieses Dokument vollständig lesen
2. `04-tasks.md` lesen
3. Offene Tasks (taskXX) identifizieren
4. Relevante Features in `01-features.md` lesen
5. Mit dem Task höchster Priorität starten

---

## 3. File System

| Datei | Zweck |
|-------|-------|
| 01-features.md | Was wir bauen und warum (beabsichtigtes Verhalten) |
| 02-user-doc.md | Nutzerperspektive und Bedienung |
| 03-dev-doc.md | Technische Implementierung (Ist-Zustand) |
| 04-tasks.md | Tasks und operativer Workflow |
| 05-quality.md | Bugs und Testergebnisse |

---

## 4. ID System

- `feat01` → Feature
- `task01` → Task
- `bug01` → Bug
- `test01` → Test

---

## 5. Deployment

- **Server:** Hetzner VPS, Ubuntu 24.04, IP: 178.104.171.153
- **Domain:** `demo.eledia.ai`, Instanzen unter `*.demo.eledia.ai`
- **TLS:** Wildcard-Zertifikat unter `/etc/letsencrypt/live/demo.eledia.ai/`
- **CI/CD:** GitHub Actions → Push auf `main` → auto-deploy auf Server
- **Repo:** https://github.com/jmoskaliuk/moodle-runbot-mcp

---

## 6. Workflow

Idee → Feature → Task → Implementierung → Test → Bug → Fix → Done → Doku-Sync

---

## 7. Definition of Done

Ein Feature gilt als **done** wenn:

- Verhalten ist definiert (`01-features.md`)
- Nutzer-Doku ist aktuell (`02-user-doc.md`)
- Implementierung ist dokumentiert (`03-dev-doc.md`)
- Alle verknüpften Tasks sind erledigt
- Keine blockierenden Bugs offen

---

## 8. Prompt Shortcuts

### #status
Analysiere `01-features.md`, `04-tasks.md`, `05-quality.md`. Ausgabe: implementierte Features, Features in Arbeit, offene Tasks, offene Bugs, Risiken. Schließe mit 3 konkreten nächsten Schritten.

### #next
Identifiziere die 1–3 Tasks mit höchstem Wert. Erkläre Warum, Abhängigkeiten, Komplexität. Priorität: Blocker → Bugs → unfertige Core-Features.

### #plan
Zerlege Feature (featXX) in Tasks. Jeder Task: klares Ziel, ausführbar, verlinkt mit Feature. Risiken und unklare Bereiche separat.

### #implement
Führe Task (taskXX) aus: Ziel neu formulieren, Komponenten identifizieren, schrittweise implementieren, Entscheidungen dokumentieren.

### #test
Erstelle Testplan für Feature (featXX): manuelle Tests, automatisierte Tests, Fehlerszenarien. Ausgabe als Checkliste für `05-quality.md`.

### #doc
Prüfe Konsistenz: `01-features.md` ↔ `02-user-doc.md` ↔ `03-dev-doc.md`. Für jedes Feature: Implementierung vs. Definition, User-Doku-Genauigkeit, Dev-Doku-Genauigkeit.
