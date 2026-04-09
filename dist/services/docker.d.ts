import type { MoodleInstance } from "../types.js";
/**
 * Clone moodle-docker and moodle core for a new instance.
 */
export declare function provisionInstance(instance: MoodleInstance): Promise<void>;
/**
 * Copy a plugin into the Moodle instance's directory tree.
 * pluginSrcPath: local path to plugin root (containing version.php)
 * pluginType: e.g. "mod", "local", "block"
 * pluginName: e.g. "eledialeitnerflow"
 */
export declare function installPlugin(instance: MoodleInstance, pluginSrcPath: string, pluginType: string, pluginName: string): Promise<void>;
/**
 * Start Docker containers for a Moodle instance.
 * Wenn snapshotFile angegeben: Snapshot restaurieren statt leere DB.
 */
export declare function startContainers(instance: MoodleInstance, snapshotFile?: string): Promise<void>;
/**
 * Stop and destroy containers + volumes for an instance.
 */
export declare function stopContainers(instance: MoodleInstance): Promise<void>;
/**
 * Remove instance directory from disk.
 */
export declare function cleanupInstanceDir(instance: MoodleInstance): Promise<void>;
/**
 * Get last N lines of webserver container logs.
 */
export declare function getLogs(instance: MoodleInstance, lines?: number): Promise<string>;
/**
 * Run PHPUnit tests for a specific plugin component.
 * Returns raw output + exit code.
 */
export declare function runPhpunit(instance: MoodleInstance, component?: string): Promise<{
    output: string;
    exitCode: number;
}>;
/**
 * Run Behat tests for a specific tag.
 */
export declare function runBehat(instance: MoodleInstance, tags?: string): Promise<{
    output: string;
    exitCode: number;
}>;
//# sourceMappingURL=docker.d.ts.map