import type { MoodleInstance } from "../types.js";
/**
 * Erstellt einen Demo-Nutzer in der Moodle-Instanz.
 * Falls die E-Mail schon existiert (aus Snapshot): Passwort + Name aktualisieren.
 *
 * @param instance  Laufende Moodle-Instanz
 * @param email     E-Mail des Kunden (wird als Username genutzt)
 * @param firstName Vorname
 * @param lastName  Nachname (oder "Demo" als Fallback)
 */
export declare function createDemoUser(instance: MoodleInstance, email: string, firstName: string, lastName: string): Promise<void>;
/**
 * Gibt dem Demo-Nutzer Kurs-Einschreibung (Student-Rolle).
 * Setzt voraus dass ein Demo-Kurs mit shortname "demo" im Snapshot existiert.
 * Schlägt still fehl wenn Kurs nicht existiert (nicht fatal).
 */
export declare function enrollUserInDemoCourse(instance: MoodleInstance, email: string): Promise<void>;
//# sourceMappingURL=moodleUser.d.ts.map