// src/index.ts
// Moodle Runbot MCP Server
// Orchestrates moodlehq/moodle-docker instances for CI testing.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import rateLimit from "express-rate-limit";
import { startCleanupScheduler, recordActivity } from "./services/cleanup.js";
import { registerInstanceStart, registerInstanceStop, registerInstanceStatus, registerInstanceList, registerInstanceLogs, registerInstanceRunTests, registerInstanceExtend, registerInstanceTimeRemaining, } from "./tools/instances.js";
import { registerSnapshotList, registerSnapshotCreate, registerSnapshotDelete, } from "./tools/snapshots.js";
import { registerConfigList, registerConfigGet, } from "./tools/configs.js";
import { loadConfigs } from "./services/config.js";
import * as tokens from "./services/tokens.js";
import * as email from "./services/email.js";
import * as github from "./services/github.js";
import * as snapshotSvc from "./services/snapshot.js";
import { DEMO_PASSWORD } from "./services/moodleUser.js";
import { getInstance, saveInstance, allocatePort } from "./services/registry.js";
import * as dockerSvc from "./services/docker.js";
import * as nginxSvc from "./services/nginx.js";
import { randomBytes } from "crypto";
import path from "path";
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
async function runHTTP() {
    const app = express();
    app.use(express.json());
    // Rate-Limiting für Demo-Anfragen
    const demoLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 Minuten
        max: 5, // max 5 Anfragen pro IP
        message: { error: "Zu viele Anfragen. Bitte warte 15 Minuten." },
        standardHeaders: true,
        legacyHeaders: false,
    });
    // MCP-Endpunkt mit API-Key absichern
    const MCP_API_KEY = process.env.MCP_API_KEY ?? "";
    const mcpAuthMiddleware = (req, res, next) => {
        if (!MCP_API_KEY) {
            next();
            return;
        } // Kein Key konfiguriert = offen (Dev-Modus)
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
        if (req.method === "OPTIONS") {
            res.sendStatus(204);
            return;
        }
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
        }
        catch (e) {
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
        await recordActivity(req.params.instanceId).catch(() => { });
        res.json({ ok: true });
    });
    // ── Demo-Anfrage-Flow ─────────────────────────────────────────────────────
    // POST /request-demo — Kunde gibt E-Mail + Name ein, bekommt Bestätigungs-E-Mail
    app.post("/request-demo", demoLimiter, async (req, res) => {
        const { email: userEmail, name, configId } = req.body;
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
            const request = await tokens.createRequest(userEmail, name ?? "Demo-Nutzer", configId);
            // Bestätigungs-E-Mail senden
            await email.sendConfirmationEmail(request, config.name);
            res.json({
                ok: true,
                message: "Bestätigungs-E-Mail wurde gesendet.",
                // Token nur in Dev-Modus zurückgeben
                ...(process.env.NODE_ENV === "development" ? { token: request.token } : {}),
            });
        }
        catch (e) {
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
        // Loading-Seite anzeigen während Demo startet.
        // Wichtig: Token wird in die Seite injected, damit das Frontend per
        // /api/demo-status/:token den Live-Status pollen kann (feat09/task22).
        const loadingHtml = buildLoadingPage(request.name.split(" ")[0], config.name, token);
        res.send(loadingHtml);
        // Demo im Hintergrund starten (nach Response-Send)
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
                const instance = {
                    id, prId: "demo", branch: "main",
                    pluginDir: config.plugin?.srcPath ?? "",
                    moodleVersion: config.moodleVersion,
                    phpVersion: config.phpVersion,
                    db: config.db,
                    webPort: port,
                    status: "starting",
                    url: BASE_DOMAIN ? `https://${id}.${BASE_DOMAIN}` : `http://localhost:${port}`,
                    createdAt: new Date().toISOString(),
                    lastActivity: new Date().toISOString(),
                    composeProject,
                    moodleDockerDir: path.join(instanceDir, "moodle-docker"),
                    moodleDir: path.join(instanceDir, "moodle"),
                };
                await saveInstance(instance);
                await dockerSvc.provisionInstance(instance);
                if (config.plugin) {
                    await tokens.setPhase(token, "installing_plugin");
                    await dockerSvc.installPlugin(instance, config.plugin.srcPath, config.plugin.type, config.plugin.name);
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
                // Keine Nutzer-Anlage mehr — der Snapshot enthält bereits die drei
                // vordefinierten Accounts (admin, teacher, student) mit identischem
                // Passwort (DEMO_PASSWORD). Der Interessent loggt sich direkt mit
                // einem dieser Accounts ein. Entscheidung Johannes, 2026-04-09:
                // Login ≠ E-Mail — die E-Mail-Adresse sollte nirgends als
                // Moodle-Username auftauchen.
                instance.status = "running";
                instance.lastActivity = new Date().toISOString();
                await saveInstance(instance);
                await nginxSvc.registerInstance(instance.id, instance.webPort);
                await tokens.markStarted(token, instance.id); // setzt phase="running"
                // "Demo bereit"-E-Mail senden
                await email.sendDemoReadyEmail(request, config.name, instance.url);
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.error("[confirm] Demo-Start fehlgeschlagen:", e);
                await tokens.setPhase(token, "error", msg).catch(() => { });
                // Nutzer über Fehler informieren
                await email.sendErrorEmail(request, config.name).catch((mailErr) => {
                    console.error("[confirm] Fehler-E-Mail konnte nicht gesendet werden:", mailErr);
                });
            }
        });
    });
    // ── Live-Status der Demo-Provisionierung (feat09) ────────────────────────
    // Die Warteseite pollt diesen Endpoint alle 3s mit dem Request-Token.
    // Token ist Auth — keine zusätzliche Authentifizierung nötig.
    app.get("/api/demo-status/:token", async (req, res) => {
        const { token } = req.params;
        let request;
        try {
            request = await tokens.getRequest(token);
        }
        catch (e) {
            // Korruption / IO-Fehler: NIE 404 schicken (würde die Warteseite
            // fälschlich als "abgelaufen" anzeigen). Stattdessen 503 + Retry.
            console.error(`[api/demo-status] getRequest failed for ${token.slice(0, 6)}…:`, e);
            res.status(503).json({ status: "preparing", phase: "waiting", pluginName: "", retry: true });
            return;
        }
        if (!request) {
            console.error(`[api/demo-status] Token ${token.slice(0, 6)}… nicht in tokens.json gefunden`);
            res.status(404).json({ status: "expired", phase: "error" });
            return;
        }
        const configs = await loadConfigs().catch(() => []);
        const config = configs.find(c => c.id === request.configId);
        const pluginName = config?.name ?? request.configId;
        // Phase → Status-Mapping
        const phase = request.phase ?? "waiting";
        let status = "preparing";
        if (phase === "running")
            status = "ready";
        else if (phase === "error")
            status = "error";
        // URL + Accounts nur wenn wirklich ready.
        // username ist KEINE E-Mail mehr — der Snapshot hat drei Accounts
        // (admin/teacher/student) mit identischem Passwort (DEMO_PASSWORD).
        // Die Warteseite zeigt alle drei an, das Frontend löst es selbst.
        let url;
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
    });
    // ── Plugin detail API ─────────────────────────────────────────────────────
    // GET /api/plugin/:id → JSON: { config, github, iconUrl }
    // Called by plugin-detail.html to populate the page dynamically.
    // iconUrl wird best-effort aus pix/monologo.{svg,png}|icon.{svg,png} geholt
    // (feat11/task23). Fehler = null, kein Blocker für den Rest.
    app.get("/api/plugin/:id", async (req, res) => {
        try {
            const configs = await loadConfigs().catch(() => []);
            const config = configs.find(c => c.id === req.params.id);
            if (!config) {
                res.status(404).json({ error: `Plugin '${req.params.id}' nicht gefunden` });
                return;
            }
            let githubData = null;
            let iconUrl = null;
            if (config.githubRepo) {
                const [g, icon] = await Promise.all([
                    github.fetchPluginData(config.githubRepo).catch(err => {
                        console.error(`[api/plugin] GitHub fetch failed for ${req.params.id}:`, err);
                        return null;
                    }),
                    github.resolvePluginIconUrl(config.githubRepo).catch(() => null),
                ]);
                githubData = g;
                iconUrl = icon;
            }
            res.json({ config, github: githubData, iconUrl });
        }
        catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    // GET /api/configs — alias so the portal's /api/configs URL works
    app.get("/api/configs", async (_req, res) => {
        try {
            const configs = await loadConfigs();
            res.json({ count: configs.length, configs });
        }
        catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    // GET /plugin/:id → serve plugin-detail.html (JS reads id from URL)
    app.get("/plugin/:id", (_req, res) => {
        res.sendFile(path.join(process.cwd(), "webui", "plugin-detail.html"));
    });
    // Serve static files from webui/ (demo-portal.html, assets, etc.)
    app.use(express.static(path.join(process.cwd(), "webui")));
    // ─────────────────────────────────────────────────────────────────────────
    const port = parseInt(process.env.PORT ?? "3000");
    app.listen(port, () => {
        console.error(`[moodle-runbot] MCP server listening on http://0.0.0.0:${port}/mcp`);
        console.error(`[moodle-runbot] Work dir: ${process.env.RUNBOT_WORK_DIR ?? "/opt/runbot"}`);
        console.error(`[moodle-runbot] Base domain: ${process.env.BASE_DOMAIN ?? "(none, using localhost ports)"}`);
    });
}
async function runStdio() {
    const t = new StdioServerTransport();
    await server.connect(t);
    console.error("[moodle-runbot] MCP server running via stdio");
}
// ── Loading Page ──────────────────────────────────────────────────────────────
//
// Wartet auf den Live-Status via /api/demo-status/:token (feat09/task22).
// Phase-Mapping: waiting|provisioning → s0, installing_plugin → s1,
// starting_containers → s2, restoring_snapshot → s3,
// running → alles done + Credentials-Box + "Demo öffnen" Button.
// Hinweis: Der frühere creating_user-Step entfällt seit 2026-04-09 — die drei
// Snapshot-Accounts (admin/teacher/student) kommen schon mit dem Snapshot.
function buildLoadingPage(firstName, pluginName, token) {
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
  .cred-row:last-child{margin-bottom:0}
  .cred-label{color:#7a8090;min-width:80px}
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
    <p class="creds-hint">Sie können sich mit einem dieser drei Accounts einloggen — alle teilen dasselbe Passwort.</p>
    <div class="cred-row">
      <span class="cred-label">Accounts:</span>
      <span class="cred-val" id="cred-user">admin · teacher · student</span>
      <button class="copy-btn" data-copy="cred-user">Kopieren</button>
    </div>
    <div class="cred-row">
      <span class="cred-label">Passwort:</span>
      <span class="cred-val" id="cred-pw"></span>
      <button class="copy-btn" data-copy="cred-pw">Kopieren</button>
    </div>
  </div>
  <a class="primary-btn" id="open-btn" href="#" target="_blank" rel="noopener">Demo öffnen →</a>
  <div class="err" id="err"></div>
  <p class="note" id="note">Sie erhalten eine E-Mail sobald Ihre Demo bereit ist.</p>
</div>
<script>
  const TOKEN = ${JSON.stringify(token)};
  const STEP_COUNT = 4;
  // DemoPhase → step index
  // creating_user mapt auf 3 (Demo-Daten laden), weil seit 2026-04-09
  // kein expliziter User-Create-Step mehr existiert — der Snapshot bringt
  // admin/teacher/student schon mit. Alte In-Flight-Tokens bleiben kompatibel.
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
    // Accounts-Liste: aus data.accounts (neu) oder statisch fallback.
    // Der Snapshot enthält drei vordefinierte Accounts mit identischem Passwort.
    const accounts = Array.isArray(data.accounts) && data.accounts.length
      ? data.accounts.join(' · ')
      : 'admin · teacher · student';
    document.getElementById('cred-user').textContent = accounts;
    if (data.password) document.getElementById('cred-pw').textContent = data.password;
    document.getElementById('creds').classList.add('show');
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

  // Tolerant gegen transient-Fehler: wir zeigen "abgelaufen" erst nach
  // 3 aufeinanderfolgenden 404s. Grund: beim ersten Poll direkt nach
  // Seitenladung kann das Backend noch mit dem Write des Tokens beschäftigt
  // sein — ein einzelnes 404 ist KEIN sicheres Signal für "abgelaufen".
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
        return true; // nochmal versuchen
      }
      consecutive404 = 0;
      if (!res.ok) return true; // transient, weiter pollen
      const data = await res.json();

      if (data.status === 'ready') {
        showReady(data);
        return false;
      }
      if (data.status === 'error') {
        showError(data.error);
        return false;
      }
      // preparing — Step aktualisieren
      const phase = data.phase || 'waiting';
      const stepIdx = PHASE_TO_STEP[phase];
      if (typeof stepIdx === 'number') setActiveStep(stepIdx);
      return true;
    } catch (e) {
      // Netzwerkfehler sind transient — weiter pollen
      return true;
    }
  }

  // Copy-to-clipboard
  document.querySelectorAll('.copy-btn').forEach(btn => {
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

  // Erst-Poll nach kurzer Delay (gibt dem Backend-setPhase Zeit zu schreiben),
  // dann alle 3s.
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
// ── Start ─────────────────────────────────────────────────────────────────────
if (transport === "http") {
    runHTTP().then(() => startCleanupScheduler()).catch((e) => {
        console.error("Fatal:", e);
        process.exit(1);
    });
}
else {
    runStdio().catch((e) => {
        console.error("Fatal:", e);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map