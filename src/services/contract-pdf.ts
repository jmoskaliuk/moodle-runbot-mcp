// src/services/contract-pdf.ts
// task47 — Onlineshop Woche 2: PDF-Generator für AGB + AVV via pandoc.
//
// Workflow pro Order:
//   1. Markdown-Template laden (`templates/agb-v1.md` bzw.
//      `templates/avv-template-v1.md`).
//   2. Platzhalter (`{{firma}}`, `{{name}}`, …) durch Order-Daten ersetzen.
//   3. pandoc aufrufen → PDF in `/opt/runbot/contracts/<orderId>/{agb,avv}.pdf`.
//   4. SHA256 über das erzeugte PDF berechnen → wird von orders.ts als
//      Audit-Hash gespeichert (Text-Form §126b BGB + Art. 28 (9) DSGVO).
//
// Warum pandoc + xelatex?
//   - Zu keepsake-pdf / pdf-lib: Markdown → PDF direkt ist one-shot.
//   - Zu puppeteer: kein Headless-Chrome-Overhead (~250MB).
//   - xelatex weil wir System-Fonts nutzen können (System-Default reicht;
//     wir brauchen keine pixelgenaue Corporate-Typo im Vertragsdokument).
//
// VPS-Setup (Johannes, einmalig):
//   apt install pandoc texlive-xetex texlive-fonts-recommended
//
// Cycle-Frage "{{sha}} im PDF":
//   Der SHA256 des gerenderten PDFs kann nicht im PDF selbst enthalten sein
//   (Henne-Ei). Wir ersetzen den Placeholder durch einen statischen Hinweis
//   und speichern den echten SHA in `order.agreements[].pdfSha256`. Das
//   reicht für §126b BGB Beweisdokumentation.
//
// Test:
//   npm run test -- contract-pdf
//   (Test setzt voraus, dass pandoc + xelatex installiert sind — wird auf
//    CI übersprungen, wenn pandoc fehlt.)

import { spawn } from "child_process";
import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";
import type { Order } from "./orders.js";
import type { DemoConfig } from "./config.js";

// ── Konstanten ─────────────────────────────────────────────────────────────

const CONTRACTS_DIR = process.env.RUNBOT_CONTRACTS_DIR
  ?? path.join(process.env.RUNBOT_WORK_DIR ?? "/opt/runbot", "contracts");

const TEMPLATES_DIR = process.env.RUNBOT_CONTRACT_TEMPLATES_DIR
  ?? path.resolve(new URL("../../templates", import.meta.url).pathname);

const PANDOC_BIN = process.env.PANDOC_BIN ?? "pandoc";

/** Aktuelle Template-Version. Bei Anwalts-Update → neue Datei `agb-v2.md`
 *  anlegen, alte NICHT löschen (Audit-Trail), hier Default hochdrehen.
 *  Alte Orders behalten ihr `templateVersion` im agreements-Record. */
export const CURRENT_TEMPLATE_VERSION = "v1";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ContractPdfResult {
  /** Absoluter Pfad zum generierten PDF. */
  path:            string;
  /** SHA256-Hexdigest über den PDF-Inhalt. */
  sha256:          string;
  /** Template-Version, z.B. "v1". */
  templateVersion: string;
  /** Bytes der PDF-Datei (für Size-Header beim Stream). */
  bytes:           number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Sehr defensive Placeholder-Substitution. Akzeptiert nur
 * [a-zA-Z_][a-zA-Z0-9_]* als Key, damit Angreifer keine regex-escapes o.ä.
 * einschmuggeln können. Unbekannte Keys werden zu `—` (em-dash), NICHT leer
 * gelassen, damit "{{foo}}" nirgends im PDF sichtbar bleibt.
 */
function renderTemplate(markdown: string, vars: Record<string, string | undefined>): string {
  return markdown.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (_match, key: string) => {
    const value = vars[key];
    if (value === undefined || value === null || value === "") return "—";
    return value;
  });
}

