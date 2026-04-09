// src/services/nginx.ts
// Verwaltet nginx-Config-Dateien für Demo-Instanzen.
// Für jede Instanz wird eine eigene /etc/nginx/conf.d/demo-{id}.conf
// geschrieben und nginx neu geladen.

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";

const execAsync = promisify(exec);

const NGINX_CONF_DIR = process.env.NGINX_CONF_DIR ?? "/etc/nginx/conf.d";
const BASE_DOMAIN     = process.env.BASE_DOMAIN ?? "";
const NGINX_ENABLED   = BASE_DOMAIN !== "";

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

  const confPath = `${NGINX_CONF_DIR}/demo-${instanceId}.conf`;
  const subdomain = `${instanceId}.${BASE_DOMAIN}`;

  const config = `
# Auto-generiert von moodle-runbot — nicht manuell bearbeiten
# Instanz: ${instanceId}  Port: ${port}
server {
    listen 80;
    server_name ${subdomain};

    # Aktivität an MCP melden damit der Inaktivitäts-Timer zurückgesetzt wird
    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;

        # Moodle braucht korrekte Weiterleitungs-URLs
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`.trim();

  try {
    await fs.mkdir(NGINX_CONF_DIR, { recursive: true });
    await fs.writeFile(confPath, config, "utf-8");
    await reloadNginx();
  } catch (e) {
    // Nicht fatal — Instanz läuft trotzdem, nur ohne Subdomain
    console.error(`[nginx] Failed to register ${instanceId}:`, e);
  }
}

/**
 * Löscht die nginx-Config einer Instanz und reloaded nginx.
 * Wird nach instance_stop aufgerufen.
 */
export async function unregisterInstance(instanceId: string): Promise<void> {
  if (!NGINX_ENABLED) return;

  const confPath = `${NGINX_CONF_DIR}/demo-${instanceId}.conf`;
  try {
    await fs.unlink(confPath);
    await reloadNginx();
  } catch {
    // Datei existiert vielleicht nicht mehr — kein Fehler
  }
}

/**
 * Räumt alle demo-*.conf Dateien auf.
 * Nützlich beim Server-Neustart.
 */
export async function cleanupAllConfigs(): Promise<void> {
  if (!NGINX_ENABLED) return;

  try {
    const files = await fs.readdir(NGINX_CONF_DIR);
    const demoFiles = files.filter(f => f.startsWith("demo-") && f.endsWith(".conf"));
    await Promise.all(demoFiles.map(f => fs.unlink(`${NGINX_CONF_DIR}/${f}`).catch(() => {})));
    if (demoFiles.length > 0) {
      await reloadNginx();
      console.error(`[nginx] Cleaned up ${demoFiles.length} stale config(s)`);
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
