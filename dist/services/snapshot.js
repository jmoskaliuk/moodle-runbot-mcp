// src/services/snapshot.ts
// Erstellt und restauriert DB-Snapshots von laufenden Moodle-Instanzen.
//
// Ablauf snapshot_create:
//   1. pg_dump (oder mysqldump) aus dem laufenden DB-Container
//   2. Komprimiert als .sql.gz in /opt/snapshots/
//   3. Metadata-Datei speichern (Moodle-Version, PHP, DB-Typ, Plugins)
//
// Ablauf snapshot_restore (beim instance_start, nach startContainers):
//   1. Leere moodle-DB droppen (pgsql) bzw. mysql lädt "INSERT" mit DROP-
//      Klauseln aus dem Dump.
//   2. zcat | psql/mysql spielt den Dump ein.
//   3. DB-weites URL-Rewrite via admin/tool/replace/cli/replace.php:
//      Alte wwwroot (aus mdl_config) → neue Instanz-URL. Nötig für
//      Log-Einträge, Grade-Items und Editor-Inhalte mit absoluten Links.
//      $CFG->tool_replace_allowdb muss in config.php gesetzt sein
//      (patchConfigForProduction() setzt das automatisch, bug18/2026-04-09).
//   4. `mdl_sessions` wird geleert — sonst erben wir Session-Records vom
//      Seed-Host (anderer wwwroot), und Moodle wirft sporadisch
//      "Invalid login, session mismatch".
//
// WICHTIG — URL-Rewrite passiert NICHT hier:
//   `$CFG->wwwroot` wird ausschließlich aus `config.php` gelesen. Der
//   canonical Patch-Point ist `patchConfigForProduction()` in docker.ts,
//   ausgeführt durch `provisionInstance()` VOR `startContainers()`. Ein
//   `admin/cli/cfg.php --name=wwwroot --set=…` schreibt nur ein
//   `mdl_config`-Row, die Moodle nie liest — früher hier als No-Op drin.
//   Entfernt 2026-04-09 (task19).
//
// MOODLEDATA — nicht im Snapshot enthalten:
//   Der Snapshot deckt nur die Datenbank ab. Alles was in moodledata liegt
//   (hochgeladene Dateien, Cache, temp, Filter-Konfigs mit Bildern,
//   Course-Summary-Files) fehlt nach Restore. Seed-Kurse daher so bauen,
//   dass sie keine File-Uploads, keine Bilder in Labels, keine
//   Resource-Module mit angehängten Dateien verwenden. Siehe 04-tasks.md
//   task19 Precheck-Liste.
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
const execAsync = promisify(exec);
const SNAPSHOT_DIR = process.env.SNAPSHOT_DIR ?? "/opt/snapshots";
// ── Helpers ───────────────────────────────────────────────────────────────────
async function run(cmd) {
    try {
        const { stdout } = await execAsync(cmd, { maxBuffer: 100 * 1024 * 1024 });
        return stdout;
    }
    catch (err) {
        const e = err;
        throw new Error(`Command failed: ${cmd}\n${e.stderr ?? e.message ?? ""}`);
    }
}
function composeEnvStr(instance) {
    return [
        `COMPOSE_PROJECT_NAME=${instance.composeProject}`,
        `MOODLE_DOCKER_WWWROOT=${instance.moodleDir}`,
        `MOODLE_DOCKER_DB=${instance.db}`,
        `MOODLE_DOCKER_PHP_VERSION=${instance.phpVersion}`,
        `MOODLE_DOCKER_WEB_PORT=0.0.0.0:${instance.webPort}`,
        `PATH=${process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"}`,
    ].join(" ");
}
function composeBin(instance) {
    return path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");
}
// ── Snapshot erstellen ────────────────────────────────────────────────────────
/**
 * Erstellt einen DB-Snapshot einer laufenden Moodle-Instanz.
 * Der Snapshot wird als komprimiertes SQL-Dump gespeichert.
 */
