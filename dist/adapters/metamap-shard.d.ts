import type { MetamapShardSourceConfig } from "../config.js";
import type { AdapterContext, AdapterResult, MetamapAdapter } from "./types.js";
/**
 * Imports a portable Metamap graph shard emitted by any language or service.
 * Semantic relation validation is intentionally deferred to the composed
 * workspace, whose registry contains all configured relation packs.
 */
export declare class MetamapShardAdapter implements MetamapAdapter<MetamapShardSourceConfig> {
    readonly id: "metamap-shard";
    readonly version = "1.0.0";
    fingerprint(config: MetamapShardSourceConfig, context: AdapterContext): Promise<AdapterResult["inputs"]>;
    discover(config: MetamapShardSourceConfig, context: AdapterContext): Promise<AdapterResult>;
}
//# sourceMappingURL=metamap-shard.d.ts.map