// src/services/tokens.ts
// Verwaltet Demo-Anfrage-Tokens.
// Token = zufällige 32-Zeichen-Zeichenkette die per E-Mail verschickt wird.
// Gespeichert in /opt/runbot/tokens.json (gleiche Registry wie Instanzen).

import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import type { DemoRequest, DemoPhase } from "../types.js";

const TOKENS_FILE = process.env.TOKENS_FILE
  ?? path.join(process.env.RUNBOT_WORK_DIR ?? "/opt/runbot", "tokens.json");

const TOKEN_TTL_HOURS = parseInt(process.env.TOKEN_TTL_HOURS ?? "24");

// ── Storage ───────────────────────────────────────────────────────────────────
//
// WICHTIG: Alle Zugriffe auf tokens.json MÜSSEN über `withLock()` serialisiert
// werden. Wir hatten einen Bug, bei dem concurrent load/save die Datei
// zerschossen haben — half-written JSON → Parse-Fehler in load() → alle
// Tokens wurden durch einen nachfolgenden save() mit `{}` ausgelöscht.
//
// Zusätzliche Absicherungen:
//   1. Atomarer Write (temp file + rename) — rename() ist POSIX-atomar
//   2. load() unterscheidet ENOENT (leere Datei, {}) vs. Parse-Fehler (throw)
//   3. Mutex per Promise-Chain — alle DB-Operationen warten aufeinander

let mutex: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = mutex.then(fn, fn); // catch + then — Fehler brechen die Kette nicht
  mutex = next.catch(() => {});    // Mutex darf nie rejecten, sonst blockiert alles
  return next;
}

