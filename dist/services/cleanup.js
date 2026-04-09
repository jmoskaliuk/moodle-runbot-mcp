// src/services/cleanup.ts
// Zwei Dinge in einer Datei:
//
// 1. `startCleanupScheduler()` — Periodischer Job (alle 60s), der Instanzen stoppt,
//    wenn sie zu alt oder zu lange idle sind. Standard: 60 Min maxAge, 15 Min
//    Inaktivität. Pro Instanz überschreibbar via `instance.maxAgeMinutes`
//    (siehe feat12 / task26 — Extension-Codes).
//
// 2. `cleanupOrphans()` — Einmaliger Startup-Cleanup (task20), der Docker-
//    Container, `/opt/runbot/<id>`-Verzeichnisse und `runbot-*.conf` nginx-
//    Configs entfernt, zu denen kein Registry-Eintrag (mehr) existiert.
//    Wird aus `src/index.ts` direkt vor `app.listen()` aufgerufen.
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { getAllInstances, saveInstance, deleteInstance } from './registry.js';
import { stopContainers, cleanupInstanceDir } from './docker.js';
import { unregisterInstance } from './nginx.js';
const execAsync = promisify(exec);
const MAX_AGE_MS = parseInt(process.env.DEMO_MAX_AGE_MINUTES ?? '60') * 60 * 1000;
const INACTIVITY_MS = parseInt(process.env.DEMO_INACTIVITY_MINUTES ?? '15') * 60 * 1000;
const POLL_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL_SECONDS ?? '60') * 1000;
export function startCleanupScheduler() {
    console.error(`[cleanup] Scheduler started — maxAge=${MAX_AGE_MS / 60000}min, ` +
        `inactivity=${INACTIVITY_MS / 60000}min, poll=${POLL_INTERVAL / 1000}s`);
    setInterval(runCleanup, POLL_INTERVAL);
    // Also run immediately on startup
    runCleanup();
}
async function runCleanup() {
    const now = Date.now();
    let instances;
    try {
        instances = await getAllInstances();
    }
    catch {
        return; // Registry not yet initialized
    }
    for (const inst of instances) {
        if (inst.status === 'stopping' || inst.status === 'stopped')
            continue;
        // task30: Gepinnte Instanzen sind cleanup-immun.
        // Werden vom `snapshot_build`-Workflow gesetzt oder vom Admin manuell
        // als Langläufer markiert. Weder maxAge noch inactivity dürfen hier
        // zuschlagen — sonst räumen wir mitten im pg_dump die Quelle ab.
        if (inst.pinned)
            continue;
        // Per-Instanz-Override für maxAge (task26 / feat12: Extension-Codes).
        // Wenn gesetzt, gilt er AB `extendedBy.at` (nicht ab `createdAt`), damit
        // eine nach 58 Min verlängerte Instanz nicht 2 Min später schon wieder
        // weg ist.
        let referenceStart;
        let effectiveMaxAgeMs;
        if (inst.maxAgeMinutes && inst.extendedBy?.at) {
            referenceStart = new Date(inst.extendedBy.at).getTime();
            effectiveMaxAgeMs = inst.maxAgeMinutes * 60 * 1000;
        }
        else {
            referenceStart = new Date(inst.createdAt).getTime();
            effectiveMaxAgeMs = MAX_AGE_MS;
        }
        const age = now - referenceStart;
        const inactive = now - new Date(inst.lastActivity).getTime();
        const tooOld = age > effectiveMaxAgeMs;
        const tooIdle = inactive > INACTIVITY_MS && inst.status === 'running';
        if (tooOld || tooIdle) {
            const reason = tooOld
                ? `max age reached (${Math.round(age / 60000)} min)`
                : `inactivity timeout (${Math.round(inactive / 60000)} min idle)`;
            console.error(`[cleanup] Stopping ${inst.id} — ${reason}`);
            try {
                inst.status = 'stopping';
                await saveInstance(inst);
                await unregisterInstance(inst.id);
                await stopContainers(inst);
                await cleanupInstanceDir(inst);
                await deleteInstance(inst.id);
                console.error(`[cleanup] ✓ ${inst.id} removed`);
            }
            catch (e) {
                console.error(`[cleanup] ✗ Failed to stop ${inst.id}:`, e);
                // Mark as error so it shows in UI
                inst.status = 'error';
                inst.error = `Cleanup failed: ${String(e)}`;
                await saveInstance(inst);
            }
        }
    }
}
// Call this whenever a user makes an HTTP request to their demo instance.
// (Webhook from nginx or the demo itself hitting our /ping endpoint)
export async function recordActivity(instanceId) {
    const { getInstance, saveInstance } = await import('./registry.js');
    const inst = await getInstance(instanceId);
    if (!inst)
        return;
    inst.lastActivity = new Date().toISOString();
    await saveInstance(inst);
}
// ═══════════════════════════════════════════════════════════════════════════
// Startup-Orphan-Cleanup (task20)
// ═══════════════════════════════════════════════════════════════════════════
//
// Hintergrund: Der Node-Prozess kann crashen/neugestartet werden, während
// Docker-Container, `/opt/runbot/<id>`-Verzeichnisse und
// `/etc/nginx/conf.d/runbot-<id>.conf`-Dateien bestehen bleiben. Nach einem
// manuellen `rm registry.json` oder einem Volume-Reset sind diese Artefakte
// nicht mehr in der Registry bekannt — klassische Waisen. Zusätzlich
// verbraten sie Ports (`webPort` aus der Registry wird frei, aber der echte
// Container lauscht noch auf dem alten Port → `allocatePort()` vergibt
// denselben Port, docker compose up crasht mit "port already in use").
//
// Strategie:
//   1) `docker ps -a --format '{{.Names}}' --filter "name=runbot-"` lesen
//   2) Aus den Container-Namen die Instanz-IDs extrahieren
//      (Prefix = COMPOSE_PROJECT_NAME = "runbot-<id>")
//   3) Mit `registry.getAllInstances()` vergleichen
//   4) Container ohne Registry-Eintrag: `docker rm -fv` + WORK_DIR/<id> löschen
//   5) nginx-Configs ohne Registry-Eintrag: Datei löschen, nginx reloaden
//
// Bewusst NICHT verwendet wird `nginx.cleanupAllConfigs()` — das würde auch
// gültige Configs (für laufende, registrierte Instanzen) wegräumen.
const WORK_DIR = process.env.RUNBOT_WORK_DIR ?? '/opt/runbot';
const NGINX_CONF_DIR = process.env.NGINX_CONF_DIR ?? '/etc/nginx/conf.d';
const BASE_DOMAIN = process.env.BASE_DOMAIN ?? '';
const NGINX_ENABLED = BASE_DOMAIN !== '';
/**
 * Einmaliger Cleanup beim Serverstart. Läuft best-effort: ein einzelner
 * Fehler killt nicht den gesamten Startup, aber jeder Fehler wird geloggt.
 */
