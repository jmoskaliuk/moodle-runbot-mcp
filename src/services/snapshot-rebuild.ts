// src/services/snapshot-rebuild.ts
//
// task43 Stage 1B: Async Rebuild-Job für existierende Snapshots.
//
// Use Case: Snapshot wurde gegen Moodle 5.0 gebaut, Code läuft jetzt auf 5.1.
// Beim regulären Demo-Start triggert Moodle den Upgrade-Pfad automatisch beim
// ersten HTTP-Request — das ist langsam (Cold-Start von 5s auf mehrere Minuten)
// und kann fehlschlagen ("Error reading from database").
//
// Die Rebuild-Funktion bringt den Snapshot kontrolliert auf die neue Code-
// Version: Provisioniert eine pinned Seed-Instanz, restauriert den alten
// Snapshot, lässt Moodle migrieren via admin/cli/upgrade.php, und dumpt das
// Ergebnis als neuen Snapshot mit gleicher ID (überschreibt).
//
// Job-State liegt in-memory — überlebt keinen Server-Restart. Bewusst, weil:
//   - Rebuilds dauern < 10 min, ein Restart in dem Zeitfenster ist selten
//   - Persistente State-Speicherung wäre fragil (Disk-Writes pro Phasenwechsel)
//   - Bei Server-Restart während Rebuild ist die Seed-Instanz verwaist —
//     `cleanupOrphans()` räumt sie beim nächsten Start auf.
//
// Auth: Routen sind hinter `adminAuth` (HTTP Basic Auth, gleiche Credentials
// wie für /admin). Kein Rate-Limit — Admin allein weiß was er tut.

import { randomBytes } from "crypto";
import path from "path";
import { loadConfigs } from "./config.js";
import * as snapshotSvc from "./snapshot.js";
import * as dockerSvc from "./docker.js";
import { saveInstance, deleteInstance, allocatePort } from "./registry.js";
import type { MoodleInstance } from "../types.js";

export type RebuildJobStatus =
  | "starting_seed"
  | "provisioning"
  | "installing_plugin"
  | "starting_containers"
  | "restoring_snapshot"
  | "running_upgrade"
  | "creating_snapshot"
  | "stopping"
  | "done"
  | "error";

export interface RebuildJob {
  jobId:        string;
  snapshotId:   string;
  configId:     string;
  status:       RebuildJobStatus;
  startedAt:    string;
  finishedAt?:  string;
  instanceId?:  string;
  newSnapshot?: snapshotSvc.SnapshotMeta;
  error?:       string;
  log:          string[];   // Neueste am Ende, max 200 Einträge
}

// Process-globaler Job-Store. Schlüssel = jobId.
const rebuildJobs = new Map<string, RebuildJob>();

function logJob(job: RebuildJob, msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  job.log.push(`${ts} ${msg}`);
  console.error(`[rebuild ${job.jobId.slice(0, 6)}] ${msg}`);
  if (job.log.length > 200) job.log = job.log.slice(-200);
}

export function getRebuildJob(jobId: string): RebuildJob | undefined {
  return rebuildJobs.get(jobId);
}

export function listRebuildJobs(limit = 20): RebuildJob[] {
  return Array.from(rebuildJobs.values())
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit);
}

/**
 * Startet einen Rebuild-Job im Hintergrund. Returnt den Job-Eintrag sofort
 * mit Status "starting_seed". Der Caller pollt via `getRebuildJob(jobId)`
 * den Fortschritt.
 *
 * Synchron-Throws:
 *   - Snapshot existiert nicht
 *   - Config existiert nicht
 */
export async function startRebuild(
  snapshotId: string,
  configId: string
): Promise<RebuildJob> {
  const oldSnap = await snapshotSvc.getSnapshot(snapshotId);
  if (!oldSnap) {
    throw new Error(`Snapshot '${snapshotId}' nicht gefunden`);
  }
  const config = (await loadConfigs()).find(c => c.id === configId);
  if (!config) {
    throw new Error(`Config '${configId}' nicht gefunden`);
  }

  const jobId = randomBytes(8).toString("hex");
  const job: RebuildJob = {
    jobId,
    snapshotId,
    configId,
    status: "starting_seed",
    startedAt: new Date().toISOString(),
    log: [],
  };
  rebuildJobs.set(jobId, job);
  logJob(job, `Rebuild-Job für ${snapshotId} via Config ${configId} (Moodle ${config.moodleVersion})`);
  setImmediate(() => runJob(job));
  return job;
}

