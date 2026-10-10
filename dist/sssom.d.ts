import type { SssomSourceConfig } from "./config.js";
import { type SssomDocument, type SssomExportResult, type SssomInterpretation } from "./sssom-model.js";
export declare const SSSOM_MAX_BYTES: number;
export declare const SSSOM_BUILTIN_PREFIXES: Readonly<Record<string, string>>;
export declare const SSSOM_PROPAGATABLE_SLOTS: readonly string[];
export declare class SssomError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare function expandSssomCurie(value: string, prefixes: Readonly<Record<string, string>>): string;
export declare function parseSssomDocument(value: unknown): SssomDocument;
export declare function interpretSssomDocument(value: unknown): SssomInterpretation;
export declare function parseSssomTsv(input: string | Uint8Array, externalMetadata?: string | Uint8Array): SssomDocument;
export declare function parseSssomSourceConfig(value: unknown): SssomSourceConfig;
export declare function exportSssomTsv(value: unknown, options?: {
    condense?: boolean;
}): SssomExportResult;
//# sourceMappingURL=sssom.d.ts.map