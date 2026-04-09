import type { DemoRequest } from "../types.js";
export declare function sendConfirmationEmail(request: DemoRequest, pluginName: string): Promise<void>;
export declare function sendDemoReadyEmail(request: DemoRequest, pluginName: string, demoUrl: string): Promise<void>;
export declare function sendErrorEmail(request: DemoRequest, pluginName: string): Promise<void>;
//# sourceMappingURL=email.d.ts.map