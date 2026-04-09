// src/services/moodleUser.ts
// Legt einen Demo-Nutzer in einer laufenden Moodle-Instanz an.
// Genutzt nach install_database / snapshot_restore damit der Kunde sich
// mit seiner eigenen E-Mail-Adresse einloggen kann.
//
// WICHTIG (2026-04-09): `admin/cli/create_user.php` existiert in Moodle-Core
// nicht (weder 4.x noch 5.x) — war nie ein Standard-Skript. Stattdessen
// schreiben wir ein temporäres PHP-Script in den Moodle-Dir (der via
// moodle-docker als /var/www/html im Container gemountet ist) und rufen
// Moodle's native user_create_user() API auf.

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import type { MoodleInstance } from "../types.js";

const execAsync = promisify(exec);

/**
 * Hardcoded Demo-Passwort für alle Nutzer, die via `createDemoUser` angelegt
 * werden. Wird auch vom `/api/demo-status/:token` Endpoint für die Credentials-
 * Anzeige in der Warteseite gelesen. Override möglich via Env `DEMO_PASSWORD`.
 */
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo1234";

function composeBin(instance: MoodleInstance): string {
  return path.join(instance.moodleDockerDir, "bin", "moodle-docker-compose");
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

// Escape für PHP single-quoted string literals
function phpEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Schreibt ein temporäres PHP-Script in den Moodle-Dir (gemounted in Container),
 * führt es via `docker exec ... php <script>` aus, und entfernt es danach.
 * Rückgabe: stdout des Scripts.
 */
async function runPhpScriptInContainer(
  instance: MoodleInstance,
  scriptName: string,
  phpCode: string
): Promise<string> {
  const scriptPath = path.join(instance.moodleDir, scriptName);
  await fs.writeFile(scriptPath, phpCode, "utf-8");
  try {
    const env = composeEnvStr(instance);
    const bin = composeBin(instance);
    const cmd = `${env} ${bin} exec -T webserver php ${scriptName}`;
    const { stdout } = await execAsync(cmd, {
      cwd: instance.moodleDockerDir,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout;
  } finally {
    await fs.unlink(scriptPath).catch(() => {});
  }
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
export async function createDemoUser(
  instance: MoodleInstance,
  email: string,
  firstName: string,
  lastName: string
): Promise<void> {
  const username =
    email.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 20) +
    Math.floor(Math.random() * 100);

  const phpCode = `<?php
define('CLI_SCRIPT', true);
require(__DIR__ . '/config.php');
require_once($CFG->dirroot . '/user/lib.php');
require_once($CFG->libdir   . '/moodlelib.php');
require_once($CFG->libdir   . '/authlib.php');

try {
    $username  = '${phpEscape(username)}';
    $email     = '${phpEscape(email)}';
    $firstname = '${phpEscape(firstName)}';
    $lastname  = '${phpEscape(lastName)}';
    $password  = '${phpEscape(DEMO_PASSWORD)}';

    // Nutzer mit dieser E-Mail bereits vorhanden? (Snapshot-Fall)
    $existing = $DB->get_record('user', ['email' => $email]);
    if ($existing) {
        $existing->firstname = $firstname;
        $existing->lastname  = $lastname;
        $existing->auth      = 'manual';
        $existing->confirmed = 1;
        user_update_user($existing, false, false);
        $auth = get_auth_plugin('manual');
        $auth->user_update_password($existing, $password);
        echo "USER_UPDATED=" . $existing->id . "\\n";
        exit(0);
    }

    $user = new stdClass();
    $user->auth       = 'manual';
    $user->confirmed  = 1;
    $user->mnethostid = $CFG->mnet_localhost_id;
    $user->username   = $username;
    $user->password   = $password;
    $user->email      = $email;
    $user->firstname  = $firstname;
    $user->lastname   = $lastname;
    // Keine explizite 'lang' Einstellung — Moodle nimmt Site-Default.
    // Hardcoded 'de' würde Warning "property lang has invalid data" auslösen,
    // falls das Sprachpaket nicht installiert ist.
    $user->timezone   = '99';

    $id = user_create_user($user, true, false);
    echo "USER_CREATED=$id\\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'PHP Error: ' . $e->getMessage() . "\\n");
    fwrite(STDERR, $e->getTraceAsString() . "\\n");
    exit(1);
}
`;

  // Retry bis zu 3× — Moodle braucht nach install_database manchmal noch einen Moment
  const MAX_ATTEMPTS = 3;
  const RETRY_DELAY_MS = 15_000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const out = await runPhpScriptInContainer(
        instance,
        "_runbot_create_user.php",
        phpCode
      );
      console.error(`[moodleUser] User created: ${email} | ${out.trim()}`);
      return;
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      const combined = `${e.stdout ?? ""} ${e.stderr ?? e.message ?? ""}`;

      // Sollte vom PHP-Script bereits abgefangen sein, aber sicherheitshalber
      if (combined.includes("already exists") || combined.includes("duplicate")) {
        console.error(`[moodleUser] User ${email} already exists — OK`);
        return;
      }

      console.error(
        `[moodleUser] createDemoUser attempt ${attempt}/${MAX_ATTEMPTS} failed:` +
          `\n  stdout: ${e.stdout ?? ""}` +
          `\n  stderr: ${e.stderr ?? e.message ?? ""}`
      );

      if (attempt < MAX_ATTEMPTS) {
        console.error(`[moodleUser] Retrying in ${RETRY_DELAY_MS / 1000}s…`);
        await new Promise<void>((r) => setTimeout(r, RETRY_DELAY_MS));
      } else {
        throw new Error(
          `Nutzer anlegen fehlgeschlagen nach ${MAX_ATTEMPTS} Versuchen:\n` +
            `stdout: ${e.stdout ?? ""}\nstderr: ${e.stderr ?? e.message ?? ""}`
        );
      }
    }
  }
}

/**
 * Gibt dem Demo-Nutzer Kurs-Einschreibung (Student-Rolle).
 * Setzt voraus dass ein Demo-Kurs mit shortname "demo" im Snapshot existiert.
 * Schlägt still fehl wenn Kurs nicht existiert (nicht fatal).
 */
export async function enrollUserInDemoCourse(
  instance: MoodleInstance,
  email: string
): Promise<void> {
  const phpCode = `<?php
define('CLI_SCRIPT', true);
require(__DIR__ . '/config.php');
require_once($CFG->dirroot . '/user/lib.php');
require_once($CFG->libdir   . '/enrollib.php');

try {
    $email = '${phpEscape(email)}';

    $user = $DB->get_record('user', ['email' => $email]);
    if (!$user) {
        fwrite(STDERR, "user not found: $email\\n");
        exit(0); // nicht fatal
    }

    $course = $DB->get_record('course', ['shortname' => 'demo']);
    if (!$course) {
        fwrite(STDERR, "course 'demo' not found — skipping enrol\\n");
        exit(0); // nicht fatal
    }

    $studentRole = $DB->get_record('role', ['shortname' => 'student'], '*', MUST_EXIST);

    // Manual enrol instance holen
    $enrolPlugin = enrol_get_plugin('manual');
    $enrolInstance = $DB->get_record(
        'enrol',
        ['courseid' => $course->id, 'enrol' => 'manual'],
        '*',
        IGNORE_MISSING
    );
    if (!$enrolInstance) {
        // Manual enrol zum Kurs hinzufügen falls fehlt
        $enrolInstanceId = $enrolPlugin->add_default_instance($course);
        $enrolInstance = $DB->get_record('enrol', ['id' => $enrolInstanceId], '*', MUST_EXIST);
    }

    $enrolPlugin->enrol_user($enrolInstance, $user->id, $studentRole->id);
    echo "ENROLLED=" . $user->id . " INTO=" . $course->id . "\\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'PHP Error: ' . $e->getMessage() . "\\n");
    exit(0); // nicht fatal
}
`;

  try {
    const out = await runPhpScriptInContainer(
      instance,
      "_runbot_enrol_user.php",
      phpCode
    );
    if (out.trim()) {
      console.error(`[moodleUser] Enrolled: ${out.trim()}`);
    } else {
      console.error(`[moodleUser] Einschreibung übersprungen (Kurs 'demo' existiert?)`);
    }
  } catch {
    // Nicht fatal — Kunde kann sich trotzdem einloggen
    console.error(`[moodleUser] Einschreibung fehlgeschlagen (nicht fatal)`);
  }
}
