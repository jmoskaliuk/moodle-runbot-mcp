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
//# sourceMappingURL=config.js.map