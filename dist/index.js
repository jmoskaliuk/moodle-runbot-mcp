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
import { registerInstanceStart, registerInstanceStop, registerInstanceStatus, registerInstanceList, registerInstanceLogs, registerInstanceRunTests, registerInstanceExtend, registerInstanceTimeRemaining, } from "./tools/instances.js";
import { registerSnapshotList, registerSnapshotCreate, registerSnapshotDelete, registerSnapshotBuild, } from "./tools/snapshots.js";
import { registerConfigList, registerConfigGet, } from "./tools/configs.js";
import { loadConfigs, updateConfig } from "./services/config.js";
import * as tokens from "./services/tokens.js";
import * as email from "./services/email.js";
import * as github from "./services/github.js";
import * as snapshotSvc from "./services/snapshot.js";
import * as snapshotAdmin from "./services/snapshot-admin.js";
import * as pluginInstall from "./services/plugin-install.js";
import * as orders from "./services/orders.js";
import * as contractPdf from "./services/contract-pdf.js";
import { DEMO_PASSWORD } from "./services/moodleUser.js";
import { getInstance, getAllInstances, saveInstance, deleteInstance, allocatePort } from "./services/registry.js";
import * as dockerSvc from "./services/docker.js";
import * as nginxSvc from "./services/nginx.js";
import { randomBytes } from "crypto";
import fs from "fs/promises";
import path from "path";
import { buildInternalRouter } from "./api/internal.js";
const server = new McpServer({
    name: "moodle-runbot-mcp-server",
    version: "0.1.0",
});
registerInstanceStart(server);
registerInstanceStop(server);
registerInstanceStatus(server);
registerInstanceList(server);
registerInstanceLogs(server);
registerInstanceRunTests(server);
registerInstanceExtend(server);
registerInstanceTimeRemaining(server);
registerSnapshotList(server);
registerSnapshotCreate(server);
registerSnapshotDelete(server);
registerSnapshotBuild(server);
registerConfigList(server);
registerConfigGet(server);
const transport = process.env.TRANSPORT ?? "stdio";
const EXTEND_CODES = new Set((process.env.EXTEND_CODES ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean));
const EXTEND_CODE_TTL_MINUTES = parseInt(process.env.EXTEND_CODE_TTL_MINUTES ?? "1440", 10);
if (EXTEND_CODES.size > 0) {
    console.error(`[extend-codes] ${EXTEND_CODES.size} code(s) loaded, TTL=${EXTEND_CODE_TTL_MINUTES}min`);
}
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
/**
 * Fix 2026-04-15: Stellt sicher, dass config.plugin.srcPath auf Disk existiert.
 * Wenn nicht, aber config.githubRepo ist gesetzt, klont das Plugin automatisch.
 *
 * Hintergrund: Manuelle Edits an configs.json (wie die Spinning-Wheel-Karte)
 * setzen zwar den srcPath-Eintrag, klonen das Plugin aber nicht auf den VPS.
 * Der Plugin-Wizard (/admin) macht den Clone beim Hinzufügen — aber nicht bei
 * manuellen JSON-Edits. Dieser Fallback schließt die Lücke.
 *
 * Gibt true zurück wenn srcPath am Ende existiert, false bei Fehler.
 */
