// src/services/tokens.ts
// Verwaltet Demo-Anfrage-Tokens.
// Token = zufällige 32-Zeichen-Zeichenkette die per E-Mail verschickt wird.
// Gespeichert in /opt/runbot/tokens.json (gleiche Registry wie Instanzen).
import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
const TOKENS_FILE = process.env.TOKENS_FILE
    ?? path.join(process.env.RUNBOT_WORK_DIR ?? "/opt/runbot", "tokens.json");
const TOKEN_TTL_HOURS = parseInt(process.env.TOKEN_TTL_HOURS ?? "24");
// ── Storage ───────────────────────────────────────────────────────────────────
async function load() {
    try {
        const raw = await fs.readFile(TOKENS_FILE, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
async function save(tokens) {
    await fs.mkdir(path.dirname(TOKENS_FILE), { recursive: true });
    await fs.writeFile(TOKENS_FILE, JSON.stringify(tokens, null, 2), "utf-8");
}
// ── Public API ────────────────────────────────────────────────────────────────
export function generateToken() {
    return randomBytes(24).toString("base64url"); // URL-sicher, 32 Zeichen
}
export async function createRequest(email, name, configId) {
    const tokens = await load();
    // Prüfen ob E-Mail + Config bereits eine pending/confirmed Anfrage hat
    const existing = Object.values(tokens).find(t => t.email.toLowerCase() === email.toLowerCase()
        && t.configId === configId
        && (t.status === "pending" || t.status === "confirmed")
        && new Date(t.expiresAt) > new Date());
    if (existing)
        return existing; // Gleiche E-Mail nicht zweimal schicken
    const token = generateToken();
    const now = new Date();
    const expires = new Date(now.getTime() + TOKEN_TTL_HOURS * 60 * 60 * 1000);
    const request = {
        token,
        email: email.toLowerCase().trim(),
        name: name.trim() || "Demo-Nutzer",
        configId,
        requestedAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        status: "pending",
    };
    tokens[token] = request;
    await save(tokens);
    return request;
}
export async function getRequest(token) {
    const tokens = await load();
    return tokens[token];
}
export async function confirmRequest(token) {
    const tokens = await load();
    const req = tokens[token];
    if (!req)
        return null;
    if (req.status !== "pending")
        return req; // schon bestätigt
    if (new Date(req.expiresAt) < new Date()) {
        req.status = "expired";
        await save(tokens);
        return null;
    }
    req.status = "confirmed";
    req.confirmedAt = new Date().toISOString();
    tokens[token] = req;
    await save(tokens);
    return req;
}
export async function markStarted(token, instanceId) {
    const tokens = await load();
    if (!tokens[token])
        return;
    tokens[token].status = "started";
    tokens[token].instanceId = instanceId;
    await save(tokens);
}
export async function listRequests() {
    const tokens = await load();
    return Object.values(tokens)
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}
// Expired tokens aufräumen (älter als 7 Tage)
export async function cleanupExpired() {
    const tokens = await load();
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let removed = 0;
    for (const [key, req] of Object.entries(tokens)) {
        if (new Date(req.requestedAt) < cutoff) {
            delete tokens[key];
            removed++;
        }
    }
    if (removed > 0)
        await save(tokens);
    return removed;
}
//# sourceMappingURL=tokens.js.map