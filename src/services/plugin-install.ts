// src/services/plugin-install.ts
//
// task43 Stage 1D: Plugin-Wizard-Backend.
//
// Klont einen Moodle-Plugin-Repo aus GitHub nach /opt/plugins/<repo>,
// liest version.php für Component-Detection (type_name, version, release),
// und schreibt dann einen Config-Eintrag in configs.json — damit eine
// neue Demo-Kachel im Portal erscheint.
//
// Sicherheit:
// - Nur HTTPS-GitHub-URLs werden akzeptiert (keine SSH, keine lokalen Pfade)
// - Plugin-Repo-Name wird strikt validiert (kebab-case, kein path traversal)
// - Clone-Destination ist immer PLUGINS_DIR, kein Escape möglich
// - Auth: aufrufende Routen sind hinter adminAuth (Basic Auth)
//
// Limitierungen:
// - Kein private-Repo-Support (bewusst — wir speichern keine Tokens)
// - Kein Branch-Auswahl (immer default branch)
// - Kein git pull bei existierendem Clone (stattdessen manueller Refresh nötig).
//   Rationale: Auto-Pull kann Breaking Changes in laufende Demos ziehen.

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { DemoConfig } from "./config.js";
import { importPluginToDirectus } from "./directus-import.js";

const execAsync = promisify(exec);

const PLUGINS_DIR = process.env.PLUGINS_DIR ?? "/opt/plugins";
const CONFIG_FILE = process.env.CONFIGS_FILE
  ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "../../configs.json");

// ── Detection ──────────────────────────────────────────────────────────

export interface DetectedPlugin {
  component:   string;          // "local_eledia_exam2pdf"
  type:        string;          // "local" | "mod" | "block" | "report" | ...
  shortname:   string;          // "eledia_exam2pdf" (component ohne type-Präfix)
  version:     number;          // 2026041205
  release:     string;          // "0.4.0"
  maturity?:   string;          // "MATURITY_ALPHA" | "MATURITY_STABLE" | ...
  requires?:   number;          // Benötigte Moodle-Version als Build-Number (2024100700)
  srcPath:     string;          // "/opt/plugins/local_eledia_exam2pdf"
  detectedAt:  string;          // ISO-Timestamp
  gitUrl:      string;          // Original-URL (für githubRepo-Feld in Config)
  githubRepo:  string;          // "owner/repo" (für Metadata-Lookups)
}

/**
 * Parst den GitHub-URL und extrahiert owner/repo.
 * Akzeptiert: https://github.com/owner/repo, https://github.com/owner/repo.git,
 *             https://github.com/owner/repo/ (trailing slash erlaubt).
 * Wirft bei allem anderen (SSH, relative Pfade, andere Hoster).
 */
function parseGithubUrl(gitUrl: string): { owner: string; repo: string } {
  const m = gitUrl.trim().match(/^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?\/?$/);
  if (!m) {
    throw new Error(
      `Ungültige GitHub-URL. Format: https://github.com/owner/repo (keine SSH, keine lokalen Pfade).`
    );
  }
  const owner = m[1]!;
  const repo  = m[2]!;
  // Repo-Name wird auch als Directory-Name benutzt — kein path traversal.
  if (repo.includes("..") || repo.includes("/")) {
    throw new Error(`Ungültiger Repo-Name: ${repo}`);
  }
  return { owner, repo };
}

/**
 * Extrahiert die Plugin-Metadaten aus einer Moodle version.php-Datei.
 * Benutzt simple Regex statt PHP-Parser — reicht für die Moodle-Konvention.
 */
