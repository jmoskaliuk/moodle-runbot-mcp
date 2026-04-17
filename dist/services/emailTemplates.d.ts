export declare function confirmEmail(opts: {
    firstName: string;
    pluginName: string;
    confirmUrl: string;
}): {
    html: string;
    text: string;
};
export declare function readyEmail(opts: {
    firstName: string;
    pluginName: string;
    demoUrl: string;
}): {
    html: string;
    text: string;
};
/**
 * (1) Double-Opt-In-Mail nach dem Formular-Submit. Kunde muss den Link
 *     klicken, damit die Bestellung in ORDER_REVIEW übergeht.
 */
export declare function mailVerifyOrder(opts: {
    firstName: string;
    firma: string;
    configName: string;
    verifyUrl: string;
    expiresAt: string;
}): {
    html: string;
    text: string;
};
/**
 * (2) Order-Review-Mail. Geht raus, sobald der Kunde die Verify-Mail
 *     geklickt hat. Führt zurück auf die Review-Seite (AGB/AVV-Download,
 *     Confirm-Button) — als Backup, falls der Kunde den Browser-Tab
 *     zwischendurch schließt.
 */
export declare function mailOrderReview(opts: {
    firstName: string;
    firma: string;
    configName: string;
    reviewUrl: string;
    agbDownloadUrl: string;
    avvDownloadUrl: string;
}): {
    html: string;
    text: string;
};
/**
 * (3) Welcome-Mail nach erfolgreichem Provisioning. Enthält Moodle-URL,
 *     Admin-Login, Temp-Passwort + Link zum Change-Password-Dialog und
 *     optional einen Magic-Link zum Kunden-Dashboard.
 */
export declare function mailOrderConfirmed(opts: {
    firstName: string;
    firma: string;
    configName: string;
    subdomain: string;
    moodleUrl: string;
    adminUsername: string;
    adminPassword: string;
    changePasswordUrl: string;
    customerDashboardUrl?: string;
}): {
    html: string;
    text: string;
};
/**
 * (4) Admin-Alert an post@moskaliuk.com bei jeder neuen Bestellung.
 *     Dient im MVP als Odoo-Notify — Rechnung wird am nächsten Arbeitstag
 *     manuell in odoo erfasst.
 */
export declare function mailAdminAlertNewOrder(opts: {
    orderId: string;
    configName: string;
    contactEmail: string;
    contactPhone?: string;
    firma: string;
    billingStrasse: string;
    billingPlz: string;
    billingOrt: string;
    billingLand: string;
    ustId?: string;
    signerName: string;
    signerFunktion: string;
    signerEmail: string;
    subdomainWish: string;
    adminReviewUrl: string;
    notes?: string;
}): {
    html: string;
    text: string;
};
export declare function errorEmail(opts: {
    firstName: string;
    pluginName: string;
    retryUrl: string;
}): {
    html: string;
    text: string;
};
//# sourceMappingURL=emailTemplates.d.ts.map