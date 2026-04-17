// src/brand.ts
//
// eLeDia Corporate Design — Brand-Konstanten als Single Source of Truth.
// Quelle: eLeDia_brand_colors.pptx (2026) + eLedia_Corporate_Design_Richtlinien.pptx.
//
// Verwendung:
// - PDF-Generator (agreements.ts) für AGB/AVV-Styling
// - Mail-Templates (email.ts) für Header/Footer-Farben
// - Shop-Frontend (shop.html) für Paket-Kacheln
// - Admin-UI (admin.html) — nutzt bereits diese Farben als CSS-Variablen
//
// Rationale: Bisher waren die Farben über mehrere HTML-Files (demo-portal.html,
// admin.html, plugin-detail.html) als CSS-Variablen verteilt. Für PDFs und
// Mails brauchen wir sie als TypeScript-Konstanten. Statt hardcoded Hex-Codes
// überall — ein File als SSOT.
export const BRAND = {
    // ── Core ────────────────────────────────────────────────────────────────
    // Default Typography + Background. Sollten ~80% des Contents dominieren.
    black: "#353535", // Default typography color
    white: "#ffffff", // Main background
    // ── Core Accent ("gibt der Brand Energie") ──────────────────────────────
    // Sparsam verwenden — für CTAs, Hover-States, Icons, Illustrations.
    lightBlue: "#65a1b3", // Active/Hover für Buttons + Links
    orange: "#f98012", // Shapes, Illustrations, Akzent-Elemente
    darkBlue: "#194866", // Titles (große Typographie), Normal-Buttons, Links
    // ── Core Soft ("Shapes oder Background Decorations") ────────────────────
    // Für Hintergründe, dezente Flächen, Info-Boxen.
    paleCoolGray: "#f3f5f8", // Primärer Soft-Background (wie das aktuelle --bg)
    lightGray: "#e9e9e9", // Borders, Trennlinien (--rule)
    paleOrange: "#ffecdb", // Warning-Info-Box-Background
    superLightBlue: "#a9cbd5", // Info-Box-Background
    // ── Secondary (Kategorien, Graphs, Illustrationen) ──────────────────────
    // Für Differenzierung: unterschiedliche Plugin-Kategorien, Chart-Serien.
    aqua: "#3aadaa", // eLeDia Aqua / Green-accent
    green: "#669933",
    lila: "#ab1d79", // Primary-Accent im aktuellen Admin-UI
    mediumGray: "#8a8a8e", // Sekundäre Typographie (--muted)
    // ── Semantic Mappings (für Entwickler-Klarheit) ─────────────────────────
    // Nicht separate Farben — nur Aliase mit semantischer Bedeutung.
    primary: "#ab1d79", // = lila — Primary CTA-Farbe
    primaryHover: "#540e3b", // Abgeleitetes Dunkellila (aus Admin-CSS --accent2)
    success: "#3aadaa", // = aqua
    warning: "#f98012", // = orange
    error: "#b91c1c", // Custom red (nicht aus Brand — aber DIN-konform)
    info: "#194866", // = darkBlue
    // ── Text-Hierarchie ────────────────────────────────────────────────────
    textPrimary: "#353535", // = black
    textSecondary: "#8a8a8e", // = mediumGray
    textMuted: "#6b6b6f", // Custom Zwischenton (aus Admin-CSS)
    // ── Backgrounds ────────────────────────────────────────────────────────
    bgPage: "#f3f5f8", // = paleCoolGray
    bgCard: "#ffffff", // = white
    bgHover: "#fafaf8", // Custom off-white Hover-State
};
/**
 * Typography-Defaults nach eLeDia-Richtlinien.
 * - Serif-Font wird für Überschriften + emotionale Akzente verwendet.
 * - Sans-Serif ist Body-Font (klarer, modern).
 *
 * Die Auswahl folgt dem bereits im Admin-UI verwendeten Pairing
 * (Fraunces Serif + Inter Sans) — erweiterbar falls eLeDia andere
 * Fonts lizenziert hat.
 */
export const BRAND_FONTS = {
    serif: `'Fraunces', 'Georgia', serif`, // Headlines, emotionale Texte
    sans: `'Inter', 'Helvetica', sans-serif`, // Body, UI
    mono: `'SF Mono', 'Menlo', monospace`, // Code, Pfade, IDs
};
/**
 * Logo-URLs (müssen beim nächsten Deploy als Assets vorliegen).
 * Wird von Mail-Templates referenziert.
 */
export const BRAND_ASSETS = {
    logoRunbot: "/eledia_runbot.png", // Bereits vorhanden in /webui
    logoEledia: "/eledia_logo.png", // TODO: beim nächsten Deploy ergänzen
    favicon: "/favicon.ico",
    partnerBadge: "/moodle-partner.png", // Bereits vorhanden
};
/**
 * Kontaktdaten für Footer + rechtliche Hinweise.
 */
export const BRAND_CONTACT = {
    companyName: "eLeDia GmbH",
    companyTagline: "eLearning im Dialog",
    address: {
        street: "Wilhelmsaue 37",
        zip: "10713",
        city: "Berlin",
        country: "Deutschland",
    },
    phone: "+49 30 50 56 10 -70",
    fax: "+49 30 50 59 08 60",
    emailGeneral: "info@eledia.de",
    emailSupport: "support@eledia.de",
    emailSales: "vertrieb@eledia.de",
    website: "https://eledia.de",
    imprint: "https://eledia.de/impressum/",
    privacy: "https://eledia.de/datenschutzerklaerung/",
    moodlePartner: true,
};
//# sourceMappingURL=brand.js.map