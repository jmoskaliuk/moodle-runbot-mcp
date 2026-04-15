// src/services/docker.ts
// Wraps moodlehq/moodle-docker compose commands.
// All heavy lifting happens here via child_process.exec.

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import type { MoodleInstance, PhpVersion, DbType, MoodleVersion } from "../types.js";

const execAsync = promisify(exec);

const MOODLE_DOCKER_REPO = "https://github.com/moodlehq/moodle-docker.git";
const MOODLE_REPO = "https://github.com/moodle/moodle.git";
const MOODLE_CACHE_DIR = process.env.MOODLE_CACHE_DIR ?? "/opt/moodle-cache";
const WORK_DIR = process.env.RUNBOT_WORK_DIR ?? "/opt/runbot";

// ── Branch name → Moodle git branch ─────────────────────────────
// "dev" → main (aktueller Entwicklungsstand aus https://github.com/moodle/moodle).
// Download-URLs auf moodle.org beziehen sich auf die gleichen Branches:
// https://download.moodle.org/releases/development/ → main

const MOODLE_BRANCH_MAP: Record<MoodleVersion, string> = {
  "4.3": "MOODLE_403_STABLE",
  "4.4": "MOODLE_404_STABLE",
  "4.5": "MOODLE_405_STABLE",
  "5.0": "MOODLE_500_STABLE",
  "5.1": "MOODLE_501_STABLE",
  "dev": "main",
};

// ── Helpers ────────────────────────────────────────────────────

async function run(cmd: string, cwd?: string): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execAsync(cmd, { cwd, maxBuffer: 10 * 1024 * 1024 });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    throw new Error(
      `Command failed: ${cmd}\nstdout: ${e.stdout ?? ""}\nstderr: ${e.stderr ?? e.message ?? ""}`
    );
  }
}

function composeEnv(instance: MoodleInstance): Record<string, string> {
  const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "";
  const webHost = BASE_DOMAIN
    ? `${instance.id}.${BASE_DOMAIN}`
    : `localhost:${instance.webPort}`;

  return {
    COMPOSE_PROJECT_NAME: instance.composeProject,
    MOODLE_DOCKER_WWWROOT: instance.moodleDir,
    MOODLE_DOCKER_DB: instance.db,
    MOODLE_DOCKER_PHP_VERSION: instance.phpVersion,
    MOODLE_DOCKER_WEB_PORT: `0.0.0.0:${instance.webPort}`,
    MOODLE_DOCKER_WEB_HOST: webHost,
    MOODLE_DOCKER_BROWSER: "chrome",
    PATH: process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  };
}