async function ensurePluginSrcPath(plugin, githubRepo) {
    const exists = await fs.access(plugin.srcPath).then(() => true).catch(() => false);
    if (exists)
        return true;
    if (!githubRepo) {
        console.error(`[confirm] Plugin srcPath ${plugin.srcPath} fehlt und kein githubRepo in config — kann nicht auto-klonen`);
        return false;
    }
    const gitUrl = `https://github.com/${githubRepo}`;
    console.error(`[confirm] Plugin srcPath ${plugin.srcPath} fehlt — auto-clone von ${gitUrl}`);
    try {
        await pluginInstall.clonePluginFromGithub(gitUrl);
        // clonePluginFromGithub legt nach /opt/plugins/<repo> ab. Der repo-Name
        // kommt aus der URL, nicht aus dem srcPath. Meistens passen die überein,
        // sonst war der configs.json-Eintrag inkonsistent. Wir checken nochmal.
        const nowExists = await fs.access(plugin.srcPath).then(() => true).catch(() => false);
        if (nowExists) {
            console.error(`[confirm] Auto-clone OK: ${plugin.srcPath} jetzt verfügbar`);
            return true;
        }
        console.error(`[confirm] Auto-clone lief, aber srcPath ${plugin.srcPath} existiert trotzdem nicht — inkonsistenter configs.json-Eintrag?`);
        return false;
    }
    catch (e) {
        console.error(`[confirm] Auto-clone fehlgeschlagen für ${gitUrl}:`, e);
        return false;
    }
}
async function runHTTP() {
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
    const mcpAuthMiddleware = (req, res, next) => {
        if (!MCP_API_KEY) {
            next();
            return;
        }
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
        if (req.method === "OPTIONS") {
            res.sendStatus(204);
            return;
        }
        next();
    });
    app.get("/health", (_req, res) => {
        res.json({ status: "ok", server: "moodle-runbot-mcp-server" });
    });
    const configsHandler = async (_req, res) => {
        try {
            const all = await loadConfigs();
            const visible = all.filter(c => c.visible !== false);
            const configs = await Promise.all(visible.map(async (c) => {
                const iconUrl = c.githubRepo
                    ? await github.resolvePluginIconUrl(c.githubRepo).catch(() => null)
                    : null;
                return { ...c, iconUrl };
            }));
            res.json({ count: configs.length, configs });
        }
        catch (e) {
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
        await recordActivity(req.params.instanceId).catch(() => { });
        res.json({ ok: true });
    });
    app.post("/request-demo", demoLimiter, async (req, res) => {
        const { email: userEmail, name, configId } = req.body;
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
            const request = await tokens.createRequest(userEmail, name ?? "Demo-Nutzer", configId);
            await email.sendConfirmationEmail(request, config.name);
            res.json({
                ok: true,
                message: "Bestätigungs-E-Mail wurde gesendet.",
                ...(process.env.NODE_ENV === "development" ? { token: request.token } : {}),
            });
        }
        catch (e) {
            console.error("[request-demo] Fehler:", e);
            res.status(500).json({ error: "E-Mail konnte nicht gesendet werden" });
        }
    });
    app.get("/confirm/:token", async (req, res) => {
        const { token } = req.params;
        const result = await tokens.confirmRequest(token);
        if (!result) {
            res.status(400).send(`<html><body style="font-family:sans-serif;text-align:center;padding:80px;color:#555">
        <h2>Link ungültig oder abgelaufen</h2><p>Bitte fordern Sie eine neue Demo an.</p>
        <a href="${process.env.BASE_URL ?? '/'}" style="color:#1a56db">→ Zurück zum Portal</a></body></html>`);
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
        res.send(buildLoadingPage(request.name.split(" ")[0], config.name, token));
        if (alreadyStarted) {
            console.log(`[confirm] Token ${token.slice(0, 6)}… bereits confirmed`);
            return;
        }
        setImmediate(async () => {
            try {
                await tokens.setPhase(token, "provisioning");
                const safeCfgId = request.configId.replace(/[^a-z0-9]/gi, "-").replace(/-+/g, "-").toLowerCase();
                const id = `demo-${safeCfgId}-${randomBytes(3).toString("hex")}`;
                const composeProject = `runbot-${id}`.replace(/[^a-z0-9-]/g, "-");
                const WORK_DIR = process.env.RUNBOT_WORK_DIR ?? "/opt/runbot";
                const PORT_START = parseInt(process.env.PORT_START ?? "8100");
                const PORT_END = parseInt(process.env.PORT_END ?? "8199");
                const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "";
                const port = await allocatePort(PORT_START, PORT_END);
                const instanceDir = path.join(WORK_DIR, id);
                const apiToken = randomBytes(32).toString("hex");
                const instance = {
                    id, prId: "demo", branch: "main",
                    pluginDir: config.plugin?.srcPath ?? "",
                    moodleVersion: config.moodleVersion,
                    phpVersion: config.phpVersion,
                    db: config.db,
                    webPort: port, status: "starting",
                    url: BASE_DOMAIN ? `https://${id}.${BASE_DOMAIN}` : `http://localhost:${port}`,
                    createdAt: new Date().toISOString(),
                    lastActivity: new Date().toISOString(),
                    composeProject,
                    moodleDockerDir: path.join(instanceDir, "moodle-docker"),
                    moodleDir: path.join(instanceDir, "moodle"),
                    apiToken, configId: request.configId,
                };
                await saveInstance(instance);
                await dockerSvc.provisionInstance(instance);
                if (config.plugin) {
                    await tokens.setPhase(token, "installing_plugin");
                    // Fix 2026-04-15: Stelle sicher, dass Plugin auf Disk liegt.
                    // Falls manuell zu configs.json hinzugefügt, wurde es ggf. nie
                    // auf den VPS geklont. Wir klonen on-demand aus config.githubRepo.
                    const srcOK = await ensurePluginSrcPath(config.plugin, config.githubRepo);
                    if (!srcOK) {
                        throw new Error(`Plugin-Quellverzeichnis ${config.plugin.srcPath} fehlt und konnte nicht ` +
                            `automatisch geklont werden. Admin muss den Plugin-Wizard in /api/admin ` +
                            `verwenden oder manuell per SSH klonen.`);
                    }
                    await dockerSvc.installPlugin(instance, config.plugin.srcPath, config.plugin.type, config.plugin.name);
                }
                const snap = config.snapshotId ? await snapshotSvc.getSnapshot(config.snapshotId) : undefined;
                await tokens.setPhase(token, "starting_containers");
                await dockerSvc.startContainers(instance, snap?.file);
                if (snap) {
                    await tokens.setPhase(token, "restoring_snapshot");
                    await snapshotSvc.restoreSnapshot(instance, snap.file);
                }
                await dockerSvc.setSiteName(instance, `Demo | ${config.name}`)
                    .catch((e) => console.error(`[confirm] setSiteName WARN:`, e));
                instance.status = "running";
                instance.lastActivity = new Date().toISOString();
                await saveInstance(instance);
                await nginxSvc.registerInstance(instance.id, instance.webPort);
                await tokens.markStarted(token, instance.id);
                await email.sendDemoReadyEmail(request, config.name, instance.url);
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.error("[confirm] Demo-Start fehlgeschlagen:", e);
                await tokens.setPhase(token, "error", msg).catch(() => { });
                await email.sendErrorEmail(request, config.name).catch((mailErr) => {
                    console.error("[confirm] Fehler-E-Mail konnte nicht gesendet werden:", mailErr);
                });
            }
        });
    });
    const demoStatusHandler = async (req, res) => {
        const { token } = req.params;
        let request;
        try {
            request = await tokens.getRequest(token);
        }
        catch (e) {
            console.error(`[api/demo-status] getRequest failed for ${token.slice(0, 6)}…:`, e);
            res.status(503).json({ status: "preparing", phase: "waiting", pluginName: "", retry: true });
            return;
        }
        if (!request) {
            res.status(404).json({ status: "expired", phase: "error" });
            return;
        }
        const configs = await loadConfigs().catch(() => []);
        const config = configs.find(c => c.id === request.configId);
        const pluginName = config?.name ?? request.configId;
        const phase = request.phase ?? "waiting";
        let status = "preparing";
        if (phase === "running")
            status = "ready";
        else if (phase === "error")
            status = "error";
        let url;
        if (status === "ready" && request.instanceId) {
            const inst = await getInstance(request.instanceId);
            url = inst?.url;
        }
        res.json({
            status, phase, pluginName, error: request.phaseError,
            ...(status === "ready" && url ? {
                url, accounts: ["admin", "teacher", "student"], password: DEMO_PASSWORD,
            } : {}),
        });
    };
    app.get("/api/demo-status/:token", demoStatusHandler);
    app.get("/demo-status/:token", demoStatusHandler);
    const extendCodeHandler = async (req, res) => {
        const { token, code } = (req.body ?? {});
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
        }
        catch (e) {
            console.error(`[extend-code] getRequest failed:`, e);
            res.status(503).json({ error: "Token-Registry temporär nicht lesbar" });
            return;
        }
        if (!request) {
            res.status(404).json({ error: "Token nicht gefunden" });
            return;
        }
        if (!request.instanceId) {
            res.status(409).json({ error: "Demo ist noch nicht gestartet" });
            return;
        }
        const inst = await getInstance(request.instanceId);
        if (!inst) {
            res.status(404).json({ error: "Instanz nicht gefunden" });
            return;
        }
        if (inst.extendedBy) {
            res.status(409).json({ error: `Instanz wurde bereits verlängert (Code: ${inst.extendedBy.code})` });
            return;
        }
        const now = new Date();
        inst.extendedBy = { code: normalizedCode, at: now.toISOString() };
        inst.maxAgeMinutes = EXTEND_CODE_TTL_MINUTES;
        inst.lastActivity = now.toISOString();
        await saveInstance(inst);
        const extendedUntil = new Date(now.getTime() + EXTEND_CODE_TTL_MINUTES * 60 * 1000);
        res.json({ ok: true, extendedUntil: extendedUntil.toISOString(), maxAgeMinutes: EXTEND_CODE_TTL_MINUTES });
    };
    app.post("/api/extend-code", extendCodeHandler);
    app.post("/extend-code", extendCodeHandler);
    // ── Onlineshop Order-Flow (task46, Woche 1b) ──────────────────────────────
    //
    // Vier kundenseitige Endpoints + ein kleiner HTML-Stub für die Review-Seite.
    // Alle Routes sind ZWEIFACH registriert — einmal mit `/api/*` und einmal ohne —,
    // weil nginx vor dem Node-Backend den `/api/*`-Präfix wegstripped (siehe
    // 04-tasks.md → Ideen → "nginx-Config sauber aufräumen").
    //
    // Das echte Review-Frontend (shop.html + order-review.html) kommt in Woche 3.
    // Für Woche 1b reicht der HTML-Stub, damit End-to-End-Tests laufen.
    // Shop-Rate-Limit: bewusst strenger als der Demo-Limiter, weil jede
    // Order eine Welcome-Mail + Provisioning triggert. 3 Bestellungen
    // pro IP pro 15 Min reicht für legitime Nutzung; Abuse wird gedrosselt.
    const shopOrderLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 3,
        message: { error: "Zu viele Bestellungen. Bitte warten Sie 15 Minuten." },
        standardHeaders: true,
        legacyHeaders: false,
    });
    function isValidSubdomain(s) {
        // a-z0-9 + einzelne Bindestriche, 3–40 Zeichen, kein führender/trailing Dash
        return /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/.test(s);
    }
    function clientIp(req) {
        // Reverse-Proxy hinter nginx → X-Forwarded-For ist die Client-IP
        const xff = req.headers["x-forwarded-for"];
        if (typeof xff === "string")
            return xff.split(",")[0].trim();
        return req.socket.remoteAddress ?? "";
    }
    function userAgent(req) {
        return (req.headers["user-agent"] ?? "").slice(0, 500);
    }
    /**
     * Provisioniert eine Shop-Instanz aus einer bestätigten Order. Pendant zum
     * /confirm/:token-Handler im Demo-Flow, nutzt aber die orders.ts-State-
     * Machine statt tokens.ts. Wird als setImmediate-Background-Task gestartet.
     *
     * Happy-Path:  ORDER_REVIEW → CONFIRMED → PROVISIONING → LIVE
     * Error-Path:  → PROVISION_FAILED + Admin-Alert
     *
     * TODO (Woche 2):
     *   - Random-Admin-Passwort generieren und via SQL-Update in m_user setzen
     *   - password_expired = 1 für den Admin-Record
     *   - Echte AGB/AVV-PDFs generieren (src/services/contract-pdf.ts)
     */
    async function provisionOrderInstance(orderId) {
        let order = await orders.getOrder(orderId);
        if (!order)
            throw new Error(`Order ${orderId} nicht gefunden`);
        const configs = await loadConfigs().catch(() => []);
        const config = configs.find(c => c.id === order.configId);
        if (!config) {
            await orders.setProvisioningError(orderId, `Config '${order.configId}' nicht in configs.json gefunden`);
            await orders.transitionOrder(orderId, "PROVISION_FAILED", "system", `Config fehlt: ${order.configId}`);
            return;
        }
        // CONFIRMED → PROVISIONING (idempotent falls bereits in PROVISIONING)
        if (order.state === "CONFIRMED") {
            order = await orders.transitionOrder(orderId, "PROVISIONING", "system", "Auto-Provisioning gestartet");
        }
        // Subdomain-Sanitization analog bug20 (SSL-Fix): IDs für Subdomain-URLs
        // müssen DNS-safe sein — Punkte oder Underscores brechen die
        // *.demo.eledia.ai-Wildcard-Policy.
        const safeWish = order.subdomainWish.replace(/[^a-z0-9]/gi, "-").replace(/-+/g, "-").toLowerCase();
        const id = `shop-${safeWish}-${randomBytes(3).toString("hex")}`;
        const composeProject = `runbot-${id}`.replace(/[^a-z0-9-]/g, "-");
        const WORK_DIR = process.env.RUNBOT_WORK_DIR ?? "/opt/runbot";
        const PORT_START = parseInt(process.env.PORT_START ?? "8100");
        const PORT_END = parseInt(process.env.PORT_END ?? "8199");
        const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "";
        try {
            const port = await allocatePort(PORT_START, PORT_END);
            const instanceDir = path.join(WORK_DIR, id);
            const apiToken = randomBytes(32).toString("hex");
            const instance = {
                id, prId: "shop", branch: "main",
                pluginDir: config.plugin?.srcPath ?? "",
                moodleVersion: config.moodleVersion,
                phpVersion: config.phpVersion,
                db: config.db,
                webPort: port, status: "starting",
                url: BASE_DOMAIN ? `https://${id}.${BASE_DOMAIN}` : `http://localhost:${port}`,
                createdAt: new Date().toISOString(),
                lastActivity: new Date().toISOString(),
                composeProject,
                moodleDockerDir: path.join(instanceDir, "moodle-docker"),
                moodleDir: path.join(instanceDir, "moodle"),
                apiToken, configId: config.id,
                // Shop-Instanzen sind Kunden-Demos: Cleanup-Scheduler MUSS sie in
                // Ruhe lassen. Kündigung läuft manuell über den Admin-Dashboard-Flow
                // oder — ab Woche 4 — aus dem Customer-Dashboard heraus.
                pinned: true,
                pinReason: `order:${order.id}`,
            };
            await saveInstance(instance);
            await orders.setProvisioningInstance(orderId, instance.id);
            await dockerSvc.provisionInstance(instance);
            if (config.plugin) {
                const srcOK = await ensurePluginSrcPath(config.plugin, config.githubRepo);
                if (!srcOK) {
                    throw new Error(`Plugin-Quellverzeichnis ${config.plugin.srcPath} fehlt und konnte ` +
                        `nicht automatisch geklont werden.`);
                }
                await dockerSvc.installPlugin(instance, config.plugin.srcPath, config.plugin.type, config.plugin.name);
            }
            const snap = config.snapshotId ? await snapshotSvc.getSnapshot(config.snapshotId) : undefined;
            await dockerSvc.startContainers(instance, snap?.file);
            if (snap) {
                await snapshotSvc.restoreSnapshot(instance, snap.file);
            }
            await dockerSvc.setSiteName(instance, `${order.billing.firma} | ${config.name}`)
                .catch((e) => console.error(`[shop] setSiteName WARN:`, e));
            instance.status = "running";
            instance.lastActivity = new Date().toISOString();
            await saveInstance(instance);
            await nginxSvc.registerInstance(instance.id, instance.webPort);
            await orders.setProvisioningFinished(orderId, id);
            const liveOrder = await orders.transitionOrder(orderId, "LIVE", "system", "Provisioning erfolgreich, Instanz läuft");
            // Kunden-Magic-Token für späteres Customer-Dashboard (Woche 4).
            // Bereits jetzt ausstellen, damit er in der Welcome-Mail verlinkbar ist.
            const { token: customerToken } = await orders.issueCustomerMagicToken(orderId);
            const customerDashboardUrl = `${process.env.BASE_URL ?? "https://demo.eledia.ai"}/kunde/${customerToken}`;
            const changePasswordUrl = `${instance.url}/login/change_password.php?expired=1`;
            try {
                await email.sendOrderConfirmedEmail(liveOrder, config.name, {
                    moodleUrl: instance.url,
                    subdomain: id,
                    adminUsername: "admin",
                    // TODO (Woche 2): durch generiertes Random-Passwort ersetzen,
                    // sobald docker.setAdminPassword() verfügbar ist.
                    adminPassword: "demo1234",
                    changePasswordUrl,
                    customerDashboardUrl,
                });
            }
            catch (mailErr) {
                console.error(`[shop] Welcome-Mail für Order ${orderId} fehlgeschlagen:`, mailErr);
            }
            console.error(`[shop] Order ${orderId} → LIVE (instance ${id}, url ${instance.url})`);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`[shop] Provisioning für Order ${orderId} fehlgeschlagen:`, e);
            await orders.setProvisioningError(orderId, msg).catch(() => { });
            await orders.transitionOrder(orderId, "PROVISION_FAILED", "system", msg).catch(() => { });
            // Admin-Alert feuern (Best-Effort, kein Throw)
            try {
                const current = await orders.getOrder(orderId);
                if (current)
                    await email.sendAdminAlertNewOrderEmail(current, config.name);
            }
            catch (alertErr) {
                console.error(`[shop] Admin-Alert für Order ${orderId} fehlgeschlagen:`, alertErr);
            }
        }
    }
    // (1) POST /api/shop/order — Create Draft + Send Verify-Mail
    const shopCreateOrderHandler = async (req, res) => {
        try {
            const body = (req.body ?? {});
            // ── Validation ──
            if (!body.configId) {
                res.status(400).json({ error: "configId ist erforderlich" });
                return;
            }
            if (!body.contact?.email) {
                res.status(400).json({ error: "contact.email ist erforderlich" });
                return;
            }
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(body.contact.email)) {
                res.status(400).json({ error: "Ungültige E-Mail-Adresse in contact.email" });
                return;
            }
            if (!body.billing?.firma || !body.billing?.strasse || !body.billing?.plz ||
                !body.billing?.ort || !body.billing?.land) {
                res.status(400).json({ error: "billing.firma/strasse/plz/ort/land sind erforderlich" });
                return;
            }
            if (!body.signer?.name || !body.signer?.funktion || !body.signer?.email) {
                res.status(400).json({ error: "signer.name/funktion/email sind erforderlich" });
                return;
            }
            if (!emailRegex.test(body.signer.email)) {
                res.status(400).json({ error: "Ungültige E-Mail-Adresse in signer.email" });
                return;
            }
            const wish = (body.subdomainWish ?? "").trim().toLowerCase();
            if (!wish || !isValidSubdomain(wish)) {
                res.status(400).json({
                    error: "subdomainWish erforderlich (3–40 Zeichen, a-z/0-9/Bindestrich, kein führender/trailing Dash)",
                });
                return;
            }
            const configs = await loadConfigs().catch(() => []);
            const config = configs.find(c => c.id === body.configId);
            if (!config) {
                res.status(404).json({ error: `Config '${body.configId}' nicht gefunden` });
                return;
            }
            const order = await orders.createOrder({
                configId: body.configId,
                contactEmail: body.contact.email,
                contactPhone: body.contact.phone,
                billing: {
                    firma: body.billing.firma,
                    strasse: body.billing.strasse,
                    plz: body.billing.plz,
                    ort: body.billing.ort,
                    land: body.billing.land,
                    ustId: body.billing.ustId,
                },
                signer: {
                    name: body.signer.name,
                    funktion: body.signer.funktion,
                    email: body.signer.email,
                },
                subdomainWish: wish,
                notes: body.notes,
            });
            // Mails raus (beide im Best-Effort-Modus; Mail-Fehler kippen die Order nicht)
            await email.sendVerifyOrderEmail(order, config.name).catch((e) => console.error(`[shop] Verify-Mail für ${order.id} fehlgeschlagen:`, e));
            await email.sendAdminAlertNewOrderEmail(order, config.name).catch((e) => console.error(`[shop] Admin-Alert für ${order.id} fehlgeschlagen:`, e));
            res.json({
                ok: true,
                orderId: order.id,
                state: order.state,
                message: "Bestellung angelegt. Wir haben Ihnen eine Verify-Mail geschickt.",
                ...(process.env.NODE_ENV === "development" ? { verifyToken: order.verifyToken } : {}),
            });
        }
        catch (e) {
            console.error(`[shop] createOrder failed:`, e);
            res.status(500).json({ error: String(e?.message ?? e) });
        }
    };
    app.post("/api/shop/order", shopOrderLimiter, shopCreateOrderHandler);
    app.post("/shop/order", shopOrderLimiter, shopCreateOrderHandler);
    // (2) GET /shop/verify/:token — Double-Opt-In-Landingpage
    //
    // Klick auf den Verify-Link in der Verify-Mail → Backend transitioned
    // PENDING_VERIFICATION → ORDER_REVIEW, verschickt parallel die Review-Mail
    // als Backup-Link und leitet dann weiter auf /shop/review/:token, wo die
    // statische order-review.html ausgeliefert wird.
    //
    // Rationale (Woche 3): Früher wurde hier buildShopReviewStub() als Inline-
    // HTML gerendert. Jetzt ist die Review-Seite eine eigenständige Datei
    // (webui/order-review.html), die via REST die Bestelldaten nachlädt. Das
    // entkoppelt Template vom Backend und erlaubt klar getrennten State.
    const shopVerifyHandler = async (req, res) => {
        const { token } = req.params;
        try {
            const order = await orders.verifyOrder(token, clientIp(req), userAgent(req));
            const configs = await loadConfigs().catch(() => []);
            const config = configs.find(c => c.id === order.configId);
            const configName = config?.name ?? order.configId;
            // Parallel die Order-Review-Mail (Backup-Link, falls Browser-Tab
            // geschlossen wird). Best-Effort.
            if (order.state === "ORDER_REVIEW") {
                email.sendOrderReviewEmail(order, configName).catch((e) => console.error(`[shop] Review-Mail für ${order.id} fehlgeschlagen:`, e));
            }
            // 302 Redirect auf die Review-Seite. Der Token bleibt in der URL, damit
            // order-review.html ihn aus window.location.pathname auslesen kann.
            res.redirect(302, `/shop/review/${encodeURIComponent(token)}`);
        }
        catch (e) {
            const msg = String(e?.message ?? e).replace(/[<>&]/g, "");
            res.status(400).setHeader("Content-Type", "text/html; charset=utf-8")
                .send(`<html><body style="font-family:sans-serif;text-align:center;padding:80px;color:#555">
          <h2>Link ungültig oder abgelaufen</h2>
          <p>${msg}</p>
          <a href="${process.env.BASE_URL ?? "/shop"}" style="color:#ab1d79">→ Neue Bestellung starten</a>
        </body></html>`);
        }
    };
    app.get("/api/shop/verify/:token", shopVerifyHandler);
    app.get("/shop/verify/:token", shopVerifyHandler);
    // (3) POST /api/shop/confirm/:token — AGB/AVV akzeptiert, triggert Provisioning
    //
    // Body: { acceptedAgb: true, acceptedAvv: true }
    // Setzt markAgreementDownloaded + markAgreementSigned für beide Typen,
    // transitioned ORDER_REVIEW → CONFIRMED und startet den Provisioning-Job
    // asynchron via setImmediate.
    const shopConfirmHandler = async (req, res) => {
        const { token } = req.params;
        const body = (req.body ?? {});
        if (!body.acceptedAgb || !body.acceptedAvv) {
            res.status(400).json({
                error: "AGB und AVV müssen beide bestätigt sein (acceptedAgb=true, acceptedAvv=true)",
            });
            return;
        }
        try {
            const order = await orders.getOrderByVerifyToken(token);
            if (!order) {
                res.status(404).json({ error: "Order nicht gefunden" });
                return;
            }
            if (order.state !== "ORDER_REVIEW") {
                res.status(409).json({
                    error: `Order im Zustand ${order.state} — Confirm nur aus ORDER_REVIEW möglich`,
                    state: order.state,
                });
                return;
            }
            const ip = clientIp(req);
            const ua = userAgent(req);
            // Agreements rendern + markieren (task47, Woche 2):
            // 1. Download-Marker setzen (falls der Kunde Download-Links umgangen hat)
            // 2. Echte PDFs via pandoc rendern — Timestamp des Signings fließt rein
            // 3. Signed-Marker mit echten SHA256-Hashes und Pfaden setzen
            //
            // Der Render-Schritt ist teuer (~2s pro PDF inkl. xelatex-Start), blockiert
            // aber den HTTP-Response bewusst — der Kunde soll bei Fehler "bitte nochmal"
            // sehen statt stiller Diskrepanz in der Audit-Trail.
            await orders.markAgreementDownloaded(order.id, "agb", contractPdf.CURRENT_TEMPLATE_VERSION, ip, ua);
            await orders.markAgreementDownloaded(order.id, "avv", contractPdf.CURRENT_TEMPLATE_VERSION, ip, ua);
            const configsForContract = await loadConfigs().catch(() => []);
            const configForContract = configsForContract.find(c => c.id === order.configId);
            const signedAtIso = new Date().toISOString();
            let agbPdf, avvPdf;
            try {
                agbPdf = await contractPdf.renderAgbPdf(order, configForContract, { signedAtIso, signerIp: ip });
                avvPdf = await contractPdf.renderAvvPdf(order, configForContract, { signedAtIso, signerIp: ip });
            }
            catch (renderErr) {
                console.error(`[shop] PDF-Rendering für ${order.id} fehlgeschlagen:`, renderErr);
                res.status(500).json({
                    error: "Vertrags-PDFs konnten nicht generiert werden. Bitte in 1–2 Minuten erneut versuchen.",
                    hint: "Falls das Problem anhält, kontaktieren Sie post@moskaliuk.com mit der Order-ID.",
                    orderId: order.id,
                });
                return;
            }
            await orders.markAgreementSigned(order.id, "agb", agbPdf.path, agbPdf.sha256, ip, ua);
            await orders.markAgreementSigned(order.id, "avv", avvPdf.path, avvPdf.sha256, ip, ua);
            const confirmed = await orders.transitionOrder(order.id, "CONFIRMED", "customer", `AGB/AVV confirmed from ${ip}; agb=${agbPdf.sha256.slice(0, 12)}…, avv=${avvPdf.sha256.slice(0, 12)}…`);
            // Provisioning im Hintergrund — HTTP-Response geht sofort raus.
            setImmediate(() => {
                provisionOrderInstance(order.id).catch((e) => {
                    console.error(`[shop] provisionOrderInstance ${order.id} crashed:`, e);
                });
            });
            res.json({
                ok: true,
                orderId: confirmed.id,
                state: confirmed.state,
                message: "AGB und AVV bestätigt. Provisioning läuft — Sie erhalten eine Welcome-Mail.",
                statusUrl: `/api/shop/order/${token}`,
            });
        }
        catch (e) {
            console.error(`[shop] confirm ${token.slice(0, 6)}… failed:`, e);
            res.status(500).json({ error: String(e?.message ?? e) });
        }
    };
    app.post("/api/shop/confirm/:token", shopConfirmHandler);
    app.post("/shop/confirm/:token", shopConfirmHandler);
    // (3b) GET /api/shop/agreement/:token/:type — AGB/AVV-PDF streamen
    //
    // Lazy-Render: Erster Klick triggert pandoc, alle folgenden Klicks lesen
    // die Datei vom Disk. Zusätzlich markiert der Endpoint `downloadedAt` im
    // orders.json, damit das Review-Frontend den Confirm-Button aktivieren
    // kann (in Woche 3 per State-Polling).
    //
    // Sicherheit: Der verify-token dient als Capability — wer den Link
    // hat, darf die PDFs sehen. Kein zusätzliches Auth. Token-Entropy
    // ist 256 Bit (32 Random-Bytes hex), das ist ausreichend.
    const shopAgreementHandler = async (req, res) => {
        const { token, type } = req.params;
        if (type !== "agb" && type !== "avv") {
            res.status(400).json({ error: "type muss 'agb' oder 'avv' sein" });
            return;
        }
        try {
            const order = await orders.getOrderByVerifyToken(token);
            if (!order) {
                res.status(404).json({ error: "Order nicht gefunden" });
                return;
            }
            // Nur vor LIVE erlauben, dass gerendert wird? Nein — nach LIVE bleibt
            // das PDF auch für Audit-Download zugänglich (IRS §147 AO: 10 Jahre).
            // Nur bei komplett zurückgezogenen States (REJECTED) blockieren wir.
            if (order.state === "REJECTED" || order.state === "VERIFY_EXPIRED") {
                res.status(410).json({ error: "Order wurde zurückgezogen, PDFs nicht mehr verfügbar" });
                return;
            }
            const ip = clientIp(req);
            const ua = userAgent(req);
            const configsForAgreement = await loadConfigs().catch(() => []);
            const configForAgreement = configsForAgreement.find(c => c.id === order.configId);
            const pdf = await contractPdf.ensureContractPdf(order, configForAgreement, type, { signedAtIso: new Date().toISOString(), signerIp: ip });
            // Download-Marker setzen (idempotent — markAgreementDownloaded
            // aktualisiert downloadedAt bei jedem Aufruf).
            await orders.markAgreementDownloaded(order.id, type, pdf.templateVersion, ip, ua).catch((e) => {
                // Logging, aber nicht blockieren — PDF ausliefern ist Priorität
                console.error(`[shop] markAgreementDownloaded ${order.id}/${type} warn:`, e);
            });
            const filename = `${type}-${order.id}.pdf`;
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Length", String(pdf.bytes));
            res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
            res.setHeader("X-Runbot-PDF-SHA256", pdf.sha256);
            res.setHeader("X-Runbot-Template-Version", pdf.templateVersion);
            res.setHeader("Cache-Control", "private, no-cache");
            const buf = await fs.readFile(pdf.path);
            res.end(buf);
        }
        catch (e) {
            console.error(`[shop] agreement ${token?.slice(0, 6) ?? "?"}…/${type} failed:`, e);
            res.status(500).json({
                error: "Vertrags-PDF konnte nicht ausgeliefert werden",
                detail: String(e?.message ?? e).slice(0, 200),
            });
        }
    };
    app.get("/api/shop/agreement/:token/:type", shopAgreementHandler);
    app.get("/shop/agreement/:token/:type", shopAgreementHandler);
    // (4) GET /api/shop/order/:token — Status-Polling für den Kunden
    //
    // Liefert den Orderzustand + bei LIVE die Instance-URL. Wird vom
    // shop-confirmed.html (Woche 3) als Polling-Endpoint gebraucht.
    const shopOrderStatusHandler = async (req, res) => {
        const { token } = req.params;
        try {
            const order = await orders.getOrderByVerifyToken(token);
            if (!order) {
                res.status(404).json({ error: "Order nicht gefunden" });
                return;
            }
            const configs = await loadConfigs().catch(() => []);
            const config = configs.find(c => c.id === order.configId);
            // Agreements ohne interne Felder (pdfPath) — SHA256 + Timestamps sind OK,
            // damit das Frontend "Heruntergeladen ✓" anzeigen kann.
            const agreementsPublic = (order.agreements ?? []).map(a => ({
                type: a.type,
                templateVersion: a.templateVersion,
                downloadedAt: a.downloadedAt,
                signedAt: a.signedAt,
                pdfSha256: a.pdfSha256,
            }));
            const response = {
                orderId: order.id,
                state: order.state,
                configId: order.configId,
                configName: config?.name ?? order.configId,
                configDescription: config?.description,
                firma: order.billing.firma,
                subdomainWish: order.subdomainWish,
                createdAt: order.createdAt,
                updatedAt: order.updatedAt,
                // Review-Daten (für order-review.html) — gleicher Security-Level wie
                // buildShopReviewStub: Token-basiert, nur der Kunde kennt den Token.
                contact: { email: order.contact.email, phone: order.contact.phone },
                billing: order.billing,
                signer: order.signer,
                agreements: agreementsPublic,
                notes: order.notes,
            };
            if (order.instanceId) {
                const inst = await getInstance(order.instanceId);
                if (inst) {
                    response.instanceId = inst.id;
                    response.instanceUrl = inst.url;
                    response.subdomain = inst.id;
                }
            }
            if (order.state === "PROVISION_FAILED" || order.provisioningError) {
                response.provisioningError = order.provisioningError;
            }
            res.json(response);
        }
        catch (e) {
            res.status(500).json({ error: String(e?.message ?? e) });
        }
    };
    app.get("/api/shop/order/:token", shopOrderStatusHandler);
    app.get("/shop/order/:token", shopOrderStatusHandler);
    // ── Customer-Dashboard (task49, Woche 4) ──────────────────────────────
    //
    // Magic-Link-Dashboard für den Kunden. Der Token (`customerMagicToken`)
    // wird nach erfolgreichem Provisioning in der Welcome-Mail verschickt
    // (30 Tage Gültigkeit, separater Token vom Verify-Token). Der Kunde
    // sieht Paket, Instance-Status, Rechnungsdaten + kann AGB/AVV nochmal
    // herunterladen.
    //
    // Rationale (separates Endpoint statt Alias auf /api/shop/order): Der
    // Shop-Order-Endpoint arbeitet mit verifyToken, der nur 7 Tage gilt
    // und revoked wird sobald die Order CONFIRMED ist. Der Kunden-Token
    // bleibt 30 Tage gültig und wird per Mail verschickt → klar getrenntes
    // Artefakt, damit kein Tokenscope-Leak passiert.
    // Hilfsfunktion: Public-Shape der Agreements (ohne internen pdfPath).
    function publicAgreements(list) {
        return (list ?? []).map(a => ({
            type: a.type,
            templateVersion: a.templateVersion,
            downloadedAt: a.downloadedAt,
            signedAt: a.signedAt,
            pdfSha256: a.pdfSha256,
        }));
    }
    const customerDashboardHandler = async (req, res) => {
        const { token } = req.params;
        try {
            const order = await orders.getOrderByCustomerMagicToken(token);
            if (!order) {
                res.status(404).json({ error: "Kunden-Link nicht gefunden oder abgelaufen" });
                return;
            }
            const configs = await loadConfigs().catch(() => []);
            const config = configs.find(c => c.id === order.configId);
            const response = {
                orderId: order.id,
                state: order.state,
                configId: order.configId,
                configName: config?.name ?? order.configId,
                configDescription: config?.description,
                firma: order.billing.firma,
                subdomainWish: order.subdomainWish,
                createdAt: order.createdAt,
                updatedAt: order.updatedAt,
                contact: { email: order.contact.email, phone: order.contact.phone },
                billing: order.billing,
                signer: order.signer,
                agreements: publicAgreements(order.agreements),
                notes: order.notes,
                customerMagicExpiresAt: order.customerMagicExpiresAt,
            };
            // Instance-Snapshot nur wenn Live/Terminated (dann existiert ein
            // Container bzw. eine Historie). Wir returnen keinen apiToken —
            // das ist ein interner Wert, den der Admin nutzt.
            if (order.instanceId) {
                const inst = await getInstance(order.instanceId);
                if (inst) {
                    response.instance = {
                        id: inst.id,
                        url: inst.url,
                        status: inst.status,
                        createdAt: inst.createdAt,
                        lastActivity: inst.lastActivity,
                    };
                }
            }
            if (order.state === "PROVISION_FAILED" || order.provisioningError) {
                response.provisioningError = order.provisioningError;
            }
            res.json(response);
        }
        catch (e) {
            res.status(500).json({ error: String(e?.message ?? e) });
        }
    };
    // JSON-Endpoint: nur unter /api/kunde/:token. Der HTML-Serve-Handler
    // für /kunde/:token wird weiter unten (nach den Shop-Statics) registriert.
    app.get("/api/kunde/:token", customerDashboardHandler);
    // AGB/AVV-Download über Customer-Token. Wrapped den bestehenden PDF-Render
    // (contract-pdf.ts) — wir loggen den Download aber NICHT als neuen
    // Agreement-Record, weil der bereits signierte Record die Source-of-
    // Truth ist. Statt markAgreementDownloaded verwenden wir hier einen
    // reinen Read-Only-Stream.
    const customerAgreementHandler = async (req, res) => {
        const { token, type } = req.params;
        if (type !== "agb" && type !== "avv") {
            res.status(400).json({ error: "type muss 'agb' oder 'avv' sein" });
            return;
        }
        try {
            const order = await orders.getOrderByCustomerMagicToken(token);
            if (!order) {
                res.status(404).json({ error: "Kunden-Link nicht gefunden oder abgelaufen" });
                return;
            }
            const configs = await loadConfigs().catch(() => []);
            const config = configs.find(c => c.id === order.configId);
            // Signed-PDF zur Order existiert auf Disk (task47). Falls die Datei
            // irgendwo verschoben / gelöscht wurde → lazy-Render neu auf Basis
            // des ursprünglichen signedAt-Timestamps (für Determinismus).
            const rec = (order.agreements ?? []).find(a => a.type === type);
            const signedAtIso = rec?.signedAt ?? new Date().toISOString();
            const result = await contractPdf.ensureContractPdf(order, config, type, { signedAtIso });
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `inline; filename="${type.toUpperCase()}-${order.id}-${result.templateVersion}.pdf"`);
            res.setHeader("X-Runbot-PDF-SHA256", result.sha256);
            res.sendFile(result.path);
        }
        catch (e) {
            res.status(500).json({ error: String(e?.message ?? e) });
        }
    };
    app.get("/api/kunde/:token/agreement/:type", customerAgreementHandler);
    app.get("/kunde/:token/agreement/:type", customerAgreementHandler);
    // ── Admin: Orders-Management (task49, Woche 4) ─────────────────────────
    //
    // GET  /admin/orders            → alle Orders, optional ?state=<OrderState>
    // GET  /admin/orders/:id        → Detail (inkl. history + instance)
    // POST /admin/orders/:id/reject → manuelle Ablehnung (CONFIRMED → REJECTED
    //                                 oder PROVISION_FAILED → REJECTED)
    // POST /admin/orders/:id/terminate → LIVE → TERMINATED + Container stoppen
    //                                    & Instance-Dir cleanup.
    app.get("/admin/orders", adminAuth, async (req, res) => {
        try {
            const stateFilter = req.query.state?.toUpperCase();
            const since = req.query.since;
            const filter = {};
            if (stateFilter)
                filter.state = stateFilter;
            if (since)
                filter.since = since;
            const all = await orders.listOrders(filter);
            // Public shape — kein pdfPath leaken. Verify/Customer-Token bleibt
            // drin, weil Admin die ggf. zum Debuggen braucht.
            const rows = all.map(o => ({
                id: o.id,
                state: o.state,
                configId: o.configId,
                firma: o.billing.firma,
                subdomainWish: o.subdomainWish,
                subdomainFinal: o.subdomainFinal,
                contactEmail: o.contact.email,
                signerName: o.signer.name,
                createdAt: o.createdAt,
                updatedAt: o.updatedAt,
                verifiedAt: o.verifiedAt,
                instanceId: o.instanceId,
                provisioningError: o.provisioningError,
                agreements: publicAgreements(o.agreements),
                notes: o.notes,
            }));
            res.json({ count: rows.length, orders: rows });
        }
        catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    app.get("/api/admin/orders", adminAuth, async (req, res) => {
        // Alias — ruft denselben Handler-Code. Wir duplizieren hier, um den
        // Express-Router nicht zu chainen; das ist konsistent mit dem Dual-
        // Registrierungsmuster im Rest der Datei.
        const stateFilter = req.query.state?.toUpperCase();
        const since = req.query.since;
        try {
            const filter = {};
            if (stateFilter)
                filter.state = stateFilter;
            if (since)
                filter.since = since;
            const all = await orders.listOrders(filter);
            const rows = all.map(o => ({
                id: o.id, state: o.state, configId: o.configId,
                firma: o.billing.firma, subdomainWish: o.subdomainWish,
                subdomainFinal: o.subdomainFinal, contactEmail: o.contact.email,
                signerName: o.signer.name, createdAt: o.createdAt, updatedAt: o.updatedAt,
                verifiedAt: o.verifiedAt, instanceId: o.instanceId,
                provisioningError: o.provisioningError, agreements: publicAgreements(o.agreements),
                notes: o.notes,
            }));
            res.json({ count: rows.length, orders: rows });
        }
        catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    app.get("/admin/orders/:id", adminAuth, async (req, res) => {
        try {
            const order = await orders.getOrder(req.params.id);
            if (!order) {
                res.status(404).json({ error: "Order nicht gefunden" });
                return;
            }
            // Instance-Details mit rausgeben, damit das Admin-UI nicht einen
            // zweiten Call machen muss.
            let instance = null;
            if (order.instanceId) {
                const inst = await getInstance(order.instanceId);
                if (inst) {
                    instance = {
                        id: inst.id, url: inst.url, status: inst.status,
                        createdAt: inst.createdAt, lastActivity: inst.lastActivity,
                        moodleVersion: inst.moodleVersion, phpVersion: inst.phpVersion,
                        pinned: inst.pinned, pinReason: inst.pinReason,
                    };
                }
            }
            res.json({
                ...order,
                // pdfPath aus agreements herausmaskieren, um kein internes File-
                // Layout in UIs zu leaken.
                agreements: publicAgreements(order.agreements),
                instance,
            });
        }
        catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    app.get("/api/admin/orders/:id", adminAuth, async (req, res) => {
        try {
            const order = await orders.getOrder(req.params.id);
            if (!order) {
                res.status(404).json({ error: "Order nicht gefunden" });
                return;
            }
            let instance = null;
            if (order.instanceId) {
                const inst = await getInstance(order.instanceId);
                if (inst) {
                    instance = {
                        id: inst.id, url: inst.url, status: inst.status,
                        createdAt: inst.createdAt, lastActivity: inst.lastActivity,
                        moodleVersion: inst.moodleVersion, phpVersion: inst.phpVersion,
                        pinned: inst.pinned, pinReason: inst.pinReason,
                    };
                }
            }
            res.json({ ...order, agreements: publicAgreements(order.agreements), instance });
        }
        catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    const adminOrderRejectHandler = async (req, res) => {
        const { id } = req.params;
        const reason = typeof req.body?.reason === "string" ? req.body.reason : "Admin-Ablehnung";
        try {
            const order = await orders.getOrder(id);
            if (!order) {
                res.status(404).json({ error: "Order nicht gefunden" });
                return;
            }
            // Erlaubte Quellzustände für Reject: CONFIRMED, PROVISION_FAILED.
            // Andere States werfen in transitionOrder() einen State-Machine-Fehler,
            // der dem Admin als 409 zurückkommt.
            const updated = await orders.transitionOrder(id, "REJECTED", "admin", reason);
            res.json({ ok: true, order: { id: updated.id, state: updated.state } });
        }
        catch (e) {
            const msg = String(e?.message ?? e);
            const status = /Ungültiger Zustandsübergang/.test(msg) ? 409 : 500;
            res.status(status).json({ error: msg });
        }
    };
    app.post("/admin/orders/:id/reject", adminAuth, adminOrderRejectHandler);
    app.post("/api/admin/orders/:id/reject", adminAuth, adminOrderRejectHandler);
    const adminOrderTerminateHandler = async (req, res) => {
        const { id } = req.params;
        const reason = typeof req.body?.reason === "string" ? req.body.reason : "Admin-Kündigung";
        try {
            const order = await orders.getOrder(id);
            if (!order) {
                res.status(404).json({ error: "Order nicht gefunden" });
                return;
            }
            if (order.state !== "LIVE") {
                res.status(409).json({ error: `Terminate nur aus LIVE möglich (aktuell: ${order.state})` });
                return;
            }
            // Container erst stoppen, dann Order transitionen. Wenn der Stop
            // fehlschlägt, lieber die Order in LIVE lassen und Fehler zeigen —
            // sonst hätten wir einen orphanen Container mit TERMINATED-Order.
            if (order.instanceId) {
                const inst = await getInstance(order.instanceId);
                if (inst) {
                    inst.status = "stopping";
                    await saveInstance(inst);
                    await nginxSvc.unregisterInstance(inst.id).catch((e) => console.error(`[admin/orders] WARN nginx unregister:`, e));
                    await dockerSvc.stopContainers(inst).catch((e) => console.error(`[admin/orders] WARN docker stop:`, e));
                    await dockerSvc.cleanupInstanceDir(inst).catch((e) => console.error(`[admin/orders] WARN cleanup dir:`, e));
                    await deleteInstance(inst.id);
                }
            }
            const updated = await orders.transitionOrder(id, "TERMINATED", "admin", reason);
            res.json({ ok: true, order: { id: updated.id, state: updated.state } });
        }
        catch (e) {
            res.status(500).json({ error: String(e?.message ?? e) });
        }
    };
    app.post("/admin/orders/:id/terminate", adminAuth, adminOrderTerminateHandler);
    app.post("/api/admin/orders/:id/terminate", adminAuth, adminOrderTerminateHandler);
    const pluginInfoHandler = async (req, res) => {
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
                        console.error(`[api/plugininfo] GitHub fetch failed:`, err);
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
    };
    app.get("/api/plugininfo/:id", pluginInfoHandler);
    app.get("/plugininfo/:id", pluginInfoHandler);
    app.get("/api/configs", configsHandler);
    // ── Admin-Dashboard ───────────────────────────────────────────────────────
    app.get("/admin", adminAuth, (_req, res) => {
        res.sendFile(path.join(process.cwd(), "webui", "admin.html"));
    });
    app.get("/admin/instances", adminAuth, async (_req, res) => {
        try {
            const instances = await getAllInstances();
            res.json({ count: instances.length, instances });
        }
        catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    app.get("/admin/tokens", adminAuth, async (_req, res) => {
        try {
            const requests = await tokens.listRequests();
            res.json({ count: requests.length, requests });
        }
        catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    app.get("/admin/instances/:id/logs", adminAuth, async (req, res) => {
        try {
            const inst = await getInstance(req.params.id);
            if (!inst) {
                res.status(404).json({ error: "Instanz nicht gefunden" });
                return;
            }
            const logs = await dockerSvc.getLogs(inst, 100);
            res.json({ instanceId: inst.id, logs });
        }
        catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    app.post("/admin/instances/:id/extend", adminAuth, async (req, res) => {
        try {
            const inst = await getInstance(req.params.id);
            if (!inst) {
                res.status(404).json({ error: "Instanz nicht gefunden" });
                return;
            }
            const minutes = Math.max(1, Math.min(10080, parseInt(req.body?.minutes ?? "60", 10) || 60));
            const now = new Date().toISOString();
            inst.maxAgeMinutes = minutes;
            inst.lastActivity = now;
            if (!inst.extendedBy)
                inst.extendedBy = { code: "ADMIN", at: now };
            else
                inst.extendedBy.at = now;
            await saveInstance(inst);
            const expiresAt = new Date(new Date(now).getTime() + minutes * 60000).toISOString();
            res.json({ ok: true, instanceId: inst.id, extendedByMinutes: minutes, expiresAt });
        }
        catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    // POST /admin/instances/:id/pin   → Instanz pinnen (Cleanup-Scheduler ignoriert sie)
    // POST /admin/instances/:id/unpin → Pin aufheben
    // Body (pin only): { reason?: string }
    app.post("/admin/instances/:id/pin", adminAuth, async (req, res) => {
        try {
            const inst = await getInstance(req.params.id);
            if (!inst) {
                res.status(404).json({ error: "Instanz nicht gefunden" });
                return;
            }
            inst.pinned = true;
            inst.pinReason = req.body?.reason?.trim() || "manuell gepinnt (Admin)";
            await saveInstance(inst);
            res.json({ ok: true, instanceId: inst.id, pinned: true, pinReason: inst.pinReason });
        }
        catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    app.post("/admin/instances/:id/unpin", adminAuth, async (req, res) => {
        try {
            const inst = await getInstance(req.params.id);
            if (!inst) {
                res.status(404).json({ error: "Instanz nicht gefunden" });
                return;
            }
            inst.pinned = false;
            inst.pinReason = undefined;
            await saveInstance(inst);
            res.json({ ok: true, instanceId: inst.id, pinned: false });
        }
        catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    app.delete("/admin/instances/:id", adminAuth, async (req, res) => {
        const { id } = req.params;
        try {
            const inst = await getInstance(id);
            if (!inst) {
                res.status(404).json({ error: "Instanz nicht gefunden" });
                return;
            }
            inst.status = "stopping";
            await saveInstance(inst);
            await nginxSvc.unregisterInstance(id).catch((e) => console.error(`[admin] WARN nginx unregister:`, e));
            await dockerSvc.stopContainers(inst).catch((e) => console.error(`[admin] WARN docker stop:`, e));
            await dockerSvc.cleanupInstanceDir(inst).catch((e) => console.error(`[admin] WARN cleanup dir:`, e));
            await deleteInstance(id);
            await tokens.expireByInstance(id).catch((e) => console.error(`[admin] WARN expire token:`, e));
            res.json({ ok: true, instanceId: id });
        }
        catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    // ── Snapshot-Manager (task43) ───────────────────────────────────────────────
    app.get("/admin/snapshots", adminAuth, async (_req, res) => {
        try {
            const snapshots = await snapshotSvc.listSnapshots();
            const configs = await loadConfigs().catch(() => []);
            const enriched = snapshots.map(s => {
                const editSession = snapshotAdmin.getEditSessionBySnapshot(s.id);
                return {
                    ...s,
                    sizeFormatted: snapshotSvc.formatBytes(s.sizeBytes),
                    usedBy: configs.filter(c => c.snapshotId === s.id).map(c => ({ id: c.id, name: c.name })),
                    editSession: editSession ? {
                        sessionId: editSession.sessionId,
                        state: editSession.state,
                        url: editSession.url,
                        startedAt: editSession.startedAt,
                        instanceId: editSession.instanceId,
                    } : null,
                };
            });
            const configsLite = configs.map(c => ({
                id: c.id, name: c.name, moodleVersion: c.moodleVersion, snapshotId: c.snapshotId,
            }));
            res.json({ count: enriched.length, snapshots: enriched, configs: configsLite });
        }
        catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    app.get("/admin/snapshots/:id/download", adminAuth, async (req, res) => {
        try {
            const meta = await snapshotSvc.getSnapshot(req.params.id);
            if (!meta) {
                res.status(404).json({ error: "Snapshot nicht gefunden" });
                return;
            }
            res.setHeader("Content-Type", "application/gzip");
            res.setHeader("Content-Disposition", `attachment; filename="${meta.id}.sql.gz"`);
            res.sendFile(meta.file);
        }
        catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    app.delete("/admin/snapshots/:id", adminAuth, async (req, res) => {
        const { id } = req.params;
        const force = req.query.force === "1";
        try {
            const meta = await snapshotSvc.getSnapshot(id);
            if (!meta) {
                res.status(404).json({ error: "Snapshot nicht gefunden" });
                return;
            }
            const configs = await loadConfigs().catch(() => []);
            const inUse = configs.find(c => c.snapshotId === id);
            if (inUse && !force) {
                res.status(409).json({
                    error: `Snapshot wird von Config '${inUse.id}' (${inUse.name}) als Default verwendet. Mit ?force=1 trotzdem löschen.`,
                    usedBy: { configId: inUse.id, configName: inUse.name },
                });
                return;
            }
            const activeSession = snapshotAdmin.getEditSessionBySnapshot(id);
            if (activeSession) {
                res.status(409).json({
                    error: `Snapshot hat eine aktive Edit-Session (${activeSession.state}). Erst Save oder Discard ausführen.`,
                    editSessionId: activeSession.sessionId,
                });
                return;
            }
            await snapshotSvc.deleteSnapshot(id);
            console.error(`[admin] Snapshot deleted: ${id}${force ? " (forced)" : ""}`);
            res.json({ ok: true, deleted: id });
        }
        catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    app.post("/admin/snapshots/:id/set-default", adminAuth, async (req, res) => {
        const { id } = req.params;
        const { configId } = (req.body ?? {});
        if (!configId) {
            res.status(400).json({ error: "configId erforderlich" });
            return;
        }
        try {
            const meta = await snapshotSvc.getSnapshot(id);
            if (!meta) {
                res.status(404).json({ error: "Snapshot nicht gefunden" });
                return;
            }
            const cfg = (await loadConfigs().catch(() => [])).find(c => c.id === configId);
            if (cfg && cfg.moodleVersion !== meta.moodleVersion) {
                console.error(`[admin] WARN: snapshot ${id} (Moodle ${meta.moodleVersion}) wird Config ${configId} (Moodle ${cfg.moodleVersion}) zugewiesen — Versions-Mismatch.`);
            }
            await updateConfig(configId, (c) => { c.snapshotId = id; });
            res.json({
                ok: true, configId, snapshotId: id,
                versionMismatch: cfg && cfg.moodleVersion !== meta.moodleVersion ? {
                    configMoodle: cfg.moodleVersion,
                    snapshotMoodle: meta.moodleVersion,
                } : null,
            });
        }
        catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    app.post("/admin/snapshots/rebuild", adminAuth, async (req, res) => {
        const { snapshotId, configId } = (req.body ?? {});
        if (!snapshotId || !configId) {
            res.status(400).json({ error: "snapshotId und configId erforderlich" });
            return;
        }
        try {
            const job = await snapshotAdmin.startRebuild(snapshotId, configId);
            res.status(202).json({
                jobId: job.jobId,
                statusUrl: `/admin/snapshots/jobs/${job.jobId}`,
                message: `Rebuild gestartet für ${snapshotId} via Config ${configId}`,
            });
        }
        catch (e) {
            res.status(404).json({ error: String(e) });
        }
    });
    app.get("/admin/snapshots/jobs/:jobId", adminAuth, (req, res) => {
        const job = snapshotAdmin.getRebuildJob(req.params.jobId);
        if (!job) {
            res.status(404).json({ error: "Job nicht gefunden (oder Server neu gestartet)" });
            return;
        }
        res.json(job);
    });
    app.get("/admin/snapshots/jobs", adminAuth, (_req, res) => {
        const jobs = snapshotAdmin.listRebuildJobs(20);
        res.json({ count: jobs.length, jobs });
    });
    app.post("/admin/snapshots/:id/edit", adminAuth, async (req, res) => {
        const { id } = req.params;
        const { configId } = (req.body ?? {});
        if (!configId) {
            res.status(400).json({ error: "configId erforderlich" });
            return;
        }
        try {
            const session = await snapshotAdmin.startEditSession(id, configId);
            res.status(202).json({
                sessionId: session.sessionId,
                state: session.state,
                url: session.url ?? null,
                statusUrl: `/admin/snapshots/edit-sessions/${session.sessionId}`,
            });
        }
        catch (e) {
            res.status(404).json({ error: String(e) });
        }
    });
    app.post("/admin/snapshots/:id/save", adminAuth, async (req, res) => {
        const { id } = req.params;
        try {
            const existing = snapshotAdmin.getEditSessionBySnapshot(id);
            if (!existing) {
                res.status(404).json({ error: "Keine aktive Edit-Session für diesen Snapshot" });
                return;
            }
            const session = await snapshotAdmin.saveEditSession(existing.sessionId);
            res.status(202).json({
                sessionId: session.sessionId,
                state: session.state,
                statusUrl: `/admin/snapshots/edit-sessions/${session.sessionId}`,
            });
        }
        catch (e) {
            res.status(409).json({ error: String(e) });
        }
    });
    app.post("/admin/snapshots/:id/discard", adminAuth, async (req, res) => {
        const { id } = req.params;
        try {
            const existing = snapshotAdmin.getEditSessionBySnapshot(id);
            if (!existing) {
                res.status(404).json({ error: "Keine aktive Edit-Session für diesen Snapshot" });
                return;
            }
            const session = await snapshotAdmin.cancelEditSession(existing.sessionId);
            res.json({
                ok: true, sessionId: session.sessionId, state: session.state,
            });
        }
        catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    app.get("/admin/snapshots/edit-sessions", adminAuth, (_req, res) => {
        const sessions = snapshotAdmin.listActiveEditSessions();
        res.json({ count: sessions.length, sessions });
    });
    app.get("/admin/snapshots/edit-sessions/:sessionId", adminAuth, (req, res) => {
        const session = snapshotAdmin.getEditSession(req.params.sessionId);
        if (!session) {
            res.status(404).json({ error: "Edit-Session nicht gefunden" });
            return;
        }
        res.json(session);
    });
    app.get("/plugin/:id", (_req, res) => {
        res.sendFile(path.join(process.cwd(), "webui", "plugin-detail.html"));
    });
    // ── Shop-Frontend (Woche 3) ───────────────────────────────────────────
    // Statische Seiten mit dynamischen Pfaden. Die API (/api/shop/*) liefert
    // die Daten, die HTML-Seiten rendern sie JS-seitig.
    app.get("/shop", (_req, res) => {
        res.sendFile(path.join(process.cwd(), "webui", "shop.html"));
    });
    app.get("/shop/review/:token", (_req, res) => {
        res.sendFile(path.join(process.cwd(), "webui", "order-review.html"));
    });
    app.get("/shop/confirmed/:token", (_req, res) => {
        res.sendFile(path.join(process.cwd(), "webui", "shop-confirmed.html"));
    });
    // Kunden-Dashboard (task49, Woche 4). Magic-Link aus der Welcome-Mail.
    // JSON-Daten via GET /api/kunde/:token — siehe customerDashboardHandler.
    app.get("/kunde/:token", (_req, res) => {
        res.sendFile(path.join(process.cwd(), "webui", "customer.html"));
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
async function runStdio() {
    const t = new StdioServerTransport();
    await server.connect(t);
    console.error("[moodle-runbot] MCP server running via stdio");
}
function buildLoadingPage(firstName, pluginName, token) {
    return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Demo wird gestartet…</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet"><style>
*{margin:0;padding:0;box-sizing:border-box}body{background:#fafaf8;font-family:'DM Sans',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;color:#2d3142;padding:24px}
.card{background:#fff;border:1px solid #e8eaee;border-radius:16px;padding:48px;text-align:center;width:min(520px,100%);box-shadow:0 4px 24px rgba(0,0,0,.06)}
.logo{margin-bottom:32px;display:flex;justify-content:center}.logo img{height:40px;width:auto}
.spinner{width:48px;height:48px;border:3px solid #e8eaee;border-top-color:#1a56db;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 28px}.spinner.hidden{display:none}
@keyframes spin{to{transform:rotate(360deg)}}
.check{width:52px;height:52px;border-radius:50%;background:#059669;display:none;align-items:center;justify-content:center;margin:0 auto 24px;color:#fff;font-size:26px;line-height:1}.check.show{display:flex}
h1{font-family:'Fraunces',Georgia,serif;font-size:26px;font-weight:300;color:#0f1117;line-height:1.3;letter-spacing:-.5px;margin-bottom:12px}
p{font-size:15px;color:#7a8090;line-height:1.7;font-weight:300;margin-bottom:28px}
.steps{display:flex;flex-direction:column;gap:10px;text-align:left;background:#fafaf8;border:1px solid #e8eaee;border-radius:10px;padding:16px 20px}
.step{display:flex;align-items:center;gap:10px;font-size:13px;color:#7a8090;transition:color .3s}.step.done{color:#059669}.step.active{color:#0f1117;font-weight:500}
.step-dot{width:18px;height:18px;border-radius:50%;border:1.5px solid #e8eaee;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0;transition:all .3s}
.step.done .step-dot{background:#059669;border-color:#059669;color:#fff}.step.active .step-dot{background:#1a56db;border-color:#1a56db;color:#fff}
.note{font-size:12px;color:#7a8090;margin-top:24px}
.creds{display:none;text-align:left;background:#fafaf8;border:1px solid #e8eaee;border-radius:10px;padding:18px 20px;margin-top:20px}.creds.show{display:block}
.creds h3{font-family:'Fraunces',Georgia,serif;font-size:15px;font-weight:400;color:#0f1117;margin-bottom:6px}.creds-hint{font-size:12px;color:#7a8090;line-height:1.5;margin:0 0 12px;font-weight:300}
.cred-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px}.creds > .cred-row:last-child{margin-bottom:0}
.cred-label{color:#7a8090;min-width:96px}.cred-val{font-family:'SF Mono','Menlo',monospace;background:#fff;border:1px solid #e8eaee;border-radius:6px;padding:5px 10px;flex:1;color:#0f1117;font-size:12px;word-break:break-all}
.copy-btn{background:#fff;border:1px solid #e8eaee;border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer;color:#7a8090;transition:all .2s;font-family:inherit}.copy-btn:hover{border-color:#1a56db;color:#1a56db}.copy-btn.copied{background:#059669;color:#fff;border-color:#059669}
.primary-btn{display:none;background:#1a56db;color:#fff;border:none;border-radius:10px;padding:14px 28px;font-size:15px;font-weight:500;cursor:pointer;margin-top:20px;text-decoration:none;font-family:inherit;transition:background .2s}.primary-btn.show{display:inline-block}.primary-btn:hover{background:#1547b8}
.err{display:none;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin-top:20px;color:#b91c1c;font-size:13px;text-align:left}.err.show{display:block}.err a{color:#b91c1c;text-decoration:underline}
.extend{display:none;text-align:left;background:#fafaf8;border:1px solid #e8eaee;border-radius:10px;padding:14px 18px;margin-top:14px;font-size:12px;color:#7a8090;font-weight:300}.extend.show{display:block}
.extend-head{display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none}.extend-chevron{transition:transform .2s;font-size:10px;color:#7a8090}.extend.open .extend-chevron{transform:rotate(90deg)}
.extend-body{display:none;margin-top:10px}.extend.open .extend-body{display:block}.extend-body p{font-size:11px;color:#7a8090;margin:0 0 8px;line-height:1.5;font-weight:300}
.extend-row{display:flex;gap:6px}.extend-row input{flex:1;background:#fff;border:1px solid #e8eaee;border-radius:6px;padding:7px 10px;font-size:12px;color:#0f1117;font-family:inherit;text-transform:uppercase}.extend-row input:focus{outline:none;border-color:#1a56db}
.extend-row button{background:#1a56db;color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:11px;font-weight:500;cursor:pointer;font-family:inherit}.extend-row button:hover{background:#1547b8}.extend-row button:disabled{background:#cbd5e1;cursor:not-allowed}
.extend-msg{font-size:11px;margin-top:8px;display:none}.extend-msg.ok{display:block;color:#059669}.extend-msg.err{display:block;color:#b91c1c}
</style></head><body>
<div class="card"><div class="logo"><img src="/eledia_runbot.png" alt="eLeDia Runbot"></div>
<div class="spinner" id="spinner"></div><div class="check" id="check">✓</div>
<h1 id="headline">${firstName}, Ihre Demo<br>wird gestartet.</h1>
<p id="subtext">Wir richten eine persönliche <strong>${pluginName}</strong>-Instanz<br>für Sie ein. Das dauert etwa 30–60 Sekunden.</p>
<div class="steps" id="steps">
<div class="step active" id="s0"><div class="step-dot">1</div><span>Moodle-Umgebung vorbereiten</span></div>
<div class="step" id="s1"><div class="step-dot">2</div><span>Plugin installieren</span></div>
<div class="step" id="s2"><div class="step-dot">3</div><span>Container starten</span></div>
<div class="step" id="s3"><div class="step-dot">4</div><span>Demo-Daten laden</span></div></div>
<div class="creds" id="creds"><h3>Ihre Zugangsdaten</h3>
<p class="creds-hint">Sie können sich mit einem der folgenden Accounts einloggen — alle teilen dasselbe Passwort.</p>
<div id="cred-accounts"></div>
<div class="cred-row"><span class="cred-label">Passwort:</span><span class="cred-val" id="cred-pw"></span><button class="copy-btn" data-copy="cred-pw">Kopieren</button></div></div>
<div class="extend" id="extend"><div class="extend-head" id="extend-toggle"><span class="extend-chevron">▶</span><span>Verlängerungscode einlösen</span></div>
<div class="extend-body"><p>Sie haben von uns einen Code erhalten? Lösen Sie ihn ein, um die Demo auf <strong>24 Stunden</strong> zu verlängern.</p>
<div class="extend-row"><input type="text" id="extend-input" placeholder="z.B. EDUMA2026" maxlength="32" autocomplete="off" spellcheck="false"><button id="extend-btn" type="button">Einlösen</button></div>
<div class="extend-msg" id="extend-msg"></div></div></div>
<a class="primary-btn" id="open-btn" href="#" target="_blank" rel="noopener">Demo öffnen →</a>
<div class="err" id="err"></div><p class="note" id="note">Sie erhalten eine E-Mail sobald Ihre Demo bereit ist.</p></div>
<script>
const TOKEN = ${JSON.stringify(token)};const STEP_COUNT = 4;
const PHASE_TO_STEP = {waiting:0,provisioning:0,installing_plugin:1,starting_containers:2,restoring_snapshot:3,creating_user:3,running:4};
function setActiveStep(idx){for(let i=0;i<STEP_COUNT;i++){const el=document.getElementById('s'+i);if(!el)continue;const dot=el.querySelector('.step-dot');if(i<idx){el.className='step done';if(dot)dot.textContent='✓';}else if(i===idx){el.className='step active';if(dot)dot.textContent=String(i+1);}else{el.className='step';if(dot)dot.textContent=String(i+1);}}}
function markAllDone(){for(let i=0;i<STEP_COUNT;i++){const el=document.getElementById('s'+i);if(!el)continue;el.className='step done';const dot=el.querySelector('.step-dot');if(dot)dot.textContent='✓';}}
function showReady(data){document.title='Demo bereit';document.getElementById('spinner').classList.add('hidden');document.getElementById('check').classList.add('show');document.getElementById('headline').innerHTML='Ihre Demo<br>ist bereit!';document.getElementById('subtext').innerHTML='Ihre <strong>'+(data.pluginName||'${pluginName}')+'</strong>-Instanz läuft.<br>Klicken Sie unten auf <strong>"Demo öffnen"</strong>, um zu starten.';markAllDone();const accounts=Array.isArray(data.accounts)&&data.accounts.length?data.accounts:['admin','teacher','student'];const ACCOUNT_LABELS={admin:'Admin',teacher:'Trainer/in',student:'Teilnehmer/in'};const accountsBox=document.getElementById('cred-accounts');accountsBox.innerHTML='';accounts.forEach((acc,idx)=>{const row=document.createElement('div');row.className='cred-row';const valId='cred-acc-'+idx;const label=ACCOUNT_LABELS[acc]||(acc.charAt(0).toUpperCase()+acc.slice(1));row.innerHTML='<span class="cred-label">'+label+':</span><span class="cred-val" id="'+valId+'"></span><button class="copy-btn" type="button" data-copy="'+valId+'">Kopieren</button>';row.querySelector('#'+valId).textContent=acc;accountsBox.appendChild(row);});if(data.password)document.getElementById('cred-pw').textContent=data.password;wireCopyButtons();document.getElementById('creds').classList.add('show');document.getElementById('extend').classList.add('show');const btn=document.getElementById('open-btn');if(data.url)btn.href=data.url;btn.classList.add('show');document.getElementById('note').style.display='none';}
function showError(msg){document.title='Demo fehlgeschlagen';document.getElementById('spinner').classList.add('hidden');document.getElementById('headline').innerHTML='Etwas ist schiefgelaufen.';document.getElementById('subtext').innerHTML='Wir konnten Ihre Demo leider nicht fertigstellen.';const err=document.getElementById('err');err.textContent=msg||'Unbekannter Fehler. Bitte versuchen Sie es erneut oder kontaktieren Sie uns.';err.classList.add('show');document.getElementById('steps').style.display='none';document.getElementById('note').innerHTML='<a href="/">Zurück zum Portal</a>';}
let consecutive404=0;const MAX_404=3;
async function poll(){try{const res=await fetch('/api/demo-status/'+TOKEN,{cache:'no-store'});if(res.status===404){consecutive404++;if(consecutive404>=MAX_404){showError('Ihre Demo-Anfrage ist abgelaufen. Bitte starten Sie einen neuen Versuch.');return false;}return true;}consecutive404=0;if(!res.ok)return true;const data=await res.json();if(data.status==='ready'){showReady(data);return false;}if(data.status==='error'){showError(data.error);return false;}const phase=data.phase||'waiting';const stepIdx=PHASE_TO_STEP[phase];if(typeof stepIdx==='number')setActiveStep(stepIdx);return true;}catch(e){return true;}}
function wireCopyButtons(){document.querySelectorAll('.copy-btn').forEach(btn=>{if(btn.getAttribute('data-wired')==='1')return;btn.setAttribute('data-wired','1');btn.addEventListener('click',async()=>{const targetId=btn.getAttribute('data-copy');const el=document.getElementById(targetId);if(!el)return;try{await navigator.clipboard.writeText(el.textContent||'');btn.classList.add('copied');btn.textContent='Kopiert!';setTimeout(()=>{btn.classList.remove('copied');btn.textContent='Kopieren';},1800);}catch{}});});}
wireCopyButtons();
(function(){const wrap=document.getElementById('extend');const head=document.getElementById('extend-toggle');const input=document.getElementById('extend-input');const btnEl=document.getElementById('extend-btn');const msg=document.getElementById('extend-msg');if(!wrap||!head||!input||!btnEl||!msg)return;head.addEventListener('click',()=>wrap.classList.toggle('open'));async function submit(){const code=(input.value||'').trim().toUpperCase();if(!code){msg.className='extend-msg err';msg.textContent='Bitte einen Code eingeben.';input.focus();return;}btnEl.disabled=true;btnEl.textContent='Prüfe…';msg.className='extend-msg';msg.textContent='';try{const r=await fetch('/api/extend-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:TOKEN,code:code})});const d=await r.json().catch(()=>({}));if(!r.ok){msg.className='extend-msg err';msg.textContent=d.error||('Fehler: HTTP '+r.status);btnEl.disabled=false;btnEl.textContent='Einlösen';return;}const until=d.extendedUntil?new Date(d.extendedUntil):null;const untilStr=until?until.toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'}):'24 Stunden';msg.className='extend-msg ok';msg.textContent='✓ Verlängert bis '+untilStr;input.disabled=true;btnEl.disabled=true;btnEl.textContent='Eingelöst';}catch(e){msg.className='extend-msg err';msg.textContent='Netzwerkfehler. Bitte noch einmal versuchen.';btnEl.disabled=false;btnEl.textContent='Einlösen';}}btnEl.addEventListener('click',submit);input.addEventListener('keydown',(e)=>{if(e.key==='Enter'){e.preventDefault();submit();}});})();
setTimeout(async()=>{const keep=await poll();if(!keep)return;const handle=setInterval(async()=>{const keepPolling=await poll();if(!keepPolling)clearInterval(handle);},3000);},1500);
</script></body></html>`;
}
// Hinweis: Der ehemalige `buildShopReviewStub()` (Woche 1b-Inline-HTML) wurde
// in Woche 3 / task48 entfernt. Die Review-Seite ist jetzt die statische Datei
// `webui/order-review.html`, die via `GET /api/shop/order/:token` die Bestell-
// daten nachlädt. Der Verify-Handler redirectet auf `/shop/review/:token`.
if (transport === "http") {
    cleanupOrphans()
        .catch((e) => {
        console.error("[moodle-runbot] Orphan cleanup encountered errors:", e);
    })
        .then(async () => {
        const recovered = await snapshotAdmin.recoverEditSessionsFromRegistry().catch((e) => {
            console.error("[admin] Recover edit sessions failed:", e);
            return 0;
        });
        if (recovered > 0) {
            console.error(`[admin] Recovered ${recovered} edit session(s) from pinned instances`);
        }
    })
        .then(() => runHTTP())
        .then(() => startCleanupScheduler())
        .catch((e) => {
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