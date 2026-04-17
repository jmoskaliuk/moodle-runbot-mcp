import type { DemoConfig } from "./config.js";
export interface DetectedPlugin {
    component: string;
    type: string;
    shortname: string;
    version: number;
    release: string;
    maturity?: string;
    requires?: number;
    srcPath: string;
    detectedAt: string;
    gitUrl: string;
    githubRepo: string;
}
/**
 * Klont das Plugin nach PLUGINS_DIR/<repo> und liest version.php. Wenn das
 * Ziel schon existiert, wird die Clone-Operation übersprungen (wir lesen die
 * existing version.php) — Admin muss manuell mit `git pull` refreshen, um
 * keine laufenden Demos ungewollt zu brechen.
 *
 * Wirft bei:
 * - Ungültiger URL
 * - git clone schlägt fehl (private Repo, Netzwerk, ungültiger Branch)
 * - version.php fehlt oder enthält kein $plugin->component
 */
export declare function clonePluginFromGithub(gitUrl: string): Promise<DetectedPlugin>;
/**
 * Liefert ALLE configs.json-Einträge, inklusive `visible: false`. Die
 * öffentliche loadConfigs() filtert invisible Einträge raus — für das
 * Admin-UI wollen wir aber alle sehen.
 */
export declare function listAllConfigsRaw(): Promise<DemoConfig[]>;
/**
 * Append-only Config-Create. Wirft bei Duplicate-ID. Atomar via tmp+rename,
 * damit kein halb-geschriebener configs.json entsteht, falls der Server
 * mitten im Write crashed.
 */
export declare function createConfig(config: DemoConfig): Promise<DemoConfig>;
export declare function deleteConfigById(id: string): Promise<void>;
//# sourceMappingURL=plugin-install.d.ts.map