async function loadRaw(): Promise<Record<string, DemoRequest>> {
  let raw: string;
  try {
    raw = await fs.readFile(TOKENS_FILE, "utf-8");
  } catch (e: unknown) {
    // Datei existiert nicht → leerer State ist OK
    if (e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw e;
  }
  // Leere Datei → leerer State (kein Parse)
  if (raw.trim().length === 0) return {};
  try {
    return JSON.parse(raw) as Record<string, DemoRequest>;
  } catch (parseErr) {
    // Parse-Fehler ist ein ERNSTES Problem: halb-geschriebene Datei.
    // NICHT silently {} zurückgeben — das würde beim nächsten save() alle
    // Tokens auslöschen. Stattdessen: loud throw, Caller muss entscheiden.
    console.error(
      `[tokens] FEHLER: ${TOKENS_FILE} ist korrupt — JSON.parse failed:`,
      parseErr
    );
    throw new Error(`tokens.json corrupt: ${String(parseErr)}`);
  }
}

async function saveRaw(tokens: Record<string, DemoRequest>): Promise<void> {
  await fs.mkdir(path.dirname(TOKENS_FILE), { recursive: true });
  // Atomares Write: erst in temp file schreiben, dann umbenennen.
  // rename() ist POSIX-atomar — Reader sehen entweder den alten oder den
  // neuen Inhalt, nie eine halb-geschriebene Datei.
  const tmp = `${TOKENS_FILE}.tmp.${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(tokens, null, 2), "utf-8");
  await fs.rename(tmp, TOKENS_FILE);
}

async function load(): Promise<Record<string, DemoRequest>> {
  return withLock(() => loadRaw());
}

async function save(tokens: Record<string, DemoRequest>): Promise<void> {
  return withLock(() => saveRaw(tokens));
}

/**
 * Read-modify-write in einem einzigen Lock-Abschnitt. Verhindert
 * Lost-Updates bei concurrent setPhase/markStarted/confirmRequest.
 */
async function update<T>(
  fn: (tokens: Record<string, DemoRequest>) => T | Promise<T>
): Promise<T> {
  return withLock(async () => {
    const tokens = await loadRaw();
    const result = await fn(tokens);
    await saveRaw(tokens);
    return result;
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateToken(): string {
  return randomBytes(24).toString("base64url"); // URL-sicher, 32 Zeichen
}

export async function createRequest(
  email: string,
  name: string,
  configId: string
): Promise<DemoRequest> {
  return update(tokens => {
    // Prüfen ob E-Mail + Config bereits eine pending/confirmed Anfrage hat
    const existing = Object.values(tokens).find(
      t => t.email.toLowerCase() === email.toLowerCase()
        && t.configId === configId
        && (t.status === "pending" || t.status === "confirmed")
        && new Date(t.expiresAt) > new Date()
    );
    if (existing) return existing; // Gleiche E-Mail nicht zweimal schicken

    const token = generateToken();
    const now = new Date();
    const expires = new Date(now.getTime() + TOKEN_TTL_HOURS * 60 * 60 * 1000);

    const request: DemoRequest = {
      token,
      email: email.toLowerCase().trim(),
      name: name.trim() || "Demo-Nutzer",
      configId,
      requestedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      status: "pending",
    };

    tokens[token] = request;
    return request;
  });
}

export async function getRequest(token: string): Promise<DemoRequest | undefined> {
  const tokens = await load();
  return tokens[token];
}

/**
 * Bestätigt einen Token und reserviert atomar den Slot für den
 * Hintergrund-Provisioning-Job.
 *
 * Rückgabe:
 *   - `null` → Token ungültig oder abgelaufen
 *   - `{ request, alreadyStarted: false }` → erster Confirm-Treffer,
 *     Caller MUSS den Hintergrund-Job starten
 *   - `{ request, alreadyStarted: true }` → Token wurde bereits confirmed
 *     (z.B. durch Link-Prefetch des E-Mail-Clients oder einen Reload),
 *     Caller darf den Loading-Page anzeigen, aber den Job NICHT nochmal
 *     starten — sonst laufen mehrere Provisionings parallel.
 *
 * Die Job-Reservierung erfolgt via `phase = "waiting"` innerhalb derselben
 * atomaren Transaktion wie der Status-Wechsel — so gibt es kein Fenster,
 * in dem zwei parallele Aufrufer beide "pending" sehen und beide den Job
 * starten.
 */
export async function confirmRequest(
  token: string
): Promise<{ request: DemoRequest; alreadyStarted: boolean } | null> {
  return update(tokens => {
    const req = tokens[token];

    if (!req) return null;
    if (new Date(req.expiresAt) < new Date()) {
      req.status = "expired";
      return null;
    }

    // Erst-Bestätigung: Status hochsetzen UND Job-Slot reservieren
    if (req.status === "pending") {
      req.status = "confirmed";
      req.confirmedAt = new Date().toISOString();
      req.phase = "waiting"; // Job-Slot gesperrt
      tokens[token] = req;
      return { request: req, alreadyStarted: false };
    }

    // Bereits bestätigt (Prefetch, Reload, zweiter Tab) — Loading Page
    // darf angezeigt werden, aber der Job darf nicht erneut starten.
    return { request: req, alreadyStarted: true };
  });
}

export async function markStarted(token: string, instanceId: string): Promise<void> {
  await update(tokens => {
    if (!tokens[token]) return;
    tokens[token].status = "started";
    tokens[token].instanceId = instanceId;
    tokens[token].phase = "running";
  });
}

/**
 * Setzt die aktuelle Provisioning-Phase eines Demo-Requests.
 * Wird vom Hintergrund-Handler in /confirm/:token aufgerufen, damit die
 * Warteseite den echten Status pollen kann (feat09).
 */
export async function setPhase(
  token: string,
  phase: DemoPhase,
  errorMessage?: string
): Promise<void> {
  await update(tokens => {
    if (!tokens[token]) {
      console.error(`[tokens] setPhase: Token ${token.slice(0, 6)}… nicht gefunden`);
      return;
    }
    tokens[token].phase = phase;
    if (errorMessage !== undefined) tokens[token].phaseError = errorMessage;
  });
}

export async function listRequests(): Promise<DemoRequest[]> {
  const tokens = await load();
  return Object.values(tokens)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

// Expired tokens aufräumen (älter als 7 Tage)
export async function cleanupExpired(): Promise<number> {
  return update(tokens => {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let removed = 0;
    for (const [key, req] of Object.entries(tokens)) {
      if (new Date(req.requestedAt) < cutoff) {
        delete tokens[key];
        removed++;
      }
    }
    return removed;
  });
}
