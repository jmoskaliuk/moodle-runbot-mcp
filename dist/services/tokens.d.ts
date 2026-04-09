import type { DemoRequest } from "../types.js";
export declare function generateToken(): string;
export declare function createRequest(email: string, name: string, configId: string): Promise<DemoRequest>;
export declare function getRequest(token: string): Promise<DemoRequest | undefined>;
export declare function confirmRequest(token: string): Promise<DemoRequest | null>;
export declare function markStarted(token: string, instanceId: string): Promise<void>;
export declare function listRequests(): Promise<DemoRequest[]>;
export declare function cleanupExpired(): Promise<number>;
//# sourceMappingURL=tokens.d.ts.map