import type { JsonObject } from "./model.js";
import type { SourceReplayBundle } from "./semantic-replay-model.js";
export declare const SCIENTIFIC_CRATE_PROFILE = "https://raw.githubusercontent.com/roryscot/metamap/main/schemas/metamap-scientific-crate-profile.schema.json";
export interface ScientificCrateOptions {
    name: string;
    description: string;
    datePublished: string;
    /** One exploratory consumer, no authorization or activation implied. */
    consumer: string;
    environment: string;
    /** Exact receipt input paths mapped to raw UTF-8 bytes. Missing inputs stay references. */
    rawInputs: Record<string, string>;
    externalOriginal?: {
        uri: string;
        name: string;
        description: string;
    };
}
export interface ScientificCrate {
    metadata: JsonObject;
    files: Record<string, string>;
}
/** Pure, bounded RO-Crate 1.2 export over existing checked replay/artifact contracts. */
export declare function createScientificCrate(replay: SourceReplayBundle, options: ScientificCrateOptions): ScientificCrate;
/** Checks this closed profile and recomputes every native output and payload hash; no I/O. */
export declare function verifyScientificCrate(value: ScientificCrate): {
    status: "verified";
    files: number;
    externalRawInputs: number;
};
//# sourceMappingURL=scientific-crate.d.ts.map