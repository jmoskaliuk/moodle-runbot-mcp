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
    // Retry bis zu 3× — Moodle braucht nach install_database manchmal noch einen Moment
    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 15_000;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const { stdout, stderr } = await execAsync(cmd, {
                cwd: instance.moodleDockerDir,
                maxBuffer: 2 * 1024 * 1024,
            });
            console.error(`[moodleUser] User created: ${email} | stdout: ${stdout.trim()} | stderr: ${stderr.trim()}`);
            return;
        }
        catch (err) {
            const e = err;
            const combined = `${e.stdout ?? ""} ${e.stderr ?? e.message ?? ""}`;
            // Nutzer existiert bereits (aus Snapshot) — nicht fatal
            if (combined.includes("already exists") || combined.includes("duplicate")) {
                console.error(`[moodleUser] User ${email} already exists — OK`);
                return;
            }
            console.error(`[moodleUser] createDemoUser attempt ${attempt}/${MAX_ATTEMPTS} failed:` +
                `\n  stdout: ${e.stdout ?? ""}` +
                `\n  stderr: ${e.stderr ?? e.message ?? ""}`);
            if (attempt < MAX_ATTEMPTS) {
                console.error(`[moodleUser] Retrying in ${RETRY_DELAY_MS / 1000}s…`);
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            }
            else {
                throw new Error(`Nutzer anlegen fehlgeschlagen nach ${MAX_ATTEMPTS} Versuchen:\n` +
                    `stdout: ${e.stdout ?? ""}\nstderr: ${e.stderr ?? e.message ?? ""}`);
            }
        }
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