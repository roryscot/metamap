import type { SssomSourceConfig } from "../config.js";
import type { AdapterContext, AdapterInput, AdapterResult, MetamapAdapter } from "./types.js";
/** Read-only local import; record metadata never creates a trusted approver. */
export declare class SssomTsvAdapter implements MetamapAdapter<SssomSourceConfig> {
    readonly id: "sssom-tsv";
    readonly version = "1.0.0";
    private inputs;
    fingerprint(config: SssomSourceConfig, context: AdapterContext): Promise<AdapterInput[]>;
    discover(value: SssomSourceConfig, context: AdapterContext): Promise<AdapterResult>;
}
//# sourceMappingURL=sssom-tsv.d.ts.map