export async function createSnapshot(instance, snapshotId, label, description, plugins) {
    await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
    const file = path.join(SNAPSHOT_DIR, `${snapshotId}.sql.gz`);
    const env = composeEnvStr(instance);
    const bin = composeBin(instance);
    // DB-spezifischer Dump-Befehl
    if (instance.db === "pgsql") {
        await run(`${env} ${bin} exec -T db ` +
            `pg_dump -U moodle moodle | gzip > ${file}`);
    }
    else if (instance.db === "mariadb" || instance.db === "mysql") {
        await run(`${env} ${bin} exec -T db ` +
            `mysqldump -u moodle -pm@0dl3ing moodle | gzip > ${file}`);
    }
    else {
        throw new Error(`Snapshot nicht unterstützt für DB-Typ: ${instance.db}`);
    }
    const stat = await fs.stat(file);
    const meta = {
        id: snapshotId,
        label,
        description,
        dbType: instance.db,
        moodleVersion: instance.moodleVersion,
        phpVersion: instance.phpVersion,
        plugins,
        sizeBytes: stat.size,
        createdAt: new Date().toISOString(),
        file,
    };
    // Metadata speichern
    await fs.writeFile(path.join(SNAPSHOT_DIR, `${snapshotId}.json`), JSON.stringify(meta, null, 2), "utf-8");
    return meta;
}
// ── Snapshot restaurieren ─────────────────────────────────────────────────────
/**
 * Restauriert einen Snapshot in eine laufende (leere) Moodle-Instanz.
 * Ersetzt install_database.php — wird nach Container-Start aufgerufen.
 */
