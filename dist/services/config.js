// src/services/config.ts
// Lädt und verwaltet die Demo-Konfigurationen für Portal + Provisioning.
//
// Historisch war `configs.json` die einzige SSOT. Seit task52 kann der
// Runbot optional Konfigurationen aus Directus laden und bei Fehlern oder
// unvollständiger Konfiguration robust auf die lokale Datei zurückfallen.
//
// Zielbild:
// - Directus = redaktionäre / zentrale Quelle
// - configs.json = Fallback + lokaler Cache/Bootstrap + Schreibziel des Wizards
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
const CONFIG_FILE = process.env.CONFIGS_FILE
    ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "../../configs.json");
const CONFIGS_SOURCE = (process.env.CONFIGS_SOURCE ?? "file").toLowerCase();
const DIRECTUS_URL = process.env.DIRECTUS_URL ?? "https://directus.eledia.ai";
const DIRECTUS_CONFIG_COLLECTION = process.env.DIRECTUS_CONFIG_COLLECTION ?? "runbot_demo_config";
const DIRECTUS_CONFIG_TOKEN = process.env.DIRECTUS_CONFIG_TOKEN
    ?? process.env.DIRECTUS_IMPORT_TOKEN
    ?? "";
const PLUGINS_DIR = process.env.PLUGINS_DIR ?? "/opt/plugins";
// ── Helfer ─────────────────────────────────────────────────────────────────────
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function asString(value) {
    if (typeof value !== "string")
        return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}
