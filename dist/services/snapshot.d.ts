import type { MoodleInstance, DbType, MoodleVersion } from "../types.js";
export interface SnapshotMeta {
    id: string;
    label: string;
    description: string;
    dbType: DbType;
    moodleVersion: MoodleVersion;
    phpVersion: string;
    plugins: string[];
    sizeBytes: number;
    createdAt: string;
    file: string;
}
/**
 * Erstellt einen DB-Snapshot einer laufenden Moodle-Instanz.
 * Der Snapshot wird als komprimiertes SQL-Dump gespeichert.
 */
export declare function createSnapshot(instance: MoodleInstance, snapshotId: string, label: string, description: string, plugins: string[]): Promise<SnapshotMeta>;
/**
 * Restauriert einen Snapshot in eine laufende (leere) Moodle-Instanz.
 * Ersetzt install_database.php — wird nach Container-Start aufgerufen.
 */
export declare function restoreSnapshot(instance: MoodleInstance, snapshotFile: string): Promise<void>;
export declare function listSnapshots(): Promise<SnapshotMeta[]>;
export declare function getSnapshot(id: string): Promise<SnapshotMeta | undefined>;
export declare function deleteSnapshot(id: string): Promise<void>;
export declare function formatBytes(bytes: number): string;
//# sourceMappingURL=snapshot.d.ts.map