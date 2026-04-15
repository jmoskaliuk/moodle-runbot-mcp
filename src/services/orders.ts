// src/services/orders.ts
//
// Onlineshop-MVP Woche 1: Order-Service mit State-Machine + JSON-Persistence.
//
// Order-Lifecycle (siehe konzept-onlineshop.md Sektion 0.5):
//
//   DRAFT ── Formular-Submit ──► PENDING_VERIFICATION
//                                       │ (Verify-Mail verschickt)
//                                       │
//                                       │ Klick auf Verify-Link (7d gültig)
//                                       ↓
//                               ORDER_REVIEW
//                                       │ (Kunde sieht Review-Seite,
//                                       │  lädt AGB + AVV herunter)
//                                       │
//                                       │ Confirm-Click (PDFs gedownloadet)
//                                       ↓
//                               CONFIRMED
//                                       │ (Auto-Provisioning startet,
//                                       │  Odoo-Notify-Mail raus)
//                                       ↓
//                               PROVISIONING
//                                       │ (Docker läuft hoch, 3–5 min)
//                                       ↓
//                               LIVE   ◄──── (Welcome-Mail raus)
//                                │
//                                │ manueller Admin-Stop bei Kündigung
//                                ↓
//                           TERMINATED
//
// Fehlerzustände:
//   VERIFY_EXPIRED    — Verify-Mail 7d nicht geklickt
//   PROVISION_FAILED  — Docker-Start ging schief, Admin muss eingreifen
//   REJECTED          — Admin hat Bestellung manuell abgelehnt
//
// Persistenz: /opt/runbot/orders.json. Atomar via tmp+rename analog tokens.ts
// und config.ts. SQLite wäre overkill für MVP; solange wir < 1000 Bestellungen
// pro Tag haben, reicht ein JSON-File. Bei höherer Last auf PostgreSQL migrieren.
//
// Thread-Safety: Runbot läuft als Single-Process Express-Server, alle Writes
// laufen sequentiell durch Node's Event-Loop. Falls das mal parallel wird:
// Promise-basierter Mutex wie in tokens.ts hinzufügen.

import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

// ── Types ──────────────────────────────────────────────────────────────

export type OrderState =
  | "DRAFT"
  | "PENDING_VERIFICATION"
  | "ORDER_REVIEW"
  | "CONFIRMED"
  | "PROVISIONING"
  | "LIVE"
  | "TERMINATED"
  | "VERIFY_EXPIRED"
  | "PROVISION_FAILED"
  | "REJECTED";

export interface BillingAddress {
  firma:      string;
  strasse:    string;
  plz:        string;
  ort:        string;
  land:       string;          // ISO-Code, z.B. "DE"
  ustId?:     string;          // nur bei B2B-EU
}

export interface SignerInfo {
  name:       string;          // Vor- und Nachname
  funktion:   string;          // z.B. "Geschäftsführer", "IT-Leitung"
  email:      string;
}

export interface AgreementRecord {
  type:             "agb" | "avv";
  templateVersion:  string;    // z.B. "v1"
  downloadedAt?:    string;    // wenn PDF heruntergeladen wurde
  signedAt?:        string;    // wenn Confirm-Button gedrückt
  ipAddress?:       string;    // vom Signer-Request
  userAgent?:       string;
  pdfSha256?:       string;    // Hash des generierten PDFs
  pdfPath?:         string;    // absoluter Pfad (nur Intern)
}

export interface Order {
  id:              string;               // "ord-abc123def456"
  state:           OrderState;
  configId:        string;               // Paket aus configs.json
  createdAt:       string;               // ISO-Timestamp
  updatedAt:       string;

  // Kontakt + Rechnung
  contact: {
    email:  string;                      // Primary-Contact, bekommt Mails
    phone?: string;
  };
  billing:         BillingAddress;

  // Für AVV: Wer unterschreibt (Text-Form nach §126b BGB)
  signer:          SignerInfo;

  // Technik
  subdomainWish:   string;               // Kunden-Wunsch
  subdomainFinal?: string;               // tatsächlich vergebene (ggf. abweichend bei Kollision)

