// src/services/emailTemplates.ts
//
// task32: Gemeinsames Layout für alle System-E-Mails aus dem Runbot-Backend.
//
// Design-Vorgaben (Johannes 2026-04-09):
//   - Logo oben statt der bisherigen Text-Wortmarke
//   - eLeDia-Farbpalette aus webui/demo-portal.html (Akzent #ab1d79)
//   - System-Font-Stack statt "DM Sans"/"Open Sans", weil E-Mail-Clients
//     Custom-Fonts nur unzuverlässig laden (Gmail, Outlook-Web, Apple Mail)
//   - Inline-Styles überall, weil E-Mail-Clients externe Stylesheets nicht
//     unterstützen (Outlook) oder `<style>`-Blöcke in `<head>` strippen
//   - Logo als absolute URL auf demo.eledia.ai — Base64 wäre zwar sicherer
//     gegen Image-Blocking, bläht aber jede Mail um ~8 KB auf und führt
//     bei einigen Clients zu Display-Bugs (Outlook)
//
// Gerendert mit Template-Strings statt einer Template-Engine, weil der
// Output statisch ist und eine weitere Dependency nicht gerechtfertigt
// wäre. Alle Funktionen geben `{ html, text }` zurück — beide Varianten
// werden als nodemailer `alternatives` mitgeschickt, damit Text-only-Clients
// den Plaintext-Fallback bekommen.
const BASE_URL = process.env.BASE_URL ?? "https://demo.eledia.ai";
const LOGO_URL = process.env.EMAIL_LOGO_URL ?? `${BASE_URL}/eledia_runbot.png`;
// eLeDia-Farbpalette (siehe webui/demo-portal.html → :root)
const COLORS = {
    accent: "#ab1d79",
    accentDark: "#540e3b",
    accentPale: "#f5e4ef",
    ink: "#353535",
    muted: "#6b6b6f",
    rule: "#e9e9e9",
    bg: "#f3f5f8",
    card: "#ffffff",
    success: "#3aadaa",
    successDark: "#267372",
};
// System-Font-Stack, derselbe den moderne Webapps standardmäßig nutzen.
// Fällt auf den jeweils hübschesten Haus-Font des Clients zurück.
const FONT_STACK = "-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Oxygen,Ubuntu,Cantarell,sans-serif";
// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
/**
 * Basis-Layout: Logo + Card + Footer. Content ist bereits HTML, wird
 * in die Card gestellt.
 */
function baseLayout(opts) {
    const { title, content, preheader } = opts;
    return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};font-family:${FONT_STACK};color:${COLORS.ink};-webkit-font-smoothing:antialiased;line-height:1.6">
