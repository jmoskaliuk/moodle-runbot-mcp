// src/index.ts
// Moodle Runbot MCP Server
// Orchestrates moodlehq/moodle-docker instances for CI testing.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import rateLimit from "express-rate-limit";
import basicAuth from "express-basic-auth";

import { startCleanupScheduler, recordActivity, cleanupOrphans } from "./services/cleanup.js";

import {
  registerInstanceStart,
  registerInstanceStop,
  registerInstanceStatus,
  registerInstanceList,
  registerInstanceLogs,
  registerInstanceRunTests,
  registerInstanceExtend,
  registerInstanceTimeRemaining,
} from "./tools/instances.js";

import {
  registerSnapshotList,
  registerSnapshotCreate,
  registerSnapshotDelete,
  registerSnapshotBuild,
} from "./tools/snapshots.js";

import {
  registerConfigList,
  registerConfigGet,
} from "./tools/configs.js";

import { loadConfigs, updateConfig } from "./services/config.js";
import * as tokens from "./services/tokens.js";
import * as email from "./services/email.js";
import * as github from "./services/github.js";
import * as snapshotSvc from "./services/snapshot.js";
import { DEMO_PASSWORD } from "./services/moodleUser.js";
import { getInstance, getAllInstances, saveInstance, deleteInstance, allocatePort } from "./services/registry.js";
import * as dockerSvc from "./services/docker.js";
import * as nginxSvc from "./services/nginx.js";
import { randomBytes } from "crypto";
import path from "path";
import type { MoodleInstance } from "./types.js";
import { buildInternalRouter } from "./api/internal.js";

// ── Server setup ─────────────────────────────────────────────────────

const server = new McpServer({
  name: "moodle-runbot-mcp-server",
  version: "0.1.0",
});

// Register all tools
registerInstanceStart(server);
registerInstanceStop(server);
registerInstanceStatus(server);
registerInstanceList(server);
registerInstanceLogs(server);
registerInstanceRunTests(server);
registerInstanceExtend(server);
registerInstanceTimeRemaining(server);

// Snapshot tools
registerSnapshotList(server);
registerSnapshotCreate(server);
registerSnapshotDelete(server);
registerSnapshotBuild(server);

// Config tools
registerConfigList(server);
registerConfigGet(server);

// ── Transport selection ─────────────────────────────────────────────────

const transport = process.env.TRANSPORT ?? "stdio";

