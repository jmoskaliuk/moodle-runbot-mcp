// src/tools/snapshots.ts
// MCP Tools für Snapshot-Management.
//
// Workflow:
//   1. snapshot_list        → Welche Snapshots gibt es?
//   2. instance_start(...)  → Instanz starten (leer, Plugin installiert)
//   3. [Manuell: Demo-Daten einrichten im Browser]
//   4. snapshot_create(...) → Snapshot dieser Instanz erstellen
//   5. snapshot_list        → Snapshot jetzt verfügbar
//
//   Beim nächsten Kunden-Klick:
//   6. instance_start(snapshotId=...) → startet aus Snapshot (5 Sek statt 60 Sek)
import { z } from "zod";
import * as snapshot from "../services/snapshot.js";
import * as registry from "../services/registry.js";
// ── Tool: snapshot_list ───────────────────────────────────────────────────────
export function registerSnapshotList(server) {
    server.registerTool("snapshot_list", {
        title: "List Available Snapshots",
        description: `Listet alle verfügbaren Snapshots auf dem Server auf.

Ein Snapshot ist eine vorkonfigurierte Moodle-Datenbank mit Demo-Daten,
aus der Kunden-Demos in ~5 Sekunden gestartet werden können.

Returns:
  { count, snapshots: [{ id, label, moodleVersion, plugins, sizeFormatted, createdAt }] }`,
        inputSchema: z.object({}).strict(),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
        },
    }, async () => {
        const snapshots = await snapshot.listSnapshots();
        const result = {
            count: snapshots.length,
            snapshots: snapshots.map(s => ({
                id: s.id,
                label: s.label,
                description: s.description,
                moodleVersion: s.moodleVersion,
                phpVersion: s.phpVersion,
                dbType: s.dbType,
                plugins: s.plugins,
                sizeFormatted: snapshot.formatBytes(s.sizeBytes),
                createdAt: s.createdAt,
                file: s.file,
            })),
        };
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
        };
    });
}
// ── Tool: snapshot_create ─────────────────────────────────────────────────────
export function registerSnapshotCreate(server) {
    server.registerTool("snapshot_create", {
        title: "Create Demo Snapshot",
        description: `Erstellt einen Snapshot der Datenbank einer laufenden Moodle-Instanz.

Workflow:
  1. Starte eine Instanz mit instance_start (ohne snapshotId)
  2. Richte Demo-Daten manuell ein (Kurse, Karten, Nutzer)
  3. Rufe snapshot_create auf — fertig

Der Snapshot wird dauerhaft gespeichert und kann für alle zukünftigen
Demo-Starts verwendet werden (snapshotId Parameter in instance_start).

Args:
  - instanceId:  Laufende Instanz als Quelle
  - snapshotId:  Eindeutiger Bezeichner, z.B. "leitnerflow-v1"
  - label:       Anzeigename, z.B. "LeitnerFlow Demo v1"
  - description: Kurzbeschreibung für das Portal
  - plugins:     Liste der installierten Plugins, z.B. ["mod_eledialeitnerflow"]

Returns:
  { snapshotId, file, sizeFormatted, createdAt }`,
        inputSchema: z.object({
            instanceId: z.string().describe("ID der laufenden Quell-Instanz"),
            snapshotId: z.string()
                .regex(/^[a-z0-9-]+$/, "Nur Kleinbuchstaben, Zahlen und Bindestriche")
                .describe("Eindeutiger Snapshot-Bezeichner, z.B. 'leitnerflow-v1'"),
            label: z.string().describe("Anzeigename, z.B. 'LeitnerFlow Demo'"),
            description: z.string().describe("Kurzbeschreibung für das Portal"),
            plugins: z.array(z.string()).default([])
                .describe("Installierte Plugins, z.B. ['mod_eledialeitnerflow']"),
        }).strict(),
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
        },
    }, async ({ instanceId, snapshotId, label, description, plugins }) => {
        // Instanz prüfen
        const instance = await registry.getInstance(instanceId);
        if (!instance) {
            return { content: [{ type: "text", text: `Fehler: Instanz '${instanceId}' nicht gefunden` }] };
        }
        if (instance.status !== "running") {
            return { content: [{ type: "text", text: `Fehler: Instanz ist nicht running (Status: ${instance.status})` }] };
        }
        // Prüfen ob Snapshot-ID schon existiert
        const existing = await snapshot.getSnapshot(snapshotId);
        if (existing) {
            return {
                content: [{
                        type: "text",
                        text: `Fehler: Snapshot '${snapshotId}' existiert bereits (erstellt ${existing.createdAt}). ` +
                            `Wähle eine andere ID oder lösche den bestehenden Snapshot zuerst mit snapshot_delete.`,
                    }],
            };
        }
        try {
            const meta = await snapshot.createSnapshot(instance, snapshotId, label, description, plugins);
            const result = {
                snapshotId: meta.id,
                label: meta.label,
                file: meta.file,
                sizeFormatted: snapshot.formatBytes(meta.sizeBytes),
                moodleVersion: meta.moodleVersion,
                plugins: meta.plugins,
                createdAt: meta.createdAt,
                nextStep: `Verwende snapshotId: "${snapshotId}" beim nächsten instance_start`,
            };
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                structuredContent: result,
            };
        }
        catch (e) {
            return { content: [{ type: "text", text: `Fehler beim Erstellen: ${String(e)}` }] };
        }
    });
}
// ── Tool: snapshot_delete ─────────────────────────────────────────────────────
export function registerSnapshotDelete(server) {
    server.registerTool("snapshot_delete", {
        title: "Delete Snapshot",
        description: `Löscht einen Snapshot dauerhaft vom Server.

Achtung: Diese Aktion kann nicht rückgängig gemacht werden.
Bestehende laufende Instanzen sind nicht betroffen.

Returns:
  { snapshotId, deleted: true }`,
        inputSchema: z.object({
            snapshotId: z.string().describe("ID des zu löschenden Snapshots"),
        }).strict(),
        annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: true,
            openWorldHint: false,
        },
    }, async ({ snapshotId }) => {
        const meta = await snapshot.getSnapshot(snapshotId);
        if (!meta) {
            return { content: [{ type: "text", text: `Fehler: Snapshot '${snapshotId}' nicht gefunden` }] };
        }
        await snapshot.deleteSnapshot(snapshotId);
        const result = { snapshotId, label: meta.label, deleted: true };
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
        };
    });
}
//# sourceMappingURL=snapshots.js.map