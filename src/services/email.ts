// src/services/email.ts
// Versendet E-Mails via Brevo SMTP (smtp-relay.brevo.com).
// Konfiguration via Umgebungsvariablen — kein SMTP-Passwort im Code.

import { createTransport } from "nodemailer";
import type { DemoRequest } from "../types.js";

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

// ── E-Mail: Bestätigung ───────────────────────────────────────────────────────

export async function sendConfirmationEmail(
  request: DemoRequest,
  pluginName: string
): Promise<void> {
  const confirmUrl = `${BASE_URL}/confirm/${request.token}`;
  const firstName  = request.name.split(" ")[0];

  const html = `
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ihre eLeDia Demo</title>
</head>
<body style="margin:0;padding:0;background:#fafaf8;font-family:'DM Sans',Helvetica,Arial,sans-serif;color:#2d3142">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf8;padding:40px 0">
  <tr>
    <td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e8eaee;border-radius:12px;overflow:hidden">

        <!-- Header -->
        <tr>
          <td style="padding:32px 40px 24px;border-bottom:1px solid #e8eaee">
            <span style="font-family:Georgia,serif;font-size:20px;font-weight:400;color:#0f1117;letter-spacing:-0.5px">
              eLeDia<span style="color:#1a56db">.</span>
            </span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px">
            <p style="font-family:Georgia,serif;font-size:26px;font-weight:300;color:#0f1117;line-height:1.3;letter-spacing:-0.5px;margin:0 0 20px">
              ${firstName}, Ihre Demo<br>wartet auf Sie.
            </p>
            <p style="font-size:15px;color:#7a8090;line-height:1.7;margin:0 0 28px;font-weight:300">
              Sie haben eine Live-Demo von <strong style="color:#2d3142">${pluginName}</strong>
              angefragt. Klicken Sie auf den Button um Ihre persönliche Moodle-Instanz
              zu starten — vorkonfiguriert mit echten Beispieldaten.
            </p>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" style="margin:0 0 32px">
              <tr>
                <td style="background:#1a56db;border-radius:8px">
                  <a href="${confirmUrl}"
                     style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:500;color:#ffffff;text-decoration:none;letter-spacing:0.1px">
                    Demo jetzt starten →
                  </a>
                </td>
              </tr>
            </table>

            <!-- Details -->
            <table cellpadding="0" cellspacing="0" width="100%"
                   style="background:#fafaf8;border:1px solid #e8eaee;border-radius:8px;margin-bottom:28px">
              <tr>
                <td style="padding:16px 20px">
                  <table cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="font-size:11px;color:#7a8090;letter-spacing:1px;text-transform:uppercase;padding-bottom:12px"
                          colspan="2">Demo-Details</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#7a8090;padding:4px 0">Plugin</td>
                      <td style="font-size:13px;color:#0f1117;font-weight:500;text-align:right">${pluginName}</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#7a8090;padding:4px 0">Laufzeit</td>
                      <td style="font-size:13px;color:#0f1117;font-weight:500;text-align:right">60 Minuten</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#7a8090;padding:4px 0">Accounts</td>
                      <td style="font-size:13px;color:#0f1117;font-weight:500;text-align:right">admin · teacher · student</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#7a8090;padding:4px 0">Passwort (für alle)</td>
                      <td style="font-size:13px;color:#0f1117;font-weight:500;text-align:right">demo1234</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#7a8090;padding:4px 0">Link gültig bis</td>
                      <td style="font-size:13px;color:#0f1117;font-weight:500;text-align:right">
                        ${new Date(request.expiresAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })} Uhr
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <p style="font-size:13px;color:#7a8090;line-height:1.6;margin:0">
              Falls der Button nicht funktioniert, kopieren Sie diesen Link:<br>
              <a href="${confirmUrl}" style="color:#1a56db;word-break:break-all">${confirmUrl}</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #e8eaee;background:#fafaf8">
            <p style="font-size:12px;color:#7a8090;margin:0;line-height:1.6">
              Diese E-Mail wurde ausgelöst weil jemand eine Demo auf
              <a href="${BASE_URL}" style="color:#1a56db;text-decoration:none">demo.eledia.ai</a>
              angefragt hat. Falls Sie das nicht waren, können Sie diese E-Mail ignorieren.
              <br><br>
              eLeDia GmbH · <a href="https://eledia.ai" style="color:#1a56db;text-decoration:none">eledia.ai</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`.trim();

  const text = `
Hallo ${firstName},

Sie haben eine Live-Demo von ${pluginName} angefragt.

Demo starten: ${confirmUrl}

Details:
- Plugin: ${pluginName}
- Laufzeit: 60 Minuten
- Accounts: admin · teacher · student (alle mit demselben Passwort)
- Passwort: demo1234
- Link gültig bis: ${new Date(request.expiresAt).toLocaleString("de-DE")}

Falls Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren.

Johannes von eLeDia.ai
https://eledia.ai
`.trim();

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
  const firstName = request.name.split(" ")[0];

  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#fafaf8;font-family:Helvetica,Arial,sans-serif;color:#2d3142">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf8;padding:40px 0">
  <tr>
    <td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e8eaee;border-radius:12px;overflow:hidden">
        <tr>
          <td style="padding:32px 40px 24px;border-bottom:1px solid #e8eaee">
            <span style="font-family:Georgia,serif;font-size:20px;color:#0f1117">
              eLeDia<span style="color:#1a56db">.</span>
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px">
            <p style="font-family:Georgia,serif;font-size:26px;font-weight:300;color:#0f1117;line-height:1.3;margin:0 0 20px">
              ${firstName}, Ihre Demo<br>ist bereit. ✓
            </p>
            <p style="font-size:15px;color:#7a8090;line-height:1.7;margin:0 0 28px;font-weight:300">
              Ihre persönliche <strong style="color:#2d3142">${pluginName}</strong>-Demo
              läuft jetzt. Sie haben 60 Minuten Zeit zum Erkunden.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 32px">
              <tr>
                <td style="background:#059669;border-radius:8px">
                  <a href="${demoUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:500;color:#fff;text-decoration:none">
                    Demo öffnen →
                  </a>
                </td>
              </tr>
            </table>
            <p style="font-size:13px;color:#7a8090;line-height:1.6;margin:0">
              Accounts: <strong style="color:#2d3142">admin</strong> ·
              <strong style="color:#2d3142">teacher</strong> ·
              <strong style="color:#2d3142">student</strong><br>
              Passwort (für alle): <strong style="color:#2d3142">demo1234</strong><br>
              Die Demo wird nach 60 Minuten automatisch gelöscht.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #e8eaee;background:#fafaf8">
            <p style="font-size:12px;color:#7a8090;margin:0">
              Fragen? Antworten Sie einfach auf diese E-Mail.<br>
              eLeDia GmbH · <a href="https://eledia.ai" style="color:#1a56db">eledia.ai</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`.trim();

  const transporter = createTransporter();

  await transporter.sendMail({
    from:    `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to:      `"${request.name}" <${request.email}>`,
    subject: `Ihre ${pluginName} Demo läuft — jetzt erkunden`,
    html,
    text: `Ihre ${pluginName} Demo ist bereit:\n${demoUrl}\n\nAccounts: admin · teacher · student (Passwort für alle: demo1234)\nLäuft 60 Minuten.`,
  });
}

