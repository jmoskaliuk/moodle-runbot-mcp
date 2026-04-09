// src/types.ts

export type MoodleVersion = "4.3" | "4.4" | "4.5" | "5.0" | "5.1";
export type DbType = "pgsql" | "mariadb" | "mysql";
export type PhpVersion = "8.1" | "8.2" | "8.3" | "8.4";
export type InstanceStatus = "starting" | "running" | "stopping" | "stopped" | "error" | "testing";
export type TestType = "phpunit" | "behat";
export type TestStatus = "pending" | "running" | "passed" | "failed" | "error";

export interface MoodleInstance {
  id: string;               // e.g. "pr-42-abc123"
  prId: string;             // GitHub PR id
  branch: string;           // git branch name
  pluginDir: string;        // local path where plugin is checked out
  moodleVersion: MoodleVersion;
  phpVersion: PhpVersion;
  db: DbType;
  webPort: number;          // host port, e.g. 8042
  status: InstanceStatus;
  url: string;              // e.g. http://pr-42.runbot.example.com or http://localhost:8042
  createdAt: string;        // ISO timestamp
  lastActivity: string;     // ISO timestamp
  composeProject: string;   // COMPOSE_PROJECT_NAME
  moodleDockerDir: string;  // path to cloned moodle-docker repo
  moodleDir: string;        // path to moodle codebase
  error?: string;
}

export interface TestRun {
  id: string;
  instanceId: string;
  type: TestType;
  status: TestStatus;
  startedAt: string;
  finishedAt?: string;
  output?: string;
  summary?: string;         // "12 passed, 2 failed" etc.
  exitCode?: number;
}

// ── Demo-Anfragen ─────────────────────────────────────────────────────────────

export interface DemoRequest {
  token:         string;    // Zufälliger Token (URL-safe, 32 Zeichen)
  email:         string;    // E-Mail-Adresse des Interessenten
  name:          string;    // Name (optional, Default: "Demo-Nutzer")
  configId:      string;    // Plugin-Config-ID, z.B. "leitnerflow"
  requestedAt:   string;    // ISO-Timestamp der Anfrage
  expiresAt:     string;    // ISO-Timestamp (24h nach requestedAt)
  confirmedAt?:  string;    // ISO-Timestamp der E-Mail-Bestätigung
  instanceId?:   string;    // Gesetzt sobald Demo gestartet
  status:        "pending" | "confirmed" | "started" | "expired";
}

export interface RunbotConfig {
  moodleDockerRepoUrl: string;
  moodleRepoUrl: string;
  workDir: string;          // base dir for all instances, e.g. /opt/runbot
  maxInstances: number;
  portRangeStart: number;
  portRangeEnd: number;
  nginxEnabled: boolean;
  baseDomain?: string;      // e.g. runbot.example.com → pr-42.runbot.example.com
}
