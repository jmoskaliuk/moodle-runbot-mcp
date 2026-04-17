import type { MoodleInstance } from "../types.js";
export declare function provisionInstance(instance: MoodleInstance): Promise<void>;
export declare function installPlugin(instance: MoodleInstance, pluginSrcPath: string, pluginType: string, pluginName: string): Promise<void>;
export declare function startContainers(instance: MoodleInstance, snapshotFile?: string): Promise<void>;
export declare function runUpgrade(instance: MoodleInstance): Promise<string>;
export declare function setSiteName(instance: MoodleInstance, siteName: string): Promise<void>;
export declare function stopContainers(instance: MoodleInstance): Promise<void>;
export declare function cleanupInstanceDir(instance: MoodleInstance): Promise<void>;
export declare function getLogs(instance: MoodleInstance, lines?: number): Promise<string>;
export declare function runPhpunit(instance: MoodleInstance, component?: string): Promise<{
    output: string;
    exitCode: number;
}>;
export declare function runBehat(instance: MoodleInstance, tags?: string): Promise<{
    output: string;
    exitCode: number;
}>;
//# sourceMappingURL=docker.d.ts.map