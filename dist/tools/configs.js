// src/tools/configs.ts
// MCP Tools für Demo-Konfigurationen.
import { z } from "zod";
import * as config from "../services/config.js";
import * as snapshot from "../services/snapshot.js";
// ── Tool: config_list ─────────────────────────────────────────────────────────
export function registerConfigList(server) {
    server.registerTool("config_list", {
        title: "List Demo Configurations",
        description: `Gibt alle verfügbaren Demo-Konfigurationen zurück — das sind die Plugin-Karten im Portal.

Jede Konfiguration enthält:
- Plugin-Infos (Name, Typ, Pfad)
- Snapshot-ID (für schnellen Demo-Start mit Demo-Daten)
- Moodle/PHP/DB-Versionen
- Anzeige-Infos für das Portal (Icon, Beschreibung, Features)

Zeigt auch ob der referenzierte Snapshot tatsächlich existiert (snapshotReady).

Returns:
  { count, configs: [...] }`,
        inputSchema: z.object({
            includeHidden: z.boolean().default(false)
                .describe("Auch Configs mit visible=false einbeziehen"),
        }).strict(),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
        },
    }, async ({ includeHidden }) => {
        try {
            const configs = await config.loadConfigs();
            const snapshots = await snapshot.listSnapshots();
            const snapshotIds = new Set(snapshots.map(s => s.id));
            const list = configs
                .filter(c => includeHidden || c.visible)
                .map(c => ({
                ...c,
                snapshotReady: c.snapshotId ? snapshotIds.has(c.snapshotId) : false,
                snapshotExists: c.snapshotId ? snapshotIds.has(c.snapshotId) : null,
            }));
            const result = { count: list.length, configs: list };
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                structuredContent: result,
            };
        }
        catch (e) {
            return { content: [{ type: "text", text: `Fehler: ${String(e)}` }] };
        }
    });
}
// ── Tool: config_get ──────────────────────────────────────────────────────────
export function registerConfigGet(server) {
    server.registerTool("config_get", {
        title: "Get Single Demo Configuration",
        description: `Gibt eine einzelne Demo-Konfiguration zurück.
Nützlich um vor instance_start die richtigen Parameter zu ermitteln.

Returns:
  { config, snapshotReady, instanceStartArgs }`,
        inputSchema: z.object({
            configId: z.string().describe("Config-ID, z.B. 'leitnerflow'"),
        }).strict(),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
        },
    }, async ({ configId }) => {
        const cfg = await config.getConfig(configId);
        if (!cfg) {
            return { content: [{ type: "text", text: `Fehler: Config '${configId}' nicht gefunden` }] };
        }
        const snapshotReady = cfg.snapshotId
            ? (await snapshot.getSnapshot(cfg.snapshotId)) !== undefined
            : false;
        // Fertige Parameter für instance_start
        const instanceStartArgs = {
            prId: "demo",
            branch: "main",
            pluginSrcPath: cfg.plugin?.srcPath ?? "/opt/plugins/vanilla",
            pluginType: cfg.plugin?.type ?? "local",
            pluginName: cfg.plugin?.name ?? "vanilla",
            moodleVersion: cfg.moodleVersion,
            phpVersion: cfg.phpVersion,
            db: cfg.db,
            ...(cfg.snapshotId && snapshotReady ? { snapshotId: cfg.snapshotId } : {}),
        };
        const result = { config: cfg, snapshotReady, instanceStartArgs };
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
        };
    });
}
//# sourceMappingURL=configs.js.map