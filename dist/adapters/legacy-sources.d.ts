import type { LegacySourcesConfig } from "../config.js";
import type { AdapterContext, AdapterResult, MetamapAdapter } from "./types.js";
export declare class LegacySourcesAdapter implements MetamapAdapter<LegacySourcesConfig> {
    readonly id: "legacy-sources";
    readonly version = "1.0.0";
    fingerprint(config: LegacySourcesConfig, context: AdapterContext): Promise<AdapterResult["inputs"]>;
    discover(config: LegacySourcesConfig, context: AdapterContext): Promise<AdapterResult>;
}
//# sourceMappingURL=legacy-sources.d.ts.map