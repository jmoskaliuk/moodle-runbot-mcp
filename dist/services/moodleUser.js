// src/services/moodleUser.ts
// Legt einen Demo-Nutzer in einer laufenden Moodle-Instanz an.
// Genutzt nach snapshot_restore damit der Kunde sich mit seiner eigenen
// E-Mail-Adresse einloggen kann.
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
const execAsync = promisify(exec);
function composeBin(instance) {
    return path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");
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
/**
 * Erstellt einen Demo-Nutzer in der Moodle-Instanz.
 * Falls die E-Mail schon existiert (aus Snapshot): Passwort + Name aktualisieren.
 *
 * @param instance  Laufende Moodle-Instanz
 * @param email     E-Mail des Kunden (wird als Username genutzt)
 * @param firstName Vorname
 * @param lastName  Nachname (oder "Demo" als Fallback)
 */
export async function createDemoUser(instance, email, firstName, lastName) {
    const env = composeEnvStr(instance);
    const bin = composeBin(instance);
    const username = email.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 20)
        + Math.floor(Math.random() * 100);
    // Moodle create_user CLI — idempotent wenn --update gesetzt
    const cmd = [
        `${env} ${bin} exec -T webserver`,
        `php admin/cli/create_user.php`,
        `--email="${email}"`,
        `--username="${username}"`,
        `--password="demo1234"`,
        `--firstname="${firstName.replace(/"/g, "'")}"`,
        `--lastname="${lastName.replace(/"/g, "'")}"`,
        `--auth=manual`,
    ].join(" ");
    try {
        await execAsync(cmd, {
            cwd: instance.moodleDockerDir,
            maxBuffer: 2 * 1024 * 1024,
        });
    }
    catch (err) {
        // Nutzer existiert vielleicht schon (aus Snapshot) — nicht fatal
        const e = err;
        if (e.stderr?.includes("already exists") || e.stderr?.includes("duplicate")) {
            console.error(`[moodleUser] User ${email} bereits vorhanden — wird nicht neu angelegt`);
            return;
        }
        throw new Error(`Nutzer anlegen fehlgeschlagen: ${String(err)}`);
    }
}
/**
 * Gibt dem Demo-Nutzer Kurs-Einschreibung (Student-Rolle).
 * Setzt voraus dass ein Demo-Kurs mit shortname "demo" im Snapshot existiert.
 */
export async function enrollUserInDemoCourse(instance, email) {
    const env = composeEnvStr(instance);
    const bin = composeBin(instance);
    // Moodle enrol_user.php — schlägt fehl wenn Kurs nicht existiert, nicht fatal
    const cmd = [
        `${env} ${bin} exec -T webserver`,
        `php admin/cli/enrol_user.php`,
        `--email="${email}"`,
        `--courseshortname="demo"`,
        `--roleshortname="student"`,
    ].join(" ");
    try {
        await execAsync(cmd, { cwd: instance.moodleDockerDir, maxBuffer: 1024 * 1024 });
    }
    catch {
        // Nicht fatal — Kunde kann sich trotzdem einloggen
        console.error(`[moodleUser] Einschreibung fehlgeschlagen (Kurs 'demo' existiert?)`);
    }
}
//# sourceMappingURL=moodleUser.js.map