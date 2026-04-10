// src/services/config.ts
// Lädt und verwaltet die Demo-Konfigurationen aus configs.json.
// configs.json ist die einzige Quelle für alle Plugin-Karten im Portal.
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
const CONFIG_FILE = process.env.CONFIGS_FILE
    ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "../../configs.json");
// ── Lesen ─────────────────────────────────────────────────────────────────────
export async function loadConfigs() {
    try {
        const raw = await fs.readFile(CONFIG_FILE, "utf-8");
        const all = JSON.parse(raw);
        return all.filter(c => c.visible !== false);
    }
    catch (e) {
        throw new Error(`Konnte configs.json nicht laden (${CONFIG_FILE}): ${String(e)}`);
    }
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
    const raw = await fs.readFile(CONFIG_FILE, "utf-8");
    const all = JSON.parse(raw);
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