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

---

## Features

---

### feat01 Self-Service Demo-Anfrage-Flow

**Goal**
Ein Interessent kann ohne manuellen Eingriff von eLeDia eine funktionierende Moodle-Demo anfordern und erhalten. Das System schützt vor Missbrauch durch E-Mail-Bestätigung.

**Behavior**

1. Interessent füllt Formular aus: Name, E-Mail, Plugin-Config
2. System sendet Bestätigungs-E-Mail mit einmaligem Token-Link
3. Interessent klickt Link → sieht Loading-Page (visuelles Feedback der Schritte)
4. System startet Demo im Hintergrund
5. System sendet zweite E-Mail mit direktem Demo-Link sobald bereit
6. Interessent kann Demo-Link jederzeit erneut aufrufen (redirect wenn Instanz läuft)

**Edge Cases**
- Token abgelaufen (24h): Fehlermeldung mit Link zurück zum Portal
- Instanz bereits gestartet + läuft noch: direkt weiterleiten, keine neue Instanz
- Demo-Start schlägt fehl: Nutzer bekommt Fehler-E-Mail mit "Erneut versuchen"-Link zum Portal
- Ungültige E-Mail: sofortige Validierungsfehlermeldung

**Non-goals**
- Kein Nutzer-Login oder Dashboard
- Keine manuelle Genehmigung durch eLeDia-Mitarbeiter
- Keine Zahlungsintegration

**Decisions**
- E-Mail-Bestätigung ist Pflicht (kein direkter Start ohne Klick)
- Token-Gültigkeit: 24 Stunden
- Token ist einmalig verwendbar (nach Bestätigung: Status "confirmed")

---

### feat02 Moodle-Instanz-Verwaltung

**Goal**
Das System kann vollständige, isolierte Moodle-Instanzen on-demand erstellen, starten, stoppen und aufräumen.

**Behavior**
- `provisionInstance`: klont moodle-docker + Moodle-Core, patcht config.php (wwwroot = HTTPS-Subdomain, Port-Block entfernt)
- `installPlugin`: kopiert Plugin in den richtigen Moodle-Verzeichnis-Pfad
- `startContainers`: startet Docker-Compose, wartet auf DB, legt DB an (oder restauriert Snapshot)
- `stopContainers`: fährt Compose down + löscht Volumes
- `cleanupInstanceDir`: entfernt Instanz-Verzeichnis von Disk

**Unterstützte Versionen**
- Moodle: 4.3, 4.4, 4.5, 5.0, 5.1
- PHP: 8.1, 8.2, 8.3, 8.4
- DB: pgsql, mariadb, mysql

**Non-goals**
- Keine persistente Datenspeicherung über Instanz-Lebensdauer hinaus (Snapshots ausgenommen)
- Keine Skalierung über einen Server hinaus

**Decisions**
- Ein Port pro Instanz aus konfigurierbarem Bereich (Standard: 8100–8199)
- config.php-Patch via Brace-Counting (nicht Regex) wegen verschachteltem if-Block

---

### feat03 nginx Reverse Proxy

**Goal**
Jede Demo-Instanz ist über eine HTTPS-Subdomain erreichbar (`{instanceId}.demo.eledia.ai`), nicht nur über localhost-Port.

**Behavior**
- Bei Instanz-Start: schreibt nginx-Config, reloaded nginx
- HTTP (Port 80): 301-Redirect auf HTTPS
- HTTPS (Port 443): Proxy zu `http://127.0.0.1:{port}` mit korrekten Headers
- Bei Instanz-Stop: löscht Config, reloaded nginx
- Beim Server-Neustart: alle alten `demo-*.conf` werden aufgeräumt

**Non-goals**
- Kein Rate-Limiting oder IP-Blocking (noch nicht)
- Kein Load-Balancing

**Decisions**
- Wildcard-Zertifikat unter `/etc/letsencrypt/live/demo.eledia.ai/`
- `X-Forwarded-Proto: https` hardcoded (verhindert Moodle-Redirect-Schleifen)
- `CERT_DIR` überschreibbar via `SSL_CERT_DIR` Env-Variable
- nginx-Config-Verzeichnis: `/etc/nginx/conf.d/`, überschreibbar via `NGINX_CONF_DIR`

---

### feat04 Plugin-Konfigurationssystem

**Goal**
Verschiedene Demo-Szenarien (verschiedene Plugins, Versionen, Demo-Daten) sind ohne Code-Änderung konfigurierbar.

**Behavior**
- Configs werden aus Dateien geladen (vermutlich YAML/JSON)
- Jede Config definiert: Plugin-Quelle, Moodle-Version, PHP-Version, DB-Typ, optionale Snapshot-ID
- GET `/configs` gibt alle sichtbaren Configs als JSON zurück (für Demo-Portal)

