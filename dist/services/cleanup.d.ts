export declare function startCleanupScheduler(): void;
export declare function recordActivity(instanceId: string): Promise<void>;
export interface OrphanCleanupReport {
    orphanContainers: string[];
    orphanDirs: string[];
    orphanConfigs: string[];
    errors: string[];
}
/**
 * Einmaliger Cleanup beim Serverstart. Läuft best-effort: ein einzelner
 * Fehler killt nicht den gesamten Startup, aber jeder Fehler wird geloggt.
 */
export declare function cleanupOrphans(): Promise<OrphanCleanupReport>;
//# sourceMappingURL=cleanup.d.ts.map