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

// ── Branch name → Moodle git branch ──────────────────────────────────────────

const MOODLE_BRANCH_MAP: Record<MoodleVersion, string> = {
  "4.3": "MOODLE_403_STABLE",
  "4.4": "MOODLE_404_STABLE",
  "4.5": "MOODLE_405_STABLE",
  "5.0": "MOODLE_500_STABLE",
  "5.1": "main",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  // MOODLE_DOCKER_WEB_HOST tells moodle-docker what hostname to put in config.php ($CFG->wwwroot).
  // Without it Moodle defaults to localhost, breaking cookies and redirects in production.
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

// ── Core operations ───────────────────────────────────────────────────────────

/**
 * Clone moodle-docker and moodle core for a new instance.
 */
export async function provisionInstance(instance: MoodleInstance): Promise<void> {
  const instanceDir = path.join(WORK_DIR, instance.id);
  await fs.mkdir(instanceDir, { recursive: true });

  // 1. Clone moodle-docker (shallow, once per instance dir)
  if (!await exists(instance.moodleDockerDir)) {
    const cachedDocker = `${MOODLE_CACHE_DIR}/moodle-docker`;
    await run(`cp -r ${cachedDocker} ${instance.moodleDockerDir}`);
  }

  // 2. Clone Moodle core (shallow, correct branch)
  if (!await exists(instance.moodleDir)) {
    const moodleBranch = MOODLE_BRANCH_MAP[instance.moodleVersion];
    const cacheKey = `moodle-${instance.moodleVersion.replace(".", "")}`;
    const cachedMoodle = `${MOODLE_CACHE_DIR}/${cacheKey}`;
    const { stat } = await import("fs/promises");
    const cacheExists = await stat(cachedMoodle).then(() => true).catch(() => false);
    if (cacheExists) {
      await run(`cp -r ${cachedMoodle} ${instance.moodleDir}`);
    } else {
      await run(
        `git clone --depth 1 -b ${moodleBranch} ${MOODLE_REPO} ${instance.moodleDir}`
      );
    }
  }

  // 3. Copy moodle-docker config.php template
  await run(
    `cp ${instance.moodleDockerDir}/config.docker-template.php ${instance.moodleDir}/config.php`
  );
}

/**
 * Copy a plugin into the Moodle instance's directory tree.
 * pluginSrcPath: local path to plugin root (containing version.php)
 * pluginType: e.g. "mod", "local", "block"
 * pluginName: e.g. "eledialeitnerflow"
 */
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

/**
 * Start Docker containers for a Moodle instance.
 * Wenn snapshotFile angegeben: Snapshot restaurieren statt leere DB.
 */
export async function startContainers(
  instance: MoodleInstance,
  snapshotFile?: string
): Promise<void> {
  const env = envString(composeEnv(instance));
  const compose = path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");

  console.error(`[docker] Starting containers for ${instance.id}…`);
  await run(`${env} ${compose} up -d`, instance.moodleDockerDir);

  // Warten bis DB erreichbar ist (Polling, bis zu 120s)
  await waitForDatabase(instance, 120);

  if (snapshotFile) {
    // Snapshot-Modus: DB aus Dump restaurieren — Import passiert in snapshot.ts
    console.error(`[docker] Snapshot-Modus: ${snapshotFile}`);
  } else {
    // Frisch-Modus: Moodle-DB initialisieren
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
      // Moodle gibt "already installed" zurück wenn DB schon existiert — nicht fatal
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

/**
 * Pollt wait_for_db.php bis die Datenbank erreichbar ist oder Timeout abläuft.
 */
async function waitForDatabase(instance: MoodleInstance, timeoutSecs: number): Promise<void> {
  const env = envString(composeEnv(instance));
  const compose = path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");
  const deadline = Date.now() + timeoutSecs * 1000;

  console.error(`[docker] Waiting for database (max ${timeoutSecs}s)…`);
  while (Date.now() < deadline) {
    try {
      await execAsync(
        `${env} ${compose} exec -T webserver php admin/cli/wait_for_db.php`,
        { cwd: instance.moodleDockerDir, maxBuffer: 1024 * 1024 }
      );
      console.error(`[docker] Database is ready`);
      return;
    } catch {
      await new Promise<void>(r => setTimeout(r, 5000));
    }
  }
  throw new Error(`[docker] Database not ready after ${timeoutSecs}s`);
}

/**
 * Stop and destroy containers + volumes for an instance.
 */
export async function stopContainers(instance: MoodleInstance): Promise<void> {
  const env = envString(composeEnv(instance));
  const compose = path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");
  try {
    await run(`${env} ${compose} down -v`, instance.moodleDockerDir);
  } catch {
    // Best effort — containers may already be gone
  }
}

/**
 * Remove instance directory from disk.
 */
export async function cleanupInstanceDir(instance: MoodleInstance): Promise<void> {
  const instanceDir = path.join(WORK_DIR, instance.id);
  try {
    await run(`rm -rf ${instanceDir}`);
  } catch {
    // Best effort
  }
}

/**
 * Get last N lines of webserver container logs.
 */
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

/**
 * Run PHPUnit tests for a specific plugin component.
 * Returns raw output + exit code.
 */
export async function runPhpunit(
  instance: MoodleInstance,
  component?: string  // e.g. "mod_eledialeitnerflow" — omit to run all
): Promise<{ output: string; exitCode: number }> {
  const env = envString(composeEnv(instance));
  const compose = path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");

  // Init PHPUnit
  await run(
    `${env} ${compose} exec -T webserver php admin/tool/phpunit/cli/init.php`,
    instance.moodleDockerDir
  ).catch(() => {/* already initialized */});

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

/**
 * Run Behat tests for a specific tag.
 */
export async function runBehat(
  instance: MoodleInstance,
  tags?: string  // e.g. "@mod_eledialeitnerflow"
): Promise<{ output: string; exitCode: number }> {
  const env = envString(composeEnv(instance));
  const compose = path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");

  // Init Behat
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

// ── Utilities ─────────────────────────────────────────────────────────────────

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
