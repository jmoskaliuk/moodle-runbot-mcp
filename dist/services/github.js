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
//# sourceMappingURL=github.js.map