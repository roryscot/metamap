import type { JsonCollectionsSourceConfig } from "../config.js";
import type { AdapterContext, AdapterResult, MetamapAdapter } from "./types.js";
export declare class JsonCollectionsAdapter implements MetamapAdapter<JsonCollectionsSourceConfig> {
    readonly id: "json-collections";
    readonly version = "1.0.0";
    fingerprint(config: JsonCollectionsSourceConfig, context: AdapterContext): Promise<AdapterResult["inputs"]>;
    discover(config: JsonCollectionsSourceConfig, context: AdapterContext): Promise<AdapterResult>;
}
//# sourceMappingURL=json-collections.d.ts.map