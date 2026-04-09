export type MoodleVersion = "4.3" | "4.4" | "4.5" | "5.0" | "5.1";
export type DbType = "pgsql" | "mariadb" | "mysql";
export type PhpVersion = "8.1" | "8.2" | "8.3" | "8.4";
export type InstanceStatus = "starting" | "running" | "stopping" | "stopped" | "error" | "testing";
export type TestType = "phpunit" | "behat";
export type TestStatus = "pending" | "running" | "passed" | "failed" | "error";
export interface MoodleInstance {
    id: string;
    prId: string;
    branch: string;
    pluginDir: string;
    moodleVersion: MoodleVersion;
    phpVersion: PhpVersion;
    db: DbType;
    webPort: number;
    status: InstanceStatus;
    url: string;
    createdAt: string;
    lastActivity: string;
    composeProject: string;
    moodleDockerDir: string;
    moodleDir: string;
    error?: string;
    maxAgeMinutes?: number;
    extendedBy?: {
        code: string;
        at: string;
    };
    pinned?: boolean;
    pinReason?: string;
}
export interface TestRun {
    id: string;
    instanceId: string;
    type: TestType;
    status: TestStatus;
    startedAt: string;
    finishedAt?: string;
    output?: string;
    summary?: string;
    exitCode?: number;
}
export type DemoPhase = "waiting" | "provisioning" | "installing_plugin" | "starting_containers" | "restoring_snapshot" | "creating_user" | "running" | "error";
export interface DemoRequest {
    token: string;
    email: string;
    name: string;
    configId: string;
    requestedAt: string;
    expiresAt: string;
    confirmedAt?: string;
    instanceId?: string;
    status: "pending" | "confirmed" | "started" | "expired";
    phase?: DemoPhase;
    phaseError?: string;
}
export interface RunbotConfig {
    moodleDockerRepoUrl: string;
    moodleRepoUrl: string;
    workDir: string;
    maxInstances: number;
    portRangeStart: number;
    portRangeEnd: number;
    nginxEnabled: boolean;
    baseDomain?: string;
}
//# sourceMappingURL=types.d.ts.map