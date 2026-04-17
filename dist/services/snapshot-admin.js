// src/services/snapshot-admin.ts
//
// task43: Snapshot-Manager-Backend — Rebuild-Jobs (Stage 1B) und
// Edit-Sessions (Stage 1C) für den zentralen Admin-Dashboard.
//
// Beide Workflows nutzen denselben Provisioning-Pfad (Seed-Instanz mit
// altem Snapshot + Moodle-Upgrade):
//
//   Rebuild:    provisionSeedReady() → createSnapshot() → stop
//   Edit-Live:  provisionSeedReady() → admin editiert manuell → createSnapshot() → stop
//
// Job-/Session-State liegt in-memory — überlebt keinen Server-Restart für
// Rebuild-Jobs (kurzlebig, wer’s nochmal will, klickt nochmal). Für
// Edit-Sessions wird der Zustand beim Startup aus der Instance-Registry
// rekonstruiert (Instances mit pinReason="edit:..." sind aktive Sessions).
//
// Auth: Routen sind hinter `adminAuth` (HTTP Basic Auth, gleiche Credentials
// wie für /admin). Kein Rate-Limit — Admin allein weiß was er tut.
//
// Hinweis zum Rename: Diese Datei hieß bis Stage 1B `snapshot-rebuild.ts`.
// Mit den Edit-Sessions ist sie nicht mehr nur über Rebuilds — daher der
// neue Name. Imports im index.ts wurden mit angepasst.
import { randomBytes } from "crypto";
import path from "path";
import { loadConfigs } from "./config.js";
import * as snapshotSvc from "./snapshot.js";
import * as dockerSvc from "./docker.js";
import { getAllInstances, saveInstance, deleteInstance, allocatePort } from "./registry.js";
/**
 * Common prelude für Rebuild + Edit-Live: provisioniert eine pinned Seed-
 * Instanz, restauriert den alten Snapshot, lässt Moodle migrieren. Die
 * Caller-Callbacks bekommen Phase-Updates (für Logging/Status-Anzeige).
 *
 * Throws bei beliebigem Fehler. Caller ist verantwortlich für Cleanup
 * der angelegten Seed-Instanz im Fehlerfall.
 */