${preheader ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escapeHtml(preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};padding:40px 16px">
  <tr>
    <td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${COLORS.card};border:1px solid ${COLORS.rule};border-radius:12px;overflow:hidden">

        <!-- Header mit Logo -->
        <tr>
          <td style="padding:28px 40px 24px;border-bottom:1px solid ${COLORS.rule};background:${COLORS.card}">
            <a href="${BASE_URL}" style="text-decoration:none;display:inline-block">
              <img src="${LOGO_URL}" alt="eLeDia Runbot" height="38"
                   style="display:block;height:38px;width:auto;border:0;outline:none;text-decoration:none">
            </a>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 32px;background:${COLORS.card}">
${content}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px 24px;border-top:1px solid ${COLORS.rule};background:${COLORS.bg}">
            <p style="font-size:12px;color:${COLORS.muted};margin:0;line-height:1.6;font-family:${FONT_STACK}">
              eLeDia GmbH · <a href="https://eledia.ai" style="color:${COLORS.accent};text-decoration:none">eledia.ai</a><br>
              Moodle Premium Partner · Hosting in Deutschland · DSGVO-konform
            </p>
          </td>
        </tr>

      </table>

      <p style="font-size:11px;color:${COLORS.muted};margin:16px 0 0;font-family:${FONT_STACK};max-width:560px">
        Diese Nachricht wurde von <a href="${BASE_URL}" style="color:${COLORS.muted};text-decoration:underline">${BASE_URL.replace(/^https?:\/\//, "")}</a> ausgelöst.
      </p>
    </td>
  </tr>
</table>
</body>
</html>`;
}
// ── Button-Komponente ─────────────────────────────────────────────────────────
function button(href, label, bg = COLORS.accent) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 32px">
  <tr>
    <td style="background:${bg};border-radius:8px">
      <a href="${href}"
         style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:500;color:#ffffff;text-decoration:none;letter-spacing:0.1px;font-family:${FONT_STACK}">
        ${escapeHtml(label)}
      </a>
    </td>
  </tr>
</table>`;
}
// ── Templates ─────────────────────────────────────────────────────────────────
export function confirmEmail(opts) {
    const { firstName, pluginName, confirmUrl } = opts;
    const content = `
<p style="font-size:24px;font-weight:500;color:${COLORS.ink};line-height:1.3;margin:0 0 18px;font-family:${FONT_STACK}">
  ${escapeHtml(firstName)}, Ihre Demo wartet auf Sie.
</p>
<p style="font-size:15px;color:${COLORS.muted};line-height:1.7;margin:0 0 28px;font-family:${FONT_STACK}">
  Sie haben eine Live-Demo von <strong style="color:${COLORS.ink}">${escapeHtml(pluginName)}</strong>
  angefragt. Klicken Sie auf den Button, um Ihre persönliche Moodle-Instanz zu starten —
  vorkonfiguriert mit echten Beispieldaten.
</p>

${button(confirmUrl, "Demo jetzt starten →")}

<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
       style="background:${COLORS.bg};border:1px solid ${COLORS.rule};border-radius:8px;margin-bottom:28px">
  <tr>
    <td style="padding:18px 22px">
      <p style="font-size:11px;color:${COLORS.muted};letter-spacing:1px;text-transform:uppercase;margin:0 0 12px;font-family:${FONT_STACK}">
        Demo-Details
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="font-size:13px;color:${COLORS.muted};padding:3px 0;font-family:${FONT_STACK}">Plugin</td>
          <td style="font-size:13px;color:${COLORS.ink};font-weight:500;text-align:right;font-family:${FONT_STACK}">${escapeHtml(pluginName)}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:${COLORS.muted};padding:3px 0;font-family:${FONT_STACK}">Laufzeit</td>
          <td style="font-size:13px;color:${COLORS.ink};font-weight:500;text-align:right;font-family:${FONT_STACK}">60 Minuten</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:${COLORS.muted};padding:3px 0;font-family:${FONT_STACK}">Accounts</td>
          <td style="font-size:13px;color:${COLORS.ink};font-weight:500;text-align:right;font-family:${FONT_STACK}">admin · teacher · student</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:${COLORS.muted};padding:3px 0;font-family:${FONT_STACK}">Passwort (für alle)</td>
          <td style="font-size:13px;color:${COLORS.ink};font-weight:500;text-align:right;font-family:${FONT_STACK}">demo1234</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<p style="font-size:13px;color:${COLORS.muted};line-height:1.6;margin:0;font-family:${FONT_STACK}">
  Falls der Button nicht funktioniert, kopieren Sie diesen Link:<br>
  <a href="${confirmUrl}" style="color:${COLORS.accent};word-break:break-all;text-decoration:underline">${escapeHtml(confirmUrl)}</a>
</p>`;
    const html = baseLayout({
        title: `Ihre ${pluginName} Demo`,
        preheader: `Klicken Sie zum Starten Ihrer ${pluginName}-Demo — 60 Minuten, alle Accounts mit Passwort demo1234`,
        content,
    });
    const text = `Hallo ${firstName},

Sie haben eine Live-Demo von ${pluginName} angefragt.

Demo starten: ${confirmUrl}

Details:
- Plugin:   ${pluginName}
- Laufzeit: 60 Minuten
- Accounts: admin · teacher · student (alle mit demselben Passwort)
- Passwort: demo1234

Falls Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren.

eLeDia GmbH · https://eledia.ai`;
    return { html, text };
}
export function readyEmail(opts) {
    const { firstName, pluginName, demoUrl } = opts;
    const content = `
<p style="font-size:24px;font-weight:500;color:${COLORS.ink};line-height:1.3;margin:0 0 18px;font-family:${FONT_STACK}">
  ${escapeHtml(firstName)}, Ihre Demo ist bereit. ✓
</p>
<p style="font-size:15px;color:${COLORS.muted};line-height:1.7;margin:0 0 28px;font-family:${FONT_STACK}">
  Ihre persönliche <strong style="color:${COLORS.ink}">${escapeHtml(pluginName)}</strong>-Demo läuft jetzt.
  Sie haben 60 Minuten Zeit zum Erkunden.
</p>

${button(demoUrl, "Demo öffnen →", COLORS.success)}

<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
       style="background:${COLORS.bg};border:1px solid ${COLORS.rule};border-radius:8px;margin-bottom:20px">
  <tr>
    <td style="padding:18px 22px">
      <p style="font-size:11px;color:${COLORS.muted};letter-spacing:1px;text-transform:uppercase;margin:0 0 12px;font-family:${FONT_STACK}">
        Zugangsdaten
      </p>
      <p style="font-size:13px;color:${COLORS.ink};line-height:1.8;margin:0;font-family:${FONT_STACK}">
        Accounts: <strong>admin</strong> · <strong>teacher</strong> · <strong>student</strong><br>
        Passwort (für alle): <strong>demo1234</strong>
      </p>
    </td>
  </tr>
</table>

<p style="font-size:13px;color:${COLORS.muted};line-height:1.6;margin:0;font-family:${FONT_STACK}">
  Die Demo wird nach 60 Minuten automatisch gelöscht. Fragen? Antworten Sie einfach auf diese E-Mail.
</p>`;
    const html = baseLayout({
        title: `Ihre ${pluginName} Demo läuft`,
        preheader: `Ihre persönliche ${pluginName}-Moodle-Instanz ist bereit — 60 Minuten zum Erkunden`,
        content,
    });
    const text = `Hallo ${firstName},

Ihre ${pluginName}-Demo ist bereit:
${demoUrl}

Accounts: admin · teacher · student (Passwort für alle: demo1234)
Die Demo läuft 60 Minuten und wird danach automatisch gelöscht.

Fragen? Antworten Sie einfach auf diese E-Mail.

eLeDia GmbH · https://eledia.ai`;
    return { html, text };
}
export function errorEmail(opts) {
    const { firstName, pluginName, retryUrl } = opts;
    const content = `
<p style="font-size:24px;font-weight:500;color:${COLORS.ink};line-height:1.3;margin:0 0 18px;font-family:${FONT_STACK}">
  ${escapeHtml(firstName)}, leider ist etwas schiefgelaufen.
</p>
<p style="font-size:15px;color:${COLORS.muted};line-height:1.7;margin:0 0 28px;font-family:${FONT_STACK}">
  Ihre <strong style="color:${COLORS.ink}">${escapeHtml(pluginName)}</strong>-Demo konnte leider
  nicht gestartet werden. Bitte versuchen Sie es erneut — das Problem ist meist vorübergehend.
</p>

${button(retryUrl, "Erneut versuchen →")}

<p style="font-size:13px;color:${COLORS.muted};line-height:1.6;margin:0;font-family:${FONT_STACK}">
  Falls das Problem weiterhin besteht, antworten Sie einfach auf diese E-Mail.
  Wir schauen es uns sofort an.
</p>`;
    const html = baseLayout({
        title: `Fehler beim Starten Ihrer ${pluginName} Demo`,
        preheader: `Es gab ein Problem beim Starten Ihrer Demo — bitte versuchen Sie es erneut`,
        content,
    });
    const text = `Hallo ${firstName},

Ihre ${pluginName}-Demo konnte leider nicht gestartet werden.

Bitte versuchen Sie es erneut: ${retryUrl}

Falls das Problem weiterhin besteht, antworten Sie auf diese E-Mail.

eLeDia GmbH · https://eledia.ai`;
    return { html, text };
}
//# sourceMappingURL=emailTemplates.js.map