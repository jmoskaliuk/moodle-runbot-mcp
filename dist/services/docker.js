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
function envString(env) {
    return Object.entries(env)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
}
// ── Core operations ───────────────────────────────────────────────────────────
/**
 * Clone moodle-docker und moodle core für eine neue Instanz. Patcht config.php
 * für Produktionsbetrieb hinter nginx:
 *   - $CFG->wwwroot auf https://{id}.{BASE_DOMAIN} ohne Port-Suffix
 *   - $CFG->sslproxy = true (nginx terminiert TLS extern)
 *
 * Der Override-Block wird VOR require_once('/lib/setup.php') eingefügt, damit
 * er alle vorherigen Template-Assignments überschreibt. Ohne diesen Patch hängt
 * das moodle-docker Template MOODLE_DOCKER_WEB_PORT an wwwroot an, und Moodle
 * kennt keinen sslproxy → Mixed-Content + Redirect-Loops.
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
    const configPath = path.join(instance.moodleDir, "config.php");
    await run(`cp ${instance.moodleDockerDir}/config.docker-template.php ${configPath}`);
    // 4. config.php für Produktionsbetrieb patchen (nur wenn BASE_DOMAIN gesetzt)
    const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "";
    if (BASE_DOMAIN) {
        await patchConfigForProduction(configPath, instance, BASE_DOMAIN);
    }
    // 5. task37 — in-Moodle Admin-Plugin local_runbotadmin einspielen.
    // Das Plugin wird bei jeder Provisionierung mit in den Moodle-Tree
    // kopiert, bevor `install_database.php` läuft. Moodle's Upgrade-
    // Pipeline registriert es dann automatisch in mdl_config_plugins.
    // Source liegt im moodle-runbot-mcp Repo unter moodle-plugins/.
    // Wenn der Ordner fehlt (z.B. älterer Checkout), loggen wir eine
    // Warnung und machen ohne Plugin weiter — kein fataler Fehler.
    const runbotAdminSrc = path.join(process.cwd(), "moodle-plugins", "local_runbotadmin");
    const runbotAdminDst = path.join(instance.moodleDir, "local", "runbotadmin");
    try {
        const { stat } = await import("fs/promises");
        await stat(runbotAdminSrc);
        await fs.mkdir(path.dirname(runbotAdminDst), { recursive: true });
        await run(`cp -r ${runbotAdminSrc} ${runbotAdminDst}`);
        console.error(`[docker] task37: local_runbotadmin plugin installed into ${runbotAdminDst}`);
    }
    catch (e) {
        console.error(`[docker] WARN task37: local_runbotadmin source not found at ${runbotAdminSrc} — skipping. ` +
            `In-Moodle admin GUI will not be available for this instance. (${String(e).slice(0, 120)})`);
    }
}
/**
 * Fügt einen Override-Block in config.php ein, der $CFG->wwwroot auf die
 * HTTPS-Subdomain ohne Port setzt und $CFG->sslproxy = true aktiviert.
 *
 * Strategie: Wir finden das finale require_once('__DIR__ . /lib/setup.php')
 * (immer letzter Befehl in einer Moodle config.php) und injizieren unseren
 * Block direkt davor. Das überschreibt alle vorherigen Template-Assignments.
 *
 * Fallback: Wenn das require_once nicht matcht (geändertes Template), hängen
 * wir den Block am Ende an und loggen eine Warnung.
 */
