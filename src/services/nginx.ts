// src/services/nginx.ts
// Verwaltet nginx-Config-Dateien für Demo-Instanzen.
// Für jede Instanz wird eine eigene /etc/nginx/conf.d/runbot-{id}.conf
// geschrieben und nginx neu geladen.
//
// Config-Aufbau pro Instanz:
//   - Port 80: HTTP → HTTPS 301-Redirect (ACME-Challenge bleibt passthrough
//     über das Haupt-site in /etc/nginx/sites-available/runbot).
//   - Port 443: HTTPS mit Wildcard-Cert aus SSL_CERT_DIR, Proxy nach
//     http://127.0.0.1:${port}. X-Forwarded-Proto=https wird gesetzt,
//     damit Moodle (mit $CFG->sslproxy = true) weiß, dass TLS extern terminiert.

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

const NGINX_CONF_DIR = process.env.NGINX_CONF_DIR ?? "/etc/nginx/conf.d";
const BASE_DOMAIN    = process.env.BASE_DOMAIN ?? "";
const NGINX_ENABLED  = BASE_DOMAIN !== "";

// Wildcard-Zertifikat liegt per Konvention unter /etc/letsencrypt/live/${BASE_DOMAIN}/
// (erzeugt via `certbot certonly --manual --preferred-challenges dns -d '*.${BASE_DOMAIN}'`).
// Überschreibbar für Dev/Test-Setups via SSL_CERT_DIR.
const SSL_CERT_DIR = process.env.SSL_CERT_DIR ?? `/etc/letsencrypt/live/${BASE_DOMAIN}`;
const SSL_FULLCHAIN = `${SSL_CERT_DIR}/fullchain.pem`;
const SSL_PRIVKEY   = `${SSL_CERT_DIR}/privkey.pem`;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Schreibt eine nginx-Config für eine Demo-Instanz und reloaded nginx.
 * Wird nach erfolgreichem instance_start aufgerufen.
 */
export async function registerInstance(
  instanceId: string,
  port: number
): Promise<void> {
  if (!NGINX_ENABLED) return; // Lokal ohne Domain: kein nginx nötig

  // Pre-Flight-Check: Wildcard-Cert muss vorhanden sein, sonst ist der
  // HTTPS-Block kaputt und nginx reload schlägt fehl — verständlich loggen.
  const certOk = await certFilesExist();
  if (!certOk) {
    console.error(
      `[nginx] WARNING: Wildcard-Cert fehlt unter ${SSL_CERT_DIR}/ — ` +
      `Instanz ${instanceId} läuft intern auf Port ${port}, aber HTTPS-Subdomain ` +
      `wird nicht funktionieren. Fix:\n` +
      `    certbot certonly --manual --preferred-challenges dns -d '*.${BASE_DOMAIN}' -d '${BASE_DOMAIN}'\n` +
      `Oder setze SSL_CERT_DIR auf einen existierenden Cert-Pfad.`
    );
    return;
  }

  const confPath = `${NGINX_CONF_DIR}/runbot-${instanceId}.conf`;
  const subdomain = `${instanceId}.${BASE_DOMAIN}`;

  const config = `
# Auto-generiert von moodle-runbot — nicht manuell bearbeiten
# Instanz: ${instanceId}  Port: ${port}  Host: ${subdomain}

# ── HTTP → HTTPS Redirect ────────────────────────────────────────────────
server {
    listen 80;
    listen [::]:80;
    server_name ${subdomain};

    # ACME-Challenge kommt über die Haupt-Site (runbot), nicht hier.
    return 301 https://$host$request_uri;
}

# ── HTTPS Reverse Proxy zur Moodle-Instanz ───────────────────────────────
server {
    # http2 als listen-Parameter (alte Syntax) — funktioniert in nginx 1.18–1.24.
    # Ab 1.25+ wäre "http2 on;" als eigener Directive erlaubt, aber Ubuntu 24.04
    # liefert 1.24.0, und die alte Syntax funktioniert in beiden.
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${subdomain};

    ssl_certificate     ${SSL_FULLCHAIN};
    ssl_certificate_key ${SSL_PRIVKEY};

    # Moderne TLS-Defaults (Mozilla Intermediate)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # Moodle kann große Uploads haben (Backups, Medien)
    client_max_body_size 256M;

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Forwarded-Port  443;

        # Moodle's install_database.php und Snapshot-Restore können lange dauern
        proxy_read_timeout    300s;
        proxy_connect_timeout 10s;
        proxy_send_timeout    300s;
    }
}
`.trim() + "\n";

  try {
    await fs.mkdir(NGINX_CONF_DIR, { recursive: true });
    await fs.writeFile(confPath, config, "utf-8");
    await reloadNginx();
    console.error(`[nginx] Registered ${subdomain} → 127.0.0.1:${port}`);
  } catch (e) {
    // Nicht fatal — Instanz läuft trotzdem, nur ohne Subdomain.
    // Versuchen, die kaputte Config wieder zu entfernen, damit nginx nicht
    // beim nächsten Reload crasht.
    console.error(`[nginx] Failed to register ${instanceId}:`, e);
    await fs.unlink(confPath).catch(() => {});
  }
}

/**
 * Löscht die nginx-Config einer Instanz und reloaded nginx.
 * Wird nach instance_stop aufgerufen.
 */
export async function unregisterInstance(instanceId: string): Promise<void> {
  if (!NGINX_ENABLED) return;

  const confPath = `${NGINX_CONF_DIR}/runbot-${instanceId}.conf`;
  try {
    await fs.unlink(confPath);
    await reloadNginx();
  } catch {
    // Datei existiert vielleicht nicht mehr — kein Fehler
  }
}

/**
 * Räumt alle runbot-*.conf Dateien auf (inkl. alten demo-*.conf Waisen
 * aus vorherigen Versionen).
 * Gedacht für Server-Neustart — sollte beim boot aufgerufen werden,
 * damit Waisen (Configs für abgestürzte Instanzen) verschwinden.
 */
export async function cleanupAllConfigs(): Promise<void> {
  if (!NGINX_ENABLED) return;

  try {
    const files = await fs.readdir(NGINX_CONF_DIR);
    const stale = files.filter(
      f => (f.startsWith("runbot-") || f.startsWith("demo-")) && f.endsWith(".conf")
    );
    await Promise.all(stale.map(f => fs.unlink(path.join(NGINX_CONF_DIR, f)).catch(() => {})));
    if (stale.length > 0) {
      await reloadNginx();
      console.error(`[nginx] Cleaned up ${stale.length} stale config(s)`);
    }
  } catch {
    // nginx conf dir existiert nicht — kein Problem
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function reloadNginx(): Promise<void> {
  try {
    await execAsync("nginx -t");                         // Config testen
    await execAsync("systemctl reload nginx");           // Graceful reload
  } catch (e) {
    console.error("[nginx] Reload failed:", e);
    throw e;
  }
}

async function certFilesExist(): Promise<boolean> {
  try {
    await fs.access(SSL_FULLCHAIN);
    await fs.access(SSL_PRIVKEY);
    return true;
  } catch {
    return false;
  }
}