**Non-goals**
- Keine Admin-UI für Config-Verwaltung

**Decisions**
- Format: JSON (`configs.json` im Projekt-Root, überschreibbar via `CONFIGS_FILE`)
- Felder pro Config: `id`, `name`, `category`, `description`, `features[]`, `plugin`, `snapshotId`, `moodleVersion`, `phpVersion`, `db`, `visible`
- `visible: false` versteckt eine Config im Portal ohne sie zu löschen

---

### feat05 Snapshot-System

**Goal**
Demo-Instanzen können mit vorbereiteten Daten (Kurse, Nutzer, Konfigurationen) gestartet werden, ohne jedes Mal neu installieren zu müssen — schnellerer Start und konsistente Demo-Erfahrung.

**Behavior**
- Snapshots sind DB-Dumps
- Beim Instanz-Start: wenn `snapshotId` in Config vorhanden → Snapshot restaurieren statt leere DB
- MCP-Tools: `snapshot_list`, `snapshot_create`, `snapshot_delete`

**Non-goals**
- Keine automatische Snapshot-Aktualisierung bei Plugin-Update

---

### feat06 Automatisches Aufräumen

**Goal**
Instanzen werden nach Inaktivität automatisch gestoppt und gelöscht, um Server-Ressourcen freizugeben.

**Behavior**
- Cleanup-Scheduler läuft im Hintergrund
- Jede Aktivität (HTTP-Request an Instanz) aktualisiert `lastActivity`-Timestamp
- Instanzen ohne Aktivität nach konfigurierter Zeit → automatisch stoppen + aufräumen
- `POST /ping/:instanceId`: expliziter Aktivitäts-Ping (von nginx oder Demo-Instanz)

**Decisions**
- Max. Gesamtlaufzeit: 60 Min (`DEMO_MAX_AGE_MINUTES`)
- Inaktivitäts-Timeout: 15 Min (`DEMO_INACTIVITY_MINUTES`)
- Scheduler-Interval: 60s (`CLEANUP_INTERVAL_SECONDS`)
- Alle Werte via Env-Variable konfigurierbar

**Non-goals**
- Keine manuelle Verlängerung durch Interessenten (feat08 für MCP-Tool `instance_extend`)

---

### feat07 Demo-Nutzerverwaltung

**Goal**
Der Interessent bekommt einen personalisierten Nutzer-Account in seiner Demo-Instanz, der direkt eingeloggt werden kann.

**Behavior**
- Nach Instanz-Start: Nutzer mit Name + E-Mail des Interessenten wird angelegt
- Nutzer wird in Demo-Kurs eingeschrieben
- "Demo bereit"-E-Mail enthält direkten Demo-Link (Nutzer muss sich noch einloggen)

**Non-goals**
- Kein Auto-Login (SSO/Token-basierter direkter Zugang)

**Decisions**
- Passwort: `demo1234` (hardcoded)
- Passwort wird aktuell **nicht** in der "Demo bereit"-E-Mail mitgeschickt → offen (bug03)

---

### feat08 MCP-Tools (CI/Testing-Modus)

**Goal**
Der Server kann auch als MCP-Server für KI-gestützte CI/CD-Workflows genutzt werden (z.B. Claude startet Testinstanz, führt Tests aus).

**Behavior**

MCP-Tools:
- `instance_start` / `instance_stop` / `instance_status` / `instance_list`
- `instance_logs` / `instance_run_tests` / `instance_extend` / `instance_time_remaining`
- `snapshot_list` / `snapshot_create` / `snapshot_delete`
- `config_list` / `config_get`

Transport: stdio (Standard) oder HTTP (`TRANSPORT=http`)

**Non-goals**
- Nicht für Endnutzer gedacht — nur für CI/AI-Systeme

---

### feat09 Live-Status auf der Warteseite

**Goal**
Nach Klick auf den Bestätigungslink sieht der Interessent eine Loading-Seite, die
**echten** Fortschritt zeigt (Polling, nicht nur ein Timer) und sobald die Demo
bereit ist direkt ohne Umweg über die E-Mail öffnen lässt — mit sichtbaren
Login-Daten.

**Behavior**

1. Nach `GET /confirm/:token` rendert der Server `buildLoadingPage()` mit dem Token eingebettet als JS-Konstante.
2. Die Seite pollt alle 3s `GET /api/demo-status/:token` und zeigt die aktuelle Phase ("Container starten", "Demo-Daten laden", …).
3. Sobald `status === "ready"` blendet sie Credentials-Box ein (E-Mail + Passwort) sowie einen prominenten "Demo öffnen"-Button, der die Instance-URL in neuem Tab öffnet.
4. Bei `status === "error"` erscheint eine freundliche Fehlermeldung mit "Erneut anfordern"-Link zum Portal.
5. Die Seite schreibt den aktuellen Status in `document.title`, damit man die Wartezeit im Browser-Tab sieht.

