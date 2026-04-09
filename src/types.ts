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

  // task26 / feat12: Extension-Codes
  // Wenn gesetzt, überschreibt `maxAgeMinutes` den globalen
  // `DEMO_MAX_AGE_MINUTES` — gerechnet wird ab `extendedBy.at`, damit
  // eine nach 58 Min verlängerte Instanz nicht unmittelbar danach
  // abläuft.
  maxAgeMinutes?: number;
  extendedBy?: {
    code: string;           // Welcher Code wurde eingelöst (uppercase)
    at:   string;           // ISO-Timestamp der Verlängerung
  };

  // task30: Snapshot-Building / Admin-gepinnte Instanzen
  // Wenn `pinned === true`, wird die Instanz vom Cleanup-Scheduler komplett
  // ignoriert — weder `maxAge` noch `inactivity` triggern einen Stop. Wird
  // vom `snapshot_build`-Workflow genutzt, damit der Scheduler die Instanz
  // nicht mitten im pg_dump abräumt. Auch sinnvoll für manuell via Admin-UI
  // angepinnte Langläufer (z.B. Dauer-Demo für Messen).
  pinned?:    boolean;
  pinReason?: string;       // menschenlesbar, z.B. "snapshot_build:exam2pdf-v1"
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

export type DemoPhase =
  | "waiting"              // Token bestätigt, Hintergrund-Job läuft noch nicht
  | "provisioning"         // moodle-docker + Moodle-Core werden geklont + config.php gepatcht
  | "installing_plugin"    // Plugin wird ins Moodle-Verzeichnis kopiert
  | "starting_containers"  // docker compose up + DB-Init
  | "restoring_snapshot"   // optional: Snapshot wird in die DB importiert
  | "creating_user"        // Moodle-Nutzer + Kurs-Einschreibung
  | "running"              // alles fertig
  | "error";               // irgendwo gecrashed

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
  phase?:        DemoPhase; // aktueller Provisioning-Schritt (für Live-Status auf Warteseite, feat09)
  phaseError?:   string;    // menschenlesbare Fehlermeldung falls phase === "error"
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
