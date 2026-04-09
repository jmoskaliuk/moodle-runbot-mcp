import type { DemoRequest, DemoPhase } from "../types.js";
export declare function generateToken(): string;
export declare function createRequest(email: string, name: string, configId: string): Promise<DemoRequest>;
export declare function getRequest(token: string): Promise<DemoRequest | undefined>;
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
export declare function confirmRequest(token: string): Promise<{
    request: DemoRequest;
    alreadyStarted: boolean;
} | null>;
export declare function markStarted(token: string, instanceId: string): Promise<void>;
/**
 * Setzt die aktuelle Provisioning-Phase eines Demo-Requests.
 * Wird vom Hintergrund-Handler in /confirm/:token aufgerufen, damit die
 * Warteseite den echten Status pollen kann (feat09).
 */
export declare function setPhase(token: string, phase: DemoPhase, errorMessage?: string): Promise<void>;
export declare function listRequests(): Promise<DemoRequest[]>;
export declare function cleanupExpired(): Promise<number>;
//# sourceMappingURL=tokens.d.ts.map