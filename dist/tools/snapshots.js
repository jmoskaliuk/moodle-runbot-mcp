// src/tools/snapshots.ts
// MCP Tools für Snapshot-Management.
//
// Workflow A — manuell (alter Pfad):
//   1. snapshot_list        → Welche Snapshots gibt es?
//   2. instance_start(...)  → Instanz starten (leer, Plugin installiert)
//   3. [Manuell: Demo-Daten einrichten im Browser]
//   4. snapshot_create(...) → Snapshot dieser Instanz erstellen
//   5. snapshot_list        → Snapshot jetzt verfügbar
//
//   Beim nächsten Kunden-Klick:
//   6. instance_start(snapshotId=...) → startet aus Snapshot (5 Sek statt 60 Sek)
//
// Workflow B — automatisch (task30, empfohlen für Snapshots ohne UI-Schritt):
//   1. snapshot_build(...)  → startet pinned Instance, dumpt DB, stoppt Instance.
//      Ein einziger Call. Cleanup-scheduler ignoriert die gepinnte Instanz,
//      damit der Dump nicht mitten im Ablauf abgeräumt wird.
import { z } from "zod";
import { randomBytes } from "crypto";
import path from "path";
import * as snapshot from "../services/snapshot.js";
import * as registry from "../services/registry.js";
import * as docker from "../services/docker.js";
import * as nginx from "../services/nginx.js";
const WORK_DIR = process.env.RUNBOT_WORK_DIR ?? "/opt/runbot";
const PORT_START = parseInt(process.env.PORT_START ?? "8100");
const PORT_END = parseInt(process.env.PORT_END ?? "8199");
const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "";
function shortId() {
    return randomBytes(3).toString("hex");
}
function buildInstanceUrl(instance) {
    if (BASE_DOMAIN)
        return `https://${instance.id}.${BASE_DOMAIN}`;
    return `http://localhost:${instance.webPort}`;
}
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
// ── Tool: snapshot_build (task30) ─────────────────────────────────────────────
//
// One-Shot-Snapshot-Builder: Startet eine gepinnte Instanz, kopiert das
// Plugin, wartet bis die DB fertig initialisiert ist, dumpt sie und räumt
// die Instanz danach wieder auf. Der gesamte Ablauf läuft ohne UI-Schritt
// — geeignet für Plugins, bei denen die Default-Installation (registrierte
// Plugin-Settings, Standard-Sample-Daten) bereits ein sinnvoller Startzustand
// für Kunden-Demos ist. Wenn du einen manuell präparierten Seed brauchst
// (Kurse, Nutzer, Inhalte im Browser anlegen), nimm stattdessen den
// manuellen Zwei-Schritt-Pfad: `instance_start(pinned=true)` → Browser →
// `snapshot_create` → `instance_stop`.
//
// Warum `pinned`: Ohne das Flag räumt der Cleanup-Scheduler die Instanz
// bereits nach 15 Min Inaktivität ab — MCP-Calls zählen nicht als Aktivität,
// d.h. bei längeren Dumps oder Restarts rennen wir in den Timer. Durch
// `pinned: true` überspringt `runCleanup()` die Instanz komplett, und
// `snapshot_build` stoppt sie am Ende explizit wieder.
export function registerSnapshotBuild(server) {
    server.registerTool("snapshot_build", {
        title: "Build Snapshot in One Call",
        description: `Startet eine temporäre Moodle-Instanz, erstellt einen Snapshot ihrer
Default-DB, und räumt die Instanz wieder auf. Ein einziger MCP-Call.

Empfohlen für Plugins, bei denen die reine Default-Installation (mit
Plugin-Settings und ggf. install.php-Samplerecords) bereits der gewünschte
Snapshot-State ist. Für manuell präparierte Seeds (Kurse, Nutzer im Browser
anlegen) stattdessen den manuellen Pfad nutzen: instance_start(pinned=true)
→ Browser-Setup → snapshot_create → instance_stop.

Ablauf intern:
  1. Port allokieren, Instance mit pinned=true in Registry anlegen
  2. moodle-docker + Moodle klonen, config.php patchen
  3. Plugin in den Moodle-Tree kopieren
  4. docker compose up + install_database.php
  5. pg_dump/mysqldump → /opt/snapshots/<id>.sql.gz + Metadata
  6. docker compose down, Verzeichnis entfernen, Registry-Eintrag löschen

Der Cleanup-Scheduler ignoriert die Instanz während der Laufzeit (pinned),
damit er nicht mitten im Dump zuschlägt.

Returns:
  { snapshotId, label, file, sizeFormatted, instanceId, durationSeconds }`,
        inputSchema: z.object({
            // ── Instance-Parameter (identisch zu instance_start) ─────────────
            prId: z.string().describe("Label für die temporäre Instanz, z.B. 'exam2pdf'"),
            branch: z.string().default("main").describe("Plugin-Branch (nur für Registry-Eintrag), Default: 'main'"),
            pluginSrcPath: z.string().describe("Absoluter Pfad zum Plugin auf dem Server, z.B. '/opt/plugins/local_eledia_exam2pdf'"),
            pluginType: z.string().default("local").describe("Moodle plugin type: local, mod, block, ..."),
            pluginName: z.string().describe("Plugin shortname ohne Frankentyp-Präfix, z.B. 'eledia_exam2pdf'"),
            moodleVersion: z.enum(["4.3", "4.4", "4.5", "5.0", "5.1"]).default("5.0"),
            phpVersion: z.enum(["8.1", "8.2", "8.3", "8.4"]).default("8.2"),
            db: z.enum(["pgsql", "mariadb", "mysql"]).default("pgsql"),
            // ── Snapshot-Parameter (identisch zu snapshot_create) ────────────
            snapshotId: z.string()
                .regex(/^[a-z0-9-]+$/, "Nur Kleinbuchstaben, Zahlen und Bindestriche")
                .describe("Eindeutiger Snapshot-Bezeichner, z.B. 'exam2pdf-v1'"),
            label: z.string().describe("Anzeigename, z.B. 'Exam2PDF Demo v1'"),
            description: z.string().describe("Kurzbeschreibung für das Portal"),
            plugins: z.array(z.string()).default([])
                .describe("Installierte Plugins, z.B. ['local_eledia_exam2pdf']"),
        }).strict(),
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
        },
    }, async ({ prId, branch, pluginSrcPath, pluginType, pluginName, moodleVersion, phpVersion, db, snapshotId, label, description, plugins, }) => {
        // Snapshot-ID muss frei sein — Fehler lieber vor dem Provisioning.
        const existing = await snapshot.getSnapshot(snapshotId);
        if (existing) {
            return { content: [{ type: "text",
                        text: `Fehler: Snapshot '${snapshotId}' existiert bereits (${existing.createdAt}). ` +
                            `Lösche ihn zuerst mit snapshot_delete oder wähle eine andere ID.` }] };
        }
        const start = Date.now();
        const id = `snap-${prId}-${shortId()}`;
        const composeProject = `runbot-${id}`.replace(/[^a-z0-9-]/g, "-");
        const instanceDir = path.join(WORK_DIR, id);
        let port;
        try {
            port = await registry.allocatePort(PORT_START, PORT_END);
        }
        catch (e) {
            return { content: [{ type: "text", text: `Fehler beim Port-Allokieren: ${String(e)}` }] };
        }
        const instance = {
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
            pinned: true,
            pinReason: `snapshot_build:${snapshotId}`,
        };
        instance.url = buildInstanceUrl(instance);
        await registry.saveInstance(instance);
        // Provisioning-Fehler dürfen die Instanz nicht als Waise hinterlassen —
        // in jedem Pfad (Erfolg wie Fehler) räumen wir im finally-Block auf.
        let buildError = null;
        let meta;
        try {
            await docker.provisionInstance(instance);
            await docker.installPlugin(instance, pluginSrcPath, pluginType, pluginName);
            await docker.startContainers(instance);
            instance.status = "running";
            instance.lastActivity = new Date().toISOString();
            await registry.saveInstance(instance);
            meta = await snapshot.createSnapshot(instance, snapshotId, label, description, plugins);
        }
        catch (e) {
            buildError = e;
        }
        finally {
            // Aufräumen — best-effort, einzelne Fehler werden geloggt aber nicht
            // weitergeworfen, weil sonst ein guter Snapshot wegen z.B. eines
            // nginx-Reload-Fehlers als "failed" zurückgemeldet würde.
            instance.status = "stopping";
            await registry.saveInstance(instance).catch(() => { });
            await nginx.unregisterInstance(instance.id).catch((e) => {
                console.error(`[snapshot_build] nginx unregister ${instance.id}:`, e);
            });
            await docker.stopContainers(instance).catch((e) => {
                console.error(`[snapshot_build] docker stop ${instance.id}:`, e);
            });
            await docker.cleanupInstanceDir(instance).catch((e) => {
                console.error(`[snapshot_build] cleanup dir ${instance.id}:`, e);
            });
            await registry.deleteInstance(instance.id).catch(() => { });
        }
        if (buildError || !meta) {
            return { content: [{ type: "text",
                        text: `Fehler beim Snapshot-Build: ${String(buildError ?? "unknown")}. ` +
                            `Temporäre Instanz ${id} wurde aufgeräumt.` }] };
        }
        const durationSeconds = Math.round((Date.now() - start) / 1000);
        const result = {
            snapshotId: meta.id,
            label: meta.label,
            file: meta.file,
            sizeFormatted: snapshot.formatBytes(meta.sizeBytes),
            moodleVersion: meta.moodleVersion,
            plugins: meta.plugins,
            createdAt: meta.createdAt,
            instanceId: id,
            durationSeconds,
            nextStep: `Verwende snapshotId: "${meta.id}" in instance_start oder setze ihn in configs.json`,
        };
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
        };
    });
}
//# sourceMappingURL=snapshots.js.map