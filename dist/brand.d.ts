export declare const BRAND: {
    readonly black: "#353535";
    readonly white: "#ffffff";
    readonly lightBlue: "#65a1b3";
    readonly orange: "#f98012";
    readonly darkBlue: "#194866";
    readonly paleCoolGray: "#f3f5f8";
    readonly lightGray: "#e9e9e9";
    readonly paleOrange: "#ffecdb";
    readonly superLightBlue: "#a9cbd5";
    readonly aqua: "#3aadaa";
    readonly green: "#669933";
    readonly lila: "#ab1d79";
    readonly mediumGray: "#8a8a8e";
    readonly primary: "#ab1d79";
    readonly primaryHover: "#540e3b";
    readonly success: "#3aadaa";
    readonly warning: "#f98012";
    readonly error: "#b91c1c";
    readonly info: "#194866";
    readonly textPrimary: "#353535";
    readonly textSecondary: "#8a8a8e";
    readonly textMuted: "#6b6b6f";
    readonly bgPage: "#f3f5f8";
    readonly bgCard: "#ffffff";
    readonly bgHover: "#fafaf8";
};
export type BrandColor = keyof typeof BRAND;
/**
 * Typography-Defaults nach eLeDia-Richtlinien.
 * - Serif-Font wird für Überschriften + emotionale Akzente verwendet.
 * - Sans-Serif ist Body-Font (klarer, modern).
 *
 * Die Auswahl folgt dem bereits im Admin-UI verwendeten Pairing
 * (Fraunces Serif + Inter Sans) — erweiterbar falls eLeDia andere
 * Fonts lizenziert hat.
 */
export declare const BRAND_FONTS: {
    readonly serif: "'Fraunces', 'Georgia', serif";
    readonly sans: "'Inter', 'Helvetica', sans-serif";
    readonly mono: "'SF Mono', 'Menlo', monospace";
};
/**
 * Logo-URLs (müssen beim nächsten Deploy als Assets vorliegen).
 * Wird von Mail-Templates referenziert.
 */
export declare const BRAND_ASSETS: {
    readonly logoRunbot: "/eledia_runbot.png";
    readonly logoEledia: "/eledia_logo.png";
    readonly favicon: "/favicon.ico";
    readonly partnerBadge: "/moodle-partner.png";
};
/**
 * Kontaktdaten für Footer + rechtliche Hinweise.
 */
export declare const BRAND_CONTACT: {
    readonly companyName: "eLeDia GmbH";
    readonly companyTagline: "eLearning im Dialog";
    readonly address: {
        readonly street: "Wilhelmsaue 37";
        readonly zip: "10713";
        readonly city: "Berlin";
        readonly country: "Deutschland";
    };
    readonly phone: "+49 30 50 56 10 -70";
    readonly fax: "+49 30 50 59 08 60";
    readonly emailGeneral: "info@eledia.de";
    readonly emailSupport: "support@eledia.de";
    readonly emailSales: "vertrieb@eledia.de";
    readonly website: "https://eledia.de";
    readonly imprint: "https://eledia.de/impressum/";
    readonly privacy: "https://eledia.de/datenschutzerklaerung/";
    readonly moodlePartner: true;
};
//# sourceMappingURL=brand.d.ts.map