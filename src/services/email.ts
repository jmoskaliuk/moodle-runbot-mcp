// src/services/email.ts
// Versendet E-Mails via Brevo SMTP (smtp-relay.brevo.com).
// Konfiguration via Umgebungsvariablen — kein SMTP-Passwort im Code.
//
// task32: Die HTML/Text-Templates wurden nach src/services/emailTemplates.ts
// extrahiert und tragen jetzt das eLeDia-Branding (Logo, System-Font-Stack,
// Accent-Farbe #ab1d79). Dieses Modul kümmert sich nur noch um SMTP-Transport
// und die Verknüpfung der DemoRequest-Daten mit den Templates.

import { createTransport } from "nodemailer";
import type { DemoRequest } from "../types.js";
import {
  confirmEmail, readyEmail, errorEmail,
  mailVerifyOrder, mailOrderReview, mailOrderConfirmed, mailAdminAlertNewOrder,
} from "./emailTemplates.js";
import type { Order } from "./orders.js";

// ── SMTP-Konfiguration ────────────────────────────────────────────────────────

const SMTP_HOST     = process.env.SMTP_HOST     ?? "smtp-relay.brevo.com";
const SMTP_PORT     = parseInt(process.env.SMTP_PORT ?? "587");
const SMTP_USER     = process.env.SMTP_USER     ?? "johannes.moskaliuk@eledia.ai";
const SMTP_PASS     = process.env.SMTP_PASS     ?? ""; // Brevo SMTP-Schlüssel
const FROM_EMAIL    = process.env.FROM_EMAIL    ?? "johannes.moskaliuk@eledia.ai";
const FROM_NAME     = process.env.FROM_NAME     ?? "Johannes von eLeDia.ai";
const BASE_URL      = process.env.BASE_URL      ?? "https://demo.eledia.ai";

