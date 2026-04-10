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
import { confirmEmail, readyEmail, errorEmail } from "./emailTemplates.js";

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