**API-Vertrag** (`GET /api/demo-status/:token`)
```json
{
  "status": "preparing" | "ready" | "error" | "expired",
  "phase": "provisioning" | "installing_plugin" | "starting_containers" | "restoring_snapshot" | "creating_user" | "running",
  "url": "https://demo-leitnerflow-abc.demo.eledia.ai",   // nur wenn status === "ready"
  "username": "ichraum@gmail.com",                        // nur wenn status === "ready"
  "password": "demo1234",                                 // nur wenn status === "ready"
  "pluginName": "LeitnerFlow"
}
```

**Edge Cases**
- Token unbekannt: 404 + `{status: "expired"}`
- Nutzer verlässt die Seite und kommt per E-Mail-Link wieder: Token noch valide → derselbe Ablauf, Seite zeigt den aktuellen Phasenstand.
- Demo gecrashed: Error-E-Mail fließt über `sendErrorEmail()`, Warteseite zeigt `status=error`.

**Non-goals**
- Kein WebSocket / SSE (Polling reicht, Kosten/Komplexität niedriger)
- Kein Auto-Login per Token (das ist feat15 falls gewollt)

**Decisions**
- Phase wird in `DemoRequest` persistiert (`phase` Feld, optional), damit Restart des Servers keinen Status verliert
- Polling-Intervall: 3s (konfigurierbar via `DEMO_STATUS_POLL_MS`)

---

### feat10 Rollenbasierte Demo-Szenarien