  // Verify-Mail-Token (Double-Opt-In)
  verifyToken:     string;               // 64 Hex-Zeichen
  verifyExpiresAt: string;               // +7 Tage
  verifiedAt?:     string;

  // Signing
  agreements:      AgreementRecord[];    // [AGB, AVV]

  // Provisioning
  instanceId?:     string;               // gesetzt bei PROVISIONING
  provisioningStartedAt?: string;
  provisioningFinishedAt?: string;
  provisioningError?: string;            // bei PROVISION_FAILED

  // Links zur Bestandsplattform (odoo) — MVP: nur Mail-Status
  odooNotifySentAt?: string;
  odooOrderId?:    string;               // manuell nachtragbar vom Admin

  // Kundendashboard-Magic-Link
  customerMagicToken?: string;           // separater Token, 30d gültig
  customerMagicExpiresAt?: string;

  // Freitext / Audit
  notes?:          string;
  history:         OrderTransition[];    // audit trail, append-only
}

export interface OrderTransition {
  at:      string;                       // ISO-Timestamp
  from:    OrderState | null;            // null bei erster Transition (Creation)
  to:      OrderState;
  by:      "system" | "admin" | "customer";
  reason?: string;                       // optional, z.B. "AGB+AVV confirmed"
}

// ── Persistence ───────────────────────────────────────────────────────

const ORDERS_FILE = process.env.ORDERS_FILE
  ?? path.join(process.env.RUNBOT_WORK_DIR ?? "/opt/runbot", "orders.json");

async function ensureFile(): Promise<void> {
  const dir = path.dirname(ORDERS_FILE);
  await fs.mkdir(dir, { recursive: true });
  const exists = await fs.access(ORDERS_FILE).then(() => true).catch(() => false);
  if (!exists) {
    await fs.writeFile(ORDERS_FILE, "[]", "utf-8");
  }
}

async function readAll(): Promise<Order[]> {
  await ensureFile();
  const raw = await fs.readFile(ORDERS_FILE, "utf-8");
  try {
    return JSON.parse(raw) as Order[];
  } catch (e) {
    console.error(`[orders] orders.json korrupt, starte mit leerem Array:`, e);
    return [];
  }
}