export async function restoreSnapshot(instance, snapshotFile) {
    const env = composeEnvStr(instance);
    const bin = composeBin(instance);
    if (instance.db === "pgsql") {
        // 1. Leere DB droppen und neu anlegen (moodle-docker hat sie schon angelegt)
        await run(`${env} ${bin} exec -T db ` +
            `psql -U moodle -c "DROP DATABASE IF EXISTS moodle;" postgres`).catch(() => { }); // Ignorieren falls DB noch nicht existiert
        await run(`${env} ${bin} exec -T db ` +
            `psql -U moodle -c "CREATE DATABASE moodle;" postgres`);
        // 2. Snapshot einspielen
        await run(`zcat ${snapshotFile} | ` +
            `${env} ${bin} exec -T db psql -U moodle moodle`);
    }
    else if (instance.db === "mariadb" || instance.db === "mysql") {
        await run(`zcat ${snapshotFile} | ` +
            `${env} ${bin} exec -T db mysql -u moodle -pm@0dl3ing moodle`);
    }
    // 3. DB-weites URL-Rewrite (bug18, 2026-04-09).
    //
    // Moodle speichert absolute URLs in vielen Tabellen: mdl_log,
    // mdl_logstore_standard_log, mdl_grade_items, mdl_backup_controllers,
    // atto-Editor-Inhalte in *.intro-Spalten und andere. Nach einem Snapshot-
    // Restore zeigen diese noch auf den Seed-Host.
    //
    // Ablauf:
    //   a) Alte wwwroot aus mdl_config lesen (authoritative für den Snapshot)
    //   b) Falls alt ≠ neu: admin/tool/replace/cli/replace.php aufrufen
    //      (benötigt $CFG->tool_replace_allowdb = true, gesetzt in patchConfigForProduction)
    //   c) Fehler werden geloggt aber NICHT weitergeworfen — der Restore
    //      ist auch ohne Rewrite funktional (wwwroot kommt aus config.php).
    //
    // Warum OLD_WWWROOT aus der DB lesen statt aus einem separaten Snapshot-
    // Metadaten-Feld? Weil der DB-Wert die einzige zuverlässige Quelle ist,
    // die immer mit dem Dump mitkommt — auch bei Snapshots, die ohne den
    // neuen seed-snapshot.sh-Helper erstellt wurden.
    try {
        let oldWwwroot = null;
        if (instance.db === "pgsql") {
            const result = await run(`${env} ${bin} exec -T db psql -U moodle -t -c ` +
                `"SELECT value FROM mdl_config WHERE name='wwwroot';" moodle`).catch(() => "");
            oldWwwroot = result.trim() || null;
        }
        else if (instance.db === "mariadb" || instance.db === "mysql") {
            const result = await run(`${env} ${bin} exec -T db mysql -u moodle -pm@0dl3ing -N -B -e ` +
                `"SELECT value FROM mdl_config WHERE name='wwwroot';" moodle`).catch(() => "");
            oldWwwroot = result.trim() || null;
        }
        const newWwwroot = instance.url; // https://{id}.{BASE_DOMAIN} (gesetzt in index.ts)
        if (oldWwwroot && oldWwwroot !== newWwwroot) {
            console.error(`[snapshot] URL-Rewrite: "${oldWwwroot}" → "${newWwwroot}" …`);
            await run(`${env} ${bin} exec -T webserver ` +
                `php admin/tool/replace/cli/replace.php ` +
                `--search=${JSON.stringify(oldWwwroot)} ` +
                `--replace=${JSON.stringify(newWwwroot)}`);
            console.error(`[snapshot] URL-Rewrite abgeschlossen.`);
        }
        else if (!oldWwwroot) {
            console.error(`[snapshot] WARN: Konnte alte wwwroot nicht aus mdl_config lesen — URL-Rewrite übersprungen.`);
        }
        else {
            console.error(`[snapshot] URL-Rewrite nicht nötig (wwwroot unverändert: ${newWwwroot}).`);
        }
    }
    catch (e) {
        // Nicht fatal — patchConfigForProduction setzt wwwroot in config.php.
        // Der Restore funktioniert auch ohne Rewrite, nur Links in alten
        // Log-Einträgen und Editor-Inhalten könnten auf den Seed-Host zeigen.
        console.error(`[snapshot] WARN: URL-Rewrite fehlgeschlagen (nicht fatal): ${String(e)}`);
    }
    // 4. Session-Tabelle leeren.
    // Der Seed-Host hatte einen anderen `wwwroot`, also enthalten die
    // `mdl_sessions`-Records einen falschen `sid`-Kontext. Moodle kann dadurch
    // beim ersten Login "Invalid login, session mismatch" werfen. Die Tabelle
    // ist sicher zu truncaten — es gibt noch keine aktiven Browser-Sessions
    // auf der frischen Instanz.
    if (instance.db === "pgsql") {
        await run(`${env} ${bin} exec -T db ` +
            `psql -U moodle -c "TRUNCATE TABLE mdl_sessions;" moodle`).catch((e) => {
            console.error(`[snapshot] WARN: TRUNCATE mdl_sessions failed (pgsql): ${String(e)}`);
        });
    }
    else if (instance.db === "mariadb" || instance.db === "mysql") {
        await run(`${env} ${bin} exec -T db ` +
            `mysql -u moodle -pm@0dl3ing -e "TRUNCATE TABLE mdl_sessions;" moodle`).catch((e) => {
            console.error(`[snapshot] WARN: TRUNCATE mdl_sessions failed (mysql): ${String(e)}`);
        });
    }
    // 5. Caches purgen.
    // Nach DB-Restore sind Moodle-interne Caches (mdl_config_plugins,
    // langcache, stringcache) nicht mehr mit dem Container-Filesystem
    // synchron — muss manuell getriggert werden, sonst zeigt das Frontend
    // gelegentlich Plugin-Versionen aus dem Seed-Host.
    await run(`${env} ${bin} exec -T webserver php admin/cli/purge_caches.php`).catch(() => { });
    // 6. Reminder (nur Log, kein Fehler): moodledata ist NICHT im Snapshot.
    // Falls der Seed-Kurs Dateien benötigt, würden sie jetzt fehlen. Siehe
    // Header-Kommentar dieses Files für Details.
    console.error(`[snapshot] restored ${path.basename(snapshotFile)} → ${instance.id}. ` +
        `Reminder: moodledata is NOT part of snapshots — file uploads in the ` +
        `seed course will be missing. wwwroot is handled via config.php, not here.`);
}
// ── Snapshot auflisten ────────────────────────────────────────────────────────
export async function listSnapshots() {
    try {
        await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
        const files = await fs.readdir(SNAPSHOT_DIR);
        const metaFiles = files.filter(f => f.endsWith(".json"));
        const metas = await Promise.all(metaFiles.map(async (f) => {
            try {
                const raw = await fs.readFile(path.join(SNAPSHOT_DIR, f), "utf-8");
                return JSON.parse(raw);
            }
            catch {
                return null;
            }
        }));
        return metas.filter((m) => m !== null)
            .sort((a, b) => a.id.localeCompare(b.id));
    }
    catch {
        return [];
    }
}
export async function getSnapshot(id) {
    try {
        const raw = await fs.readFile(path.join(SNAPSHOT_DIR, `${id}.json`), "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return undefined;
    }
}
export async function deleteSnapshot(id) {
    await Promise.all([
        fs.unlink(path.join(SNAPSHOT_DIR, `${id}.sql.gz`)).catch(() => { }),
        fs.unlink(path.join(SNAPSHOT_DIR, `${id}.json`)).catch(() => { }),
    ]);
}
// ── Größe lesbar formatieren ──────────────────────────────────────────────────
export function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
//# sourceMappingURL=snapshot.js.map