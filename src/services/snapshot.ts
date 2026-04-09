// src/services/snapshot.ts
// Erstellt und restauriert DB-Snapshots von laufenden Moodle-Instanzen.
//
// Ablauf snapshot_create:
//   1. pg_dump (oder mysqldump) aus dem laufenden DB-Container
//   2. Komprimiert als .sql.gz in /opt/snapshots/
//   3. Metadata-Datei speichern (Moodle-Version, PHP, DB-Typ, Plugins)
//
// Ablauf snapshot_restore (beim instance_start):
//   1. Snapshot-Datei in DB-Container kopieren
//   2. pg_restore (oder mysql) einspielen
//   3. Moodle-Config anpassen (siteurl, dataroot)

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import type { MoodleInstance, DbType, MoodleVersion } from "../types.js";

const execAsync = promisify(exec);

const SNAPSHOT_DIR = process.env.SNAPSHOT_DIR ?? "/opt/snapshots";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SnapshotMeta {
  id:            string;       // e.g. "leitnerflow"
  label:         string;       // "LeitnerFlow Demo"
  description:   string;
  dbType:        DbType;
  moodleVersion: MoodleVersion;
  phpVersion:    string;
  plugins:       string[];     // ["mod_eledialeitnerflow"]
  sizeBytes:     number;
  createdAt:     string;
  file:          string;       // absoluter Pfad zur .sql.gz
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function run(cmd: string): Promise<string> {
  try {
    const { stdout } = await execAsync(cmd, { maxBuffer: 100 * 1024 * 1024 });
    return stdout;
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    throw new Error(`Command failed: ${cmd}\n${e.stderr ?? e.message ?? ""}`);
  }
}

function composeEnvStr(instance: MoodleInstance): string {
  return [
    `COMPOSE_PROJECT_NAME=${instance.composeProject}`,
    `MOODLE_DOCKER_WWWROOT=${instance.moodleDir}`,
    `MOODLE_DOCKER_DB=${instance.db}`,
    `MOODLE_DOCKER_PHP_VERSION=${instance.phpVersion}`,
    `MOODLE_DOCKER_WEB_PORT=0.0.0.0:${instance.webPort}`,
    `PATH=${process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"}`,
  ].join(" ");
}

function composeBin(instance: MoodleInstance): string {
  return path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");
}

// ── Snapshot erstellen ────────────────────────────────────────────────────────

/**
 * Erstellt einen DB-Snapshot einer laufenden Moodle-Instanz.
 * Der Snapshot wird als komprimiertes SQL-Dump gespeichert.
 */
export async function createSnapshot(
  instance: MoodleInstance,
  snapshotId: string,
  label: string,
  description: string,
  plugins: string[]
): Promise<SnapshotMeta> {
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });

  const file = path.join(SNAPSHOT_DIR, `${snapshotId}.sql.gz`);
  const env  = composeEnvStr(instance);
  const bin  = composeBin(instance);

  // DB-spezifischer Dump-Befehl
  if (instance.db === "pgsql") {
    await run(
      `${env} ${bin} exec -T db ` +
      `pg_dump -U moodle moodle | gzip > ${file}`
    );
  } else if (instance.db === "mariadb" || instance.db === "mysql") {
    await run(
      `${env} ${bin} exec -T db ` +
      `mysqldump -u moodle -pm@0dl3ing moodle | gzip > ${file}`
    );
  } else {
    throw new Error(`Snapshot nicht unterstützt für DB-Typ: ${instance.db}`);
  }

  const stat = await fs.stat(file);

  const meta: SnapshotMeta = {
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
  await fs.writeFile(
    path.join(SNAPSHOT_DIR, `${snapshotId}.json`),
    JSON.stringify(meta, null, 2),
    "utf-8"
  );

  return meta;
}

// ── Snapshot restaurieren ─────────────────────────────────────────────────────

/**
 * Restauriert einen Snapshot in eine laufende (leere) Moodle-Instanz.
 * Ersetzt install_database.php — wird nach Container-Start aufgerufen.
 */
export async function restoreSnapshot(
  instance: MoodleInstance,
  snapshotFile: string
): Promise<void> {
  const env = composeEnvStr(instance);
  const bin = composeBin(instance);

  if (instance.db === "pgsql") {
    // 1. Leere DB droppen und neu anlegen (moodle-docker hat sie schon angelegt)
    await run(
      `${env} ${bin} exec -T db ` +
      `psql -U moodle -c "DROP DATABASE IF EXISTS moodle;" postgres`
    ).catch(() => {}); // Ignorieren falls DB noch nicht existiert

    await run(
      `${env} ${bin} exec -T db ` +
      `psql -U moodle -c "CREATE DATABASE moodle;" postgres`
    );

    // 2. Snapshot einspielen
    await run(
      `zcat ${snapshotFile} | ` +
      `${env} ${bin} exec -T db psql -U moodle moodle`
    );

  } else if (instance.db === "mariadb" || instance.db === "mysql") {
    await run(
      `zcat ${snapshotFile} | ` +
      `${env} ${bin} exec -T db mysql -u moodle -pm@0dl3ing moodle`
    );
  }

  // 3. Moodle-Config auf neue URL und Pfade anpassen
  const newUrl = instance.url;
  const newDataroot = `/var/moodledata`; // Standard im moodle-docker Container

  await run(
    `${env} ${bin} exec -T webserver php admin/cli/cfg.php ` +
    `--name=wwwroot --set="${newUrl}"`
  ).catch(() => {}); // Nicht fatal

  await run(
    `${env} ${bin} exec -T webserver php admin/cli/cfg.php ` +
    `--name=dataroot --set="${newDataroot}"`
  ).catch(() => {});

  // 4. Caches purgen
  await run(
    `${env} ${bin} exec -T webserver php admin/cli/purge_caches.php`
  ).catch(() => {});
}

// ── Snapshot auflisten ────────────────────────────────────────────────────────

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  try {
    await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
    const files = await fs.readdir(SNAPSHOT_DIR);
    const metaFiles = files.filter(f => f.endsWith(".json"));

    const metas = await Promise.all(
      metaFiles.map(async f => {
        try {
          const raw = await fs.readFile(path.join(SNAPSHOT_DIR, f), "utf-8");
          return JSON.parse(raw) as SnapshotMeta;
        } catch {
          return null;
        }
      })
    );

    return metas.filter((m): m is SnapshotMeta => m !== null)
                .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}

export async function getSnapshot(id: string): Promise<SnapshotMeta | undefined> {
  try {
    const raw = await fs.readFile(path.join(SNAPSHOT_DIR, `${id}.json`), "utf-8");
    return JSON.parse(raw) as SnapshotMeta;
  } catch {
    return undefined;
  }
}

export async function deleteSnapshot(id: string): Promise<void> {
  await Promise.all([
    fs.unlink(path.join(SNAPSHOT_DIR, `${id}.sql.gz`)).catch(() => {}),
    fs.unlink(path.join(SNAPSHOT_DIR, `${id}.json`)).catch(() => {}),
  ]);
}

// ── Größe lesbar formatieren ──────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
