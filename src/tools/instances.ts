// src/tools/instances.ts
// All MCP tool registrations for the Moodle Runbot.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomBytes } from "crypto";
import path from "path";
import type { MoodleInstance, TestRun } from "../types.js";
import * as registry from "../services/registry.js";
import * as docker from "../services/docker.js";
import * as nginx from "../services/nginx.js";
import * as snapshotSvc from "../services/snapshot.js";

const WORK_DIR = process.env.RUNBOT_WORK_DIR ?? "/opt/runbot";
const PORT_START = parseInt(process.env.PORT_START ?? "8100");
const PORT_END = parseInt(process.env.PORT_END ?? "8199");
const BASE_DOMAIN = process.env.BASE_DOMAIN ?? ""; // e.g. runbot.example.com

function instanceUrl(instance: MoodleInstance): string {
  if (BASE_DOMAIN) return `http://${instance.id}.${BASE_DOMAIN}`;
  return `http://localhost:${instance.webPort}`;
}

function shortId(): string {
  return randomBytes(3).toString("hex");
}

// ── Tool: instance_start ──────────────────────────────────────────────────────

export function registerInstanceStart(server: McpServer): void {
  server.registerTool(
    "instance_start",
    {
      title: "Start Moodle Instance",
      description: `Provision and start a new Moodle Docker instance for testing a plugin branch.

Clones moodle-docker and Moodle core, installs the plugin, and starts all containers.
Returns an instance ID and URL once running.

Returns:
  { instanceId, url, webPort, status }

Examples:
  - "Start a Moodle 5.0 instance for PR #42 on branch feature/my-quiz" 
  - "Spin up a test instance with PHP 8.3 and MariaDB"`,
      inputSchema: z.object({
        prId: z.string().describe("GitHub PR ID or any label, e.g. '42'"),
        branch: z.string().describe("Git branch of the plugin to test, e.g. 'feature/my-quiz'"),
        pluginSrcPath: z.string().describe("Absolute path to the plugin source directory on the server"),
        pluginType: z.string().default("mod").describe("Moodle plugin type: mod, local, block, tool, etc."),
        pluginName: z.string().describe("Plugin shortname, e.g. 'eledialeitnerflow'"),
        moodleVersion: z.enum(["4.3", "4.4", "4.5", "5.0", "5.1"]).default("5.0"),
        phpVersion: z.enum(["8.1", "8.2", "8.3", "8.4"]).default("8.3"),
        db: z.enum(["pgsql", "mariadb", "mysql"]).default("pgsql"),
        snapshotId: z.string().optional()
          .describe("Optional: Snapshot-ID für Demo-Daten, z.B. 'leitnerflow-v1'. " +
                    "Wenn angegeben: DB aus Snapshot (schnell, mit Demo-Daten). " +
                    "Ohne: leere Moodle-Installation."),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ prId, branch, pluginSrcPath, pluginType, pluginName, moodleVersion, phpVersion, db, snapshotId }) => {
      const id = `pr-${prId}-${shortId()}`;
      const composeProject = `runbot-${id}`.replace(/[^a-z0-9-]/g, "-");
      const instanceDir = path.join(WORK_DIR, id);

      // Snapshot prüfen falls angegeben
      let snapshotMeta: snapshotSvc.SnapshotMeta | undefined;
      if (snapshotId) {
        snapshotMeta = await snapshotSvc.getSnapshot(snapshotId);
        if (!snapshotMeta) {
          return { content: [{ type: "text", text: `Fehler: Snapshot '${snapshotId}' nicht gefunden. Verfügbare Snapshots mit snapshot_list abrufen.` }] };
        }
        // DB-Typ aus Snapshot übernehmen
        if (snapshotMeta.dbType !== db) {
          return { content: [{ type: "text", text: `Fehler: Snapshot '${snapshotId}' wurde mit DB-Typ '${snapshotMeta.dbType}' erstellt, aber '${db}' wurde angegeben. Bitte db='${snapshotMeta.dbType}' verwenden.` }] };
        }
      }

      let port: number;
      try {
        port = await registry.allocatePort(PORT_START, PORT_END);
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${String(e)}` }] };
      }

      const instance: MoodleInstance = {
        id,
        prId,
        branch,
        pluginDir: pluginSrcPath,
        moodleVersion,
        phpVersion,
        db,
        webPort: port,
        status: "starting",
        url: "",
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        composeProject,
        moodleDockerDir: path.join(instanceDir, "moodle-docker"),
        moodleDir: path.join(instanceDir, "moodle"),
      };
      instance.url = instanceUrl(instance);

      await registry.saveInstance(instance);

      try {
        await docker.provisionInstance(instance);
        await docker.installPlugin(instance, pluginSrcPath, pluginType, pluginName);
        await docker.startContainers(instance, snapshotMeta?.file);

        // Snapshot restaurieren wenn angegeben
        if (snapshotMeta) {
          await snapshotSvc.restoreSnapshot(instance, snapshotMeta.file);
        }

        instance.status = "running";
        instance.lastActivity = new Date().toISOString();
        await registry.saveInstance(instance);

        // nginx-Config schreiben damit Subdomain erreichbar ist
        await nginx.registerInstance(instance.id, instance.webPort);

        const result = { instanceId: id, url: instance.url, webPort: port, status: "running" };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
      } catch (e) {
        instance.status = "error";
        instance.error = String(e);
        await registry.saveInstance(instance);
        return { content: [{ type: "text", text: `Error starting instance: ${String(e)}` }] };
      }
    }
  );
}

// ── Tool: instance_stop ───────────────────────────────────────────────────────

export function registerInstanceStop(server: McpServer): void {
  server.registerTool(
    "instance_stop",
    {
      title: "Stop & Destroy Moodle Instance",
      description: `Stop containers and clean up all files for a Moodle instance.

This permanently deletes the instance, its database, and all files.

Args:
  - instanceId: ID returned by instance_start

Returns:
  { instanceId, status: "stopped" }`,
      inputSchema: z.object({
        instanceId: z.string().describe("Instance ID from instance_start, e.g. 'pr-42-abc123'"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ instanceId }) => {
      const instance = await registry.getInstance(instanceId);
      if (!instance) {
        return { content: [{ type: "text", text: `Error: Instance '${instanceId}' not found` }] };
      }

      instance.status = "stopping";
      await registry.saveInstance(instance);

      await nginx.unregisterInstance(instanceId);
      await docker.stopContainers(instance);
      await docker.cleanupInstanceDir(instance);
      await registry.deleteInstance(instanceId);

      const result = { instanceId, status: "stopped" };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    }
  );
}

// ── Tool: instance_status ─────────────────────────────────────────────────────

export function registerInstanceStatus(server: McpServer): void {
  server.registerTool(
    "instance_status",
    {
      title: "Get Moodle Instance Status",
      description: `Get detailed status of a specific Moodle instance.

Returns instance metadata, URL, current status, and recent test runs.

Returns:
  { instanceId, status, url, moodleVersion, phpVersion, db, createdAt, testRuns[] }`,
      inputSchema: z.object({
        instanceId: z.string().describe("Instance ID, e.g. 'pr-42-abc123'"),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ instanceId }) => {
      const instance = await registry.getInstance(instanceId);
      if (!instance) {
        return { content: [{ type: "text", text: `Error: Instance '${instanceId}' not found` }] };
      }

      const testRuns = await registry.getTestRunsForInstance(instanceId);
      const result = { ...instance, testRuns };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    }
  );
}

// ── Tool: instance_list ───────────────────────────────────────────────────────

export function registerInstanceList(server: McpServer): void {
  server.registerTool(
    "instance_list",
    {
      title: "List All Moodle Instances",
      description: `List all running and stopped Moodle test instances.

Returns:
  { count, instances: [{ instanceId, prId, branch, status, url, moodleVersion, createdAt }] }`,
      inputSchema: z.object({
        statusFilter: z.enum(["all", "running", "stopped", "error"]).default("all")
          .describe("Filter instances by status"),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ statusFilter }) => {
      let instances = await registry.getAllInstances();
      if (statusFilter !== "all") {
        instances = instances.filter((i) => i.status === statusFilter);
      }

      const summary = instances.map(({ id, prId, branch, status, url, moodleVersion, createdAt }) => ({
        instanceId: id, prId, branch, status, url, moodleVersion, createdAt,
      }));
      const result = { count: summary.length, instances: summary };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    }
  );
}

// ── Tool: instance_logs ───────────────────────────────────────────────────────

export function registerInstanceLogs(server: McpServer): void {
  server.registerTool(
    "instance_logs",
    {
      title: "Get Moodle Instance Logs",
      description: `Fetch recent webserver container logs for a Moodle instance.

Useful for debugging startup errors, PHP fatal errors, or Moodle warnings.

Args:
  - instanceId: The instance ID
  - lines: Number of log lines to return (default 100, max 500)

Returns:
  { instanceId, lines, log }`,
      inputSchema: z.object({
        instanceId: z.string().describe("Instance ID"),
        lines: z.number().int().min(10).max(500).default(100).describe("Number of log lines"),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ instanceId, lines }) => {
      const instance = await registry.getInstance(instanceId);
      if (!instance) {
        return { content: [{ type: "text", text: `Error: Instance '${instanceId}' not found` }] };
      }

      const log = await docker.getLogs(instance, lines);
      const result = { instanceId, lines, log };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    }
  );
}

// ── Tool: instance_run_tests ──────────────────────────────────────────────────

export function registerInstanceRunTests(server: McpServer): void {
  server.registerTool(
    "instance_run_tests",
    {
      title: "Run Tests on Moodle Instance",
      description: `Run PHPUnit or Behat tests on a Moodle instance.

PHPUnit: runs unit/integration tests. Specify component to limit scope.
Behat: runs acceptance tests. Specify tags to limit scope (e.g. "@mod_myplugin").

Args:
  - instanceId: The instance to run tests on
  - type: "phpunit" or "behat"
  - component: (PHPUnit) component name, e.g. "mod_eledialeitnerflow". Omit for all.
  - tags: (Behat) tag filter, e.g. "@mod_eledialeitnerflow". Omit for all.

Returns:
  { testRunId, instanceId, type, status, summary, output }

Note: Tests run synchronously and may take several minutes. Output is truncated to 50KB.`,
      inputSchema: z.object({
        instanceId: z.string().describe("Instance ID"),
        type: z.enum(["phpunit", "behat"]).describe("Test type to run"),
        component: z.string().optional().describe("(PHPUnit) Component to test, e.g. 'mod_eledialeitnerflow'"),
        tags: z.string().optional().describe("(Behat) Tag filter, e.g. '@mod_eledialeitnerflow'"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ instanceId, type, component, tags }) => {
      const instance = await registry.getInstance(instanceId);
      if (!instance) {
        return { content: [{ type: "text", text: `Error: Instance '${instanceId}' not found` }] };
      }
      if (instance.status !== "running") {
        return { content: [{ type: "text", text: `Error: Instance '${instanceId}' is not running (status: ${instance.status})` }] };
      }

      const runId = `${instanceId}-${type}-${shortId()}`;
      const testRun: TestRun = {
        id: runId,
        instanceId,
        type,
        status: "running",
        startedAt: new Date().toISOString(),
      };
      await registry.saveTestRun(testRun);

      instance.status = "testing";
      await registry.saveInstance(instance);

      try {
        let output: string;
        let exitCode: number;

        if (type === "phpunit") {
          ({ output, exitCode } = await docker.runPhpunit(instance, component));
        } else {
          ({ output, exitCode } = await docker.runBehat(instance, tags));
        }

        // Truncate to 50KB
        const truncated = output.length > 50_000
          ? output.slice(0, 50_000) + "\n\n[... output truncated to 50KB ...]"
          : output;

        const summary = extractSummary(output, type);

        testRun.status = exitCode === 0 ? "passed" : "failed";
        testRun.finishedAt = new Date().toISOString();
        testRun.output = truncated;
        testRun.summary = summary;
        testRun.exitCode = exitCode;
        await registry.saveTestRun(testRun);

        instance.status = "running";
        instance.lastActivity = new Date().toISOString();
        await registry.saveInstance(instance);

        const result = {
          testRunId: runId,
          instanceId,
          type,
          status: testRun.status,
          summary,
          output: truncated,
        };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
      } catch (e) {
        testRun.status = "error";
        testRun.finishedAt = new Date().toISOString();
        testRun.output = String(e);
        await registry.saveTestRun(testRun);

        instance.status = "running";
        await registry.saveInstance(instance);

        return { content: [{ type: "text", text: `Error running tests: ${String(e)}` }] };
      }
    }
  );
}

// ── Tool: instance_extend ─────────────────────────────────────────────────────

export function registerInstanceExtend(server: McpServer): void {
  const MAX_EXTENSIONS = parseInt(process.env.MAX_EXTENSIONS ?? "2");
  const EXTEND_MINUTES = parseInt(process.env.EXTEND_MINUTES ?? "30");

  server.registerTool(
    "instance_extend",
    {
      title: "Extend Demo Instance Lifetime",
      description: `Extend a running Moodle demo instance by ${EXTEND_MINUTES} minutes.
Customers can extend up to ${MAX_EXTENSIONS} times per instance.

Returns:
  { instanceId, newExpiresAt, extensionsUsed, extensionsRemaining }`,
      inputSchema: z.object({
        instanceId: z.string().describe("Instance ID to extend"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ instanceId }) => {
      const instance = await registry.getInstance(instanceId);
      if (!instance) {
        return { content: [{ type: "text", text: `Error: Instance '${instanceId}' not found` }] };
      }
      if (instance.status !== "running") {
        return { content: [{ type: "text", text: `Error: Instance is not running (status: ${instance.status})` }] };
      }

      const extensions = (instance as MoodleInstance & { extensions?: number }).extensions ?? 0;
      if (extensions >= MAX_EXTENSIONS) {
        return { content: [{ type: "text", text: `Error: Maximum extensions (${MAX_EXTENSIONS}) reached` }] };
      }

      // Push createdAt forward by EXTEND_MINUTES to delay expiry
      const current = new Date(instance.createdAt).getTime();
      const newCreatedAt = new Date(current + EXTEND_MINUTES * 60 * 1000).toISOString();
      (instance as MoodleInstance & { extensions?: number }).extensions = extensions + 1;
      instance.createdAt = newCreatedAt;
      instance.lastActivity = new Date().toISOString();
      await registry.saveInstance(instance);

      const maxAgeMs = parseInt(process.env.DEMO_MAX_AGE_MINUTES ?? "60") * 60 * 1000;
      const expiresAt = new Date(new Date(newCreatedAt).getTime() + maxAgeMs).toISOString();

      const result = {
        instanceId,
        newExpiresAt: expiresAt,
        extensionsUsed: extensions + 1,
        extensionsRemaining: MAX_EXTENSIONS - (extensions + 1),
      };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    }
  );
}

// ── Tool: instance_time_remaining ─────────────────────────────────────────────

export function registerInstanceTimeRemaining(server: McpServer): void {
  server.registerTool(
    "instance_time_remaining",
    {
      title: "Get Demo Time Remaining",
      description: `Get how many minutes remain before a demo instance is automatically stopped.
Useful for showing a countdown timer in the demo portal.

Returns:
  { instanceId, minutesRemaining, expiresAt, canExtend }`,
      inputSchema: z.object({
        instanceId: z.string().describe("Instance ID"),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ instanceId }) => {
      const instance = await registry.getInstance(instanceId);
      if (!instance) {
        return { content: [{ type: "text", text: `Error: Instance '${instanceId}' not found` }] };
      }

      const maxAgeMs = parseInt(process.env.DEMO_MAX_AGE_MINUTES ?? "60") * 60 * 1000;
      const maxExtensions = parseInt(process.env.MAX_EXTENSIONS ?? "2");
      const createdAt = new Date(instance.createdAt).getTime();
      const expiresAt = new Date(createdAt + maxAgeMs);
      const msRemaining = expiresAt.getTime() - Date.now();
      const minutesRemaining = Math.max(0, Math.round(msRemaining / 60000));
      const extensions = (instance as MoodleInstance & { extensions?: number }).extensions ?? 0;

      const result = {
        instanceId,
        minutesRemaining,
        expiresAt: expiresAt.toISOString(),
        canExtend: extensions < maxExtensions && instance.status === "running",
        extensionsUsed: extensions,
        extensionsRemaining: maxExtensions - extensions,
      };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    }
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractSummary(output: string, type: "phpunit" | "behat"): string {
  if (type === "phpunit") {
    // PHPUnit: "Tests: 42, Assertions: 84, Failures: 2."
    const match = output.match(/Tests:\s*\d+.*(?:Failures?:\s*\d+)?/);
    if (match) return match[0].trim();
    if (output.includes("OK (")) {
      const ok = output.match(/OK \(\d+ tests?.*?\)/);
      if (ok) return ok[0];
    }
  } else {
    // Behat: "3 scenarios (2 passed, 1 failed)"
    const match = output.match(/\d+ scenarios? \([^)]+\)/);
    if (match) return match[0];
  }
  return output.includes("FAILURES") || output.includes("failed") ? "Tests failed" : "Tests passed";
}
