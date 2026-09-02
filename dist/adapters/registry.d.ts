import type { MetamapSourceConfig } from "../config.js";
import type { AdapterInput, AdapterResult, MetamapAdapter } from "./types.js";
/** Runtime registry for built-in and consumer-supplied source adapters. */
export declare class AdapterRegistry {
    private readonly adapters;
    register<TConfig extends MetamapSourceConfig>(adapter: MetamapAdapter<TConfig>): this;
    get(id: string): MetamapAdapter<MetamapSourceConfig> | undefined;
    require(id: string): MetamapAdapter<MetamapSourceConfig>;
    ids(): string[];
}
/** A fresh registry prevents state leakage between independent workspaces. */
export declare function createDefaultAdapterRegistry(): AdapterRegistry;
export type { AdapterInput, AdapterResult };
//# sourceMappingURL=registry.d.ts.map