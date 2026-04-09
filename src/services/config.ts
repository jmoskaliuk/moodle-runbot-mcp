// src/services/config.ts
// Lädt und verwaltet die Demo-Konfigurationen aus configs.json.
// configs.json ist die einzige Quelle für alle Plugin-Karten im Portal.

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const CONFIG_FILE = process.env.CONFIGS_FILE
  ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "../../configs.json");

// ── Typen ─────────────────────────────────────────────────────────────────────

export interface PluginRef {
  srcPath: string;
  type:    string;   // "mod", "local", "block", "report", "enrol", ...
  name:    string;   // "eledialeitnerflow"
}

export interface DemoConfig {
  id:            string;
  name:          string;
  category:      string;
  categoryLabel: string;
  icon:          string;
  iconBg:        string;
  description:   string;
  features:      string[];
  plugin:        PluginRef | null;  // null = kein extra Plugin (vanilla)
  snapshotId:    string | null;     // null = leere Installation
  moodleVersion: string;
  phpVersion:    string;
  db:            string;
  visible:       boolean;
}

// ── Lesen ─────────────────────────────────────────────────────────────────────

export async function loadConfigs(): Promise<DemoConfig[]> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf-8");
    const all = JSON.parse(raw) as DemoConfig[];
    return all.filter(c => c.visible !== false);
  } catch (e) {
    throw new Error(`Konnte configs.json nicht laden (${CONFIG_FILE}): ${String(e)}`);
  }
}

export async function getConfig(id: string): Promise<DemoConfig | undefined> {
  const configs = await loadConfigs();
  return configs.find(c => c.id === id);
}
