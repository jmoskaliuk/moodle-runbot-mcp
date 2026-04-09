/**
 * Schreibt eine nginx-Config für eine Demo-Instanz und reloaded nginx.
 * Wird nach erfolgreichem instance_start aufgerufen.
 */
export declare function registerInstance(instanceId: string, port: number): Promise<void>;
/**
 * Löscht die nginx-Config einer Instanz und reloaded nginx.
 * Wird nach instance_stop aufgerufen.
 */
export declare function unregisterInstance(instanceId: string): Promise<void>;
/**
 * Räumt alle demo-*.conf Dateien auf.
 * Nützlich beim Server-Neustart.
 */
export declare function cleanupAllConfigs(): Promise<void>;
//# sourceMappingURL=nginx.d.ts.map