async function provisionSeedReady(snapshotId, configId, pinReason, onPhase) {
    const PORT_START = parseInt(process.env.PORT_START ?? "8100");
    const PORT_END = parseInt(process.env.PORT_END ?? "8199");
    const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "";
    const WORK_DIR = process.env.RUNBOT_WORK_DIR ?? "/opt/runbot";
    const configs = await loadConfigs();
    const config = configs.find(c => c.id === configId);
    if (!config)
        throw new Error(`Config ${configId} nicht gefunden`);
    const oldSnap = await snapshotSvc.getSnapshot(snapshotId);
    if (!oldSnap)
        throw new Error(`Snapshot ${snapshotId} nicht gefunden`);
    const idPrefix = pinReason.startsWith("rebuild:") ? "seed-rebuild" : "seed-edit";
    const id = `${idPrefix}-${randomBytes(3).toString("hex")}`;
    const composeProject = `runbot-${id}`.replace(/[^a-z0-9-]/g, "-");
    const port = await allocatePort(PORT_START, PORT_END);
    const instanceDir = path.join(WORK_DIR, id);
    const instance = {
        id,
        prId: pinReason.split(":")[0] ?? "seed",
        branch: "main",
        pluginDir: config.plugin?.srcPath ?? "",
        moodleVersion: config.moodleVersion,
        phpVersion: config.phpVersion,
        db: config.db,
        webPort: port,
        status: "starting",
        url: BASE_DOMAIN ? `https://${id}.${BASE_DOMAIN}` : `http://localhost:${port}`,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        composeProject,
        moodleDockerDir: path.join(instanceDir, "moodle-docker"),
        moodleDir: path.join(instanceDir, "moodle"),
        apiToken: randomBytes(32).toString("hex"),
        configId,
        pinned: true,
        pinReason,
    };
    await saveInstance(instance);
    onPhase(`Provisioniere Seed-Instanz ${instance.id} mit Moodle ${instance.moodleVersion}`, "provisioning");
    await dockerSvc.provisionInstance(instance);
    if (config.plugin) {
        onPhase(`Installiere Plugin ${config.plugin.type}_${config.plugin.name}`, "installing_plugin");
        await dockerSvc.installPlugin(instance, config.plugin.srcPath, config.plugin.type, config.plugin.name);
    }
    onPhase(`Starte Container (DB: ${instance.db}, PHP: ${instance.phpVersion})`, "starting_containers");
    await dockerSvc.startContainers(instance, oldSnap.file);
    onPhase(`Restauriere alten Snapshot (${snapshotSvc.formatBytes(oldSnap.sizeBytes)}, Moodle ${oldSnap.moodleVersion})`, "restoring_snapshot");
    await snapshotSvc.restoreSnapshot(instance, oldSnap.file);
    onPhase(`Moodle-Upgrade ${oldSnap.moodleVersion} → ${instance.moodleVersion} (kann mehrere Minuten dauern)`, "running_upgrade");
    const upgradeOut = await dockerSvc.runUpgrade(instance);
    const upgradeLines = upgradeOut.split("\n").length;
    onPhase(`Upgrade fertig (${upgradeLines} log lines)`, "running_upgrade");
    // Status update + register with nginx so the URL is reachable from outside.
    // For edit-sessions ist das essenziell — der Admin muss die URL im Browser
    // öffnen können. Für Rebuilds wäre es egal, aber konsistent ist es
    // einfacher.
    instance.status = "running";
    instance.lastActivity = new Date().toISOString();
    await saveInstance(instance);
    // Nginx-Registrierung wird vom Caller gemacht (rebuild braucht's nicht,
    // edit-session schon).
    return { instance, oldSnapshot: oldSnap };
}
async function bestEffortCleanup(instance, log) {
    if (!instance)
        return;
    try {
        await dockerSvc.stopContainers(instance);
        await dockerSvc.cleanupInstanceDir(instance);
        await deleteInstance(instance.id);
        log(`Cleanup der Seed-Instanz durchgeführt`);
    }
    catch (cleanupErr) {
        log(`WARN: Cleanup fehlgeschlagen: ${String(cleanupErr).slice(0, 200)}`);
    }
}
const rebuildJobs = new Map();
function logJob(job, msg) {
    const ts = new Date().toISOString().slice(11, 19);
    job.log.push(`${ts} ${msg}`);
    console.error(`[rebuild ${job.jobId.slice(0, 6)}] ${msg}`);
    if (job.log.length > 200)
        job.log = job.log.slice(-200);
}
export function getRebuildJob(jobId) {
    return rebuildJobs.get(jobId);
}
export function listRebuildJobs(limit = 20) {
    return Array.from(rebuildJobs.values())
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, limit);
}
export async function startRebuild(snapshotId, configId) {
    const oldSnap = await snapshotSvc.getSnapshot(snapshotId);
    if (!oldSnap)
        throw new Error(`Snapshot '${snapshotId}' nicht gefunden`);
    const config = (await loadConfigs()).find(c => c.id === configId);
    if (!config)
        throw new Error(`Config '${configId}' nicht gefunden`);
    const jobId = randomBytes(8).toString("hex");
    const job = {
        jobId, snapshotId, configId,
        status: "starting_seed",
        startedAt: new Date().toISOString(),
        log: [],
    };
    rebuildJobs.set(jobId, job);
    logJob(job, `Rebuild-Job für ${snapshotId} via Config ${configId} (Moodle ${config.moodleVersion})`);
    setImmediate(() => runRebuildJob(job));
    return job;
}
async function runRebuildJob(job) {
    let instance = null;
    try {
        const ctx = await provisionSeedReady(job.snapshotId, job.configId, `rebuild:${job.snapshotId}`, (msg, phase) => {
            job.status = phase;
            logJob(job, msg);
        });
        instance = ctx.instance;
        job.instanceId = instance.id;
        job.status = "creating_snapshot";
        logJob(job, `Dumpe neuen Snapshot ${job.snapshotId} (überschreibt alten)`);
        const today = new Date().toISOString().slice(0, 10);
        const newDescription = ctx.oldSnapshot.description.includes("rebuilt")
            ? ctx.oldSnapshot.description.replace(/\s*\(rebuilt[^)]+\)/, "") + ` (rebuilt ${today} → Moodle ${instance.moodleVersion})`
            : `${ctx.oldSnapshot.description} (rebuilt ${today} → Moodle ${instance.moodleVersion})`;
        const newMeta = await snapshotSvc.createSnapshot(instance, job.snapshotId, ctx.oldSnapshot.label, newDescription, ctx.oldSnapshot.plugins);
        job.newSnapshot = newMeta;
        logJob(job, `Neuer Snapshot: ${snapshotSvc.formatBytes(newMeta.sizeBytes)} (vorher ${snapshotSvc.formatBytes(ctx.oldSnapshot.sizeBytes)})`);
        job.status = "stopping";
        logJob(job, `Stoppe Seed-Instanz + Cleanup`);
        await bestEffortCleanup(instance, msg => logJob(job, msg));
        job.status = "done";
        job.finishedAt = new Date().toISOString();
        logJob(job, `✓ Rebuild erfolgreich abgeschlossen`);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logJob(job, `✗ FEHLER: ${msg.slice(0, 500)}`);
        job.status = "error";
        job.error = msg;
        job.finishedAt = new Date().toISOString();
        await bestEffortCleanup(instance, m => logJob(job, m));
    }
}
const editSessions = new Map(); // by sessionId
const editSessionsBySnapshot = new Map(); // snapshotId → sessionId
function logSession(s, msg) {
    const ts = new Date().toISOString().slice(11, 19);
    s.log.push(`${ts} ${msg}`);
    console.error(`[edit ${s.sessionId.slice(0, 6)}] ${msg}`);
    if (s.log.length > 200)
        s.log = s.log.slice(-200);
}
export function getEditSession(sessionId) {
    return editSessions.get(sessionId);
}
export function getEditSessionBySnapshot(snapshotId) {
    const sid = editSessionsBySnapshot.get(snapshotId);
    if (!sid)
        return undefined;
    const s = editSessions.get(sid);
    // Wenn die Session schon beendet ist (saved/discarded/error), nicht mehr
    // als "aktiv" zurückgeben — aber im Map lassen für Polling/History.
    if (!s)
        return undefined;
    if (s.state === "saved" || s.state === "discarded" || s.state === "error") {
        return undefined;
    }
    return s;
}
export function listActiveEditSessions() {
    return Array.from(editSessions.values())
        .filter(s => s.state !== "saved" && s.state !== "discarded" && s.state !== "error")
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
/**
 * Startet eine Edit-Session. Wenn schon eine für denselben Snapshot läuft,
 * wird sie zurückgegeben statt eine neue zu erstellen (idempotent).
 */
export async function startEditSession(snapshotId, configId) {
    const existing = getEditSessionBySnapshot(snapshotId);
    if (existing) {
        return existing;
    }
    const oldSnap = await snapshotSvc.getSnapshot(snapshotId);
    if (!oldSnap)
        throw new Error(`Snapshot '${snapshotId}' nicht gefunden`);
    const config = (await loadConfigs()).find(c => c.id === configId);
    if (!config)
        throw new Error(`Config '${configId}' nicht gefunden`);
    const sessionId = randomBytes(8).toString("hex");
    const session = {
        sessionId, snapshotId, configId,
        state: "starting",
        startedAt: new Date().toISOString(),
        log: [],
    };
    editSessions.set(sessionId, session);
    editSessionsBySnapshot.set(snapshotId, sessionId);
    logSession(session, `Edit-Session für ${snapshotId} via Config ${configId} (Moodle ${config.moodleVersion})`);
    setImmediate(() => runEditSessionStart(session));
    return session;
}
async function runEditSessionStart(session) {
    let instance = null;
    try {
        const ctx = await provisionSeedReady(session.snapshotId, session.configId, `edit:${session.snapshotId}`, (msg, _phase) => logSession(session, msg));
        instance = ctx.instance;
        session.instanceId = instance.id;
        session.url = instance.url;
        // Nginx-Registrierung damit die URL extern erreichbar ist (anders als bei
        // Rebuild, wo nur intern gedumpt wird). Wir importieren nginx hier lazy,
        // damit das Modul auch in Tests/Stdio-Mode ohne nginx läuft.
        try {
            const nginxSvc = await import("./nginx.js");
            await nginxSvc.registerInstance(instance.id, instance.webPort);
            logSession(session, `Nginx-Registrierung OK — URL: ${instance.url}`);
        }
        catch (e) {
            logSession(session, `WARN: nginx-Registrierung fehlgeschlagen (Demo evtl. nur über Port erreichbar): ${String(e).slice(0, 200)}`);
        }
        session.state = "ready";
        logSession(session, `✓ Edit-Session bereit. Admin kann unter ${instance.url} editieren.`);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logSession(session, `✗ FEHLER beim Start: ${msg.slice(0, 500)}`);
        session.state = "error";
        session.error = msg;
        session.finishedAt = new Date().toISOString();
        await bestEffortCleanup(instance, m => logSession(session, m));
        editSessionsBySnapshot.delete(session.snapshotId);
    }
}
/**
 * Speichert die Edit-Session: createSnapshot überschreibt den alten Dump,
 * dann wird die Seed-Instanz gestoppt + aufgeräumt. Async — returnt
 * sofort, der State läuft über Polling von getEditSession().
 */
export async function saveEditSession(sessionId) {
    const session = editSessions.get(sessionId);
    if (!session)
        throw new Error(`Edit-Session ${sessionId} nicht gefunden`);
    if (session.state !== "ready") {
        throw new Error(`Edit-Session ist im Status '${session.state}', kann nicht gespeichert werden (nur 'ready' ist erlaubt)`);
    }
    session.state = "saving";
    logSession(session, `Speichere Edit-Session: dumpe DB als Snapshot ${session.snapshotId}`);
    setImmediate(() => runEditSessionSave(session));
    return session;
}
async function runEditSessionSave(session) {
    if (!session.instanceId) {
        session.state = "error";
        session.error = "instanceId fehlt — Session korrupt?";
        session.finishedAt = new Date().toISOString();
        return;
    }
    // Wir lesen die Instance frisch aus dem Registry, damit lastActivity etc.
    // stimmen.
    const instances = await getAllInstances();
    const instance = instances.find(i => i.id === session.instanceId) ?? null;
    if (!instance) {
        session.state = "error";
        session.error = `Seed-Instanz ${session.instanceId} nicht mehr in Registry (manuell gelöscht?)`;
        session.finishedAt = new Date().toISOString();
        logSession(session, `✗ ${session.error}`);
        editSessionsBySnapshot.delete(session.snapshotId);
        return;
    }
    try {
        const oldSnap = await snapshotSvc.getSnapshot(session.snapshotId);
        const today = new Date().toISOString().slice(0, 10);
        const newDescription = oldSnap?.description?.includes("edited")
            ? oldSnap.description.replace(/\s*\(edited[^)]+\)/, "") + ` (edited ${today} → Moodle ${instance.moodleVersion})`
            : `${oldSnap?.description ?? ""} (edited ${today} → Moodle ${instance.moodleVersion})`.trim();
        const newMeta = await snapshotSvc.createSnapshot(instance, session.snapshotId, oldSnap?.label ?? session.snapshotId, newDescription, oldSnap?.plugins ?? []);
        session.newSnapshot = newMeta;
        logSession(session, `Neuer Snapshot: ${snapshotSvc.formatBytes(newMeta.sizeBytes)}`);
        logSession(session, `Stoppe Seed-Instanz + Cleanup`);
        // Nginx vor docker stop, damit kein 502 auf der Demo-URL hängenbleibt.
        try {
            const nginxSvc = await import("./nginx.js");
            await nginxSvc.unregisterInstance(instance.id);
        }
        catch { }
        await bestEffortCleanup(instance, msg => logSession(session, msg));
        session.state = "saved";
        session.finishedAt = new Date().toISOString();
        logSession(session, `✓ Edit-Session gespeichert + beendet`);
        editSessionsBySnapshot.delete(session.snapshotId);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logSession(session, `✗ FEHLER beim Speichern: ${msg.slice(0, 500)}`);
        session.state = "error";
        session.error = msg;
        session.finishedAt = new Date().toISOString();
        // Cleanup trotzdem versuchen — sonst hängt die Seed-Instanz weiter.
        try {
            const nginxSvc = await import("./nginx.js");
            await nginxSvc.unregisterInstance(instance.id);
        }
        catch { }
        await bestEffortCleanup(instance, m => logSession(session, m));
        editSessionsBySnapshot.delete(session.snapshotId);
    }
}
/**
 * Verwirft die Edit-Session: stoppt + räumt die Seed-Instanz auf, ohne den
 * Snapshot zu ändern. Synchron — ist schnell genug (~5s für docker stop).
 */
