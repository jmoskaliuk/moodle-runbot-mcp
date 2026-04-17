import * as snapshotSvc from "./snapshot.js";
export type RebuildJobStatus = "starting_seed" | "provisioning" | "installing_plugin" | "starting_containers" | "restoring_snapshot" | "running_upgrade" | "creating_snapshot" | "stopping" | "done" | "error";
export interface RebuildJob {
    jobId: string;
    snapshotId: string;
    configId: string;
    status: RebuildJobStatus;
    startedAt: string;
    finishedAt?: string;
    instanceId?: string;
    newSnapshot?: snapshotSvc.SnapshotMeta;
    error?: string;
    log: string[];
}
export declare function getRebuildJob(jobId: string): RebuildJob | undefined;
export declare function listRebuildJobs(limit?: number): RebuildJob[];
export declare function startRebuild(snapshotId: string, configId: string): Promise<RebuildJob>;
export type EditSessionState = "starting" | "ready" | "saving" | "saved" | "discarding" | "discarded" | "error";
export interface EditSession {
    sessionId: string;
    snapshotId: string;
    configId: string;
    state: EditSessionState;
    startedAt: string;
    finishedAt?: string;
    instanceId?: string;
    url?: string;
    newSnapshot?: snapshotSvc.SnapshotMeta;
    error?: string;
    log: string[];
}
export declare function getEditSession(sessionId: string): EditSession | undefined;
export declare function getEditSessionBySnapshot(snapshotId: string): EditSession | undefined;
export declare function listActiveEditSessions(): EditSession[];
/**
 * Startet eine Edit-Session. Wenn schon eine für denselben Snapshot läuft,
 * wird sie zurückgegeben statt eine neue zu erstellen (idempotent).
 */
export declare function startEditSession(snapshotId: string, configId: string): Promise<EditSession>;
/**
 * Speichert die Edit-Session: createSnapshot überschreibt den alten Dump,
 * dann wird die Seed-Instanz gestoppt + aufgeräumt. Async — returnt
 * sofort, der State läuft über Polling von getEditSession().
 */
export declare function saveEditSession(sessionId: string): Promise<EditSession>;
/**
 * Verwirft die Edit-Session: stoppt + räumt die Seed-Instanz auf, ohne den
 * Snapshot zu ändern. Synchron — ist schnell genug (~5s für docker stop).
 */
export declare function cancelEditSession(sessionId: string): Promise<EditSession>;
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
export declare function recoverEditSessionsFromRegistry(): Promise<number>;
//# sourceMappingURL=snapshot-admin.d.ts.map