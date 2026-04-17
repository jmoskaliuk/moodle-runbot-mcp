import type { Order } from "./orders.js";
import type { DemoConfig } from "./config.js";
/** Aktuelle Template-Version. Bei Anwalts-Update → neue Datei `agb-v2.md`
 *  anlegen, alte NICHT löschen (Audit-Trail), hier Default hochdrehen.
 *  Alte Orders behalten ihr `templateVersion` im agreements-Record. */
export declare const CURRENT_TEMPLATE_VERSION = "v1";
export interface ContractPdfResult {
    /** Absoluter Pfad zum generierten PDF. */
    path: string;
    /** SHA256-Hexdigest über den PDF-Inhalt. */
    sha256: string;
    /** Template-Version, z.B. "v1". */
    templateVersion: string;
    /** Bytes der PDF-Datei (für Size-Header beim Stream). */
    bytes: number;
}
/** Rendert die AGB-PDF für eine Order. Throwt bei Template-/pandoc-Fehler. */
export declare function renderAgbPdf(order: Order, config: DemoConfig | undefined, opts: {
    signedAtIso: string;
    signerIp?: string;
}): Promise<ContractPdfResult>;
/** Rendert die AVV-PDF für eine Order. Throwt bei Template-/pandoc-Fehler. */
export declare function renderAvvPdf(order: Order, config: DemoConfig | undefined, opts: {
    signedAtIso: string;
    signerIp?: string;
}): Promise<ContractPdfResult>;
/**
 * Prüft ob für eine Order bereits gerenderte PDFs auf Disk liegen. Wird
 * vom Download-Endpoint (GET /api/shop/agreement/:token/:type) genutzt,
 * damit Kundenklicks auf "AGB herunterladen" nicht jedes Mal pandoc neu
 * starten — aber beim ersten Klick on-the-fly generieren (Lazy-Render).
 */
export declare function findExistingPdf(orderId: string, kind: "agb" | "avv"): Promise<{
    path: string;
    bytes: number;
} | null>;
/**
 * Garantiert, dass eine PDF für (order, kind) vorhanden ist. Rendert nur
 * wenn nicht da — sonst wird der vorhandene Hash gegengeprüft. Gibt
 * Pfad + SHA256 + Bytes + Version zurück. Für Download-Endpoint.
 *
 * Idempotent: mehrfacher Aufruf erzeugt keine Dubletten. SHA kann sich
 * zwischen Render-Runs geringfügig ändern (xelatex setzt eine CreationDate
 * im PDF-Metadatenfeld) — deswegen re-hashen wir bei cached PDFs.
 */
export declare function ensureContractPdf(order: Order, config: DemoConfig | undefined, kind: "agb" | "avv", opts: {
    signedAtIso: string;
    signerIp?: string;
}): Promise<ContractPdfResult>;
//# sourceMappingURL=contract-pdf.d.ts.map