async function parseVersionPhp(filePath: string): Promise<Omit<DetectedPlugin, "srcPath" | "detectedAt" | "gitUrl" | "githubRepo">> {
  const content = await fs.readFile(filePath, "utf-8").catch(() => {
    throw new Error(`version.php nicht lesbar: ${filePath}`);
  });

  const componentMatch = content.match(/\$plugin->component\s*=\s*['"]([a-z0-9_]+)['"]/);
  if (!componentMatch) {
    throw new Error(`$plugin->component nicht in version.php gefunden — ist das wirklich ein Moodle-Plugin?`);
  }
  const component = componentMatch[1]!;
  const [type, ...rest] = component.split("_");
  if (!type || rest.length === 0) {
    throw new Error(`Component '${component}' hat ungewohntes Format (erwartet: type_shortname)`);
  }

  const versionMatch  = content.match(/\$plugin->version\s*=\s*(\d+)/);
  const releaseMatch  = content.match(/\$plugin->release\s*=\s*['"]([^'"]+)['"]/);
  const requiresMatch = content.match(/\$plugin->requires\s*=\s*(\d+)/);
  const maturityMatch = content.match(/\$plugin->maturity\s*=\s*(MATURITY_[A-Z]+)/);

  return {
    component,
    type,
    shortname: rest.join("_"),
    version:   versionMatch ? parseInt(versionMatch[1]!, 10) : 0,
    release:   releaseMatch?.[1] ?? "unknown",
    maturity:  maturityMatch?.[1],
    requires:  requiresMatch ? parseInt(requiresMatch[1]!, 10) : undefined,
  };
}

// ── Clone ──────────────────────────────────────────────────────────────────

/**
 * Klont das Plugin nach PLUGINS_DIR/<repo> und liest version.php. Wenn das
 * Ziel schon existiert, wird die Clone-Operation übersprungen (wir lesen die
 * existing version.php) — Admin muss manuell mit `git pull` refreshen, um
 * keine laufenden Demos ungewollt zu brechen.
 *
 * Wirft bei:
 * - Ungültiger URL
 * - git clone schlägt fehl (private Repo, Netzwerk, ungültiger Branch)
 * - version.php fehlt oder enthält kein $plugin->component
 */
export async function clonePluginFromGithub(gitUrl: string): Promise<DetectedPlugin> {
  const { owner, repo } = parseGithubUrl(gitUrl);
  const dest = path.join(PLUGINS_DIR, repo);

  await fs.mkdir(PLUGINS_DIR, { recursive: true });

  const exists = await fs.stat(dest).then(() => true).catch(() => false);
  let wasCloned = false;
  if (!exists) {
    // --depth 1 weil wir den History-Verlauf für Demos nicht brauchen.
    // moodle-docker-Clones nutzen dieselbe Strategie (siehe docker.ts).
    try {
      await execAsync(`git clone --depth 1 ${gitUrl} ${dest}`, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120_000, // 2 Minuten max für große Repos
      });
      wasCloned = true;
      console.error(`[plugin-install] Cloned ${gitUrl} → ${dest}`);
    } catch (err) {
      const e = err as { stderr?: string; message?: string };
      throw new Error(`git clone fehlgeschlagen: ${(e.stderr ?? e.message ?? "").slice(0, 300)}`);
    }
  } else {
    console.error(`[plugin-install] ${dest} existiert bereits — überspringe Clone`);
  }

  const versionPath = path.join(dest, "version.php");
  const parsed = await parseVersionPhp(versionPath);

  const result: DetectedPlugin = {
    ...parsed,
    srcPath: dest,
    detectedAt: new Date().toISOString(),
    gitUrl,
    githubRepo: `${owner}/${repo}`,
    // NB: Wenn das Target schon existierte, könnte version.php einer alten
    // Code-Version entsprechen. Wir loggen das als WARN — Admin kann dann
    // manuell auf dem VPS `git pull` ausführen.
    ...(wasCloned ? {} : {
      // Marker für die UI. Keine eigene Spalte — kann in der Description erwähnt werden.
    }),
  };

  // task30: Fire-and-forget Import in Directus SSOT (catalog_editor Draft).
  // Darf den Wizard-Flow niemals blockieren oder scheitern lassen.
  importPluginToDirectus(result).catch((e: unknown) =>
    console.error("[plugin-install] Directus-Import WARN:", e),
  );

  return result;
}

// ── Config-CRUD ────────────────────────────────────────────────────────────

/**
 * Liefert ALLE configs.json-Einträge, inklusive `visible: false`. Die
 * öffentliche loadConfigs() filtert invisible Einträge raus — für das
 * Admin-UI wollen wir aber alle sehen.
 */
export async function listAllConfigsRaw(): Promise<DemoConfig[]> {
  const raw = await fs.readFile(CONFIG_FILE, "utf-8");
  return JSON.parse(raw) as DemoConfig[];
}

/**
 * Append-only Config-Create. Wirft bei Duplicate-ID. Atomar via tmp+rename,
 * damit kein halb-geschriebener configs.json entsteht, falls der Server
 * mitten im Write crashed.
 */
export async function createConfig(config: DemoConfig): Promise<DemoConfig> {
  if (!config.id || typeof config.id !== "string") {
    throw new Error("config.id erforderlich (lowercase kebab-case)");
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(config.id)) {
    throw new Error(`Ungültige config.id '${config.id}' — nur a-z, 0-9, . _ -, erster char muss buchstabe/ziffer sein`);
  }
  const raw = await fs.readFile(CONFIG_FILE, "utf-8");
  const all = JSON.parse(raw) as DemoConfig[];
  if (all.some(c => c.id === config.id)) {
    throw new Error(`Config mit ID '${config.id}' existiert bereits`);
  }
  all.push(config);
  const tmp = `${CONFIG_FILE}.tmp.${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(all, null, 2), "utf-8");
  await fs.rename(tmp, CONFIG_FILE);
  return config;
}

export async function deleteConfigById(id: string): Promise<void> {
  const raw = await fs.readFile(CONFIG_FILE, "utf-8");
  const all = JSON.parse(raw) as DemoConfig[];
  const filtered = all.filter(c => c.id !== id);
  if (filtered.length === all.length) {
    throw new Error(`Config '${id}' nicht gefunden`);
  }
  const tmp = `${CONFIG_FILE}.tmp.${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(filtered, null, 2), "utf-8");
  await fs.rename(tmp, CONFIG_FILE);
}