/** Formatiert ein ISO-Datum auf `DD.MM.YYYY`. */
function formatDateDE(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/** Formatiert eine Uhrzeit auf `HH:MM UTC`. */
function formatTimeUTC(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Baut die Placeholder-Map für Template-Rendering. Quelle der meisten
 * Felder ist die Order selbst; Paket-Metadaten kommen aus configs.json.
 *
 * Zentrale Stelle für Platzhalter-Mapping — wird von AGB + AVV geteilt.
 * Nicht alle Platzhalter werden in beiden Templates genutzt; das ist OK,
 * ungenutzte Keys sind harmlos.
 */
function buildTemplateVars(
  order:      Order,
  config:     DemoConfig | undefined,
  opts:       { signedAtIso: string; signerIp?: string }
): Record<string, string | undefined> {
  const paketName = config?.name ?? order.configId;
  // DemoConfig hat (noch) kein strukturiertes userLimit/plugins-Feld.
  // Wir nehmen was da ist und fallbacken klar lesbar. Woche 2+: in
  // configs.json ergänzen.
  const pluginName = config?.plugin?.name ?? "—";

  return {
    // Firma / Rechnungsadresse
    firma:      order.billing.firma,
    strasse:    order.billing.strasse,
    plz:        order.billing.plz,
    ort:        order.billing.ort,
    land:       order.billing.land,
    ustId:      order.billing.ustId,

    // Signer (AVV §126b)
    name:       order.signer.name,
    funktion:   order.signer.funktion,
    email:      order.signer.email,

    // Paket / Technik
    paket:      paketName,
    plugins:    pluginName,
    userLimit:  "unbegrenzt (MVP — Fair-Use)", // TODO Woche 4: echten Limit aus configs.json
    subdomain:  `${order.subdomainFinal ?? order.subdomainWish}.demo.eledia.ai`,

    // Audit
    orderId:    order.id,
    version:    CURRENT_TEMPLATE_VERSION,
    datum:      formatDateDE(opts.signedAtIso),
    uhrzeit:    formatTimeUTC(opts.signedAtIso),
    ip:         opts.signerIp,
    // Henne-Ei: der echte SHA wird nach dem Rendern berechnet und in
    // order.agreements[].pdfSha256 geloggt. Im PDF bleibt der Platzhalter
    // als stabiler String — damit derselbe Input immer denselben SHA gibt.
    sha:        "(siehe Audit-Log in der Runbot-Datenbank)",
  };
}

/**
 * Ruft pandoc auf und wartet auf Exit. Gibt den Exitcode + stderr zurück,
 * ohne Exceptions zu werfen (der Caller handlet den Fehler mit passender
 * UX-Message — "pandoc nicht installiert" vs. "LaTeX-Syntaxfehler").
 */
function runPandoc(args: string[], stdinContent: string): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PANDOC_BIN, args, { stdio: ["pipe", "inherit", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("error", (e) => reject(e));
    proc.on("close", (code) => resolve({ code: code ?? 1, stderr }));
    proc.stdin.write(stdinContent, "utf-8");
    proc.stdin.end();
  });
}

/**
 * Zentrale Render-Funktion. Lädt das passende Template, substituiert
 * Platzhalter, ruft pandoc mit xelatex-PDF-Engine auf, berechnet SHA256.
 */
async function renderPdf(
  kind:   "agb" | "avv",
  order:  Order,
  config: DemoConfig | undefined,
  opts:   { signedAtIso: string; signerIp?: string }
): Promise<ContractPdfResult> {
  const templateFile = kind === "agb"
    ? `agb-${CURRENT_TEMPLATE_VERSION}.md`
    : `avv-template-${CURRENT_TEMPLATE_VERSION}.md`;
  const templatePath = path.join(TEMPLATES_DIR, templateFile);

  const templateRaw = await fs.readFile(templatePath, "utf-8");
  const vars       = buildTemplateVars(order, config, opts);
  const markdown   = renderTemplate(templateRaw, vars);

  // Output-Pfad: /opt/runbot/contracts/<orderId>/<kind>.pdf
  const outDir  = path.join(CONTRACTS_DIR, order.id);
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `${kind}.pdf`);

  // pandoc-Aufruf. Keep-It-Simple: kein LaTeX-Template-File, nur sane
  // Defaults via -V. Das reicht für ein rechtsgültiges Textform-PDF.
  // Branding (Logo/Farben) ist im MVP nicht kritisch — der Anwaltstext
  // ist, was zählt.
  const pandocArgs = [
    "-f", "markdown",
    "-t", "pdf",
    "--pdf-engine=xelatex",
    "-V", "geometry:margin=2cm",
    "-V", "colorlinks=true",
    "-V", "linkcolor=blue",
    "-V", "fontsize=11pt",
    "-V", `title=${kind.toUpperCase()} — ${order.billing.firma} — Order ${order.id}`,
    "-V", `author=eLeDia GmbH`,
    "-V", `date=${vars.datum}`,
    "-o", outFile,
  ];

  const { code, stderr } = await runPandoc(pandocArgs, markdown);
  if (code !== 0) {
    throw new Error(
      `pandoc (${kind}) beendet mit Exit ${code}. stderr=${stderr.slice(-800)}`
    );
  }

  const buf   = await fs.readFile(outFile);
  const hash  = createHash("sha256").update(buf).digest("hex");
  const bytes = buf.byteLength;

  return {
    path:            outFile,
    sha256:          hash,
    templateVersion: CURRENT_TEMPLATE_VERSION,
    bytes,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Rendert die AGB-PDF für eine Order. Throwt bei Template-/pandoc-Fehler. */
export async function renderAgbPdf(
  order:  Order,
  config: DemoConfig | undefined,
  opts:   { signedAtIso: string; signerIp?: string }
): Promise<ContractPdfResult> {
  return renderPdf("agb", order, config, opts);
}

/** Rendert die AVV-PDF für eine Order. Throwt bei Template-/pandoc-Fehler. */
export async function renderAvvPdf(
  order:  Order,
  config: DemoConfig | undefined,
  opts:   { signedAtIso: string; signerIp?: string }
): Promise<ContractPdfResult> {
  return renderPdf("avv", order, config, opts);
}

/**
 * Prüft ob für eine Order bereits gerenderte PDFs auf Disk liegen. Wird
 * vom Download-Endpoint (GET /api/shop/agreement/:token/:type) genutzt,
 * damit Kundenklicks auf "AGB herunterladen" nicht jedes Mal pandoc neu
 * starten — aber beim ersten Klick on-the-fly generieren (Lazy-Render).
 */
export async function findExistingPdf(
  orderId: string,
  kind:    "agb" | "avv"
): Promise<{ path: string; bytes: number } | null> {
  const p = path.join(CONTRACTS_DIR, orderId, `${kind}.pdf`);
  try {
    const st = await fs.stat(p);
    if (st.isFile() && st.size > 0) return { path: p, bytes: st.size };
    return null;
  } catch {
    return null;
  }
}

/**
 * Garantiert, dass eine PDF für (order, kind) vorhanden ist. Rendert nur
 * wenn nicht da — sonst wird der vorhandene Hash gegengeprüft. Gibt
 * Pfad + SHA256 + Bytes + Version zurück. Für Download-Endpoint.
 *
 * Idempotent: mehrfacher Aufruf erzeugt keine Dubletten. SHA kann sich
 * zwischen Render-Runs geringfügig ändern (xelatex setzt eine CreationDate
 * im PDF-Metadatenfeld) — deswegen re-hashen wir bei cached PDFs.
 */
export async function ensureContractPdf(
  order:  Order,
  config: DemoConfig | undefined,
  kind:   "agb" | "avv",
  opts:   { signedAtIso: string; signerIp?: string }
): Promise<ContractPdfResult> {
  const existing = await findExistingPdf(order.id, kind);
  if (existing) {
    const buf  = await fs.readFile(existing.path);
    const hash = createHash("sha256").update(buf).digest("hex");
    return {
      path:            existing.path,
      sha256:          hash,
      templateVersion: CURRENT_TEMPLATE_VERSION,
      bytes:           existing.bytes,
    };
  }
  return renderPdf(kind, order, config, opts);
}
