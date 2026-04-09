#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# eLeDia Moodle Runbot — Hetzner VPS Setup
# Ubuntu 24.04 · einmal ausführen als root oder sudo-User
#
# Verwendung:
#   curl -fsSL https://raw.githubusercontent.com/yourorg/moodle-runbot/main/setup.sh | bash
#   oder: bash setup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Konfiguration ─────────────────────────────────────────────────────────────
DOMAIN="${DOMAIN:-runbot.deinedomain.de}"       # Deine Domain — per Env überschreibbar
MCP_REPO="${MCP_REPO:-https://github.com/yourorg/moodle-runbot-mcp.git}"
WORK_DIR="/opt/runbot"
APP_DIR="/opt/moodle-runbot-mcp"
APP_USER="runbot"
MCP_PORT=3000
PORT_START=8100
PORT_END=8199
DEMO_MAX_AGE=60     # Minuten
DEMO_INACTIVITY=15  # Minuten
MAX_EXTENSIONS=2

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[info]${NC} $*"; }
success() { echo -e "${GREEN}[ok]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC} $*"; }
die()     { echo -e "${RED}[fail]${NC} $*"; exit 1; }

[[ $EUID -eq 0 ]] || die "Bitte als root oder mit sudo ausführen"

echo ""
echo "  eLeDia Moodle Runbot — Server Setup"
echo "  ════════════════════════════════════"
echo "  Domain:  $DOMAIN"
echo "  Work:    $WORK_DIR"
echo "  App:     $APP_DIR"
echo "  Ports:   $PORT_START–$PORT_END"
echo ""

# ── 1. System-Pakete ──────────────────────────────────────────────────────────
info "System-Pakete installieren…"
apt-get update -qq
apt-get install -y -qq \
  curl git nginx certbot python3-certbot-nginx \
  ufw fail2ban > /dev/null
success "System-Pakete installiert"

# ── 2. Docker ─────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  info "Docker installieren…"
  curl -fsSL https://get.docker.com | sh > /dev/null 2>&1
  success "Docker installiert"
else
  success "Docker bereits vorhanden ($(docker --version | cut -d' ' -f3 | tr -d ','))"
fi

# ── 3. Node.js 20 ─────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -e 'console.log(process.version.slice(1).split(".")[0])')" -lt 20 ]]; then
  info "Node.js 20 installieren…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null
  success "Node.js $(node --version) installiert"
else
  success "Node.js $(node --version) bereits vorhanden"
fi

# ── 4. System-User anlegen ────────────────────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
  info "User '$APP_USER' anlegen…"
  useradd -r -s /bin/bash -d /home/$APP_USER -m "$APP_USER"
  usermod -aG docker "$APP_USER"
  success "User '$APP_USER' angelegt"
else
  # Sicherstellen dass User in docker-Gruppe ist
  usermod -aG docker "$APP_USER" 2>/dev/null || true
  success "User '$APP_USER' bereits vorhanden"
fi

# ── 5. Verzeichnisse ──────────────────────────────────────────────────────────
info "Verzeichnisse anlegen…"
mkdir -p "$WORK_DIR" "$APP_DIR"
chown "$APP_USER:$APP_USER" "$WORK_DIR" "$APP_DIR"
success "Verzeichnisse angelegt"

# ── 6. MCP Server deployen ────────────────────────────────────────────────────
info "MCP Server deployen…"
if [[ -d "$APP_DIR/.git" ]]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" pull --quiet
  sudo -u "$APP_USER" bash -c "cd $APP_DIR && npm install --quiet && npm run build"
else
  if [[ -f "./package.json" ]]; then
    cp -r . "$APP_DIR/"
    chown -R "$APP_USER:$APP_USER" "$APP_DIR"
  else
    sudo -u "$APP_USER" git clone "$MCP_REPO" "$APP_DIR" --quiet
  fi
  sudo -u "$APP_USER" bash -c "cd $APP_DIR && npm install --quiet && npm run build"
fi
# Sicherstellen dass dist/index.js existiert bevor systemd startet
[[ -f "$APP_DIR/dist/index.js" ]] || die "Build fehlgeschlagen — dist/index.js nicht gefunden"
success "MCP Server gebaut"

# ── 7. Environment-Datei ──────────────────────────────────────────────────────
info "Environment konfigurieren…"
cat > /etc/moodle-runbot.env <<EOF
TRANSPORT=http
PORT=$MCP_PORT
RUNBOT_WORK_DIR=$WORK_DIR
PORT_START=$PORT_START
PORT_END=$PORT_END
BASE_DOMAIN=$DOMAIN
BASE_URL=https://$DOMAIN
REGISTRY_FILE=$WORK_DIR/registry.json
TOKENS_FILE=$WORK_DIR/tokens.json
DEMO_MAX_AGE_MINUTES=$DEMO_MAX_AGE
DEMO_INACTIVITY_MINUTES=$DEMO_INACTIVITY
CLEANUP_INTERVAL_SECONDS=60
MAX_EXTENSIONS=$MAX_EXTENSIONS
EXTEND_MINUTES=30
CORS_ORIGINS=https://$DOMAIN,https://www.$DOMAIN

