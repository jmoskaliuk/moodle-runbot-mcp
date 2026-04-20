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
// Dupe:   GET ?filter[component][_eq]=<frankenstyle>&limit=1 — wenn vorhanden, additive PATCH-Aktualisierung
// Error:  Alle Fehler werden als WARN geloggt, niemals weitergeworfen.

import type { DetectedPlugin } from "./plugin-install.js";

const DIRECTUS_URL = process.env.DIRECTUS_URL ?? "https://directus.eledia.ai";
const DIRECTUS_TOKEN = process.env.DIRECTUS_IMPORT_TOKEN ?? "";

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

interface DirectusRecord {
  id: string;
  display_name?: string | null;
}

function buildSlug(component: string): string {
  return component.trim().toLowerCase().replace(/_/g, "-");
}

function inferDisplayName(shortname: string): string {
  return shortname
    .trim()
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeMaturity(maturity?: string): string | undefined {
  if (!maturity) return undefined;

  const normalized = maturity
    .trim()
    .replace(/^MATURITY_/i, "")
    .toLowerCase();

  switch (normalized) {
    case "stable":
    case "beta":
    case "alpha":
      return normalized;
    case "rc":
    case "releasecandidate":
    case "release_candidate":
      return "rc";
    default:
      return "unknown";
  }
}

function buildTechnicalPayload(detected: DetectedPlugin) {
  return {
    component: detected.component,
    plugin_type: detected.type,
    plugin_shortname: detected.shortname,
    github_repo: detected.githubRepo,
    git_url: detected.gitUrl,
    release: detected.release || undefined,
    version_build: detected.version || undefined,
    requires_build: detected.requires,
    maturity: normalizeMaturity(detected.maturity),
    source_path_hint: ".",
    import_last_run_at: new Date().toISOString(),
  };
}

async function parseDirectusError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  return text.slice(0, 300);
}

async function findExistingRecord(
  component: string,
  headers: Record<string, string>,
): Promise<DirectusRecord | null> {
  const checkUrl =
    `${DIRECTUS_URL}/items/plugin_component` +
    `?filter[component][_eq]=${encodeURIComponent(component)}` +
    `&limit=1&fields=id,display_name`;

  const checkRes = await fetch(checkUrl, { headers });
  if (!checkRes.ok) {
    console.error(
      `[directus-import] WARN: Duplikat-Check HTTP ${checkRes.status} für '${component}' — versuche trotzdem POST`,
    );
    return null;
  }

  const checkData = (await checkRes.json()) as { data?: DirectusRecord[] };
  return checkData.data?.[0] ?? null;
}

/**
 * Importiert ein erkanntes Plugin als Draft-Eintrag in den Directus SSOT.
 *
 * - Wenn DIRECTUS_IMPORT_TOKEN nicht gesetzt ist, wird der Import lautlos übersprungen.
 * - Bei bestehendem Eintrag (component-Duplikat) werden technische Importfelder additiv aktualisiert.
 * - Jede Exception wird abgefangen und geloggt; die Funktion wirft niemals.
 */
export async function importPluginToDirectus(
  detected: DetectedPlugin,
): Promise<DirectusImportResult> {
  if (!DIRECTUS_TOKEN) {
    console.error(
      "[directus-import] DIRECTUS_IMPORT_TOKEN nicht gesetzt — Import übersprungen",
    );
    return { id: "", created: false, skipped: true };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${DIRECTUS_TOKEN}`,
    "Content-Type": "application/json",
  };

  const slug = buildSlug(detected.component);
  const displayName = inferDisplayName(detected.shortname);
  const technicalPayload = buildTechnicalPayload(detected);

  try {
    // ── 1. Duplikat-Check ────────────────────────────────────────────────
    const existing = await findExistingRecord(detected.component, headers);
    if (existing) {
        const patchBody: Record<string, unknown> = {
          ...technicalPayload,
          import_last_status: "updated",
        };

        if (!existing.display_name?.trim()) {
          patchBody.display_name = displayName;
        }

        const updateRes = await fetch(
          `${DIRECTUS_URL}/items/plugin_component/${encodeURIComponent(existing.id)}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify(patchBody),
          },
        );

        if (!updateRes.ok) {
          const errText = await parseDirectusError(updateRes);
          throw new Error(`PATCH HTTP ${updateRes.status}: ${errText}`);
        }

        console.error(
          `[directus-import] '${detected.component}' existiert bereits (id=${existing.id}) — technische Felder aktualisiert`,
        );
        return { id: existing.id, created: false, updated: true };
    }

    // ── 2. Draft-Eintrag anlegen ─────────────────────────────────────────
    const body = {
      ...technicalPayload,
      display_name: displayName,
      slug,
      status: "draft",
      visible: true,
      import_last_status: "imported",
    };

    const createRes = await fetch(`${DIRECTUS_URL}/items/plugin_component`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!createRes.ok) {
      if (createRes.status === 409) {
        const afterConflict = await findExistingRecord(detected.component, headers);
        console.error(
          `[directus-import] WARN: POST lieferte 409 für '${detected.component}' — Eintrag wurde vermutlich parallel angelegt`,
        );
        return {
          id: afterConflict?.id ?? "",
          created: false,
          updated: Boolean(afterConflict),
        };
      }
      const errText = await parseDirectusError(createRes);
      throw new Error(`HTTP ${createRes.status}: ${errText}`);
    }

    const created = (await createRes.json()) as { data?: { id: string } };
    const newId = created.data?.id ?? "";
    console.error(
      `[directus-import] Draft-Eintrag für '${detected.component}' angelegt (id=${newId})`,
    );
    return { id: newId, created: true };
  } catch (e) {
    // Niemals weiterwerfen — Wizard-Flow darf nicht scheitern
    console.error(
      `[directus-import] WARN: Import von '${detected.component}' fehlgeschlagen:`,
      e,
    );
    return { id: "", created: false };
  }
}
