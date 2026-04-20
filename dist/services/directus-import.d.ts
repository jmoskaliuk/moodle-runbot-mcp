import type { DetectedPlugin } from "./plugin-install.js";
export interface DirectusImportResult {
    /** Directus-ID des plugin_component-Eintrags (leer wenn skip/error) */
    id: string;
    /** true = neuer Draft-Eintrag angelegt */
    created: boolean;
    /** true = bestehender Eintrag technisch aktualisiert */
    updated?: boolean;
    /** true = kein Token konfiguriert → Import übersprungen */
    skipped?: boolean;
}
/**
 * Importiert ein erkanntes Plugin als Draft-Eintrag in den Directus SSOT.
 *
 * - Wenn DIRECTUS_IMPORT_TOKEN nicht gesetzt ist, wird der Import lautlos übersprungen.
 * - Bei bestehendem Eintrag (component-Duplikat) werden technische Importfelder additiv aktualisiert.
 * - Jede Exception wird abgefangen und geloggt; die Funktion wirft niemals.
 */
export declare function importPluginToDirectus(detected: DetectedPlugin): Promise<DirectusImportResult>;
//# sourceMappingURL=directus-import.d.ts.map