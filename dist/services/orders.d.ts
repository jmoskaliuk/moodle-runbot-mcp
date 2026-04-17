export type OrderState = "DRAFT" | "PENDING_VERIFICATION" | "ORDER_REVIEW" | "CONFIRMED" | "PROVISIONING" | "LIVE" | "TERMINATED" | "VERIFY_EXPIRED" | "PROVISION_FAILED" | "REJECTED";
export interface BillingAddress {
    firma: string;
    strasse: string;
    plz: string;
    ort: string;
    land: string;
    ustId?: string;
}
export interface SignerInfo {
    name: string;
    funktion: string;
    email: string;
}
export interface AgreementRecord {
    type: "agb" | "avv";
    templateVersion: string;
    downloadedAt?: string;
    signedAt?: string;
    ipAddress?: string;
    userAgent?: string;
    pdfSha256?: string;
    pdfPath?: string;
}
export interface Order {
    id: string;
    state: OrderState;
    configId: string;
    createdAt: string;
    updatedAt: string;
    contact: {
        email: string;
        phone?: string;
    };
    billing: BillingAddress;
    signer: SignerInfo;
    subdomainWish: string;
    subdomainFinal?: string;
    verifyToken: string;
    verifyExpiresAt: string;
    verifiedAt?: string;
    agreements: AgreementRecord[];
    instanceId?: string;
    provisioningStartedAt?: string;
    provisioningFinishedAt?: string;
    provisioningError?: string;
    odooNotifySentAt?: string;
    odooOrderId?: string;
    customerMagicToken?: string;
    customerMagicExpiresAt?: string;
    notes?: string;
    history: OrderTransition[];
}
export interface OrderTransition {
    at: string;
    from: OrderState | null;
    to: OrderState;
    by: "system" | "admin" | "customer";
    reason?: string;
}
export interface CreateOrderInput {
    configId: string;
    contactEmail: string;
    contactPhone?: string;
    billing: BillingAddress;
    signer: SignerInfo;
    subdomainWish: string;
    notes?: string;
}
/**
 * Erstellt eine neue Order im State DRAFT, verschiebt sofort zu
 * PENDING_VERIFICATION und setzt den verifyToken. Die eigentliche
 * Verify-Mail wird vom Caller (index.ts /api/order-Handler) verschickt.
 */
export declare function createOrder(input: CreateOrderInput): Promise<Order>;
export declare function getOrder(id: string): Promise<Order | undefined>;
export declare function getOrderByVerifyToken(token: string): Promise<Order | undefined>;
export declare function listOrders(filter?: {
    state?: OrderState;
    configId?: string;
    since?: string;
}): Promise<Order[]>;
/**
 * Persistenz-Wrapper: transition + write-back.
 */
export declare function transitionOrder(id: string, to: OrderState, by: OrderTransition["by"], reason?: string): Promise<Order>;
/**
 * Markiert einen Verify-Link als benutzt — transitioned PENDING_VERIFICATION
 * → ORDER_REVIEW, setzt verifiedAt.
 */
export declare function verifyOrder(token: string, ipAddress?: string, userAgent?: string): Promise<Order>;
/**
 * Markiert ein Agreement (AGB oder AVV) als heruntergeladen. Muss vor dem
 * Confirm-Button-Klick passieren — das Frontend zeigt den Confirm-Button
 * erst, wenn beide Agreements `downloadedAt` haben.
 */
export declare function markAgreementDownloaded(orderId: string, type: "agb" | "avv", templateVersion: string, ipAddress?: string, userAgent?: string): Promise<Order>;
/**
 * Markiert ein Agreement als gesigned (Confirm-Button geklickt). Setzt
 * pdfSha256 + pdfPath für Audit-Trail.
 */
export declare function markAgreementSigned(orderId: string, type: "agb" | "avv", pdfPath: string, pdfSha256: string, ipAddress?: string, userAgent?: string): Promise<Order>;
/**
 * Prüft ob alle erforderlichen Agreements gesigned sind. Prärequisit für
 * die Transition ORDER_REVIEW → CONFIRMED.
 */
export declare function hasAllAgreementsSigned(order: Order): boolean;
/**
 * Setzt die Provisioning-Metadaten. Aufgerufen vom Provisioning-Job im
 * index.ts.
 */
export declare function setProvisioningInstance(orderId: string, instanceId: string): Promise<Order>;
export declare function setProvisioningFinished(orderId: string, subdomainFinal: string): Promise<Order>;
export declare function setProvisioningError(orderId: string, error: string): Promise<Order>;
/**
 * Markiert die Odoo-Notify-Mail als verschickt.
 */
export declare function markOdooNotifySent(orderId: string): Promise<Order>;
/**
 * Erzeugt einen Magic-Token für das Kunden-Dashboard (30d gültig).
 * Wird nach erfolgreichem Provisioning in der Welcome-Mail mit verschickt.
 */
export declare function issueCustomerMagicToken(orderId: string): Promise<{
    order: Order;
    token: string;
}>;
export declare function getOrderByCustomerMagicToken(token: string): Promise<Order | undefined>;
/**
 * Scant alle Orders nach abgelaufenen Verify-Tokens. Verschiebt diese
 * nach VERIFY_EXPIRED. Sollte stundlich via Scheduler aufgerufen werden
 * (analog cleanup.ts).
 */
export declare function expireStaleVerifyTokens(): Promise<number>;
//# sourceMappingURL=orders.d.ts.map