// ── Extend-Codes (task26 / feat12) ────────────────────────────────────
const EXTEND_CODES: Set<string> = new Set(
  (process.env.EXTEND_CODES ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
);
const EXTEND_CODE_TTL_MINUTES: number = parseInt(
  process.env.EXTEND_CODE_TTL_MINUTES ?? "1440",
  10
);
if (EXTEND_CODES.size > 0) {
  console.error(
    `[extend-codes] ${EXTEND_CODES.size} code(s) loaded, TTL=${EXTEND_CODE_TTL_MINUTES}min`
  );
}

// ── Admin-Dashboard (task25 / feat11) ───────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
if (!ADMIN_PASSWORD) {
  console.error("[admin] FEHLER: ADMIN_PASSWORD nicht gesetzt — Server wird nicht gestartet.");
  console.error("[admin] Bitte ADMIN_PASSWORD in /etc/moodle-runbot.env setzen und Service neu starten.");
  process.exit(1);
}
const adminAuth = basicAuth({
  users: { admin: ADMIN_PASSWORD },
  challenge: true,
  realm: "eLeDia Runbot Admin",
});

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  const demoLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: "Zu viele Anfragen. Bitte warte 15 Minuten." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const MCP_API_KEY = process.env.MCP_API_KEY ?? "";
  const mcpAuthMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!MCP_API_KEY) { next(); return; }
    const key = req.headers["x-api-key"] ?? req.query["api_key"];
    if (key !== MCP_API_KEY) {
      res.status(403).json({ error: "Forbidden: Invalid API key" });
      return;
    }
    next();
  };

  const allowedOrigins = (process.env.CORS_ORIGINS ?? "*").split(",").map(s => s.trim());
  app.use((req, res, next) => {
    const origin = req.headers.origin ?? "*";
    const allowed = allowedOrigins.includes("*") || allowedOrigins.includes(origin);
    if (allowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") { res.sendStatus(204); return; }
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "moodle-runbot-mcp-server" });
  });

  const configsHandler = async (_req: express.Request, res: express.Response) => {
    try {
      const all = await loadConfigs();
      const visible = all.filter(c => c.visible !== false);
      const configs = await Promise.all(
        visible.map(async c => {
          const iconUrl = c.githubRepo
            ? await github.resolvePluginIconUrl(c.githubRepo).catch(() => null)
            : null;
          return { ...c, iconUrl };
        })
      );
      res.json({ count: configs.length, configs });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  };
  app.get("/configs", configsHandler);

  app.post("/mcp", mcpAuthMiddleware, async (req, res) => {
    const t = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => t.close());
    await server.connect(t);
    await t.handleRequest(req, res, req.body);
  });

  app.post("/ping/:instanceId", async (req, res) => {
    await recordActivity(req.params.instanceId).catch(() => {});
    res.json({ ok: true });
  });

  // ── Demo-Anfrage-Flow ──────────────────────────────────────────

  app.post("/request-demo", demoLimiter, async (req, res) => {
    const { email: userEmail, name, configId } = req.body as {
      email?: string; name?: string; configId?: string;
    };

    if (!userEmail || !configId) {
      res.status(400).json({ error: "email und configId sind erforderlich" });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      res.status(400).json({ error: "Ungültige E-Mail-Adresse" });
      return;
    }

    const configs = await loadConfigs().catch(() => []);
    const config = configs.find(c => c.id === configId);
    if (!config) {
      res.status(404).json({ error: `Config '${configId}' nicht gefunden` });
      return;
    }

    try {
      const request = await tokens.createRequest(
        userEmail,
        name ?? "Demo-Nutzer",
        configId
      );

      await email.sendConfirmationEmail(request, config.name);

      res.json({
        ok: true,
        message: "Bestätigungs-E-Mail wurde gesendet.",
        ...(process.env.NODE_ENV === "development" ? { token: request.token } : {}),
      });
    } catch (e) {
      console.error("[request-demo] Fehler:", e);
      res.status(500).json({ error: "E-Mail konnte nicht gesendet werden" });
    }
  });

  app.get("/confirm/:token", async (req, res) => {
    const { token } = req.params;

    const result = await tokens.confirmRequest(token);
    if (!result) {
      res.status(400).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:80px;color:#555">
          <h2>Link ungültig oder abgelaufen</h2>
          <p>Bitte fordern Sie eine neue Demo an.</p>
          <a href="${process.env.BASE_URL ?? '/'}" style="color:#1a56db">→ Zurück zum Portal</a>
        </body></html>
      `);
      return;
    }
    const { request, alreadyStarted } = result;

    if (request.status === "started" && request.instanceId) {
      const inst = await getInstance(request.instanceId);
      if (inst?.status === "running") {
        res.redirect(inst.url);
        return;
      }
    }

    const configs = await loadConfigs().catch(() => []);
    const config = configs.find(c => c.id === request.configId);
    if (!config) {
      res.status(500).send("<html><body>Konfiguration nicht gefunden.</body></html>");
      return;
    }

    const loadingHtml = buildLoadingPage(
      request.name.split(" ")[0],
      config.name,
      token
    );
    res.send(loadingHtml);

    if (alreadyStarted) {
      console.log(`[confirm] Token ${token.slice(0,6)}… bereits confirmed — Loading Page ohne neuen Job`);
      return;
    }

    setImmediate(async () => {
      try {
        await tokens.setPhase(token, "provisioning");

        const id = `demo-${request.configId}-${randomBytes(3).toString("hex")}`;
        const composeProject = `runbot-${id}`.replace(/[^a-z0-9-]/g, "-");
        const WORK_DIR = process.env.RUNBOT_WORK_DIR ?? "/opt/runbot";
        const PORT_START = parseInt(process.env.PORT_START ?? "8100");
        const PORT_END = parseInt(process.env.PORT_END ?? "8199");
        const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "";

        const port = await allocatePort(PORT_START, PORT_END);
        const instanceDir = path.join(WORK_DIR, id);

        const apiToken = randomBytes(32).toString("hex");

        const instance: MoodleInstance = {
          id, prId: "demo", branch: "main",
          pluginDir: config.plugin?.srcPath ?? "",
          moodleVersion: config.moodleVersion as MoodleInstance["moodleVersion"],
          phpVersion: config.phpVersion as MoodleInstance["phpVersion"],
          db: config.db as MoodleInstance["db"],
          webPort: port,
          status: "starting",
          url: BASE_DOMAIN ? `https://${id}.${BASE_DOMAIN}` : `http://localhost:${port}`,
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          composeProject,
          moodleDockerDir: path.join(instanceDir, "moodle-docker"),
          moodleDir: path.join(instanceDir, "moodle"),
          apiToken,
          configId: request.configId,
        };

        await saveInstance(instance);

        await dockerSvc.provisionInstance(instance);
        if (config.plugin) {
          await tokens.setPhase(token, "installing_plugin");
          await dockerSvc.installPlugin(
            instance,
            config.plugin.srcPath,
            config.plugin.type,
            config.plugin.name
          );
        }

        const snap = config.snapshotId
          ? await snapshotSvc.getSnapshot(config.snapshotId)
          : undefined;

        await tokens.setPhase(token, "starting_containers");
        await dockerSvc.startContainers(instance, snap?.file);
        if (snap) {
          await tokens.setPhase(token, "restoring_snapshot");
          await snapshotSvc.restoreSnapshot(instance, snap.file);
        }

        await dockerSvc
          .setSiteName(instance, `Demo | ${config.name}`)
          .catch((e: unknown) => console.error(`[confirm] setSiteName WARN:`, e));

        instance.status = "running";
        instance.lastActivity = new Date().toISOString();
        await saveInstance(instance);
        await nginxSvc.registerInstance(instance.id, instance.webPort);
        await tokens.markStarted(token, instance.id);

        await email.sendDemoReadyEmail(request, config.name, instance.url);

      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[confirm] Demo-Start fehlgeschlagen:", e);
        await tokens.setPhase(token, "error", msg).catch(() => {});
        await email.sendErrorEmail(request, config.name).catch((mailErr) => {
          console.error("[confirm] Fehler-E-Mail konnte nicht gesendet werden:", mailErr);
        });
      }
    });
  });

  // ── Live-Status der Demo-Provisionierung (feat09) ────────────────────────
  const demoStatusHandler: express.RequestHandler = async (req, res) => {
    const { token } = req.params;
    let request;
    try {
      request = await tokens.getRequest(token);
    } catch (e) {
      console.error(`[api/demo-status] getRequest failed for ${token.slice(0,6)}…:`, e);
      res.status(503).json({ status: "preparing", phase: "waiting", pluginName: "", retry: true });
      return;
    }

    if (!request) {
      console.error(`[api/demo-status] Token ${token.slice(0,6)}… nicht in tokens.json gefunden`);
      res.status(404).json({ status: "expired", phase: "error" });
      return;
    }

    const configs = await loadConfigs().catch(() => []);
    const config = configs.find(c => c.id === request.configId);
    const pluginName = config?.name ?? request.configId;

    const phase = request.phase ?? "waiting";
    let status: "preparing" | "ready" | "error" | "expired" = "preparing";
    if (phase === "running") status = "ready";
    else if (phase === "error") status = "error";

    let url: string | undefined;
    if (status === "ready" && request.instanceId) {
      const inst = await getInstance(request.instanceId);
      url = inst?.url;
    }

    res.json({
      status,
      phase,
      pluginName,
      error: request.phaseError,
      ...(status === "ready" && url ? {
        url,
        accounts: ["admin", "teacher", "student"],
        password: DEMO_PASSWORD,
      } : {}),
    });
  };
  app.get("/api/demo-status/:token", demoStatusHandler);
  app.get("/demo-status/:token", demoStatusHandler);

  // ── Extend-Code API (task26 / feat12) ─────────────────────────────────────
  const extendCodeHandler: express.RequestHandler = async (req, res) => {
    const { token, code } = (req.body ?? {}) as { token?: string; code?: string };
    if (!token || !code) {
      res.status(400).json({ error: "token und code sind erforderlich" });
      return;
    }

    if (EXTEND_CODES.size === 0) {
      res.status(503).json({ error: "Verlängerungs-Codes sind nicht konfiguriert" });
      return;
    }

    const normalizedCode = code.trim().toUpperCase();
    if (!EXTEND_CODES.has(normalizedCode)) {
      res.status(400).json({ error: "Code ist ungültig" });
      return;
    }

    let request;
    try {
      request = await tokens.getRequest(token);
    } catch (e) {
      console.error(`[extend-code] getRequest failed for ${token.slice(0,6)}…:`, e);
      res.status(503).json({ error: "Token-Registry temporär nicht lesbar" });
      return;
    }
    if (!request) {
      res.status(404).json({ error: "Token nicht gefunden" });
      return;
    }
    if (!request.instanceId) {
      res.status(409).json({ error: "Demo ist noch nicht gestartet — Verlängerung erst möglich, sobald die Instanz läuft" });
      return;
    }

    const inst = await getInstance(request.instanceId);
    if (!inst) {
      res.status(404).json({ error: "Instanz nicht gefunden (bereits abgelaufen?)" });
      return;
    }

    if (inst.extendedBy) {
      res.status(409).json({
        error: `Instanz wurde bereits am ${inst.extendedBy.at} verlängert (Code: ${inst.extendedBy.code})`,
      });
      return;
    }

    const now = new Date();
    inst.extendedBy    = { code: normalizedCode, at: now.toISOString() };
    inst.maxAgeMinutes = EXTEND_CODE_TTL_MINUTES;
    inst.lastActivity  = now.toISOString();
    await saveInstance(inst);

    const extendedUntil = new Date(now.getTime() + EXTEND_CODE_TTL_MINUTES * 60 * 1000);
    console.error(
      `[extend-code] ${inst.id} verlängert mit Code ${normalizedCode} ` +
      `bis ${extendedUntil.toISOString()} (+${EXTEND_CODE_TTL_MINUTES}min)`
    );

    res.json({
      ok: true,
      extendedUntil: extendedUntil.toISOString(),
      maxAgeMinutes: EXTEND_CODE_TTL_MINUTES,
    });
  };
  app.post("/api/extend-code", extendCodeHandler);
  app.post("/extend-code", extendCodeHandler);

  // ── Plugin detail API ──────────────────────────────────────────────────
  const pluginInfoHandler: express.RequestHandler = async (req, res) => {
    try {
      const configs = await loadConfigs().catch(() => []);
      const config = configs.find(c => c.id === req.params.id);
      if (!config) {
        res.status(404).json({ error: `Plugin '${req.params.id}' nicht gefunden` });
        return;
      }
      let githubData = null;
      let iconUrl: string | null = null;
      if (config.githubRepo) {
        const [g, icon] = await Promise.all([
          github.fetchPluginData(config.githubRepo).catch(err => {
            console.error(`[api/plugininfo] GitHub fetch failed for ${req.params.id}:`, err);
            return null;
          }),
          github.resolvePluginIconUrl(config.githubRepo).catch(() => null),
        ]);
        githubData = g;
        iconUrl = icon;
      }
      res.json({ config, github: githubData, iconUrl });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  };
  app.get("/api/plugininfo/:id", pluginInfoHandler);
  app.get("/plugininfo/:id", pluginInfoHandler);

  app.get("/api/configs", configsHandler);

  // ── Admin-Dashboard (task25) ─────────────────────────────────────────────────
  app.get("/admin", adminAuth, (_req, res) => {
    res.sendFile(path.join(process.cwd(), "webui", "admin.html"));
  });

  app.get("/admin/instances", adminAuth, async (_req, res) => {
    try {
      const instances = await getAllInstances();
      res.json({ count: instances.length, instances });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/admin/tokens", adminAuth, async (_req, res) => {
    try {
      const requests = await tokens.listRequests();
      res.json({ count: requests.length, requests });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/admin/instances/:id/logs", adminAuth, async (req, res) => {
    try {
      const inst = await getInstance(req.params.id);
      if (!inst) { res.status(404).json({ error: "Instanz nicht gefunden" }); return; }
      const logs = await dockerSvc.getLogs(inst, 100);
      res.json({ instanceId: inst.id, logs });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/admin/instances/:id/extend", adminAuth, async (req, res) => {
    try {
      const inst = await getInstance(req.params.id);
      if (!inst) { res.status(404).json({ error: "Instanz nicht gefunden" }); return; }
      const minutes = Math.max(1, Math.min(10080, parseInt(req.body?.minutes ?? "60", 10) || 60));
      const now = new Date().toISOString();
      inst.maxAgeMinutes = minutes;
      inst.lastActivity  = now;
      if (!inst.extendedBy) {
        inst.extendedBy = { code: "ADMIN", at: now };
      } else {
        inst.extendedBy.at = now;
      }
      await saveInstance(inst);
      const expiresAt = new Date(new Date(now).getTime() + minutes * 60000).toISOString();
      res.json({ ok: true, instanceId: inst.id, extendedByMinutes: minutes, expiresAt });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.delete("/admin/instances/:id", adminAuth, async (req, res) => {
    const { id } = req.params;
    try {
      const inst = await getInstance(id);
      if (!inst) { res.status(404).json({ error: "Instanz nicht gefunden" }); return; }
      inst.status = "stopping";
      await saveInstance(inst);
      await nginxSvc.unregisterInstance(id).catch((e: unknown) => {
        console.error(`[admin] WARN nginx unregister ${id}:`, e);
      });
      await dockerSvc.stopContainers(inst).catch((e: unknown) => {
        console.error(`[admin] WARN docker stop ${id}:`, e);
      });
      await dockerSvc.cleanupInstanceDir(inst).catch((e: unknown) => {
        console.error(`[admin] WARN cleanup dir ${id}:`, e);
      });
      await deleteInstance(id);
      await tokens.expireByInstance(id).catch((e: unknown) => {
        console.error(`[admin] WARN expire token for ${id}:`, e);
      });
      console.error(`[admin] Manually deleted instance ${id}`);
      res.json({ ok: true, instanceId: id });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Admin Snapshot-Manager (task43, Stage 1A) ─────────────────────────────
  // Liste, Löschen, Set-Default, Download von Snapshots im zentralen Admin.
  // Stage 1B (Rebuild) und 1C (Edit-Live) folgen separat.
  //
  // Auth: Re-uses adminAuth (HTTP Basic Auth, gleiche Credentials wie
  // für /admin). Snapshot-Files liegen in SNAPSHOT_DIR (default /opt/snapshots).

  app.get("/admin/snapshots", adminAuth, async (_req, res) => {
    try {
      const snapshots = await snapshotSvc.listSnapshots();
      // Configs incl. invisible — wir brauchen die volle Liste, damit
      // "Set as Default" auch für versteckte Configs funktioniert. loadConfigs()
      // filtert visible:false raus.
      const configs = await loadConfigs().catch(() => []);
      const enriched = snapshots.map(s => ({
        ...s,
        sizeFormatted: snapshotSvc.formatBytes(s.sizeBytes),
        usedBy: configs
          .filter(c => c.snapshotId === s.id)
          .map(c => ({ id: c.id, name: c.name })),
      }));
      // Configs minimal exportieren für das Set-Default-Dropdown im Frontend.
      const configsLite = configs.map(c => ({
        id: c.id,
        name: c.name,
        moodleVersion: c.moodleVersion,
        snapshotId: c.snapshotId,
      }));
      res.json({ count: enriched.length, snapshots: enriched, configs: configsLite });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/admin/snapshots/:id/download", adminAuth, async (req, res) => {
    try {
      const meta = await snapshotSvc.getSnapshot(req.params.id);
      if (!meta) { res.status(404).json({ error: "Snapshot nicht gefunden" }); return; }
      res.setHeader("Content-Type", "application/gzip");
      res.setHeader("Content-Disposition", `attachment; filename="${meta.id}.sql.gz"`);
      res.sendFile(meta.file);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.delete("/admin/snapshots/:id", adminAuth, async (req, res) => {
    const { id } = req.params;
    const force = req.query.force === "1";
    try {
      const meta = await snapshotSvc.getSnapshot(id);
      if (!meta) { res.status(404).json({ error: "Snapshot nicht gefunden" }); return; }

      // Default-Schutz: Wenn ein Config diesen Snapshot als snapshotId nutzt,
      // verweigern — außer ?force=1. Verhindert versehentliches Löschen, das
      // alle Demos kaputt macht.
      const configs = await loadConfigs().catch(() => []);
      const inUse = configs.find(c => c.snapshotId === id);
      if (inUse && !force) {
        res.status(409).json({
          error: `Snapshot wird von Config '${inUse.id}' (${inUse.name}) als Default verwendet. Mit ?force=1 trotzdem löschen.`,
          usedBy: { configId: inUse.id, configName: inUse.name },
        });
        return;
      }

      await snapshotSvc.deleteSnapshot(id);
      console.error(`[admin] Snapshot deleted: ${id}${force ? " (forced)" : ""}`);
      res.json({ ok: true, deleted: id });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/admin/snapshots/:id/set-default", adminAuth, async (req, res) => {
    const { id } = req.params;
    const { configId } = (req.body ?? {}) as { configId?: string };
    if (!configId) { res.status(400).json({ error: "configId erforderlich" }); return; }
    try {
      const meta = await snapshotSvc.getSnapshot(id);
      if (!meta) { res.status(404).json({ error: "Snapshot nicht gefunden" }); return; }

      // Warnung bei Versions-Mismatch — verhindert das nicht, aber loggt.
      // Z.B. Snapshot auf Moodle 5.0, Config auf 5.1 → Demo wird beim ersten
      // Request den Upgrade-Pfad triggern und ggf. crashen.
      const cfg = (await loadConfigs().catch(() => []))
        .find(c => c.id === configId);
      if (cfg && cfg.moodleVersion !== meta.moodleVersion) {
        console.error(
          `[admin] WARN: snapshot ${id} (Moodle ${meta.moodleVersion}) wird Config ${configId} (Moodle ${cfg.moodleVersion}) zugewiesen — ` +
          `Versions-Mismatch kann "Error reading from database" beim Restore verursachen.`
        );
      }

      await updateConfig(configId, (c) => { c.snapshotId = id; });
      console.error(`[admin] Set snapshot ${id} as default for config ${configId}`);
      res.json({
        ok: true,
        configId,
        snapshotId: id,
        versionMismatch: cfg && cfg.moodleVersion !== meta.moodleVersion ? {
          configMoodle: cfg.moodleVersion,
          snapshotMoodle: meta.moodleVersion,
        } : null,
      });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/plugin/:id", (_req, res) => {
    res.sendFile(path.join(process.cwd(), "webui", "plugin-detail.html"));
  });

  const internalRouter = buildInternalRouter();
  app.use("/api/internal", internalRouter);
  app.use("/internal", internalRouter);

  app.use(express.static(path.join(process.cwd(), "webui")));

  const port = parseInt(process.env.PORT ?? "3000");
  app.listen(port, () => {
    console.error(`[moodle-runbot] MCP server listening on http://0.0.0.0:${port}/mcp`);
    console.error(`[moodle-runbot] Work dir: ${process.env.RUNBOT_WORK_DIR ?? "/opt/runbot"}`);
    console.error(`[moodle-runbot] Base domain: ${process.env.BASE_DOMAIN ?? "(none, using localhost ports)"}`);
  });
}

async function runStdio(): Promise<void> {
  const t = new StdioServerTransport();
  await server.connect(t);
  console.error("[moodle-runbot] MCP server running via stdio");
}

// ── Loading Page ──────────────────────────────────────────────────────────
function buildLoadingPage(firstName: string, pluginName: string, token: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Demo wird gestartet…</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#fafaf8;font-family:'DM Sans',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;color:#2d3142;padding:24px}
  .card{background:#fff;border:1px solid #e8eaee;border-radius:16px;padding:48px;text-align:center;width:min(520px,100%);box-shadow:0 4px 24px rgba(0,0,0,.06)}
  .logo{margin-bottom:32px;display:flex;justify-content:center}
  .logo img{height:40px;width:auto}
  .spinner{width:48px;height:48px;border:3px solid #e8eaee;border-top-color:#1a56db;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 28px}
  .spinner.hidden{display:none}
  @keyframes spin{to{transform:rotate(360deg)}}
  .check{width:52px;height:52px;border-radius:50%;background:#059669;display:none;align-items:center;justify-content:center;margin:0 auto 24px;color:#fff;font-size:26px;line-height:1}
  .check.show{display:flex}
  h1{font-family:'Fraunces',Georgia,serif;font-size:26px;font-weight:300;color:#0f1117;line-height:1.3;letter-spacing:-.5px;margin-bottom:12px}
  p{font-size:15px;color:#7a8090;line-height:1.7;font-weight:300;margin-bottom:28px}
  .steps{display:flex;flex-direction:column;gap:10px;text-align:left;background:#fafaf8;border:1px solid #e8eaee;border-radius:10px;padding:16px 20px}
  .step{display:flex;align-items:center;gap:10px;font-size:13px;color:#7a8090;transition:color .3s}
  .step.done{color:#059669}
  .step.active{color:#0f1117;font-weight:500}
  .step-dot{width:18px;height:18px;border-radius:50%;border:1.5px solid #e8eaee;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0;transition:all .3s}
  .step.done .step-dot{background:#059669;border-color:#059669;color:#fff}
  .step.active .step-dot{background:#1a56db;border-color:#1a56db;color:#fff}
  .note{font-size:12px;color:#7a8090;margin-top:24px}
  .creds{display:none;text-align:left;background:#fafaf8;border:1px solid #e8eaee;border-radius:10px;padding:18px 20px;margin-top:20px}
  .creds.show{display:block}
  .creds h3{font-family:'Fraunces',Georgia,serif;font-size:15px;font-weight:400;color:#0f1117;margin-bottom:6px}
  .creds-hint{font-size:12px;color:#7a8090;line-height:1.5;margin:0 0 12px;font-weight:300}
  .cred-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px}
  .creds > .cred-row:last-child{margin-bottom:0}
  .cred-label{color:#7a8090;min-width:96px}
  .cred-val{font-family:'SF Mono','Menlo',monospace;background:#fff;border:1px solid #e8eaee;border-radius:6px;padding:5px 10px;flex:1;color:#0f1117;font-size:12px;word-break:break-all}
  .copy-btn{background:#fff;border:1px solid #e8eaee;border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer;color:#7a8090;transition:all .2s;font-family:inherit}
  .copy-btn:hover{border-color:#1a56db;color:#1a56db}
  .copy-btn.copied{background:#059669;color:#fff;border-color:#059669}
  .primary-btn{display:none;background:#1a56db;color:#fff;border:none;border-radius:10px;padding:14px 28px;font-size:15px;font-weight:500;cursor:pointer;margin-top:20px;text-decoration:none;font-family:inherit;transition:background .2s}
  .primary-btn.show{display:inline-block}
  .primary-btn:hover{background:#1547b8}
  .err{display:none;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin-top:20px;color:#b91c1c;font-size:13px;text-align:left}
  .err.show{display:block}
  .err a{color:#b91c1c;text-decoration:underline}
  .extend{display:none;text-align:left;background:#fafaf8;border:1px solid #e8eaee;border-radius:10px;padding:14px 18px;margin-top:14px;font-size:12px;color:#7a8090;font-weight:300}
  .extend.show{display:block}
  .extend-head{display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none}
  .extend-chevron{transition:transform .2s;font-size:10px;color:#7a8090}
  .extend.open .extend-chevron{transform:rotate(90deg)}
  .extend-body{display:none;margin-top:10px}
  .extend.open .extend-body{display:block}
  .extend-body p{font-size:11px;color:#7a8090;margin:0 0 8px;line-height:1.5;font-weight:300}
  .extend-row{display:flex;gap:6px}
  .extend-row input{flex:1;background:#fff;border:1px solid #e8eaee;border-radius:6px;padding:7px 10px;font-size:12px;color:#0f1117;font-family:inherit;text-transform:uppercase}
  .extend-row input:focus{outline:none;border-color:#1a56db}
  .extend-row button{background:#1a56db;color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:11px;font-weight:500;cursor:pointer;font-family:inherit}
  .extend-row button:hover{background:#1547b8}
  .extend-row button:disabled{background:#cbd5e1;cursor:not-allowed}
  .extend-msg{font-size:11px;margin-top:8px;display:none}
  .extend-msg.ok{display:block;color:#059669}
  .extend-msg.err{display:block;color:#b91c1c}
</style>
</head>
<body>
<div class="card">
  <div class="logo"><img src="/eledia_runbot.png" alt="eLeDia Runbot"></div>
  <div class="spinner" id="spinner"></div>
  <div class="check" id="check">✓</div>
  <h1 id="headline">${firstName}, Ihre Demo<br>wird gestartet.</h1>
  <p id="subtext">Wir richten eine persönliche <strong>${pluginName}</strong>-Instanz<br>für Sie ein. Das dauert etwa 30–60 Sekunden.</p>
  <div class="steps" id="steps">
    <div class="step active" id="s0"><div class="step-dot">1</div><span>Moodle-Umgebung vorbereiten</span></div>
    <div class="step" id="s1"><div class="step-dot">2</div><span>Plugin installieren</span></div>
    <div class="step" id="s2"><div class="step-dot">3</div><span>Container starten</span></div>
    <div class="step" id="s3"><div class="step-dot">4</div><span>Demo-Daten laden</span></div>
  </div>
  <div class="creds" id="creds">
    <h3>Ihre Zugangsdaten</h3>
    <p class="creds-hint">Sie können sich mit einem der folgenden Accounts einloggen — alle teilen dasselbe Passwort.</p>
    <div id="cred-accounts"></div>
    <div class="cred-row">
      <span class="cred-label">Passwort:</span>
      <span class="cred-val" id="cred-pw"></span>
      <button class="copy-btn" data-copy="cred-pw">Kopieren</button>
    </div>
  </div>
  <div class="extend" id="extend">
    <div class="extend-head" id="extend-toggle">
      <span class="extend-chevron">▶</span>
      <span>Verlängerungscode einlösen</span>
    </div>
    <div class="extend-body">
      <p>Sie haben von uns einen Code erhalten? Lösen Sie ihn ein, um die Demo auf <strong>24 Stunden</strong> zu verlängern.</p>
      <div class="extend-row">
        <input type="text" id="extend-input" placeholder="z.B. EDUMA2026" maxlength="32" autocomplete="off" spellcheck="false">
        <button id="extend-btn" type="button">Einlösen</button>
      </div>
      <div class="extend-msg" id="extend-msg"></div>
    </div>
  </div>
  <a class="primary-btn" id="open-btn" href="#" target="_blank" rel="noopener">Demo öffnen →</a>
  <div class="err" id="err"></div>
  <p class="note" id="note">Sie erhalten eine E-Mail sobald Ihre Demo bereit ist.</p>
</div>
<script>
  const TOKEN = ${JSON.stringify(token)};
  const STEP_COUNT = 4;
  const PHASE_TO_STEP = {
    waiting: 0,
    provisioning: 0,
    installing_plugin: 1,
    starting_containers: 2,
    restoring_snapshot: 3,
    creating_user: 3,
    running: 4
  };

  function setActiveStep(idx) {
    for (let i = 0; i < STEP_COUNT; i++) {
      const el = document.getElementById('s' + i);
      if (!el) continue;
      const dot = el.querySelector('.step-dot');
      if (i < idx) {
        el.className = 'step done';
        if (dot) dot.textContent = '✓';
      } else if (i === idx) {
        el.className = 'step active';
        if (dot) dot.textContent = String(i + 1);
      } else {
        el.className = 'step';
        if (dot) dot.textContent = String(i + 1);
      }
    }
  }

  function markAllDone() {
    for (let i = 0; i < STEP_COUNT; i++) {
      const el = document.getElementById('s' + i);
      if (!el) continue;
      el.className = 'step done';
      const dot = el.querySelector('.step-dot');
      if (dot) dot.textContent = '✓';
    }
  }

  function showReady(data) {
    document.title = 'Demo bereit';
    document.getElementById('spinner').classList.add('hidden');
    document.getElementById('check').classList.add('show');
    document.getElementById('headline').innerHTML = 'Ihre Demo<br>ist bereit!';
    document.getElementById('subtext').innerHTML = 'Ihre <strong>' + (data.pluginName || '${pluginName}') + '</strong>-Instanz läuft.<br>Klicken Sie unten auf <strong>"Demo öffnen"</strong>, um zu starten.';
    markAllDone();
    const accounts = Array.isArray(data.accounts) && data.accounts.length
      ? data.accounts
      : ['admin', 'teacher', 'student'];
    const ACCOUNT_LABELS = {
      admin:   'Admin',
      teacher: 'Trainer/in',
      student: 'Teilnehmer/in',
    };
    const accountsBox = document.getElementById('cred-accounts');
    accountsBox.innerHTML = '';
    accounts.forEach((acc, idx) => {
      const row  = document.createElement('div');
      row.className = 'cred-row';
      const valId = 'cred-acc-' + idx;
      const label = ACCOUNT_LABELS[acc] || (acc.charAt(0).toUpperCase() + acc.slice(1));
      row.innerHTML =
        '<span class="cred-label">' + label + ':</span>' +
        '<span class="cred-val" id="' + valId + '"></span>' +
        '<button class="copy-btn" type="button" data-copy="' + valId + '">Kopieren</button>';
      row.querySelector('#' + valId).textContent = acc;
      accountsBox.appendChild(row);
    });
    if (data.password) document.getElementById('cred-pw').textContent = data.password;
    wireCopyButtons();
    document.getElementById('creds').classList.add('show');
    document.getElementById('extend').classList.add('show');
    const btn = document.getElementById('open-btn');
    if (data.url) btn.href = data.url;
    btn.classList.add('show');
    document.getElementById('note').style.display = 'none';
  }

  function showError(msg) {
    document.title = 'Demo fehlgeschlagen';
    document.getElementById('spinner').classList.add('hidden');
    document.getElementById('headline').innerHTML = 'Etwas ist schiefgelaufen.';
    document.getElementById('subtext').innerHTML = 'Wir konnten Ihre Demo leider nicht fertigstellen.';
    const err = document.getElementById('err');
    err.textContent = msg || 'Unbekannter Fehler. Bitte versuchen Sie es erneut oder kontaktieren Sie uns.';
    err.classList.add('show');
    document.getElementById('steps').style.display = 'none';
    document.getElementById('note').innerHTML = '<a href="/">Zurück zum Portal</a>';
  }

  let consecutive404 = 0;
  const MAX_404 = 3;

  async function poll() {
    try {
      const res = await fetch('/api/demo-status/' + TOKEN, { cache: 'no-store' });
      if (res.status === 404) {
        consecutive404++;
        if (consecutive404 >= MAX_404) {
          showError('Ihre Demo-Anfrage ist abgelaufen. Bitte starten Sie einen neuen Versuch.');
          return false;
        }
        return true;
      }
      consecutive404 = 0;
      if (!res.ok) return true;
      const data = await res.json();

      if (data.status === 'ready') {
        showReady(data);
        return false;
      }
      if (data.status === 'error') {
        showError(data.error);
        return false;
      }
      const phase = data.phase || 'waiting';
      const stepIdx = PHASE_TO_STEP[phase];
      if (typeof stepIdx === 'number') setActiveStep(stepIdx);
      return true;
    } catch (e) {
      return true;
    }
  }

  function wireCopyButtons() {
    document.querySelectorAll('.copy-btn').forEach(btn => {
      if (btn.getAttribute('data-wired') === '1') return;
      btn.setAttribute('data-wired', '1');
      btn.addEventListener('click', async () => {
        const targetId = btn.getAttribute('data-copy');
        const el = document.getElementById(targetId);
        if (!el) return;
        try {
          await navigator.clipboard.writeText(el.textContent || '');
          btn.classList.add('copied');
          btn.textContent = 'Kopiert!';
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.textContent = 'Kopieren';
          }, 1800);
        } catch {}
      });
    });
  }
  wireCopyButtons();

  (function(){
    const wrap  = document.getElementById('extend');
    const head  = document.getElementById('extend-toggle');
    const input = document.getElementById('extend-input');
    const btnEl = document.getElementById('extend-btn');
    const msg   = document.getElementById('extend-msg');
    if (!wrap || !head || !input || !btnEl || !msg) return;

    head.addEventListener('click', () => wrap.classList.toggle('open'));

    async function submit() {
      const code = (input.value || '').trim().toUpperCase();
      if (!code) {
        msg.className = 'extend-msg err';
        msg.textContent = 'Bitte einen Code eingeben.';
        input.focus();
        return;
      }
      btnEl.disabled = true;
      btnEl.textContent = 'Prüfe…';
      msg.className = 'extend-msg';
      msg.textContent = '';
      try {
        const r = await fetch('/api/extend-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: TOKEN, code: code }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          msg.className = 'extend-msg err';
          msg.textContent = d.error || ('Fehler: HTTP ' + r.status);
          btnEl.disabled = false;
          btnEl.textContent = 'Einlösen';
          return;
        }
        const until = d.extendedUntil ? new Date(d.extendedUntil) : null;
        const untilStr = until
          ? until.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
          : '24 Stunden';
        msg.className = 'extend-msg ok';
        msg.textContent = '✓ Verlängert bis ' + untilStr;
        input.disabled = true;
        btnEl.disabled = true;
        btnEl.textContent = 'Eingelöst';
      } catch (e) {
        msg.className = 'extend-msg err';
        msg.textContent = 'Netzwerkfehler. Bitte noch einmal versuchen.';
        btnEl.disabled = false;
        btnEl.textContent = 'Einlösen';
      }
    }

    btnEl.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
  })();

  setTimeout(async () => {
    const keep = await poll();
    if (!keep) return;
    const handle = setInterval(async () => {
      const keepPolling = await poll();
      if (!keepPolling) clearInterval(handle);
    }, 3000);
  }, 1500);
</script>
</body>
</html>`;
}

// ── Start ────────────────────────────────────────────────────────────────
if (transport === "http") {
  cleanupOrphans()
    .catch((e) => {
      console.error("[moodle-runbot] Orphan cleanup encountered errors:", e);
    })
    .then(() => runHTTP())
    .then(() => startCleanupScheduler())
    .catch((e) => {
      console.error("Fatal:", e);
      process.exit(1);
    });
} else {
  runStdio().catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  });
}
