import type { PrismaSourceConfig } from "../config.js";
import type { AdapterContext, AdapterResult, MetamapAdapter } from "./types.js";
export declare class PrismaAdapter implements MetamapAdapter<PrismaSourceConfig> {
    readonly id: "prisma";
    readonly version = "1.0.0";
    fingerprint(config: PrismaSourceConfig, context: AdapterContext): Promise<AdapterResult["inputs"]>;
    discover(config: PrismaSourceConfig, context: AdapterContext): Promise<AdapterResult>;
}
//# sourceMappingURL=prisma.d.ts.map