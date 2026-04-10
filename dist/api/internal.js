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
import { getInstance } from "../services/registry.js";
import { createSnapshot, listSnapshots } from "../services/snapshot.js";
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
    router.get("/snapshot/list", async (req, res) => {
        const instance = req.runbotInstance;
        const slug = instancePluginSlug(instance);
        try {
            const all = await listSnapshots();
            const mine = all.filter(s => s.plugins?.includes(slug));
            res.json({
                snapshots: mine.map(s => ({
                    snapshotId: s.id,
                    label: s.label,
                    description: s.description,
                    sizeBytes: s.sizeBytes,
                    createdAt: s.createdAt,
                })),
            });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`[internal] snapshot/list failed for ${instance.id}:`, msg);
            res.status(500).json({ error: msg });
        }
    });
    return router;
}
//# sourceMappingURL=internal.js.map