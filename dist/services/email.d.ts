import type { DemoRequest } from "../types.js";
import type { Order } from "./orders.js";
export declare function sendConfirmationEmail(request: DemoRequest, pluginName: string): Promise<void>;
export declare function sendDemoReadyEmail(request: DemoRequest, pluginName: string, demoUrl: string): Promise<void>;
/** (1) Double-Opt-In nach Formular-Submit. */
export declare function sendVerifyOrderEmail(order: Order, configName: string): Promise<void>;
/** (2) Nach Verify-Klick: Review-Seite mit AGB/AVV-Download. */
export declare function sendOrderReviewEmail(order: Order, configName: string): Promise<void>;
/** (3) Welcome-Mail nach Provisioning. */
export declare function sendOrderConfirmedEmail(order: Order, configName: string, opts: {
    moodleUrl: string;
    subdomain: string;
    adminUsername: string;
    adminPassword: string;
    changePasswordUrl: string;
    customerDashboardUrl?: string;
}): Promise<void>;
/** (4) Admin-Alert an post@moskaliuk.com (Odoo-Notify im MVP). */
export declare function sendAdminAlertNewOrderEmail(order: Order, configName: string): Promise<void>;
export declare function sendErrorEmail(request: DemoRequest, pluginName: string): Promise<void>;
//# sourceMappingURL=email.d.ts.map