async function writeAll(orders: Order[]): Promise<void> {
  await ensureFile();
  const tmp = `${ORDERS_FILE}.tmp.${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(orders, null, 2), "utf-8");
  await fs.rename(tmp, ORDERS_FILE);
}

// ── State-Machine ────────────────────────────────────────────────────

/**
 * Erlaubte Übergänge. Werden bei transitionOrder() geprüft, damit State-
 * Machine sauber bleibt. Direkte Writes auf order.state sollten vermieden
 * werden.
 */
const ALLOWED_TRANSITIONS: Record<OrderState, OrderState[]> = {
  DRAFT:                ["PENDING_VERIFICATION"],
  PENDING_VERIFICATION: ["ORDER_REVIEW", "VERIFY_EXPIRED"],
  ORDER_REVIEW:         ["CONFIRMED", "VERIFY_EXPIRED"],
  CONFIRMED:            ["PROVISIONING", "REJECTED"],
  PROVISIONING:         ["LIVE", "PROVISION_FAILED"],
  LIVE:                 ["TERMINATED"],
  // Endzustände:
  TERMINATED:           [],
  VERIFY_EXPIRED:       [],
  PROVISION_FAILED:     ["PROVISIONING", "REJECTED"],   // Admin kann manuell retry
  REJECTED:             [],
};

function canTransition(from: OrderState, to: OrderState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Public API ──────────────────────────────────────────────────────

export interface CreateOrderInput {
  configId:       string;
  contactEmail:   string;
  contactPhone?:  string;
  billing:        BillingAddress;
  signer:         SignerInfo;
  subdomainWish:  string;
  notes?:         string;
}

function generateId(prefix: string, bytes = 6): string {
  return `${prefix}-${randomBytes(bytes).toString("hex")}`;
}

/**
 * Erstellt eine neue Order im State DRAFT, verschiebt sofort zu
 * PENDING_VERIFICATION und setzt den verifyToken. Die eigentliche
 * Verify-Mail wird vom Caller (index.ts /api/order-Handler) verschickt.
 */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const now = new Date();
  const verifyToken = randomBytes(32).toString("hex");
  const verifyExpires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7d

  const order: Order = {
    id: generateId("ord"),
    state: "DRAFT",
    configId: input.configId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    contact: {
      email: input.contactEmail.trim().toLowerCase(),
      phone: input.contactPhone?.trim() || undefined,
    },
    billing: input.billing,
    signer: input.signer,
    subdomainWish: input.subdomainWish.trim().toLowerCase(),
    verifyToken,
    verifyExpiresAt: verifyExpires.toISOString(),
    agreements: [],
    notes: input.notes?.trim() || undefined,
    history: [{
      at: now.toISOString(),
      from: null,
      to: "DRAFT",
      by: "system",
      reason: "Order created via /api/order",
    }],
  };

  // Direkt weiter zu PENDING_VERIFICATION — DRAFT ist nur ein kurzer
  // Zustand für spätere Erweiterbarkeit (z.B. Shopping-Cart).
  const transitioned = applyTransition(order, "PENDING_VERIFICATION", "system", "Verify-Mail ausgelöst");

  const all = await readAll();
  all.push(transitioned);
  await writeAll(all);

  console.error(`[orders] Created ${transitioned.id} for ${input.configId}, state=${transitioned.state}`);
  return transitioned;
}

export async function getOrder(id: string): Promise<Order | undefined> {
  const all = await readAll();
  return all.find(o => o.id === id);
}

export async function getOrderByVerifyToken(token: string): Promise<Order | undefined> {
  const all = await readAll();
  return all.find(o => o.verifyToken === token);
}

export async function listOrders(filter?: {
  state?: OrderState;
  configId?: string;
  since?: string;  // ISO-Timestamp, nur Orders danach
}): Promise<Order[]> {
  const all = await readAll();
  return all.filter(o => {
    if (filter?.state && o.state !== filter.state) return false;
    if (filter?.configId && o.configId !== filter.configId) return false;
    if (filter?.since && o.createdAt < filter.since) return false;
    return true;
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Zustandsübergang mit Validierung. Gibt die aktualisierte Order zurück.
 * Throws wenn Transition nicht erlaubt ist.
 */
function applyTransition(
  order: Order,
  to: OrderState,
  by: OrderTransition["by"],
  reason?: string
): Order {
  if (order.state === to) return order; // idempotent
  if (!canTransition(order.state, to)) {
    throw new Error(
      `Ungültiger Zustandsübergang: ${order.state} → ${to} ` +
      `(erlaubt: ${ALLOWED_TRANSITIONS[order.state]?.join(", ") || "(keine)"})`
    );
  }
  const now = new Date().toISOString();
  order.history.push({ at: now, from: order.state, to, by, reason });
  order.state = to;
  order.updatedAt = now;
  return order;
}

/**
 * Persistenz-Wrapper: transition + write-back.
 */
export async function transitionOrder(
  id: string,
  to: OrderState,
  by: OrderTransition["by"],
  reason?: string
): Promise<Order> {
  const all = await readAll();
  const idx = all.findIndex(o => o.id === id);
  if (idx < 0) throw new Error(`Order ${id} nicht gefunden`);
  const order = all[idx]!;
  applyTransition(order, to, by, reason);
  all[idx] = order;
  await writeAll(all);
  console.error(`[orders] ${id}: ${order.history[order.history.length - 2]?.from} → ${to} (${by})`);
  return order;
}

/**
 * Markiert einen Verify-Link als benutzt — transitioned PENDING_VERIFICATION
 * → ORDER_REVIEW, setzt verifiedAt.
 */
export async function verifyOrder(token: string, ipAddress?: string, userAgent?: string): Promise<Order> {
  const all = await readAll();
  const idx = all.findIndex(o => o.verifyToken === token);
  if (idx < 0) throw new Error(`Verify-Token ungültig oder abgelaufen`);
  const order = all[idx]!;

  // Check Ablauf
  const now = new Date();
  if (new Date(order.verifyExpiresAt) < now) {
    applyTransition(order, "VERIFY_EXPIRED", "system", "Verify-Link nach 7 Tagen nicht geklickt");
    all[idx] = order;
    await writeAll(all);
    throw new Error(`Verify-Link abgelaufen`);
  }

  if (order.state === "ORDER_REVIEW") {
    // Idempotent — Nutzer hat Link mehrfach geklickt. Das ist OK, zur Review-Seite.
    return order;
  }

  if (order.state !== "PENDING_VERIFICATION") {
    throw new Error(`Order ist in Zustand ${order.state}, Verify nicht möglich`);
  }

  applyTransition(order, "ORDER_REVIEW", "customer", `Verify-Link geklickt von ${ipAddress ?? "unknown IP"}`);
  order.verifiedAt = now.toISOString();
  all[idx] = order;
  await writeAll(all);
  return order;
}

/**
 * Markiert ein Agreement (AGB oder AVV) als heruntergeladen. Muss vor dem
 * Confirm-Button-Klick passieren — das Frontend zeigt den Confirm-Button
 * erst, wenn beide Agreements `downloadedAt` haben.
 */
export async function markAgreementDownloaded(
  orderId: string,
  type: "agb" | "avv",
  templateVersion: string,
  ipAddress?: string,
  userAgent?: string
): Promise<Order> {
  const all = await readAll();
  const idx = all.findIndex(o => o.id === orderId);
  if (idx < 0) throw new Error(`Order ${orderId} nicht gefunden`);
  const order = all[idx]!;

  const now = new Date().toISOString();
  const existing = order.agreements.find(a => a.type === type);
  if (existing) {
    existing.downloadedAt = now;
    if (ipAddress) existing.ipAddress = ipAddress;
    if (userAgent) existing.userAgent = userAgent;
  } else {
    order.agreements.push({
      type,
      templateVersion,
      downloadedAt: now,
      ipAddress,
      userAgent,
    });
  }
  order.updatedAt = now;
  all[idx] = order;
  await writeAll(all);
  return order;
}

/**
 * Markiert ein Agreement als gesigned (Confirm-Button geklickt). Setzt
 * pdfSha256 + pdfPath für Audit-Trail.
 */
export async function markAgreementSigned(
  orderId: string,
  type: "agb" | "avv",
  pdfPath: string,
  pdfSha256: string,
  ipAddress?: string,
  userAgent?: string
): Promise<Order> {
  const all = await readAll();
  const idx = all.findIndex(o => o.id === orderId);
  if (idx < 0) throw new Error(`Order ${orderId} nicht gefunden`);
  const order = all[idx]!;

  const now = new Date().toISOString();
  const existing = order.agreements.find(a => a.type === type);
  if (!existing) {
    throw new Error(`Agreement ${type} muss erst downloadet sein vor Signing`);
  }
  existing.signedAt = now;
  existing.pdfPath = pdfPath;
  existing.pdfSha256 = pdfSha256;
  if (ipAddress) existing.ipAddress = ipAddress;
  if (userAgent) existing.userAgent = userAgent;
  order.updatedAt = now;
  all[idx] = order;
  await writeAll(all);
  return order;
}

/**
 * Prüft ob alle erforderlichen Agreements gesigned sind. Prärequisit für
 * die Transition ORDER_REVIEW → CONFIRMED.
 */
export function hasAllAgreementsSigned(order: Order): boolean {
  const agb = order.agreements.find(a => a.type === "agb");
  const avv = order.agreements.find(a => a.type === "avv");
  return !!(agb?.signedAt && avv?.signedAt);
}

/**
 * Setzt die Provisioning-Metadaten. Aufgerufen vom Provisioning-Job im
 * index.ts.
 */
export async function setProvisioningInstance(orderId: string, instanceId: string): Promise<Order> {
  const all = await readAll();
  const idx = all.findIndex(o => o.id === orderId);
  if (idx < 0) throw new Error(`Order ${orderId} nicht gefunden`);
  const order = all[idx]!;
  order.instanceId = instanceId;
  order.provisioningStartedAt = new Date().toISOString();
  order.updatedAt = order.provisioningStartedAt;
  all[idx] = order;
  await writeAll(all);
  return order;
}

export async function setProvisioningFinished(orderId: string, subdomainFinal: string): Promise<Order> {
  const all = await readAll();
  const idx = all.findIndex(o => o.id === orderId);
  if (idx < 0) throw new Error(`Order ${orderId} nicht gefunden`);
  const order = all[idx]!;
  order.subdomainFinal = subdomainFinal;
  order.provisioningFinishedAt = new Date().toISOString();
  order.updatedAt = order.provisioningFinishedAt;
  all[idx] = order;
  await writeAll(all);
  return order;
}

export async function setProvisioningError(orderId: string, error: string): Promise<Order> {
  const all = await readAll();
  const idx = all.findIndex(o => o.id === orderId);
  if (idx < 0) throw new Error(`Order ${orderId} nicht gefunden`);
  const order = all[idx]!;
  order.provisioningError = error.slice(0, 1000);
  order.provisioningFinishedAt = new Date().toISOString();
  order.updatedAt = order.provisioningFinishedAt;
  all[idx] = order;
  await writeAll(all);
  return order;
}

/**
 * Markiert die Odoo-Notify-Mail als verschickt.
 */
export async function markOdooNotifySent(orderId: string): Promise<Order> {
  const all = await readAll();
  const idx = all.findIndex(o => o.id === orderId);
  if (idx < 0) throw new Error(`Order ${orderId} nicht gefunden`);
  const order = all[idx]!;
  order.odooNotifySentAt = new Date().toISOString();
  order.updatedAt = order.odooNotifySentAt;
  all[idx] = order;
  await writeAll(all);
  return order;
}

/**
 * Erzeugt einen Magic-Token für das Kunden-Dashboard (30d gültig).
 * Wird nach erfolgreichem Provisioning in der Welcome-Mail mit verschickt.
 */
export async function issueCustomerMagicToken(orderId: string): Promise<{ order: Order; token: string }> {
  const all = await readAll();
  const idx = all.findIndex(o => o.id === orderId);
  if (idx < 0) throw new Error(`Order ${orderId} nicht gefunden`);
  const order = all[idx]!;

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  order.customerMagicToken = token;
  order.customerMagicExpiresAt = expires.toISOString();
  order.updatedAt = new Date().toISOString();
  all[idx] = order;
  await writeAll(all);
  return { order, token };
}

export async function getOrderByCustomerMagicToken(token: string): Promise<Order | undefined> {
  const all = await readAll();
  const order = all.find(o => o.customerMagicToken === token);
  if (!order) return undefined;
  if (order.customerMagicExpiresAt && new Date(order.customerMagicExpiresAt) < new Date()) {
    return undefined; // abgelaufen
  }
  return order;
}

// ── Expiry-Scanner ──────────────────────────────────────────────────────

/**
 * Scant alle Orders nach abgelaufenen Verify-Tokens. Verschiebt diese
 * nach VERIFY_EXPIRED. Sollte stundlich via Scheduler aufgerufen werden
 * (analog cleanup.ts).
 */
export async function expireStaleVerifyTokens(): Promise<number> {
  const all = await readAll();
  const now = new Date();
  let changed = 0;
  for (const order of all) {
    if (order.state === "PENDING_VERIFICATION" &&
        new Date(order.verifyExpiresAt) < now) {
      applyTransition(order, "VERIFY_EXPIRED", "system", "Verify-Link 7d nicht geklickt");
      changed++;
    }
  }
  if (changed > 0) {
    await writeAll(all);
    console.error(`[orders] Expired ${changed} verify tokens`);
  }
  return changed;
}