function createTransporter() {
  return createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,       // STARTTLS auf Port 587
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

function firstNameOf(request: DemoRequest): string {
  return (request.name || "").split(" ")[0] || "";
}

// ── E-Mail: Bestätigung ───────────────────────────────────────────────────────

export async function sendConfirmationEmail(
  request: DemoRequest,
  pluginName: string
): Promise<void> {
  const { html, text } = confirmEmail({
    firstName:  firstNameOf(request),
    pluginName,
    confirmUrl: `${BASE_URL}/confirm/${request.token}`,
  });

  const transporter = createTransporter();

  await transporter.sendMail({
    from:    `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to:      `"${request.name}" <${request.email}>`,
    subject: `Ihre ${pluginName} Demo — Link zum Starten`,
    html,
    text,
  });
}

// ── E-Mail: Demo ist bereit ───────────────────────────────────────────────────

export async function sendDemoReadyEmail(
  request: DemoRequest,
  pluginName: string,
  demoUrl: string
): Promise<void> {
  const { html, text } = readyEmail({
    firstName:  firstNameOf(request),
    pluginName,
    demoUrl,
  });

  const transporter = createTransporter();

  await transporter.sendMail({
    from:    `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to:      `"${request.name}" <${request.email}>`,
    subject: `Ihre ${pluginName} Demo läuft — jetzt erkunden`,
    html,
    text,
  });
}

// ── Onlineshop Order-Flow (task46, Woche 1b) ─────────────────────────────────
//
// Vier Send-Funktionen analog zu den Demo-Flow-Varianten darüber — jede
// verdrahtet das entsprechende Template aus emailTemplates.ts mit dem
// SMTP-Transport. Order-Felder kommen direkt aus src/services/orders.ts.

const ADMIN_ALERT_EMAIL  = process.env.ADMIN_ALERT_EMAIL  ?? "post@moskaliuk.com";

function orderFirstName(order: Order): string {
  return (order.signer?.name || "").split(" ")[0] || "";
}

/** (1) Double-Opt-In nach Formular-Submit. */
export async function sendVerifyOrderEmail(order: Order, configName: string): Promise<void> {
  const verifyUrl = `${BASE_URL}/api/shop/verify/${order.verifyToken}`;
  const { html, text } = mailVerifyOrder({
    firstName:  orderFirstName(order),
    firma:      order.billing.firma,
    configName,
    verifyUrl,
    expiresAt:  order.verifyExpiresAt,
  });

  const transporter = createTransporter();
  await transporter.sendMail({
    from:    `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to:      `"${order.signer.name}" <${order.contact.email}>`,
    subject: `Bestellung bestätigen — ${configName}`,
    html,
    text,
  });
}

/** (2) Nach Verify-Klick: Review-Seite mit AGB/AVV-Download. */
export async function sendOrderReviewEmail(order: Order, configName: string): Promise<void> {
  const base = `${BASE_URL}/api/shop`;
  const reviewUrl      = `${base}/review/${order.verifyToken}`;
  const agbDownloadUrl = `${base}/agreement/${order.verifyToken}/agb`;
  const avvDownloadUrl = `${base}/agreement/${order.verifyToken}/avv`;

  const { html, text } = mailOrderReview({
    firstName:  orderFirstName(order),
    firma:      order.billing.firma,
    configName,
    reviewUrl,
    agbDownloadUrl,
    avvDownloadUrl,
  });

  const transporter = createTransporter();
  await transporter.sendMail({
    from:    `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to:      `"${order.signer.name}" <${order.contact.email}>`,
    subject: `${configName} — Bestellung prüfen`,
    html,
    text,
  });
}

/** (3) Welcome-Mail nach Provisioning. */
export async function sendOrderConfirmedEmail(
  order: Order,
  configName: string,
  opts: {
    moodleUrl:             string;
    subdomain:             string;
    adminUsername:         string;
    adminPassword:         string;
    changePasswordUrl:     string;
    customerDashboardUrl?: string;
  }
): Promise<void> {
  const { html, text } = mailOrderConfirmed({
    firstName:           orderFirstName(order),
    firma:               order.billing.firma,
    configName,
    subdomain:           opts.subdomain,
    moodleUrl:           opts.moodleUrl,
    adminUsername:       opts.adminUsername,
    adminPassword:       opts.adminPassword,
    changePasswordUrl:   opts.changePasswordUrl,
    customerDashboardUrl: opts.customerDashboardUrl,
  });

  const transporter = createTransporter();
  await transporter.sendMail({
    from:    `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to:      `"${order.signer.name}" <${order.contact.email}>`,
    subject: `${configName} — Ihre Moodle-Instanz ist bereit`,
    html,
    text,
  });
}

/** (4) Admin-Alert an post@moskaliuk.com (Odoo-Notify im MVP). */
export async function sendAdminAlertNewOrderEmail(
  order: Order,
  configName: string,
): Promise<void> {
  const adminReviewUrl = `${BASE_URL}/admin#order-${order.id}`;
  const { html, text } = mailAdminAlertNewOrder({
    orderId:         order.id,
    configName,
    contactEmail:    order.contact.email,
    contactPhone:    order.contact.phone,
    firma:           order.billing.firma,
    billingStrasse:  order.billing.strasse,
    billingPlz:      order.billing.plz,
    billingOrt:      order.billing.ort,
    billingLand:     order.billing.land,
    ustId:           order.billing.ustId,
    signerName:      order.signer.name,
    signerFunktion:  order.signer.funktion,
    signerEmail:     order.signer.email,
    subdomainWish:   order.subdomainWish,
    adminReviewUrl,
    notes:           order.notes,
  });

  const transporter = createTransporter();
  await transporter.sendMail({
    from:    `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to:      ADMIN_ALERT_EMAIL,
    replyTo: order.contact.email,
    subject: `🛒 Neue Bestellung: ${configName} — ${order.billing.firma}`,
    html,
    text,
  });
}

// ── E-Mail: Demo-Start fehlgeschlagen ─────────────────────────────────────────

export async function sendErrorEmail(
  request: DemoRequest,
  pluginName: string
): Promise<void> {
  const { html, text } = errorEmail({
    firstName:  firstNameOf(request),
    pluginName,
    retryUrl:   BASE_URL,
  });

  const transporter = createTransporter();

  await transporter.sendMail({
    from:    `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to:      `"${request.name}" <${request.email}>`,
    subject: `Ihre ${pluginName} Demo konnte nicht gestartet werden`,
    html,
    text,
  });
}
