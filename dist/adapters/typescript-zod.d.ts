import type { TypeScriptZodSourceConfig } from "../config.js";
import type { AdapterContext, AdapterInput, AdapterResult, MetamapAdapter } from "./types.js";
export declare class TypeScriptZodAdapter implements MetamapAdapter<TypeScriptZodSourceConfig> {
    readonly id: "typescript-zod";
    readonly version = "1.0.0";
    fingerprint(config: TypeScriptZodSourceConfig, context: AdapterContext): Promise<AdapterInput[]>;
    discover(config: TypeScriptZodSourceConfig, context: AdapterContext): Promise<AdapterResult>;
}
//# sourceMappingURL=typescript-zod.d.ts.map