export async function cancelEditSession(sessionId) {
    const session = editSessions.get(sessionId);
    if (!session)
        throw new Error(`Edit-Session ${sessionId} nicht gefunden`);
    if (session.state === "saved" || session.state === "discarded") {
        return session; // Idempotent — schon beendet.
    }
    session.state = "discarding";
    logSession(session, `Verwerfe Edit-Session: stoppe Seed-Instanz ohne Speichern`);
    if (session.instanceId) {
        const instances = await getAllInstances();
        const instance = instances.find(i => i.id === session.instanceId) ?? null;
        if (instance) {
            try {
                const nginxSvc = await import("./nginx.js");
                await nginxSvc.unregisterInstance(instance.id);
            }
            catch { }
            await bestEffortCleanup(instance, msg => logSession(session, msg));
        }
    }
    session.state = "discarded";
    session.finishedAt = new Date().toISOString();
    logSession(session, `✓ Edit-Session verworfen`);
    editSessionsBySnapshot.delete(session.snapshotId);
    return session;
}
/**
 * Beim Server-Start aufrufen: Scant die Instance-Registry nach pinned
 * Instanzen mit pinReason="edit:..." und legt Edit-Session-Einträge an.
 * So überlebt der Admin-Workflow Server-Restarts — ohne diese Recovery
 * würde der Admin den Save-Button verlieren und müsste die Seed-Instanz
 * manuell entsorgen.
 *
 * Recovered Sessions sind im State "ready" (kein Log-Verlauf vom
 * ursprünglichen Start).
 */
export async function recoverEditSessionsFromRegistry() {
    const instances = await getAllInstances().catch(() => []);
    let recovered = 0;
    for (const inst of instances) {
        if (!inst.pinned || !inst.pinReason?.startsWith("edit:"))
            continue;
        const snapshotId = inst.pinReason.slice("edit:".length);
        if (!snapshotId)
            continue;
        if (editSessionsBySnapshot.has(snapshotId))
            continue; // schon recovered
        const sessionId = randomBytes(8).toString("hex");
        const session = {
            sessionId,
            snapshotId,
            configId: inst.configId ?? "",
            state: "ready",
            startedAt: inst.createdAt,
            instanceId: inst.id,
            url: inst.url,
            log: [`(recovered nach Server-Restart — originaler Log-Verlauf nicht verfügbar)`],
        };
        editSessions.set(sessionId, session);
        editSessionsBySnapshot.set(snapshotId, sessionId);
        recovered++;
        console.error(`[edit] recovered session ${sessionId.slice(0, 6)} für snapshot ${snapshotId} (instance ${inst.id})`);
    }
    return recovered;
}
//# sourceMappingURL=snapshot-admin.js.map