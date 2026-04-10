// src/api/internal.ts
//
// Internal HTTP endpoints for the in-Moodle local_runbotadmin plugin.
// (task37 MVP)
//
// Authentication
// ──────────────
// These routes are NOT protected by the normal MCP API-key (which is for
// external tool callers). Instead, each Moodle instance has its own
// `apiToken` generated at instance_start. The token is injected into the
// container via the RUNBOT_API_TOKEN env var and surfaces as
// $CFG->runbot_api_token on the PHP side.
//
// Every request must carry:
//   X-Runbot-Instance-Id: <instance.id>
//   X-Runbot-Api-Token:   <instance.apiToken>
//
// The middleware looks up the instance in the registry, compares the
// presented token with `instance.apiToken`, and rejects on mismatch.
//
// Why not share the MCP API-key? Because it's global — a leaked token
// from one demo instance would give full MCP access. The per-instance
// token limits blast radius to that one running demo.
//
// Routes (MVP)
// ────────────
//   POST /api/internal/snapshot/create  → create a snapshot of the calling instance
//   GET  /api/internal/snapshot/list    → list snapshots belonging to the instance's plugin
//
// The rest (download, upload, delete, plugin management, metadata) is
// deferred to task37b.
import express from "express";
import path from "path";
import fs from "fs/promises";
import { getInstance } from "../services/registry.js";
import { createSnapshot, listSnapshots, getSnapshot, deleteSnapshot, } from "../services/snapshot.js";
import { updateConfig, getConfig } from "../services/config.js";
const SNAPSHOT_DIR = process.env.SNAPSHOT_DIR ?? "/opt/snapshots";
/**
 * Extract the plugin slug from an instance. For demo-flow instances,
 * `instance.id` follows the pattern `demo-<configId>-<hex6>`. If a
 * `configId` is present on the instance (new in task37), prefer that.
 */
function instancePluginSlug(instance) {
    if (instance.configId)
        return instance.configId;
    const m = /^demo-([a-z0-9-]+?)-[a-f0-9]{6}$/i.exec(instance.id);
    return m ? m[1] : instance.id;
}
/**
 * Middleware — validates the two custom headers and attaches the
 * resolved MoodleInstance to req for downstream handlers.
 */
async function authMiddleware(req, res, next) {
    const instanceId = req.header("X-Runbot-Instance-Id") ?? "";
    const token = req.header("X-Runbot-Api-Token") ?? "";
    if (!instanceId || !token) {
        res.status(401).json({ error: "Missing X-Runbot-Instance-Id or X-Runbot-Api-Token header" });
        return;
    }
    const instance = await getInstance(instanceId);
    if (!instance) {
        res.status(401).json({ error: "Unknown instance" });
        return;
    }
    if (!instance.apiToken || instance.apiToken !== token) {
        console.warn(`[internal] Token mismatch for instance ${instanceId}`);
        res.status(401).json({ error: "Invalid token" });
        return;
    }
    // Attach for handlers. Using (req as any) to avoid a module-wide
    // Express type augmentation for one field.
    req.runbotInstance = instance;
    next();
}
/**
 * Build and return the Express router mounted at /api/internal.
 */
