// src/services/docker.ts
// Wraps moodlehq/moodle-docker compose commands.
// All heavy lifting happens here via child_process.exec.
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
const execAsync = promisify(exec);
const MOODLE_DOCKER_REPO = "https://github.com/moodlehq/moodle-docker.git";
const MOODLE_REPO = "https://github.com/moodle/moodle.git";
const MOODLE_CACHE_DIR = process.env.MOODLE_CACHE_DIR ?? "/opt/moodle-cache";
const WORK_DIR = process.env.RUNBOT_WORK_DIR ?? "/opt/runbot";
// ── Branch name → Moodle git branch ──────────────────────────────────────────
const MOODLE_BRANCH_MAP = {
    "4.3": "MOODLE_403_STABLE",
    "4.4": "MOODLE_404_STABLE",
    "4.5": "MOODLE_405_STABLE",
    "5.0": "MOODLE_500_STABLE",
    "5.1": "main",
};
// ── Helpers ───────────────────────────────────────────────────────────────────
async function run(cmd, cwd) {
    try {
        return await execAsync(cmd, { cwd, maxBuffer: 10 * 1024 * 1024 });
    }
    catch (err) {
        const e = err;
        throw new Error(`Command failed: ${cmd}\nstdout: ${e.stdout ?? ""}\nstderr: ${e.stderr ?? e.message ?? ""}`);
    }
}
function composeEnv(instance) {
    return {
        COMPOSE_PROJECT_NAME: instance.composeProject,
        MOODLE_DOCKER_WWWROOT: instance.moodleDir,
        MOODLE_DOCKER_DB: instance.db,
        MOODLE_DOCKER_PHP_VERSION: instance.phpVersion,
        MOODLE_DOCKER_WEB_PORT: `0.0.0.0:${instance.webPort}`,
        MOODLE_DOCKER_BROWSER: "chrome",
        PATH: process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    };
}
function envString(env) {
    return Object.entries(env)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
}
// ── Core operations ───────────────────────────────────────────────────────────
/**
 * Clone moodle-docker and moodle core for a new instance.
 */
export async function provisionInstance(instance) {
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
        }
        else {
            await run(`git clone --depth 1 -b ${moodleBranch} ${MOODLE_REPO} ${instance.moodleDir}`);
        }
    }
    // 3. Copy moodle-docker config.php template
    await run(`cp ${instance.moodleDockerDir}/config.docker-template.php ${instance.moodleDir}/config.php`);
}
/**
 * Copy a plugin into the Moodle instance's directory tree.
 * pluginSrcPath: local path to plugin root (containing version.php)
 * pluginType: e.g. "mod", "local", "block"
 * pluginName: e.g. "eledialeitnerflow"
 */
export async function installPlugin(instance, pluginSrcPath, pluginType, pluginName) {
    const dest = path.join(instance.moodleDir, pluginTypeDir(pluginType), pluginName);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await run(`cp -r ${pluginSrcPath} ${dest}`);
}
/**
 * Start Docker containers for a Moodle instance.
 * Wenn snapshotFile angegeben: Snapshot restaurieren statt leere DB.
 */
export async function startContainers(instance, snapshotFile) {
    const env = envString(composeEnv(instance));
    const compose = path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");
    await run(`${env} ${compose} up -d`, instance.moodleDockerDir);
    // Warten bis DB bereit
    await run(`${env} ${compose} exec -T webserver php admin/cli/wait_for_db.php || true`, instance.moodleDockerDir);
    if (snapshotFile) {
        // Snapshot-Modus: DB aus Dump restaurieren (schnell, mit Demo-Daten)
        // Import passiert in snapshot.ts nach diesem Aufruf
        console.error(`[docker] Snapshot-Modus: ${snapshotFile}`);
    }
    else {
        // Frisch-Modus: leere Moodle-DB anlegen
        await run(`${env} ${compose} exec -T webserver php admin/cli/install_database.php ` +
            `--agree-license --fullname="eLeDia Demo ${instance.id}" ` +
            `--shortname="${instance.id}" --adminpass="demo1234" --adminemail="admin@eledia.de" || true`, instance.moodleDockerDir);
    }
}
/**
 * Stop and destroy containers + volumes for an instance.
 */
export async function stopContainers(instance) {
    const env = envString(composeEnv(instance));
    const compose = path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");
    try {
        await run(`${env} ${compose} down -v`, instance.moodleDockerDir);
    }
    catch {
        // Best effort — containers may already be gone
    }
}
/**
 * Remove instance directory from disk.
 */
export async function cleanupInstanceDir(instance) {
    const instanceDir = path.join(WORK_DIR, instance.id);
    try {
        await run(`rm -rf ${instanceDir}`);
    }
    catch {
        // Best effort
    }
}
/**
 * Get last N lines of webserver container logs.
 */
export async function getLogs(instance, lines = 100) {
    const env = envString(composeEnv(instance));
    const compose = path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");
    try {
        const { stdout } = await run(`${env} ${compose} logs --tail=${lines} webserver`, instance.moodleDockerDir);
        return stdout;
    }
    catch (e) {
        return `Error fetching logs: ${String(e)}`;
    }
}
/**
 * Run PHPUnit tests for a specific plugin component.
 * Returns raw output + exit code.
 */
export async function runPhpunit(instance, component // e.g. "mod_eledialeitnerflow" — omit to run all
) {
    const env = envString(composeEnv(instance));
    const compose = path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");
    // Init PHPUnit
    await run(`${env} ${compose} exec -T webserver php admin/tool/phpunit/cli/init.php`, instance.moodleDockerDir).catch(() => { });
    const target = component ?? "";
    let { stdout, stderr } = await execAsync(`${env} ${compose} exec -T webserver vendor/bin/phpunit ${target} 2>&1`, { cwd: instance.moodleDockerDir, maxBuffer: 20 * 1024 * 1024 }).catch((e) => ({
        stdout: (e.stdout ?? "") + (e.stderr ?? ""),
        stderr: "",
        code: e.code ?? 1,
    }));
    return { output: stdout + stderr, exitCode: stdout.includes("FAILURES") ? 1 : 0 };
}
/**
 * Run Behat tests for a specific tag.
 */
export async function runBehat(instance, tags // e.g. "@mod_eledialeitnerflow"
) {
    const env = envString(composeEnv(instance));
    const compose = path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");
    // Init Behat
    await run(`${env} ${compose} exec -T webserver php admin/tool/behat/cli/init.php`, instance.moodleDockerDir).catch(() => { });
    const tagFlag = tags ? `--tags=${tags}` : "";
    const { stdout } = await execAsync(`${env} ${compose} exec -T -u www-data webserver ` +
        `php admin/tool/behat/cli/run.php ${tagFlag} 2>&1`, { cwd: instance.moodleDockerDir, maxBuffer: 20 * 1024 * 1024 }).catch((e) => ({
        stdout: (e.stdout ?? "") + (e.stderr ?? ""),
    }));
    return {
        output: stdout,
        exitCode: stdout.includes("failed") ? 1 : 0,
    };
}
// ── Utilities ─────────────────────────────────────────────────────────────────
async function exists(p) {
    try {
        await fs.access(p);
        return true;
    }
    catch {
        return false;
    }
}
function pluginTypeDir(type) {
    const map = {
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
//# sourceMappingURL=docker.js.map