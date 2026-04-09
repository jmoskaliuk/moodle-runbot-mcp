export interface GithubRepo {
    full_name: string;
    description: string | null;
    html_url: string;
    stargazers_count: number;
    forks_count: number;
    open_issues_count: number;
    license: {
        spdx_id: string;
        name: string;
    } | null;
    default_branch: string;
    topics: string[];
    pushed_at: string;
}
export interface GithubRelease {
    tag_name: string;
    name: string;
    body: string;
    published_at: string;
    html_url: string;
    prerelease: boolean;
    draft: boolean;
}
export interface GithubPluginData {
    repo: GithubRepo;
    readme: string;
    releases: GithubRelease[];
}
/**
 * Fetch repo info, README (decoded) and up to 5 releases for a given
 * "owner/repo" string (e.g. "jmoskaliuk/moodle-runbot-mcp").
 * Results are cached for 1 hour.
 */
export declare function fetchPluginData(ownerRepo: string): Promise<GithubPluginData>;
/**
 * Invalidate the cache for a specific repo (e.g. after a release).
 */
export declare function invalidateCache(ownerRepo: string): void;
/**
 * Versucht, eine Icon-URL für ein Moodle-Plugin auf GitHub zu finden.
 * Gibt die raw.githubusercontent.com-URL zurück (CDN-gecached, CORS-fähig)
 * oder `null` wenn keine der üblichen Dateien existiert.
 *
 * Achtung: Die Funktion führt 1–4 HEAD-Requests gegen raw.githubusercontent.com
 * aus; Fehler werden als "nicht vorhanden" interpretiert. Resultat wird 24h
 * gecacht, Misserfolge ebenfalls (damit wir nicht bei jedem Request neu suchen).
 *
 * @param ownerRepo  "owner/repo" String
 * @param branch     Branch-Name (default: "main"). Für Plugins mit master-Default
 *                   wird bei 404 automatisch "master" nachgezogen.
 */
export declare function resolvePluginIconUrl(ownerRepo: string, branch?: string): Promise<string | null>;
//# sourceMappingURL=github.d.ts.map