export async function cleanupOrphans() {
    const report = {
        orphanContainers: [],
        orphanDirs: [],
        orphanConfigs: [],
        errors: [],
    };
    // Registrierte Instanzen laden
    let knownIds;
    try {
        const instances = await getAllInstances();
        knownIds = new Set(instances.map((i) => i.id));
    }
    catch (e) {
        report.errors.push(`registry read failed: ${String(e)}`);
        return report;
    }
    // ── 1) Docker-Container-Waisen ─────────────────────────────────────────────
    try {
        const orphanIds = await findOrphanContainerIds(knownIds);
        for (const id of orphanIds) {
            try {
                await removeOrphanContainer(id);
                report.orphanContainers.push(id);
            }
            catch (e) {
                report.errors.push(`container ${id}: ${String(e)}`);
            }
        }
    }
    catch (e) {
        report.errors.push(`docker ps failed: ${String(e)}`);
    }
    // ── 2) Verzeichnis-Waisen in WORK_DIR ─────────────────────────────────────
    try {
        const orphanDirs = await findOrphanDirs(knownIds);
        for (const id of orphanDirs) {
            try {
                await fs.rm(path.join(WORK_DIR, id), { recursive: true, force: true });
                report.orphanDirs.push(id);
            }
            catch (e) {
                report.errors.push(`dir ${id}: ${String(e)}`);
            }
        }
    }
    catch (e) {
        report.errors.push(`readdir ${WORK_DIR} failed: ${String(e)}`);
    }
    // ── 3) nginx-Config-Waisen ─────────────────────────────────────────────────
    if (NGINX_ENABLED) {
        try {
            const orphanConfs = await findOrphanNginxConfigs(knownIds);
            for (const f of orphanConfs) {
                try {
                    await fs.unlink(path.join(NGINX_CONF_DIR, f));
                    report.orphanConfigs.push(f);
                }
                catch (e) {
                    report.errors.push(`nginx conf ${f}: ${String(e)}`);
                }
            }
            if (report.orphanConfigs.length > 0) {
                await reloadNginxAfterCleanup();
            }
        }
        catch (e) {
            report.errors.push(`readdir ${NGINX_CONF_DIR} failed: ${String(e)}`);
        }
    }
    // ── Log-Zusammenfassung ────────────────────────────────────────────────────
    const total = report.orphanContainers.length +
        report.orphanDirs.length +
        report.orphanConfigs.length;
    if (total === 0 && report.errors.length === 0) {
        console.error(`[cleanup] Startup: no orphans found — registry is consistent`);
    }
    else {
        console.error(`[cleanup] Startup: removed ${report.orphanContainers.length} container(s), ` +
            `${report.orphanDirs.length} dir(s), ${report.orphanConfigs.length} nginx config(s). ` +
            `${report.errors.length} error(s).`);
        if (report.orphanContainers.length > 0) {
            console.error(`[cleanup]   container orphans: ${report.orphanContainers.join(', ')}`);
        }
        if (report.orphanDirs.length > 0) {
            console.error(`[cleanup]   dir orphans: ${report.orphanDirs.join(', ')}`);
        }
        if (report.orphanConfigs.length > 0) {
            console.error(`[cleanup]   nginx config orphans: ${report.orphanConfigs.join(', ')}`);
        }
        for (const err of report.errors) {
            console.error(`[cleanup]   ERROR: ${err}`);
        }
    }
    return report;
}
/**
 * Liest `docker ps -a` und gibt die Instanz-IDs zurück, deren Container
 * NICHT in `knownIds` enthalten sind. Werden sowohl laufende als auch
 * gestoppte Container berücksichtigt (`-a`), damit abgestürzte Instanzen
 * nicht stehen bleiben.
 *
 * Annahme über die Container-Naming-Konvention:
 * `composeProject = "runbot-<id>"` → Container heißen
 * `runbot-<id>-webserver-1`, `runbot-<id>-db-1` usw.
 * Wir extrahieren <id> aus dem ersten passenden Container pro Instanz.
 */