**Goal**
Manche Demos zeigen den Mehrwert eines Plugins nur dann, wenn mehrere Rollen
sichtbar sind (z.B. "Admin erstellt Kartenset → Teacher weist Kurs zu → Student
lernt"). Der Interessent kann in derselben Instanz zwischen drei Testnutzern
wechseln, ohne dass wir individuelle Accounts aus seiner E-Mail bauen müssen.

**Entscheidung (2026-04-09, Johannes)**
- Es gibt **kein** dynamisches User-Create mehr aus der E-Mail-Adresse des
  Interessenten. Die E-Mail taucht nirgends als Moodle-Username auf.
- Stattdessen liefert der Snapshot selbst die drei Accounts mit.
- Ob ein Plugin-Snapshot den Multi-User-Modus nutzt, wird im Config-Eintrag
  pro Plugin via Flag `multiUser: true` markiert (Default: `true` für alle
  neuen Snapshots).

**Behavior**
- Im Snapshot sind drei Accounts vordefiniert: `admin`, `teacher`, `student`
- Alle drei teilen dasselbe Passwort (`DEMO_PASSWORD`, default `demo1234`)
- Alle drei sind in denselben Demo-Kurs eingeschrieben, mit den passenden
  Moodle-Rollen
- Die Warteseite zeigt im "Ready"-Zustand eine Creds-Box mit genau einem
  Info-Block: `Accounts: admin · teacher · student / Passwort: demo1234`
- Die "Demo bereit"-E-Mail enthält dieselbe Info — Login-Feld zeigt die drei
  Account-Namen, nicht die E-Mail-Adresse
- Kein Auto-Login, kein Rollen-Switcher in Phase 1 — der Nutzer loggt sich
  manuell mit dem Account ein, den er sehen will, und nutzt ggf. Moodles
  eigenes "Login as" für schnelleres Wechseln

**Non-goals**
- Kein grafischer Rollen-Switcher im Portal (Phase 2)
- Kein Auto-Login via Webservice-Token (Phase 2)
- Keine echten Multi-User-Szenarien mit konkurrenter Nutzung (es bleibt 1 Demo-Instanz für 1 Interessenten)
- Keine individuellen Passwörter pro Rolle
- Keine kundendefinierten Rollen

---

### feat11 Admin-Dashboard

**Goal**
eLeDia-Mitarbeiter können in einer internen Seite alle laufenden Demos sehen,
manuell verlängern und löschen — ohne SSH auf den Server.

**Entscheidung (2026-04-09, Johannes)**
- **Auth:** HTTP Basic Auth reicht für den MVP — die Daten sind nicht kritisch
  (Demo-Instanzen, keine Kundendaten). Passwort via `ADMIN_PASSWORD` Env-Variable.
- **GitHub OAuth / SSO** wird erst in Phase 2 eingebaut, wenn das Dashboard
  mehr Funktionen bekommt (Statistiken, Audit-Log, Multi-User-Verwaltung).

**Behavior**
- URL: `/admin` (nur mit HTTP Basic Auth erreichbar)
- Tabelle: alle Instanzen mit Spalten `id | config | requester | gestartet | verbleibend | Status | Aktionen`
- Aktionen pro Zeile: "Verlängern" (+1 Std), "Sofort löschen", "Logs anzeigen" (last 50 lines)
- Refresh-Button (kein Live-Polling im MVP)
- Zweite Tabelle: alle aktiven Demo-Tokens (aus `tokens.json`) mit Status + Ablaufzeit

**Auth**
- HTTP Basic Auth via Express-Middleware
- Username: fest auf `admin`
- Passwort: aus `ADMIN_PASSWORD` Env-Variable (Pflicht — Server startet nicht ohne)
- Browser merkt sich die Credentials für die Session; Logout via "neues Browser-Fenster"

**Non-goals**
- Kein GitHub OAuth im MVP (Phase 2)
- Keine Statistiken (Chart-Ansicht, Historie) im MVP
- Keine Multi-Admin-Verwaltung, kein Audit-Log, kein 2FA
- Keine CSRF-Tokens für Actions (Same-Origin + Basic Auth reicht für interne Tools)

---

### feat12 Code-basierte Demo-Verlängerung

**Goal**
Ein Kunde auf einer Messe oder in einer Schulung bekommt von eLeDia einen
vorher generierten Code ("EDUMA2026"), mit dem er seine eigene Demo-Instanz
von 60 Min auf 24 Stunden verlängern kann — ohne dass eLeDia manuell
eingreifen muss.

**Entscheidung (2026-04-09, Johannes)**
- Codes werden **pre-generated** (vom Admin, nicht vom Nutzer selbst).
- Distribution ist **manuell**: per E-Mail, auf der Messe ausgedruckt, im
  Schulungsraum auf dem Whiteboard. Kein Self-Service-Formular im MVP.
- **Alle Codes haben dieselbe Laufzeit: 1 Tag (1440 Min)**. Pro-Code-TTL
  kann später kommen, aber für den MVP einheitlich.
- Codes liegen in einer simplen Config-Datei (`/opt/runbot/extend-codes.json`
  oder via `EXTEND_CODES` Env), nicht in einer DB.

**Behavior**
- Auf der Demo-Instanz oder der Warteseite gibt es ein kleines Eingabefeld "Verlängerungscode eingeben"
- `POST /api/extend-code` mit `{token, code}` → Server checkt `EXTEND_CODES`, akzeptiert + setzt neue `expiresAt` für diese Instanz
- Antwort: "Demo verlängert bis 2026-04-10 16:30"

**Codes**
- Format im Env: `EXTEND_CODES=EDUMA2026,PRIVATE,TRAIN01` (Komma-getrennt, nur Code-Namen)
- TTL global: 1440 Min (1 Tag) für alle Codes im MVP
- Generierung manuell durch Admin (z.B. per `openssl rand -hex 4` + Eintrag in Env)

**Edge Cases**
- Code existiert nicht: "Code ungültig"
- Token bereits abgelaufen: "Demo bereits beendet — neue anfordern"
- Code bereits für diesen Token verwendet: "Du hast diese Demo schon verlängert"
- Ein Code darf von mehreren Interessenten genutzt werden (es ist ein "Messe-Code"),
  aber pro Token nur einmal

**Non-goals**
- Keine personalisierten Codes (ein Code gilt für mehrere Interessenten gleichzeitig)
- Keine pro-Code-TTL im MVP — alles 1 Tag
- Kein Abrechnungsmodell, keine Zahlung
- Keine Code-Generierungs-UI im Admin-Dashboard (Phase 2)
- Kein Self-Service "Code beantragen"-Formular für Interessenten

---

### feat13 Plugin-Metadaten aus GitHub

**Goal**
Das Portal zeigt bei jedem Plugin das echte Icon aus dem GitHub-Repo, nicht nur
ein Emoji. Außerdem Stars, letztes Release und Lizenz — als Vertrauenssignal.

**Behavior**
- In `configs.json` kann pro Plugin ein `githubRepo: "owner/repo"` stehen
- Das bestehende `github.ts` liefert bereits Repo-Info + Releases (1h-Cache)
- Ergänzung: Service versucht das Icon aus `pix/monologo.svg` oder `pix/icon.png` im Default-Branch via `https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}` zu laden (HEAD-Check)
- Frontend fragt `GET /api/plugin/:id` ab und zeigt falls vorhanden das GitHub-Icon statt des Emojis, sowie Star-Count als Micro-Stat

**Non-goals**
- Kein Upload/Hosting der Icons auf unserem Server (wir linken direkt auf raw.githubusercontent.com)
- Keine automatische Synchronisation von Plugin-Versionen mit moodle.org/plugins Directory