async function patchConfigForProduction(configPath, instance, baseDomain) {
    const wwwroot = `https://${instance.id}.${baseDomain}`;
    // task37: Runbot-API-Kontext für das in-Moodle Plugin local_runbotadmin.
    // Wir schreiben Instance-Id, API-Token und API-URL direkt als String-
    // Literals in die config.php — kein Umweg über Container-env-Vars.
    // Rationale: moodle-docker-compose forwardet keine beliebigen env-Vars
    // an den Webserver-Container, und ein docker-compose.override.yml zu
    // schreiben wäre brüchig. config.php liegt ohnehin im WWWROOT-Mount,
    // wird bei jedem Request geladen und ist einfacher zu debuggen.
    //
    // Token ist ein per Instance generierter Random-Hex (64 Zeichen, siehe
    // instances.ts + index.ts). Er rotiert bei jedem Instance-Start und ist
    // nur innerhalb des laufenden Containers + auf dem VPS sichtbar.
    const runbotApiUrl = process.env.RUNBOT_PUBLIC_API_URL ?? (baseDomain ? `https://${baseDomain}` : "http://localhost:3000");
    // Token/ConfigId können fehlen (z.B. CI, alte Dev-Instanzen vor task37).
    // In dem Fall schreiben wir einen leeren Token — das Plugin zeigt dann
    // "err_api_token" statt zu crashen.
    const runbotToken = instance.apiToken ?? "";
    const runbotConfigId = instance.configId ?? "";
    const overrideBlock = `
// ── eLeDia Runbot overrides ─────────────────────────────────────
// Auto-generiert von src/services/docker.ts — nicht manuell bearbeiten.
// Gründe für den Override:
//   1. moodle-docker Template hängt MOODLE_DOCKER_WEB_PORT an wwwroot an,
//      aber nginx proxied auf Port 443 — Port darf nicht im wwwroot stehen.
//   2. nginx terminiert TLS extern; Moodle muss mit sslproxy=true laufen,
//      sonst kommen interne Links als http:// raus → Mixed-Content.
$CFG->wwwroot  = '${wwwroot}';
$CFG->sslproxy = true;
$CFG->tool_replace_allowdb = true; // admin/tool/replace/cli/replace.php für Snapshot-URL-Rewrite freigeben
$CFG->debug        = 0;            // Keine PHP-Notices/-Warnings im Browser (Demo-Nutzer sollen keinen Debug-Output sehen)
$CFG->debugdisplay = 0;

// task37: Context für local_runbotadmin. Das Plugin liest diese Werte
// aus $CFG und macht damit HTTP-Calls gegen /api/internal/* auf dem
// Runbot-MCP-Server. Token ist per Instance einzigartig (siehe
// instance_start) und landet nur in dieser config.php.
$CFG->runbot_instance_id = '${instance.id}';
$CFG->runbot_config_id   = '${runbotConfigId}';
$CFG->runbot_api_token   = '${runbotToken}';
$CFG->runbot_api_url     = '${runbotApiUrl}';

unset($CFG->behat_wwwroot); // Behat nutzt eigenen Host, nicht überschreiben
// ────────────────────────────────────────────────────────────────
`;
    let cfg = await fs.readFile(configPath, "utf-8");
    // Finde die finale require_once(__DIR__ . '/lib/setup.php') Zeile.
    // Akzeptiert Single- oder Double-Quotes und optionale Whitespaces.
    const setupRequireRe = /(require_once\s*\(\s*__DIR__\s*\.\s*['"]\/lib\/setup\.php['"]\s*\)\s*;)/;
    if (setupRequireRe.test(cfg)) {
        cfg = cfg.replace(setupRequireRe, `${overrideBlock}\n$1`);
    }
    else {
        console.error(`[docker] WARNING: require_once('/lib/setup.php') nicht in ${configPath} gefunden — ` +
            `Override-Block wird am Ende angehängt. Das funktioniert vermutlich NICHT.`);
        cfg += "\n" + overrideBlock + "\n";
    }
    await fs.writeFile(configPath, cfg, "utf-8");
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
    console.error(`[docker] Starting containers for ${instance.id}…`);
    await run(`${env} ${compose} up -d`, instance.moodleDockerDir);
    // Warten bis DB erreichbar ist (Polling, bis zu 120s)
    await waitForDatabase(instance, 120);
    if (snapshotFile) {
        // Snapshot-Modus: DB aus Dump restaurieren — Import passiert in snapshot.ts
        console.error(`[docker] Snapshot-Modus: ${snapshotFile}`);
    }
    else {
        // Frisch-Modus: Moodle-DB initialisieren
        console.error(`[docker] Running install_database.php…`);
        try {
            const { stdout, stderr } = await execAsync(`${env} ${compose} exec -T webserver php admin/cli/install_database.php ` +
                `--agree-license --fullname="eLeDia Demo ${instance.id}" ` +
                `--shortname="${instance.id}" --adminpass="demo1234" --adminemail="admin@eledia.de"`, { cwd: instance.moodleDockerDir, maxBuffer: 10 * 1024 * 1024 });
            console.error(`[docker] install_database stdout: ${stdout.slice(0, 500)}`);
            if (stderr)
                console.error(`[docker] install_database stderr: ${stderr.slice(0, 500)}`);
        }
        catch (err) {
            const e = err;
            const combined = `${e.stdout ?? ""} ${e.stderr ?? e.message ?? ""}`;
            // Moodle gibt "already installed" zurück wenn DB schon existiert — nicht fatal
            if (combined.includes("already installed") || combined.includes("already exists") || combined.includes("Site already installed")) {
                console.error(`[docker] Moodle already installed — OK`);
            }
            else {
                throw new Error(`install_database.php failed:\nstdout: ${e.stdout ?? ""}\nstderr: ${e.stderr ?? e.message ?? ""}`);
            }
        }
        console.error(`[docker] Moodle database ready for ${instance.id}`);
    }
}
/**
 * Wartet bis der DB-Container gesund ist.
 * Pgsql → pg_isready direkt im db-Container (kein Umweg über Webserver).
 * MariaDB/MySQL → mysqladmin ping im db-Container.
 * Fallback: wait_for_db.php im Webserver-Container (alte Methode).
 */
async function waitForDatabase(instance, timeoutSecs) {
    const env = envString(composeEnv(instance));
    const compose = path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");
    const deadline = Date.now() + timeoutSecs * 1000;
    // Kurz warten damit docker compose up -d die Container anlegen kann
    await new Promise(r => setTimeout(r, 8000));
    const isPostgres = instance.db === "pgsql";
    const healthCmd = isPostgres
        ? `${env} ${compose} exec -T db pg_isready -U moodle`
        : `${env} ${compose} exec -T db mysqladmin ping -h localhost --silent`;
    console.error(`[docker] Waiting for database (max ${timeoutSecs}s, cmd: ${isPostgres ? "pg_isready" : "mysqladmin ping"})…`);
    while (Date.now() < deadline) {
        try {
            const { stdout, stderr } = await execAsync(healthCmd, {
                cwd: instance.moodleDockerDir, maxBuffer: 512 * 1024
            });
            console.error(`[docker] Database ready — ${stdout.trim() || stderr.trim()}`);
            // Kurze Pause damit postgres vollständig initialisiert ist
            await new Promise(r => setTimeout(r, 2000));
            return;
        }
        catch (e) {
            const msg = e.message?.slice(0, 120) ?? "";
            console.error(`[docker] DB not ready yet: ${msg}`);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
    throw new Error(`[docker] Database not ready after ${timeoutSecs}s`);
}
/**
 * task33: Setzt den Moodle-Site-Namen (Front-Page-Kurs ID 1) direkt in der
 * DB. Wird nach `startContainers()` (Fresh-Install) oder `restoreSnapshot()`
 * aufgerufen, je nachdem welcher Pfad aktiv ist.
 *
 * Warum DB statt `$CFG->sitename`? Moodle hält den Site-Namen kanonisch im
 * Front-Page-Kurs (`mdl_course` id=1, Felder `fullname` + `shortname`).
 * `$CFG->sitename`-Overrides werden an vielen Stellen ignoriert. Der
 * direkte DB-Weg ist robust und greift sofort ohne Cache-Purge.
 *
 * Escaping: Wir werfen Hochkomma + Backslash weg statt zu quoten, weil wir
 * den String als SQL-Literal inlinen (kein Prepared Statement via
 * docker exec). Moodle-Labels sind ohnehin ASCII-sauber; Johannes' Konvention
 * ist "Demo | <PluginName>".
 */
export async function setSiteName(instance, siteName) {
    // Kein gefährliches Zeichen: entfernen statt quoten, dann in ' ' wrappen.
    const clean = siteName.replace(/['"\\`;]/g, "").slice(0, 200);
    if (!clean) {
        console.error(`[docker] setSiteName: leerer Name für ${instance.id}, skip`);
        return;
    }
    const env = envString(composeEnv(instance));
    const compose = path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");
    // Shortname ist in Moodle UNIQUE. Um Kollisionen zu vermeiden hängen wir
    // einen Kurz-Hash aus der Instance-ID an — so bleibt jede Instanz einzigartig
    // und trotzdem lesbar ("Demo | LeitnerFlow" bzw. shortname mit Suffix).
    const shortHashSuffix = instance.id.slice(-6);
    const shortname = `${clean}-${shortHashSuffix}`.slice(0, 255);
    const sql = instance.db === "pgsql"
        ? `UPDATE mdl_course SET fullname='${clean}', shortname='${shortname}' WHERE id=1;`
        : `UPDATE mdl_course SET fullname='${clean}', shortname='${shortname}' WHERE id=1;`;
    try {
        if (instance.db === "pgsql") {
            await execAsync(`${env} ${compose} exec -T db psql -U moodle -d moodle -c "${sql}"`, { cwd: instance.moodleDockerDir, maxBuffer: 1 * 1024 * 1024 });
        }
        else {
            await execAsync(`${env} ${compose} exec -T db mysql -u root -proot moodle -e "${sql}"`, { cwd: instance.moodleDockerDir, maxBuffer: 1 * 1024 * 1024 });
        }
        console.error(`[docker] setSiteName OK: ${instance.id} → "${clean}"`);
    }
    catch (e) {
        console.error(`[docker] setSiteName FAIL for ${instance.id}:`, e.message?.slice(0, 300));
        // Nicht fatal — der Default-Name ist nur kosmetisch.
    }
    // Caches purgen damit der neue Name sofort im Header erscheint.
    try {
        await execAsync(`${env} ${compose} exec -T webserver php admin/cli/purge_caches.php`, { cwd: instance.moodleDockerDir, maxBuffer: 2 * 1024 * 1024 });
    }
    catch {
        // best-effort
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