// ── E-Mail: Demo-Start fehlgeschlagen ─────────────────────────────────────────

export async function sendErrorEmail(
  request: DemoRequest,
  pluginName: string
): Promise<void> {
  const firstName  = request.name.split(" ")[0];
  const retryUrl   = `${BASE_URL}`;

  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#fafaf8;font-family:Helvetica,Arial,sans-serif;color:#2d3142">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf8;padding:40px 0">
  <tr>
    <td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e8eaee;border-radius:12px;overflow:hidden">
        <tr>
          <td style="padding:32px 40px 24px;border-bottom:1px solid #e8eaee">
            <span style="font-family:Georgia,serif;font-size:20px;color:#0f1117">
              eLeDia<span style="color:#1a56db">.</span>
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px">
            <p style="font-family:Georgia,serif;font-size:26px;font-weight:300;color:#0f1117;line-height:1.3;margin:0 0 20px">
              ${firstName}, leider ist<br>etwas schiefgelaufen.
            </p>
            <p style="font-size:15px;color:#7a8090;line-height:1.7;margin:0 0 28px;font-weight:300">
              Ihre <strong style="color:#2d3142">${pluginName}</strong>-Demo konnte leider
              nicht gestartet werden. Bitte versuchen Sie es erneut — das Problem
              ist meist vorübergehend.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 32px">
              <tr>
                <td style="background:#1a56db;border-radius:8px">
                  <a href="${retryUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:500;color:#fff;text-decoration:none">
                    Erneut versuchen →
                  </a>
                </td>
              </tr>
            </table>
            <p style="font-size:13px;color:#7a8090;line-height:1.6;margin:0">
              Falls das Problem weiterhin besteht, antworten Sie einfach auf diese E-Mail.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #e8eaee;background:#fafaf8">
            <p style="font-size:12px;color:#7a8090;margin:0">
              eLeDia GmbH · <a href="https://eledia.ai" style="color:#1a56db">eledia.ai</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`.trim();

  const transporter = createTransporter();

  await transporter.sendMail({
    from:    `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to:      `"${request.name}" <${request.email}>`,
    subject: `Ihre ${pluginName} Demo konnte nicht gestartet werden`,
    html,
    text: `Hallo ${firstName},\n\nIhre ${pluginName}-Demo konnte leider nicht gestartet werden.\n\nBitte versuchen Sie es erneut: ${retryUrl}\n\nFalls das Problem weiterhin besteht, antworten Sie auf diese E-Mail.\n\neLeDia GmbH`,
  });
}