async function runJob(job: RebuildJob): Promise<void> {
  const PORT_START  = parseInt(process.env.PORT_START ?? "8100");
  const PORT_END    = parseInt(process.env.PORT_END ?? "8199");
  const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "";
  const WORK_DIR    = process.env.RUNBOT_WORK_DIR ?? "/opt/runbot";

  let instance: MoodleInstance | null = null;
  try {
    const configs = await loadConfigs();
    const config = configs.find(c => c.id === job.configId);
    if (!config) throw new Error(`Config ${job.configId} nicht mehr in configs.json`);

    const oldSnap = await snapshotSvc.getSnapshot(job.snapshotId);
    if (!oldSnap) throw new Error(`Snapshot ${job.snapshotId} verschwunden`);

    // ── 1. Seed-Instanz anlegen ───────────────────────────────────────
    const id = `seed-rebuild-${randomBytes(3).toString("hex")}`;
    const composeProject = `runbot-${id}`.replace(/[^a-z0-9-]/g, "-");
    const port = await allocatePort(PORT_START, PORT_END);
    const instanceDir = path.join(WORK_DIR, id);

    instance = {
      id,
      prId: "rebuild",
      branch: "main",
      pluginDir: config.plugin?.srcPath ?? "",
      moodleVersion: config.moodleVersion as MoodleInstance["moodleVersion"],
      phpVersion: config.phpVersion as MoodleInstance["phpVersion"],
      db: config.db as MoodleInstance["db"],
      webPort: port,
      status: "starting",
      url: BASE_DOMAIN ? `https://${id}.${BASE_DOMAIN}` : `http://localhost:${port}`,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      composeProject,
      moodleDockerDir: path.join(instanceDir, "moodle-docker"),
      moodleDir: path.join(instanceDir, "moodle"),
      apiToken: randomBytes(32).toString("hex"),
      configId: job.configId,
      // task30: Cleanup-Scheduler ignoriert pinned Instanzen.
      pinned: true,
      pinReason: `rebuild:${job.snapshotId}`,
    };
    job.instanceId = instance.id;
    await saveInstance(instance);

    // ── 2. Provisioning ──────────────────────────────────────────────
    job.status = "provisioning";
    logJob(job, `Provisioniere Seed-Instanz ${instance.id} mit Moodle ${instance.moodleVersion}`);
    await dockerSvc.provisionInstance(instance);

    if (config.plugin) {
      job.status = "installing_plugin";
      logJob(job, `Installiere Plugin ${config.plugin.type}_${config.plugin.name}`);
      await dockerSvc.installPlugin(
        instance,
        config.plugin.srcPath,
        config.plugin.type,
        config.plugin.name
      );
    }

    // ── 3. Container starten + alten Snapshot restaurieren ───────────────────────
    job.status = "starting_containers";
    logJob(job, `Starte Container (DB: ${instance.db}, PHP: ${instance.phpVersion})`);
    await dockerSvc.startContainers(instance, oldSnap.file);

    job.status = "restoring_snapshot";
    logJob(job, `Restauriere alten Snapshot (${snapshotSvc.formatBytes(oldSnap.sizeBytes)}, Moodle ${oldSnap.moodleVersion})`);
    await snapshotSvc.restoreSnapshot(instance, oldSnap.file);

    // ── 4. Moodle-Upgrade ausführen ────────────────────────────────────
    // admin/cli/upgrade.php migriert die DB-Schema von der alten Snapshot-
    // Version auf die neue Code-Version. Bei Major-Version-Wechseln (5.0 → 5.1)
    // braucht das --allow-unstable. Kann mehrere Minuten dauern.
    job.status = "running_upgrade";
    logJob(job, `Moodle-Upgrade ${oldSnap.moodleVersion} → ${instance.moodleVersion} (kann mehrere Minuten dauern)`);
    const upgradeOut = await dockerSvc.runUpgrade(instance);
    const upgradeLines = upgradeOut.split("\n").length;
    logJob(job, `Upgrade fertig (${upgradeLines} log lines)`);

    // ── 5. Neuen Snapshot dumpen (überschreibt alten) ─────────────────────────
    job.status = "creating_snapshot";
    logJob(job, `Dumpe neuen Snapshot ${job.snapshotId} (überschreibt alten)`);
    const today = new Date().toISOString().slice(0, 10);
    const newDescription = oldSnap.description.includes("rebuilt")
      ? oldSnap.description.replace(/\s*\(rebuilt[^)]+\)/, "") + ` (rebuilt ${today} → Moodle ${instance.moodleVersion})`
      : `${oldSnap.description} (rebuilt ${today} → Moodle ${instance.moodleVersion})`;
    const newMeta = await snapshotSvc.createSnapshot(
      instance,
      job.snapshotId,
      oldSnap.label,
      newDescription,
      oldSnap.plugins
    );
    job.newSnapshot = newMeta;
    logJob(job, `Neuer Snapshot: ${snapshotSvc.formatBytes(newMeta.sizeBytes)} (vorher ${snapshotSvc.formatBytes(oldSnap.sizeBytes)})`);

    // ── 6. Cleanup ────────────────────────────────────────────────────
    job.status = "stopping";
    logJob(job, `Stoppe Seed-Instanz + Cleanup`);
    await dockerSvc.stopContainers(instance);
    await dockerSvc.cleanupInstanceDir(instance);
    await deleteInstance(instance.id);

    job.status = "done";
    job.finishedAt = new Date().toISOString();
    logJob(job, `✓ Rebuild erfolgreich abgeschlossen`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logJob(job, `✗ FEHLER: ${msg.slice(0, 500)}`);
    job.status = "error";
    job.error = msg;
    job.finishedAt = new Date().toISOString();

    // Best-effort Cleanup, damit keine verwaiste Seed-Instanz Ressourcen
    // verbrennt. Fehler beim Cleanup werden nur geloggt, nicht weitergegeben.
    if (instance) {
      try {
        await dockerSvc.stopContainers(instance);
        await dockerSvc.cleanupInstanceDir(instance);
        await deleteInstance(instance.id);
        logJob(job, `Cleanup der Seed-Instanz nach Fehler durchgeführt`);
      } catch (cleanupErr) {
        logJob(job, `WARN: Cleanup fehlgeschlagen: ${String(cleanupErr).slice(0, 200)}`);
      }
    }
  }
}
