// src/index.ts
// Moodle Runbot MCP Server
// Orchestrates moodlehq/moodle-docker instances for CI testing.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import rateLimit from "express-rate-limit";

import { startCleanupScheduler, recordActivity } from "./services/cleanup.js";

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
} from "./tools/snapshots.js";

import {
  registerConfigList,
  registerConfigGet,
} from "./tools/configs.js";

import { loadConfigs } from "./services/config.js";
import * as tokens from "./services/tokens.js";
import * as email from "./services/email.js";
import * as snapshotSvc from "./services/snapshot.js";
import * as moodleUser from "./services/moodleUser.js";
import { getInstance, saveInstance, allocatePort } from "./services/registry.js";
import * as dockerSvc from "./services/docker.js";
import * as nginxSvc from "./services/nginx.js";
import { randomBytes } from "crypto";
import path from "path";
import type { MoodleInstance } from "./types.js";

// ── Server setup ──────────────────────────────────────────────────────────────

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

// Config tools
registerConfigList(server);
registerConfigGet(server);

// ── Transport selection ───────────────────────────────────────────────────────

const transport = process.env.TRANSPORT ?? "stdio";

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  // Rate-Limiting für Demo-Anfragen
  const demoLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 Minuten
    max: 5,                    // max 5 Anfragen pro IP
    message: { error: "Zu viele Anfragen. Bitte warte 15 Minuten." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // MCP-Endpunkt mit API-Key absichern
  const MCP_API_KEY = process.env.MCP_API_KEY ?? "";
  const mcpAuthMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!MCP_API_KEY) { next(); return; } // Kein Key konfiguriert = offen (Dev-Modus)
    const key = req.headers["x-api-key"] ?? req.query["api_key"];
    if (key !== MCP_API_KEY) {
      res.status(403).json({ error: "Forbidden: Invalid API key" });
      return;
    }
    next();
  };

  // CORS — allow demo portal to call MCP from the browser
  const allowedOrigins = (process.env.CORS_ORIGINS ?? "*").split(",").map(s => s.trim());
  app.use((req, res, next) => {
    const origin = req.headers.origin ?? "*";
    const allowed = allowedOrigins.includes("*") || allowedOrigins.includes(origin);
    if (allowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") { res.sendStatus(204); return; }
    next();
  });

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "moodle-runbot-mcp-server" });
  });

  // Configs endpoint — vom Portal direkt aufgerufen (kein MCP-Overhead nötig)
  // GET /configs → alle sichtbaren Demo-Konfigurationen als JSON
  app.get("/configs", async (_req, res) => {
    try {
      const configs = await loadConfigs();
      res.json({ count: configs.length, configs });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // MCP endpoint — stateless, new transport per request
  app.post("/mcp", mcpAuthMiddleware, async (req, res) => {
    const t = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => t.close());
    await server.connect(t);
    await t.handleRequest(req, res, req.body);
  });

  // Activity ping — called by demo instances or nginx to extend inactivity timer
  app.post("/ping/:instanceId", async (req, res) => {
    await recordActivity(req.params.instanceId).catch(() => {});
    res.json({ ok: true });
  });

  // ── Demo-Anfrage-Flow ─────────────────────────────────────────────────────

  // POST /request-demo — Kunde gibt E-Mail + Name ein, bekommt Bestätigungs-E-Mail
  app.post("/request-demo", demoLimiter, async (req, res) => {
    const { email: userEmail, name, configId } = req.body as {
      email?: string; name?: string; configId?: string;
    };

    // Validierung
    if (!userEmail || !configId) {
      res.status(400).json({ error: "email und configId sind erforderlich" });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      res.status(400).json({ error: "Ungültige E-Mail-Adresse" });
      return;
    }

    // Config prüfen
    const configs = await loadConfigs().catch(() => []);
    const config = configs.find(c => c.id === configId);
    if (!config) {
      res.status(404).json({ error: `Config '${configId}' nicht gefunden` });
      return;
    }

    try {
      // Token anlegen
      const request = await tokens.createRequest(
        userEmail,
        name ?? "Demo-Nutzer",
        configId
      );

      // Bestätigungs-E-Mail senden
      await email.sendConfirmationEmail(request, config.name);

      res.json({
        ok: true,
        message: "Bestätigungs-E-Mail wurde gesendet.",
        // Token nur in Dev-Modus zurückgeben
        ...(process.env.NODE_ENV === "development" ? { token: request.token } : {}),
      });
    } catch (e) {
      console.error("[request-demo] Fehler:", e);
      res.status(500).json({ error: "E-Mail konnte nicht gesendet werden" });
    }
  });

  // GET /confirm/:token — Kunde klickt Link, Demo startet
  app.get("/confirm/:token", async (req, res) => {
    const { token } = req.params;

    const request = await tokens.confirmRequest(token);
    if (!request) {
      // Token ungültig oder abgelaufen
      res.status(400).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:80px;color:#555">
          <h2>Link ungültig oder abgelaufen</h2>
          <p>Bitte fordern Sie eine neue Demo an.</p>
          <a href="${process.env.BASE_URL ?? '/'}" style="color:#1a56db">→ Zurück zum Portal</a>
        </body></html>
      `);
      return;
    }

    // Falls Demo bereits gestartet: direkt weiterleiten
    if (request.status === "started" && request.instanceId) {
      const inst = await getInstance(request.instanceId);
      if (inst?.status === "running") {
        res.redirect(inst.url);
        return;
      }
    }

    // Config laden
    const configs = await loadConfigs().catch(() => []);
    const config = configs.find(c => c.id === request.configId);
    if (!config) {
      res.status(500).send("<html><body>Konfiguration nicht gefunden.</body></html>");
      return;
    }

    // Loading-Seite anzeigen während Demo startet
    const loadingHtml = buildLoadingPage(request.name.split(" ")[0], config.name);
    res.send(loadingHtml);

    // Demo im Hintergrund starten (nach Response-Send)
    setImmediate(async () => {
      try {
        const id = `demo-${request.configId}-${randomBytes(3).toString("hex")}`;
        const composeProject = `runbot-${id}`.replace(/[^a-z0-9-]/g, "-");
        const WORK_DIR = process.env.RUNBOT_WORK_DIR ?? "/opt/runbot";
        const PORT_START = parseInt(process.env.PORT_START ?? "8100");
        const PORT_END = parseInt(process.env.PORT_END ?? "8199");
        const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "";

        const port = await allocatePort(PORT_START, PORT_END);
        const instanceDir = path.join(WORK_DIR, id);

        const instance: MoodleInstance = {
          id, prId: "demo", branch: "main",
          pluginDir: config.plugin?.srcPath ?? "",
          moodleVersion: config.moodleVersion as MoodleInstance["moodleVersion"],
          phpVersion: config.phpVersion as MoodleInstance["phpVersion"],
          db: config.db as MoodleInstance["db"],
          webPort: port,
          status: "starting",
          url: BASE_DOMAIN ? `http://${id}.${BASE_DOMAIN}` : `http://localhost:${port}`,
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          composeProject,
          moodleDockerDir: path.join(instanceDir, "moodle-docker"),
          moodleDir: path.join(instanceDir, "moodle"),
        };

        await saveInstance(instance);

        await dockerSvc.provisionInstance(instance);
        if (config.plugin) {
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

        await dockerSvc.startContainers(instance, snap?.file);
        if (snap) await snapshotSvc.restoreSnapshot(instance, snap.file);

        // Kunden-Nutzer anlegen
        const nameParts = request.name.split(" ");
        const firstName = nameParts[0];
        const lastName  = nameParts.slice(1).join(" ") || "Demo";
        await moodleUser.createDemoUser(instance, request.email, firstName, lastName);
        await moodleUser.enrollUserInDemoCourse(instance, request.email);

        instance.status = "running";
        instance.lastActivity = new Date().toISOString();
        await saveInstance(instance);
        await nginxSvc.registerInstance(instance.id, instance.webPort);
        await tokens.markStarted(token, instance.id);

        // "Demo bereit"-E-Mail senden
        await email.sendDemoReadyEmail(request, config.name, instance.url);

      } catch (e) {
        console.error("[confirm] Demo-Start fehlgeschlagen:", e);
        // Nutzer über Fehler informieren
        await email.sendErrorEmail(request, config.name).catch((mailErr) => {
          console.error("[confirm] Fehler-E-Mail konnte nicht gesendet werden:", mailErr);
        });
      }
    });
  });

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

