// src/services/directus-import.ts
//
// task30: Import eines erkannten Moodle-Plugins in den Directus SSOT als Draft-Eintrag.
//
// Wird nach erfolgreichem version.php-Parse in clonePluginFromGithub() aufgerufen
// (fire-and-forget). Ein Fehler darf den Plugin-Wizard-Flow nie unterbrechen.
//
// Auth:   DIRECTUS_IMPORT_TOKEN env var (Directus Service-Token, catalog_editor Rolle)
// URL:    DIRECTUS_URL env var oder https://directus.eledia.ai
// Coll.:  plugin_component
// Dupe:   GET ?filter[component][_eq]=<frankenstyle>&limit=1 — wenn vorhanden, nur ID zurück
// Error:  Alle Fehler werden als WARN geloggt, niemals weitergeworfen.
const DIRECTUS_URL = process.env.DIRECTUS_URL ?? "https://directus.eledia.ai";
const DIRECTUS_TOKEN = process.env.DIRECTUS_IMPORT_TOKEN ?? "";
/**
 * Importiert ein erkanntes Plugin als Draft-Eintrag in den Directus SSOT.
 *
 * - Wenn DIRECTUS_IMPORT_TOKEN nicht gesetzt ist, wird der Import lautlos übersprungen.
 * - Bei bestehendem Eintrag (component-Duplikat) wird die vorhandene ID zurückgegeben.
 * - Jede Exception wird abgefangen und geloggt; die Funktion wirft niemals.
 */
export async function importPluginToDirectus(detected) {
    if (!DIRECTUS_TOKEN) {
        console.error("[directus-import] DIRECTUS_IMPORT_TOKEN nicht gesetzt — Import übersprungen");
        return { id: "", created: false, skipped: true };
    }
    const headers = {
        Authorization: `Bearer ${DIRECTUS_TOKEN}`,
        "Content-Type": "application/json",
    };
    // Slug: shortname lowercased, Unterstriche → Bindestriche (URL-friendly)
    const slug = detected.shortname.toLowerCase().replace(/_/g, "-");
    try {
        // ── 1. Duplikat-Check ────────────────────────────────────────────────
        const checkUrl = `${DIRECTUS_URL}/items/plugin_component` +
            `?filter[component][_eq]=${encodeURIComponent(detected.component)}` +
            `&limit=1&fields=id`;
        const checkRes = await fetch(checkUrl, { headers });
        if (checkRes.ok) {
            const checkData = (await checkRes.json());
            if (checkData.data && checkData.data.length > 0) {
                const existingId = checkData.data[0].id;
                console.error(`[directus-import] '${detected.component}' existiert bereits (id=${existingId}) — übersprungen`);
                return { id: existingId, created: false };
            }
        }
        else {
            // Nicht-kritisch: Duplikat-Check schlug fehl — wir versuchen trotzdem den POST
            console.error(`[directus-import] WARN: Duplikat-Check HTTP ${checkRes.status} für '${detected.component}' — versuche trotzdem POST`);
        }
        // ── 2. Draft-Eintrag anlegen ─────────────────────────────────────────
        const body = {
            component: detected.component,
            display_name: detected.component, // Admin befüllt später
            slug,
            status: "draft",
        };
        const createRes = await fetch(`${DIRECTUS_URL}/items/plugin_component`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        });
        if (!createRes.ok) {
            const errText = await createRes.text().catch(() => "");
            throw new Error(`HTTP ${createRes.status}: ${errText.slice(0, 300)}`);
        }
        const created = (await createRes.json());
        const newId = created.data?.id ?? "";
        console.error(`[directus-import] Draft-Eintrag für '${detected.component}' angelegt (id=${newId})`);
        return { id: newId, created: true };
    }
    catch (e) {
        // Niemals weiterwerfen — Wizard-Flow darf nicht scheitern
        console.error(`[directus-import] WARN: Import von '${detected.component}' fehlgeschlagen:`, e);
        return { id: "", created: false };
    }
}
//# sourceMappingURL=directus-import.js.map