async function findOrphanContainerIds(knownIds) {
    const { stdout } = await execAsync(`docker ps -a --format '{{.Names}}' --filter "name=runbot-"`);
    const names = stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    const foundIds = new Set();
    for (const name of names) {
        // Erwartetes Format: runbot-<id>-<service>-<replica>
        // <id> kann Bindestriche enthalten (z.B. "demo-leitnerflow-abc123")
        // Service-Suffixe aus moodle-docker: webserver, db, selenium, mailhog, redis, exttests
        const m = name.match(/^runbot-(.+?)-(?:webserver|db|selenium|mailhog|redis|exttests)-\d+$/);
        if (m) {
            foundIds.add(m[1]);
        }
    }
    return Array.from(foundIds).filter((id) => !knownIds.has(id));
}
/**
 * Findet alle `<id>`-Directories unter `WORK_DIR`, deren `<id>` nicht in
 * `knownIds` steht. Überspringt die `registry.json`-Datei selbst und
 * bekannte Utility-Verzeichnisse wie `tokens.json`.
 */
async function findOrphanDirs(knownIds) {
    let entries;
    try {
        entries = await fs.readdir(WORK_DIR);
    }
    catch {
        return []; // WORK_DIR existiert evtl. noch nicht
    }
    const orphans = [];
    for (const name of entries) {
        // Skippen: bekannte Infrastruktur-Pfade (dürfen nie als Waisen gelöscht werden)
        if (name === 'registry.json' ||
            name === 'tokens.json' ||
            name === 'snapshots' ||
            name === 'moodle-cache' ||
            name === 'logs')
            continue;
        const full = path.join(WORK_DIR, name);
        let isDir = false;
        try {
            const stat = await fs.stat(full);
            isDir = stat.isDirectory();
        }
        catch {
            continue;
        }
        if (!isDir)
            continue;
        if (!knownIds.has(name)) {
            orphans.push(name);
        }
    }
    return orphans;
}
/**
 * Findet alle `runbot-<id>.conf` Dateien in NGINX_CONF_DIR, deren `<id>`
 * nicht in `knownIds` steht. Berücksichtigt auch das Alt-Prefix `demo-*.conf`
 * aus frühen Versionen (werden alle als Waisen behandelt, da wir seit
 * 2026-04 nur noch `runbot-*.conf` schreiben).
 */
async function findOrphanNginxConfigs(knownIds) {
    let files;
    try {
        files = await fs.readdir(NGINX_CONF_DIR);
    }
    catch {
        return [];
    }
    const orphans = [];
    for (const f of files) {
        if (!f.endsWith('.conf'))
            continue;
        if (f.startsWith('demo-')) {
            // Alt-Prefix → immer Waise
            orphans.push(f);
            continue;
        }
        const m = f.match(/^runbot-(.+)\.conf$/);
        if (!m)
            continue;
        const id = m[1];
        if (!knownIds.has(id)) {
            orphans.push(f);
        }
    }
    return orphans;
}
/**
 * Stoppt + entfernt einen Orphan-Container. Verwendet direkt `docker rm -fv`
 * auf allen Containern, die den Projekt-Prefix tragen, statt
 * `docker compose down -v` — letzteres bräuchte das moodle-docker Repo und
 * die passenden ENV-Variablen, die wir für eine Waise nicht mehr haben.
 */
async function removeOrphanContainer(id) {
    const project = `runbot-${id}`;
    // Alle Container mit diesem Compose-Projekt finden (auch gestoppte)
    const { stdout } = await execAsync(`docker ps -a --format '{{.Names}}' --filter "name=^${project}-"`);
    const names = stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    if (names.length === 0)
        return;
    // Container zwangsweise stoppen + entfernen (inkl. Volumes)
    await execAsync(`docker rm -fv ${names.join(' ')}`);
    // Zugehörige Compose-Networks manchmal übrig — best-effort entfernen
    await execAsync(`docker network rm ${project}_default`).catch(() => { });
}
async function reloadNginxAfterCleanup() {
    try {
        await execAsync('nginx -t');
        await execAsync('systemctl reload nginx');
    }
    catch (e) {
        console.error(`[cleanup] nginx reload after orphan cleanup failed: ${String(e)}`);
    }
}
//# sourceMappingURL=cleanup.js.map