// ── Loading Page ──────────────────────────────────────────────────────────────

function buildLoadingPage(firstName: string, pluginName: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Demo wird gestartet…</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#fafaf8;font-family:'DM Sans',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;color:#2d3142}
  .card{background:#fff;border:1px solid #e8eaee;border-radius:16px;padding:48px;text-align:center;width:min(480px,90vw);box-shadow:0 4px 24px rgba(0,0,0,.06)}
  .logo{font-family:'Fraunces',Georgia,serif;font-size:20px;color:#0f1117;margin-bottom:36px}
  .logo span{color:#1a56db}
  .spinner{width:48px;height:48px;border:3px solid #e8eaee;border-top-color:#1a56db;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 28px}
  @keyframes spin{to{transform:rotate(360deg)}}
  h1{font-family:'Fraunces',Georgia,serif;font-size:26px;font-weight:300;color:#0f1117;line-height:1.3;letter-spacing:-.5px;margin-bottom:12px}
  p{font-size:15px;color:#7a8090;line-height:1.7;font-weight:300;margin-bottom:32px}
  .steps{display:flex;flex-direction:column;gap:10px;text-align:left;background:#fafaf8;border:1px solid #e8eaee;border-radius:10px;padding:16px 20px}
  .step{display:flex;align-items:center;gap:10px;font-size:13px;color:#7a8090;transition:color .3s}
  .step.done{color:#059669}
  .step.active{color:#0f1117;font-weight:500}
  .step-dot{width:18px;height:18px;border-radius:50%;border:1.5px solid #e8eaee;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0;transition:all .3s}
  .step.done .step-dot{background:#059669;border-color:#059669;color:#fff}
  .step.active .step-dot{background:#1a56db;border-color:#1a56db;color:#fff}
  .note{font-size:12px;color:#7a8090;margin-top:24px}
</style>
</head>
<body>
<div class="card">
  <div class="logo">eLeDia<span>.</span></div>
  <div class="spinner"></div>
  <h1>${firstName}, Ihre Demo<br>wird gestartet.</h1>
  <p>Wir richten eine persönliche <strong>${pluginName}</strong>-Instanz<br>für Sie ein. Das dauert etwa 30–60 Sekunden.</p>
  <div class="steps" id="steps">
    <div class="step active" id="s0"><div class="step-dot">1</div><span>Moodle-Umgebung vorbereiten</span></div>
    <div class="step" id="s1"><div class="step-dot">2</div><span>Plugin installieren</span></div>
    <div class="step" id="s2"><div class="step-dot">3</div><span>Container starten</span></div>
    <div class="step" id="s3"><div class="step-dot">4</div><span>Demo-Daten laden</span></div>
    <div class="step" id="s4"><div class="step-dot">5</div><span>Ihren Nutzer anlegen</span></div>
  </div>
  <p class="note">Sie erhalten eine E-Mail sobald Ihre Demo bereit ist.</p>
</div>
<script>
// Schritte animieren — nur visuell, Demo läuft im Hintergrund
let step=0;
const STEPS=5;
const t=setInterval(()=>{
  if(step>0){
    document.getElementById('s'+(step-1)).className='step done';
    document.getElementById('s'+(step-1)).querySelector('.step-dot').textContent='✓';
  }
  if(step<STEPS){
    document.getElementById('s'+step).className='step active';
    step++;
  }else{
    clearInterval(t);
  }
},10000);
</script>
</body>
</html>`;
}

// ── Start ─────────────────────────────────────────────────────────────────────

if (transport === "http") {
  runHTTP().then(() => startCleanupScheduler()).catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  });
} else {
  runStdio().catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  });
}
