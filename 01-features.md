# Features

## Meta

Dieses Dokument definiert, was das Produkt tun soll.
Es ist die **Source of Truth für beabsichtigtes Verhalten** — keine Implementierungsdetails.

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