# Brevo SMTP — Schlüssel im Brevo Dashboard unter SMTP & API → SMTP
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=johannes.moskaliuk@eledia.ai
SMTP_PASS=HIER_BREVO_SMTP_SCHLUESSEL_EINTRAGEN
FROM_EMAIL=johannes.moskaliuk@eledia.ai
FROM_NAME=Johannes von eLeDia.ai
TOKEN_TTL_HOURS=24
EOF
chmod 600 /etc/moodle-runbot.env
success "Environment-Datei erstellt: /etc/moodle-runbot.env"

# ── 8. systemd Service ────────────────────────────────────────────────────────
info "systemd Service einrichten…"
cat > /etc/systemd/system/moodle-runbot.service <<EOF
[Unit]
Description=eLeDia Moodle Runbot MCP Server
Documentation=https://github.com/yourorg/moodle-runbot-mcp
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=/etc/moodle-runbot.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=moodle-runbot

# Ressourcenlimits
LimitNOFILE=65536
MemoryMax=512M

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable moodle-runbot
systemctl restart moodle-runbot
sleep 2

if systemctl is-active --quiet moodle-runbot; then
  success "MCP Server läuft (Port $MCP_PORT)"
else
  warn "MCP Server gestartet — prüfe: journalctl -u moodle-runbot -n 20"
fi

# ── 9. Firewall ───────────────────────────────────────────────────────────────
info "Firewall konfigurieren…"
ufw --force reset > /dev/null
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
ufw allow ssh > /dev/null
ufw allow 80/tcp > /dev/null   # HTTP (für certbot + redirect)
ufw allow 443/tcp > /dev/null  # HTTPS
# MCP Port nur intern — nginx proxied nach außen
# Demo-Ports für Moodle-Instanzen nur intern (nginx proxied)
ufw --force enable > /dev/null
success "Firewall konfiguriert (SSH + 80 + 443)"

# ── 10. nginx Konfiguration ───────────────────────────────────────────────────
info "nginx konfigurieren…"

# Demo-Portal + MCP API
cat > /etc/nginx/sites-available/runbot <<EOF
# ── MCP API & Demo-Portal ────────────────────────────────────────
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    # Demo-Portal (statische HTML)
    root $APP_DIR/webui;
    index demo-portal.html;

    # ACME-Challenge für Let's Encrypt
    location /.well-known/acme-challenge/ { root /var/www/html; }

    # MCP Server API — langer Timeout weil instance_start ~60s dauert
    location /api/ {
        proxy_pass http://127.0.0.1:$MCP_PORT/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 300s;
        proxy_connect_timeout 10s;
    }

    # Statische Dateien
    location / { try_files \$uri \$uri/ =404; }
}

# ── Moodle Demo-Instanzen (Wildcard-Subdomains) ──────────────────
# Jede Instanz läuft auf einem eigenen Port (8100–8199).
# Statt einer nginx-Map nutzen wir ein kleines Lua/Python-Script NICHT —
# stattdessen: der MCP Server schreibt für jede Instanz eine eigene
# nginx-Config-Datei in /etc/nginx/conf.d/demo-*.conf und reloaded nginx.
# Dadurch funktioniert proxy_pass ohne Variable-Tricks.
EOF

# Leeres Map-File anlegen (wird vom MCP Server befüllt)
touch "$WORK_DIR/nginx-ports.map"
chown "$APP_USER:$APP_USER" "$WORK_DIR/nginx-ports.map"

ln -sf /etc/nginx/sites-available/runbot /etc/nginx/sites-enabled/runbot
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
success "nginx konfiguriert"

# ── 11. Webui-Verzeichnis ─────────────────────────────────────────────────────
if [[ -d "$APP_DIR/webui" ]]; then
  chown -R www-data:www-data "$APP_DIR/webui"
  success "Webui-Dateien bereit"
else
  warn "Kein webui/-Verzeichnis gefunden — Demo-Portal manuell deployen"
fi

# ── 12. SSL (Let's Encrypt) ───────────────────────────────────────────────────
echo ""
warn "SSL-Zertifikat: Führe nach DNS-Setup aus:"
echo "    certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo "    # Für Wildcard (Demo-Subdomains):"
echo "    certbot certonly --manual --preferred-challenges dns -d '*.$DOMAIN'"
echo ""

# ── 13. Zusammenfassung ───────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}  ══════════════════════════════════════${NC}"
echo -e "${GREEN}  Setup abgeschlossen!${NC}"
echo -e "${GREEN}  ══════════════════════════════════════${NC}"
echo ""
echo "  MCP Server:    http://localhost:$MCP_PORT/health"
echo "  Demo-Portal:   http://$DOMAIN"
echo "  Logs:          journalctl -u moodle-runbot -f"
echo "  Status:        systemctl status moodle-runbot"
echo "  Neustart:      systemctl restart moodle-runbot"
echo ""
echo "  Nächste Schritte:"
echo "   1. DNS: $DOMAIN + *.$DOMAIN → $(curl -s ifconfig.me 2>/dev/null || echo 'DEINE-IP')"
echo "   2. SSL: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo "   3. Plugin-Pfade in $WORK_DIR/plugins/ anlegen"
echo "   4. Portal testen: curl http://localhost:$MCP_PORT/health"
echo ""