function asBool(value) {
    if (typeof value === "boolean")
        return value;
    if (typeof value === "number")
        return value !== 0;
    if (typeof value !== "string")
        return undefined;
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "ja", "on", "published", "active", "visible"].includes(normalized))
        return true;
    if (["false", "0", "no", "nein", "off", "draft", "archived", "hidden"].includes(normalized))
        return false;
    return undefined;
}
function asStringArray(value) {
    if (Array.isArray(value)) {
        return value
            .map((entry) => {
            if (typeof entry === "string")
                return entry.trim();
            if (isRecord(entry)) {
                return asString(entry.label)
                    ?? asString(entry.title)
                    ?? asString(entry.name)
                    ?? asString(entry.value)
                    ?? "";
            }
            return "";
        })
            .filter(Boolean);
    }
    if (typeof value === "string") {
        return value
            .split(/\r?\n|[,;]+/)
            .map((entry) => entry.trim())
            .filter(Boolean);
    }
    return [];
}
function pluginRefFromComponent(component, explicitType, explicitName) {
    const parts = component.split("_");
    if (parts.length < 2)
        return null;
    const type = explicitType ?? parts[0];
    const name = explicitName ?? parts.slice(1).join("_");
    return {
        srcPath: path.join(PLUGINS_DIR, component),
        type,
        name,
    };
}
function normalizeFileConfig(config) {
    return {
        ...config,
        source: config.source ?? "file",
    };
}
async function loadFileConfigsRaw() {
    try {
        const raw = await fs.readFile(CONFIG_FILE, "utf-8");
        const all = JSON.parse(raw);
        return all.map(normalizeFileConfig);
    }
    catch (e) {
        throw new Error(`Konnte configs.json nicht laden (${CONFIG_FILE}): ${String(e)}`);
    }
}
function mapDirectusItemToConfig(item) {
    const relation = isRecord(item.plugin_component) ? item.plugin_component : undefined;
    const relationGithubRepo = asString(relation?.github_repo)
        ?? asString(relation?.repository)
        ?? asString(relation?.repository_url);
    const relationComponent = asString(relation?.component)
        ?? asString(item.component);
    const id = asString(item.slug)
        ?? asString(item.demo_id)
        ?? asString(item.code)
        ?? relationComponent?.replace(/_/g, "-");
    const name = asString(item.name)
        ?? asString(item.title)
        ?? asString(item.display_name)
        ?? asString(relation?.display_name)
        ?? relationComponent;
    if (!id || !name)
        return null;
    const type = asString(item.type)
        ?? (relationComponent ? "plugin" : "vanilla");
    const githubRepo = asString(item.github_repo)
        ?? relationGithubRepo;
    const pluginSrcPath = asString(item.plugin_src_path)
        ?? (githubRepo ? path.join(PLUGINS_DIR, githubRepo.split("/").pop()) : undefined)
        ?? (relationComponent ? path.join(PLUGINS_DIR, relationComponent) : undefined);
    const pluginType = asString(item.plugin_type)
        ?? (relationComponent ? relationComponent.split("_")[0] : undefined);
    const pluginName = asString(item.plugin_name)
        ?? (relationComponent ? relationComponent.split("_").slice(1).join("_") : undefined);
    const plugin = pluginSrcPath && pluginType && pluginName
        ? { srcPath: pluginSrcPath, type: pluginType, name: pluginName }
        : (relationComponent ? pluginRefFromComponent(relationComponent, pluginType, pluginName) : null);
    const visible = asBool(item.visible)
        ?? asBool(item.is_visible)
        ?? asBool(item.enabled)
        ?? (asString(item.status)?.toLowerCase() !== "archived");
    return {
        id,
        name,
        category: asString(item.category) ?? "referenz",
        categoryLabel: asString(item.category_label) ?? asString(item.categoryLabel) ?? "Referenz",
        icon: asString(item.icon) ?? "🧩",
        iconBg: asString(item.icon_bg) ?? asString(item.iconBg) ?? "#f3f5f8",
        description: asString(item.description)
            ?? asString(item.summary)
            ?? asString(item.teaser)
            ?? "",
        features: asStringArray(item.features).length > 0
            ? asStringArray(item.features)
            : asStringArray(item.feature_list),
        plugin: type === "vanilla" ? null : plugin,
        snapshotId: asString(item.snapshot_id) ?? asString(item.snapshotId) ?? null,
        moodleVersion: asString(item.moodle_version) ?? asString(item.moodleVersion) ?? "5.1",
        phpVersion: asString(item.php_version) ?? asString(item.phpVersion) ?? "8.3",
        db: asString(item.db) ?? asString(item.db_type) ?? "pgsql",
        visible,
        type,
        githubRepo,
        licenseUrl: asString(item.license_url) ?? asString(item.licenseUrl),
        userLimit: asString(item.user_limit) ?? asString(item.userLimit),
        source: "directus",
        directusId: asString(item.id),
    };
}
async function fetchDirectusConfigs() {
    const headers = {};
    if (DIRECTUS_CONFIG_TOKEN) {
        headers.Authorization = `Bearer ${DIRECTUS_CONFIG_TOKEN}`;
    }
    const url = `${DIRECTUS_URL}/items/${DIRECTUS_CONFIG_COLLECTION}` +
        `?limit=-1&fields=*.*.*`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Directus-Config-Load fehlgeschlagen (${res.status} ${res.statusText}): ${text.slice(0, 300)}`);
    }
    const payload = await res.json();
    const rows = Array.isArray(payload.data) ? payload.data : [];
    return rows
        .map((row) => isRecord(row) ? mapDirectusItemToConfig(row) : null)
        .filter((row) => Boolean(row));
}
// ── Lesen ─────────────────────────────────────────────────────────────────────
export async function loadConfigs() {
    const useFile = CONFIGS_SOURCE === "file";
    const useDirectus = CONFIGS_SOURCE === "directus";
    const useHybrid = CONFIGS_SOURCE === "hybrid";
    if (useFile) {
        const all = await loadFileConfigsRaw();
        return all.filter(c => c.visible !== false);
    }
    if (useDirectus || useHybrid) {
        try {
            const directus = await fetchDirectusConfigs();
            if (directus.length > 0) {
                return directus.filter(c => c.visible !== false);
            }
            if (useDirectus) {
                throw new Error(`Directus lieferte 0 Einträge aus Collection '${DIRECTUS_CONFIG_COLLECTION}'`);
            }
            console.error(`[config] Directus lieferte keine Configs — Fallback auf ${CONFIG_FILE}`);
        }
        catch (e) {
            if (useDirectus)
                throw e;
            console.error(`[config] WARN: Directus-Load fehlgeschlagen, nutze Datei-Fallback:`, e);
        }
    }
    const all = await loadFileConfigsRaw();
    return all.filter(c => c.visible !== false);
}
export async function getConfig(id) {
    const configs = await loadConfigs();
    return configs.find(c => c.id === id);
}
// ── Schreiben (task37b) ───────────────────────────────────────────────────────
//
// Atomares Read-Modify-Write auf configs.json. Wird vom internal API-
// Router verwendet, damit das in-Moodle-Plugin "Snapshot als Default
// setzen" kann. Wir laden die rohen Configs (incl. visible:false
// Einträge, die `loadConfigs` ausblendet), mutieren per Callback und
// schreiben atomar zurück (tmp-file + rename).
//
// Kein Cross-Prozess-Lock — die Runbot-Instanz läuft als einzelner
// systemd-Service, und alle Schreibzugriffe laufen aktuell sequentiell
// durch Express. Falls das mal parallel werden soll, müsste ein
// Promise-basierter Mutex wie in tokens.ts hinzu.
export async function updateConfig(id, mutator) {
    const all = await loadFileConfigsRaw();
    const idx = all.findIndex(c => c.id === id);
    if (idx < 0) {
        throw new Error(`Config '${id}' nicht in configs.json gefunden`);
    }
    const cfg = all[idx];
    mutator(cfg);
    const tmp = `${CONFIG_FILE}.tmp.${process.pid}`;
    await fs.writeFile(tmp, JSON.stringify(all, null, 2), "utf-8");
    await fs.rename(tmp, CONFIG_FILE);
    return cfg;
}
//# sourceMappingURL=config.js.map