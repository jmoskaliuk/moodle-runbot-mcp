import type { MoodleInstance, TestRun } from "../types.js";
export declare function getAllInstances(): Promise<MoodleInstance[]>;
export declare function getInstance(id: string): Promise<MoodleInstance | undefined>;
export declare function saveInstance(instance: MoodleInstance): Promise<void>;
export declare function deleteInstance(id: string): Promise<void>;
export declare function saveTestRun(run: TestRun): Promise<void>;
export declare function getTestRun(id: string): Promise<TestRun | undefined>;
export declare function getTestRunsForInstance(instanceId: string): Promise<TestRun[]>;
export declare function allocatePort(start: number, end: number): Promise<number>;
//# sourceMappingURL=registry.d.ts.map