function envString(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

// ── Core operations ─────────────────────────────────────────────────

export async function provisionInstance(instance: MoodleInstance): Promise<void> {
  const instanceDir = path.join(WORK_DIR, instance.id);
  await fs.mkdir(instanceDir, { recursive: true });

  if (!await exists(instance.moodleDockerDir)) {
    const cachedDocker = `${MOODLE_CACHE_DIR}/moodle-docker`;
    await run(`cp -r ${cachedDocker} ${instance.moodleDockerDir}`);
  }

  if (!await exists(instance.moodleDir)) {
    const moodleBranch = MOODLE_BRANCH_MAP[instance.moodleVersion];
    const cacheKey = `moodle-${instance.moodleVersion.replace(".", "")}`;
    const cachedMoodle = `${MOODLE_CACHE_DIR}/${cacheKey}`;
    const { stat } = await import("fs/promises");
    const cacheExists = await stat(cachedMoodle).then(() => true).catch(() => false);
    if (cacheExists && instance.moodleVersion !== "dev") {
      await run(`cp -r ${cachedMoodle} ${instance.moodleDir}`);
    } else {
      await run(
        `git clone --depth 1 -b ${moodleBranch} ${MOODLE_REPO} ${instance.moodleDir}`
      );
    }
  }

  const configPath = path.join(instance.moodleDir, "config.php");
  await run(
    `cp ${instance.moodleDockerDir}/config.docker-template.php ${configPath}`
  );

  const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "";
  if (BASE_DOMAIN) {
    await patchConfigForProduction(configPath, instance, BASE_DOMAIN);
  }

  const runbotAdminSrc = path.join(process.cwd(), "moodle-plugins", "local_runbotadmin");
  const runbotAdminDst = path.join(instance.moodleDir, "local", "runbotadmin");
  try {
    const { stat } = await import("fs/promises");
    await stat(runbotAdminSrc);
    await fs.mkdir(path.dirname(runbotAdminDst), { recursive: true });
    await run(`cp -r ${runbotAdminSrc} ${runbotAdminDst}`);
    console.error(`[docker] task37: local_runbotadmin plugin installed into ${runbotAdminDst}`);
  } catch (e) {
    console.error(
      `[docker] WARN task37: local_runbotadmin source not found at ${runbotAdminSrc} — skipping. ` +
      `In-Moodle admin GUI will not be available for this instance. (${String(e).slice(0, 120)})`
    );
  }
}

async function patchConfigForProduction(
  configPath: string,
  instance: MoodleInstance,
  baseDomain: string
): Promise<void> {
  const wwwroot = `https://${instance.id}.${baseDomain}`;

  const runbotApiUrl =
    process.env.RUNBOT_PUBLIC_API_URL ?? (baseDomain ? `https://${baseDomain}` : "http://localhost:3000");
  const runbotToken    = instance.apiToken ?? "";
  const runbotConfigId = instance.configId ?? "";

  const overrideBlock = `
// ── eLeDia Runbot overrides ───────────────────────────────
// Auto-generiert von src/services/docker.ts — nicht manuell bearbeiten.
$CFG->wwwroot  = '${wwwroot}';
$CFG->sslproxy = true;
$CFG->tool_replace_allowdb = true;

// task36: Debug-Anzeige komplett deaktivieren.
$CFG->debug           = 0;
$CFG->debugdisplay    = 0;
$CFG->debugsmtp       = 0;
$CFG->debugpageinfo   = 0;
$CFG->debugvalidators = 0;
$CFG->debugstringids  = 0;
$CFG->perfdebug       = 0;

// task37: Context für local_runbotadmin.
$CFG->runbot_instance_id = '${instance.id}';
$CFG->runbot_config_id   = '${runbotConfigId}';
$CFG->runbot_api_token   = '${runbotToken}';
$CFG->runbot_api_url     = '${runbotApiUrl}';

unset($CFG->behat_wwwroot);
// ─────────────────────────────────────────────────────────────────
`;

  let cfg = await fs.readFile(configPath, "utf-8");

  const setupRequireRe =
    /(require_once\s*\(\s*__DIR__\s*\.\s*['"]\/lib\/setup\.php['"]\s*\)\s*;)/;

  if (setupRequireRe.test(cfg)) {
    cfg = cfg.replace(setupRequireRe, `${overrideBlock}\n$1`);
  } else {
    console.error(
      `[docker] WARNING: require_once('/lib/setup.php') nicht in ${configPath} gefunden — ` +
      `Override-Block wird am Ende angehängt.`
    );
    cfg += "\n" + overrideBlock + "\n";
  }

  await fs.writeFile(configPath, cfg, "utf-8");
}

export async function installPlugin(
  instance: MoodleInstance,
  pluginSrcPath: string,
  pluginType: string,
  pluginName: string
): Promise<void> {
  const dest = path.join(instance.moodleDir, pluginTypeDir(pluginType), pluginName);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await run(`cp -r ${pluginSrcPath} ${dest}`);
}

export async function startContainers(
  instance: MoodleInstance,
  snapshotFile?: string
): Promise<void> {
  const env = envString(composeEnv(instance));
  const compose = path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");

  console.error(`[docker] Starting containers for ${instance.id}…`);
  await run(`${env} ${compose} up -d`, instance.moodleDockerDir);

  await waitForDatabase(instance, 120);

  if (snapshotFile) {
    console.error(`[docker] Snapshot-Modus: ${snapshotFile}`);
  } else {
    console.error(`[docker] Running install_database.php…`);
    try {
      const { stdout, stderr } = await execAsync(
        `${env} ${compose} exec -T webserver php admin/cli/install_database.php ` +
        `--agree-license --fullname="eLeDia Demo ${instance.id}" ` +
        `--shortname="${instance.id}" --adminpass="demo1234" --adminemail="admin@eledia.de"`,
        { cwd: instance.moodleDockerDir, maxBuffer: 10 * 1024 * 1024 }
      );
      console.error(`[docker] install_database stdout: ${stdout.slice(0, 500)}`);
      if (stderr) console.error(`[docker] install_database stderr: ${stderr.slice(0, 500)}`);
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      const combined = `${e.stdout ?? ""} ${e.stderr ?? e.message ?? ""}`;
      if (combined.includes("already installed") || combined.includes("already exists") || combined.includes("Site already installed")) {
        console.error(`[docker] Moodle already installed — OK`);
      } else {
        throw new Error(
          `install_database.php failed:\nstdout: ${e.stdout ?? ""}\nstderr: ${e.stderr ?? e.message ?? ""}`
        );
      }
    }
    console.error(`[docker] Moodle database ready for ${instance.id}`);
  }
}

async function waitForDatabase(instance: MoodleInstance, timeoutSecs: number): Promise<void> {
  const env = envString(composeEnv(instance));
  const compose = path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");
  const deadline = Date.now() + timeoutSecs * 1000;

  await new Promise<void>(r => setTimeout(r, 8000));

  const isPostgres = instance.db === "pgsql";
  const healthCmd = isPostgres
    ? `${env} ${compose} exec -T db pg_isready -U moodle`
    : `${env} ${compose} exec -T db mysqladmin ping -h localhost --silent`;

  console.error(`[docker] Waiting for database (max ${timeoutSecs}s)…`);

  while (Date.now() < deadline) {
    try {
      const { stdout, stderr } = await execAsync(healthCmd, {
        cwd: instance.moodleDockerDir, maxBuffer: 512 * 1024
      });
      console.error(`[docker] Database ready — ${stdout.trim() || stderr.trim()}`);
      await new Promise<void>(r => setTimeout(r, 2000));
      return;
    } catch (e) {
      const msg = (e as Error).message?.slice(0, 120) ?? "";
      console.error(`[docker] DB not ready yet: ${msg}`);
      await new Promise<void>(r => setTimeout(r, 5000));
    }
  }
  throw new Error(`[docker] Database not ready after ${timeoutSecs}s`);
}

/**
 * task43: Run admin/cli/upgrade.php --non-interactive --allow-unstable in the
 * webserver container. Used by the snapshot rebuild flow to bring an old
 * snapshot's DB schema up to the current Moodle code version before re-dumping.
 *
 * --allow-unstable lets us cross major version boundaries (e.g. 5.0 → 5.1).
 * --non-interactive skips all confirmation prompts. Returns the combined
 * stdout/stderr for diagnostics.
 *
 * Throws on non-zero exit code (Moodle returns >0 when upgrade fails).
 * The caller is expected to log/surface the error to the admin UI.
 */
export async function runUpgrade(instance: MoodleInstance): Promise<string> {
  const env = envString(composeEnv(instance));
  const compose = path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");
  console.error(`[docker] Running admin/cli/upgrade.php for ${instance.id}…`);
  try {
    const { stdout, stderr } = await execAsync(
      `${env} ${compose} exec -T webserver php admin/cli/upgrade.php --non-interactive --allow-unstable`,
      { cwd: instance.moodleDockerDir, maxBuffer: 20 * 1024 * 1024 }
    );
    console.error(`[docker] upgrade.php finished for ${instance.id} (${stdout.length} bytes stdout)`);
    return stdout + (stderr ? `\n--- STDERR ---\n${stderr}` : "");
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    throw new Error(
      `upgrade.php failed for ${instance.id}:\nstdout: ${(e.stdout ?? "").slice(-2000)}\nstderr: ${(e.stderr ?? e.message ?? "").slice(-2000)}`
    );
  }
}

export async function setSiteName(instance: MoodleInstance, siteName: string): Promise<void> {
  const clean = siteName.replace(/['"\\`;]/g, "").slice(0, 200);
  if (!clean) {
    console.error(`[docker] setSiteName: leerer Name für ${instance.id}, skip`);
    return;
  }
  const env = envString(composeEnv(instance));
  const compose = path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");

  const shortHashSuffix = instance.id.slice(-6);
  const shortname = `${clean}-${shortHashSuffix}`.slice(0, 255);

  const sql = `UPDATE mdl_course SET fullname='${clean}', shortname='${shortname}' WHERE id=1;`;

  try {
    if (instance.db === "pgsql") {
      await execAsync(
        `${env} ${compose} exec -T db psql -U moodle -d moodle -c "${sql}"`,
        { cwd: instance.moodleDockerDir, maxBuffer: 1 * 1024 * 1024 }
      );
    } else {
      await execAsync(
        `${env} ${compose} exec -T db mysql -u root -proot moodle -e "${sql}"`,
        { cwd: instance.moodleDockerDir, maxBuffer: 1 * 1024 * 1024 }
      );
    }
    console.error(`[docker] setSiteName OK: ${instance.id} → "${clean}"`);
  } catch (e) {
    console.error(`[docker] setSiteName FAIL for ${instance.id}:`, (e as Error).message?.slice(0, 300));
  }

  try {
    await execAsync(
      `${env} ${compose} exec -T webserver php admin/cli/purge_caches.php`,
      { cwd: instance.moodleDockerDir, maxBuffer: 2 * 1024 * 1024 }
    );
  } catch {}
}

export async function stopContainers(instance: MoodleInstance): Promise<void> {
  const env = envString(composeEnv(instance));
  const compose = path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");
  try {
    await run(`${env} ${compose} down -v`, instance.moodleDockerDir);
  } catch {}
}

export async function cleanupInstanceDir(instance: MoodleInstance): Promise<void> {
  const instanceDir = path.join(WORK_DIR, instance.id);
  try {
    await run(`rm -rf ${instanceDir}`);
  } catch {}
}

export async function getLogs(instance: MoodleInstance, lines = 100): Promise<string> {
  const env = envString(composeEnv(instance));
  const compose = path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");
  try {
    const { stdout } = await run(
      `${env} ${compose} logs --tail=${lines} webserver`,
      instance.moodleDockerDir
    );
    return stdout;
  } catch (e: unknown) {
    return `Error fetching logs: ${String(e)}`;
  }
}

export async function runPhpunit(
  instance: MoodleInstance,
  component?: string
): Promise<{ output: string; exitCode: number }> {
  const env = envString(composeEnv(instance));
  const compose = path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");

  await run(
    `${env} ${compose} exec -T webserver php admin/tool/phpunit/cli/init.php`,
    instance.moodleDockerDir
  ).catch(() => {});

  const target = component ?? "";
  let { stdout, stderr } = await execAsync(
    `${env} ${compose} exec -T webserver vendor/bin/phpunit ${target} 2>&1`,
    { cwd: instance.moodleDockerDir, maxBuffer: 20 * 1024 * 1024 }
  ).catch((e: { stdout?: string; stderr?: string; code?: number }) => ({
    stdout: (e.stdout ?? "") + (e.stderr ?? ""),
    stderr: "",
    code: e.code ?? 1,
  }));

  return { output: stdout + stderr, exitCode: stdout.includes("FAILURES") ? 1 : 0 };
}

export async function runBehat(
  instance: MoodleInstance,
  tags?: string
): Promise<{ output: string; exitCode: number }> {
  const env = envString(composeEnv(instance));
  const compose = path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");

  await run(
    `${env} ${compose} exec -T webserver php admin/tool/behat/cli/init.php`,
    instance.moodleDockerDir
  ).catch(() => {});

  const tagFlag = tags ? `--tags=${tags}` : "";
  const { stdout } = await execAsync(
    `${env} ${compose} exec -T -u www-data webserver ` +
    `php admin/tool/behat/cli/run.php ${tagFlag} 2>&1`,
    { cwd: instance.moodleDockerDir, maxBuffer: 20 * 1024 * 1024 }
  ).catch((e: { stdout?: string; stderr?: string }) => ({
    stdout: (e.stdout ?? "") + (e.stderr ?? ""),
  }));

  return {
    output: stdout,
    exitCode: stdout.includes("failed") ? 1 : 0,
  };
}

// ── Utilities ──────────────────────────────────────────────────────

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function pluginTypeDir(type: string): string {
  const map: Record<string, string> = {
    mod: "mod",
    local: "local",
    block: "blocks",
    tool: "admin/tool",
    report: "report",
    theme: "theme",
    auth: "auth",
    enrol: "enrol",
    qtype: "question/type",
    filter: "filter",
  };
  return map[type] ?? type;
}