export function buildInternalRouter() {
    const router = express.Router();
    router.use(express.json({ limit: "2mb" }));
    router.use(authMiddleware);
    // ── POST /snapshot/create ──────────────────────────────────────────────
    router.post("/snapshot/create", async (req, res) => {
        const instance = req.runbotInstance;
        const body = (req.body ?? {});
        const label = (body.label ?? "").trim();
        const description = (body.description ?? "").trim();
        if (!label || !/^[A-Za-z0-9-]+$/.test(label)) {
            res.status(400).json({ error: "Label must be non-empty and contain only letters, digits, hyphens" });
            return;
        }
        // Snapshot-Id: <plugin-slug>-<label> — stable and predictable.
        const slug = instancePluginSlug(instance);
        const snapshotId = `${slug}-${label}`;
        try {
            const meta = await createSnapshot(instance, snapshotId, `${slug} — ${label}`, description || `Created from in-Moodle admin by instance ${instance.id}`, [slug]);
            res.json({
                snapshotId: meta.id,
                label: meta.label,
                sizeBytes: meta.sizeBytes,
                createdAt: meta.createdAt,
            });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`[internal] snapshot/create failed for ${instance.id}:`, msg);
            res.status(500).json({ error: msg });
        }
    });
    // ── GET /snapshot/list ─────────────────────────────────────────────────
    // Returns only snapshots that include this instance's plugin slug in
    // their `plugins` array. Generic snapshots (empty plugins) are hidden
    // to avoid leaking unrelated demo data between plugins.
    //
    // task37b: Zusätzliche Felder `isDefault` (= aktueller defaultSnapshot
    // aus configs.json) und `downloadUrl` (relative Backend-Route). Das
    // Plugin benutzt beides für die UI (Badge, Download-Link).
    router.get("/snapshot/list", async (req, res) => {
        const instance = req.runbotInstance;
        const slug = instancePluginSlug(instance);
        try {
            const [all, config] = await Promise.all([
                listSnapshots(),
                getConfig(slug).catch(() => undefined),
            ]);
            const currentDefault = config?.snapshotId ?? null;
            const mine = all.filter(s => s.plugins?.includes(slug));
            res.json({
                configId: slug,
                defaultSnapshot: currentDefault,
                snapshots: mine.map(s => ({
                    snapshotId: s.id,
                    label: s.label,
                    description: s.description,
                    sizeBytes: s.sizeBytes,
                    createdAt: s.createdAt,
                    isDefault: s.id === currentDefault,
                    downloadUrl: `/api/internal/snapshot/download/${encodeURIComponent(s.id)}`,
                })),
            });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`[internal] snapshot/list failed for ${instance.id}:`, msg);
            res.status(500).json({ error: msg });
        }
    });
    // ── GET /snapshot/download/:id ─────────────────────────────────────────
    //
    // task37b: Streamt die .sql.gz-Datei eines Snapshots zurück. Der
    // Browser bekommt `Content-Disposition: attachment` und startet den
    // Download direkt, ohne dass das PHP-Plugin selbst Binärdaten durch
    // curl pumpen muss.
    //
    // Zugangsschutz:
    //   1. authMiddleware (bereits aktiv) prüft Instance-Id + Token
    //   2. Der Snapshot muss die Plugin-Slug dieser Instanz enthalten —
    //      sonst könnte jeder Demo-Container jeden Snapshot herunterladen
    //      (z.B. einen aus einem parallelen, anderen Plugin-Demo).
    //   3. Der angeforderte Pfad wird auf SNAPSHOT_DIR beschränkt (kein
    //      Path-Traversal via `..`).
    router.get("/snapshot/download/:id", async (req, res) => {
        const instance = req.runbotInstance;
        const slug = instancePluginSlug(instance);
        const id = String(req.params.id || "");
        // Whitelist der Zeichen, die in einer snapshotId auftreten dürfen —
        // gleiche Regex wie im Create-Endpoint plus Punkt/Underscore für
        // Altbestand (z.B. "vanilla-4.5").
        if (!/^[A-Za-z0-9._-]+$/.test(id)) {
            res.status(400).json({ error: "Invalid snapshot id" });
            return;
        }
        try {
            const meta = await getSnapshot(id);
            if (!meta) {
                res.status(404).json({ error: `Snapshot '${id}' nicht gefunden` });
                return;
            }
            if (!meta.plugins?.includes(slug)) {
                // Nicht für diesen Plugin-Scope sichtbar → selbes 404 wie oben,
                // damit wir keinen Seitenkanal auf "existiert" leaken.
                res.status(404).json({ error: `Snapshot '${id}' nicht gefunden` });
                return;
            }
            const file = path.join(SNAPSHOT_DIR, `${id}.sql.gz`);
            // Zusätzlicher Path-Containment-Check: resolve muss mit SNAPSHOT_DIR beginnen.
            const resolved = path.resolve(file);
            if (!resolved.startsWith(path.resolve(SNAPSHOT_DIR) + path.sep)) {
                res.status(400).json({ error: "Invalid path" });
                return;
            }
            // Existenz prüfen, bevor wir Content-Length-Header setzen.
            const stat = await fs.stat(resolved).catch(() => null);
            if (!stat || !stat.isFile()) {
                res.status(404).json({ error: `Snapshot-Datei fehlt auf Disk: ${id}.sql.gz` });
                return;
            }
            res.setHeader("Content-Type", "application/gzip");
            res.setHeader("Content-Length", stat.size.toString());
            res.setHeader("Content-Disposition", `attachment; filename="${id}.sql.gz"`);
            res.sendFile(resolved);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`[internal] snapshot/download failed for ${instance.id}/${id}:`, msg);
            res.status(500).json({ error: msg });
        }
    });
    // ── POST /snapshot/delete ──────────────────────────────────────────────
    //
    // task37b: Löscht sowohl .sql.gz als auch .json einer Snapshot-Id.
    // Restriktion: Die Snapshot-Id muss zur Plugin-Slug der aufrufenden
    // Instanz gehören (gleiche Logik wie list/download). Zusätzlich
    // verweigern wir das Löschen des aktuell eingestellten Default-
    // Snapshots — sonst würde die Config ins Leere zeigen und der nächste
    // Demo-Start schlägt fehl.
    router.post("/snapshot/delete", async (req, res) => {
        const instance = req.runbotInstance;
        const slug = instancePluginSlug(instance);
        const body = (req.body ?? {});
        const id = (body.snapshotId ?? "").trim();
        if (!id || !/^[A-Za-z0-9._-]+$/.test(id)) {
            res.status(400).json({ error: "Invalid snapshotId" });
            return;
        }
        try {
            const meta = await getSnapshot(id);
            if (!meta) {
                res.status(404).json({ error: `Snapshot '${id}' nicht gefunden` });
                return;
            }
            if (!meta.plugins?.includes(slug)) {
                res.status(404).json({ error: `Snapshot '${id}' nicht gefunden` });
                return;
            }
            // Default-Schutz: Der aktuelle snapshotId aus der Config darf
            // nicht gelöscht werden — der Admin muss vorher einen anderen als
            // Default setzen.
            const config = await getConfig(slug).catch(() => undefined);
            if (config?.snapshotId === id) {
                res.status(409).json({
                    error: `Snapshot '${id}' ist aktuell als Default gesetzt. ` +
                        `Bitte erst einen anderen Snapshot als Default wählen.`,
                });
                return;
            }
            await deleteSnapshot(id);
            res.json({ ok: true, snapshotId: id });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`[internal] snapshot/delete failed for ${instance.id}/${id}:`, msg);
            res.status(500).json({ error: msg });
        }
    });
    // ── POST /config/set-default ───────────────────────────────────────────
    //
    // task37b: Setzt `snapshotId` in configs.json für die Plugin-Slug der
    // aufrufenden Instanz. Der Snapshot muss (a) existieren und (b) zur
    // gleichen Plugin-Slug gehören — sonst könnte eine Instanz einen
    // beliebigen fremden Snapshot als Default für sich selbst setzen.
    router.post("/config/set-default", async (req, res) => {
        const instance = req.runbotInstance;
        const slug = instancePluginSlug(instance);
        const body = (req.body ?? {});
        const id = (body.snapshotId ?? "").trim();
        if (!id || !/^[A-Za-z0-9._-]+$/.test(id)) {
            res.status(400).json({ error: "Invalid snapshotId" });
            return;
        }
        try {
            const meta = await getSnapshot(id);
            if (!meta || !meta.plugins?.includes(slug)) {
                res.status(404).json({ error: `Snapshot '${id}' nicht gefunden` });
                return;
            }
            const updated = await updateConfig(slug, cfg => {
                cfg.snapshotId = id;
            });
            res.json({
                ok: true,
                configId: slug,
                snapshotId: updated.snapshotId,
            });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`[internal] config/set-default failed for ${instance.id}:`, msg);
            res.status(500).json({ error: msg });
        }
    });
    return router;
}
//# sourceMappingURL=internal.js.map