// src/services/github.ts
// Fetches plugin metadata from the GitHub API: repo info, README, releases.
// Results are cached in-memory with a 1-hour TTL to avoid rate limits.

const GITHUB_API = "https://api.github.com";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── Types ────────────────────────────────────────────────────────────────────

export interface GithubRepo {
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  license: { spdx_id: string; name: string } | null;
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
  readme: string;       // decoded Markdown
  releases: GithubRelease[];
}

interface CacheEntry {
  data: GithubPluginData;
  fetchedAt: number;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const cache = new Map<string, CacheEntry>();

// ── Internal fetch helper ────────────────────────────────────────────────────

async function githubGet<T>(path: string): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "moodle-runbot-mcp/1.0",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${GITHUB_API}${path}`, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API ${path}: HTTP ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch repo info, README (decoded) and up to 5 releases for a given
 * "owner/repo" string (e.g. "jmoskaliuk/moodle-runbot-mcp").
 * Results are cached for 1 hour.
 */
export async function fetchPluginData(ownerRepo: string): Promise<GithubPluginData> {
  const cached = cache.get(ownerRepo);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const [repo, readmeRaw, releases] = await Promise.all([
    githubGet<GithubRepo>(`/repos/${ownerRepo}`),
    githubGet<{ content: string; encoding: string }>(`/repos/${ownerRepo}/readme`)
      .catch(() => ({ content: "", encoding: "base64" })),
    githubGet<GithubRelease[]>(`/repos/${ownerRepo}/releases?per_page=5`)
      .catch(() => [] as GithubRelease[]),
  ]);

  // README content is base64-encoded with line breaks — strip them before decoding
  const readme = readmeRaw.content
    ? Buffer.from(readmeRaw.content.replace(/\n/g, ""), "base64").toString("utf-8")
    : "";

  const data: GithubPluginData = {
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
export function invalidateCache(ownerRepo: string): void {
  cache.delete(ownerRepo);
}
