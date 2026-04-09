# Moodle Runbot — MCP Server

MCP Server für die Orchestrierung von Moodle-Testinstanzen auf einem Hetzner VPS.
Nutzt [moodlehq/moodle-docker](https://github.com/moodlehq/moodle-docker) als Basis.

## Konzept

```
GitHub PR/Push
      │
      ▼
Webhook Receiver  →  Claude (via MCP)  →  Moodle-Runbot MCP Server
                                                    │
                                         moodlehq/moodle-docker
                                                    │
                                    ┌───────────────┼───────────────┐
                                 Instanz 1      Instanz 2      Instanz 3
                               (pr-42-...)    (pr-43-...)    (pr-44-...)
                               Port 8100      Port 8101      Port 8102
```

## Tools

| Tool | Beschreibung |
|------|-------------|
| `instance_start` | Startet neue Moodle-Instanz mit Plugin |
| `instance_stop` | Stoppt und löscht Instanz |
| `instance_status` | Status und Test-Runs einer Instanz |
| `instance_list` | Alle Instanzen auflisten |
| `instance_logs` | Container-Logs abrufen |
| `instance_run_tests` | PHPUnit oder Behat ausführen |

## Setup auf Hetzner VPS (Ubuntu 24.04)

### 1. Voraussetzungen

```bash
# Docker installieren
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Node.js 20+ installieren
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# Arbeitsverzeichnis anlegen
sudo mkdir -p /opt/runbot
sudo chown $USER:$USER /opt/runbot
```

### 2. MCP Server installieren

```bash
git clone <dein-repo>/moodle-runbot-mcp.git
cd moodle-runbot-mcp
npm install
npm run build
```

### 3. Umgebungsvariablen

```bash
# /etc/environment oder systemd service
TRANSPORT=http
PORT=3000
RUNBOT_WORK_DIR=/opt/runbot
PORT_START=8100
PORT_END=8199
BASE_DOMAIN=runbot.deinedomain.de   # optional
REGISTRY_FILE=/opt/runbot/registry.json
```

### 4. Als systemd Service

```ini
# /etc/systemd/system/moodle-runbot.service
[Unit]
Description=Moodle Runbot MCP Server
After=docker.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/moodle-runbot-mcp
Environment=TRANSPORT=http
Environment=PORT=3000
Environment=RUNBOT_WORK_DIR=/opt/runbot
Environment=PORT_START=8100
Environment=PORT_END=8199
Environment=BASE_DOMAIN=runbot.deinedomain.de
ExecStart=/usr/bin/node dist/index.js
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now moodle-runbot
```

### 5. nginx Reverse Proxy (optional)

```nginx
# /etc/nginx/sites-available/runbot
server {
    listen 80;
    server_name *.runbot.deinedomain.de;

    # Wildcard: leite jeden Subdomain-Request an den richtigen Port weiter
    # Instance-Port wird aus dem Subdomain-Namen ermittelt
    # (Alternativ: direkte Port-Freigabe 8100-8199 in der Hetzner Firewall)
    location / {
        proxy_pass http://localhost:$PORT;
    }
}
```

## Lokale Entwicklung / Test

```bash
# stdio mode (für Claude Desktop / lokale Nutzung)
RUNBOT_WORK_DIR=/tmp/runbot-test node dist/index.js

# HTTP mode
TRANSPORT=http PORT=3000 RUNBOT_WORK_DIR=/tmp/runbot-test node dist/index.js

# Mit MCP Inspector testen
npx @modelcontextprotocol/inspector http://localhost:3000/mcp
```

## Beispiel-Workflow mit Claude

```
User: Starte eine Moodle 5.0 Instanz für PR #42, Branch 'feature/my-quiz',
      Plugin liegt unter /opt/plugins/mod_myquiz

Claude ruft auf:
  instance_start({
    prId: "42",
    branch: "feature/my-quiz",
    pluginSrcPath: "/opt/plugins/mod_myquiz",
    pluginType: "mod",
    pluginName: "myquiz",
    moodleVersion: "5.0",
    phpVersion: "8.3",
    db: "pgsql"
  })

→ { instanceId: "pr-42-abc123", url: "http://localhost:8100", status: "running" }

User: Führe PHPUnit Tests aus

Claude ruft auf:
  instance_run_tests({
    instanceId: "pr-42-abc123",
    type: "phpunit",
    component: "mod_myquiz"
  })

→ { status: "passed", summary: "OK (42 tests, 84 assertions)", ... }
```

## Nächste Schritte

- [ ] GitHub Webhook Receiver (Node.js) der automatisch `instance_start` triggert
- [ ] nginx Wildcard-Config mit dynamischer Port-Weiterleitung  
- [ ] Automatische Cleanup-Routine für alte Instanzen (Cron)
- [ ] GitHub PR Status + Kommentar mit Test-Ergebnis
- [ ] Claude analysiert Fehler-Logs und schreibt verständliche PR-Kommentare
