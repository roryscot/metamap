import type { JsonObject, JsonValue } from "./model.js";
export declare const SSSOM_FORMAT_VERSION: "1.0.0";
export declare const SSSOM_ENTITY_PROFILE: "sssom-1.0-entity-tsv";
/** Loss-preserving raw metadata and decoded TSV cell strings, not checked truth. */
export interface SssomDocument {
    schemaVersion: typeof SSSOM_FORMAT_VERSION;
    profile: typeof SSSOM_ENTITY_PROFILE;
    metadata: JsonObject;
    columns: string[];
    rows: string[][];
}
export interface SssomRecord {
    raw: Record<string, string>;
    fields: JsonObject;
    origins: Record<string, "record" | "set">;
    expanded: Record<string, string | string[]>;
}
export interface SssomInterpretation {
    metadata: JsonObject;
    prefixes: Record<string, string>;
    extensions: Array<{
        name: string;
        property: string;
        type: string;
    }>;
    propagation: Array<{
        slot: string;
        status: "propagated" | "blocked-by-record-value";
        value: JsonValue;
    }>;
    records: SssomRecord[];
}
export interface SssomExportResult {
    text: string;
    loss: {
        profile: typeof SSSOM_ENTITY_PROFILE;
        semanticFieldsPreserved: true;
        byteIdentityPreserved: false;
        droppedFields: [];
        condensedSlots: string[];
        normalization: string[];
    };
}
//# sourceMappingURL=sssom-model.d.ts.map