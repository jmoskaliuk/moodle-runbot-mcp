// src/services/github.ts
// Fetches plugin metadata from the GitHub API: repo info, README, releases.
// Results are cached in-memory with a 1-hour TTL to avoid rate limits.
const GITHUB_API = "https://api.github.com";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
// ── Cache ─────────────────────────────────────────────────────────────────────
const cache = new Map();
// ── Internal fetch helper ────────────────────────────────────────────────────
async function githubGet(path) {
    const token = process.env.GITHUB_TOKEN;
    const headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "moodle-runbot-mcp/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token)
        headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${GITHUB_API}${path}`, { headers });
    if (!res.ok) {
        throw new Error(`GitHub API ${path}: HTTP ${res.status} ${res.statusText}`);
    }
    return res.json();
}
// ── Public API ───────────────────────────────────────────────────────────────
/**
 * Fetch repo info, README (decoded) and up to 5 releases for a given
 * "owner/repo" string (e.g. "jmoskaliuk/moodle-runbot-mcp").
 * Results are cached for 1 hour.
 */
export async function fetchPluginData(ownerRepo) {
    const cached = cache.get(ownerRepo);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.data;
    }
    const [repo, readmeRaw, releases] = await Promise.all([
        githubGet(`/repos/${ownerRepo}`),
        githubGet(`/repos/${ownerRepo}/readme`)
            .catch(() => ({ content: "", encoding: "base64" })),
        githubGet(`/repos/${ownerRepo}/releases?per_page=5`)
            .catch(() => []),
    ]);
    // README content is base64-encoded with line breaks — strip them before decoding
    const readme = readmeRaw.content
        ? Buffer.from(readmeRaw.content.replace(/\n/g, ""), "base64").toString("utf-8")
        : "";
    const data = {
        repo,
        readme,
        releases: releases.filter(r => !r.draft).slice(0, 5),
    };
    cache.set(ownerRepo, { data, fetchedAt: Date.now() });
    console.error(`[github] Fetched and cached data for ${ownerRepo}`);
    return data;
}
/**
 * Invalidate the cache for a specific repo (e.g. after a release).
 */
export function invalidateCache(ownerRepo) {
    cache.delete(ownerRepo);
}
// ── Icon resolution (feat11/task23) ──────────────────────────────────────────
//
// Moodle-Plugins folgen der Konvention, ihr Icon unter pix/monologo.svg
// (Moodle 4+) oder pix/icon.svg|png abzulegen. Wir probieren die Varianten
// in einer sinnvollen Reihenfolge und cachen das Ergebnis, damit wir den
// GitHub-CDN nicht bei jedem Aufruf polleren.
const ICON_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const iconCache = new Map();
const ICON_CANDIDATES = [
    "pix/monologo.svg",
    "pix/monologo.png",
    "pix/icon.svg",
    "pix/icon.png",
];
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
export async function resolvePluginIconUrl(ownerRepo, branch = "main") {
    const cacheKey = `${ownerRepo}@${branch}`;
    const cached = iconCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < ICON_CACHE_TTL_MS) {
        return cached.url;
    }
    const branches = [branch];
    if (branch === "main")
        branches.push("master");
    for (const br of branches) {
        for (const candidate of ICON_CANDIDATES) {
            const url = `https://raw.githubusercontent.com/${ownerRepo}/${br}/${candidate}`;
            try {
                const res = await fetch(url, { method: "HEAD" });
                if (res.ok) {
                    iconCache.set(cacheKey, { url, fetchedAt: Date.now() });
                    return url;
                }
            }
            catch {
                // Netzwerkfehler → nächste Variante
            }
        }
    }
    iconCache.set(cacheKey, { url: null, fetchedAt: Date.now() });
    return null;
}
//# sourceMappingURL=github.js.map