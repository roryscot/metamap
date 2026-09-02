import { type MetamapDocument } from "../model.js";
export interface LegacySourceOfTruthEntry {
    id: string;
    label: string;
    paths: string[];
    outputs: string[];
    updateSteps?: string;
    specDoc?: string;
    note?: string;
}
export interface LegacySourceOfTruthDocument {
    description?: string;
    sourcesOfTruth: LegacySourceOfTruthEntry[];
}
export interface LegacyAdapterWarning {
    code: "LEGACY_MULTIPLE_SOURCES" | "LEGACY_AMBIGUOUS_PATH" | "LEGACY_PATH_PATTERN";
    message: string;
    entryId: string;
    value?: string;
}
export interface LegacyAdapterOptions {
    namespace?: string;
    repository?: string;
    documentId?: string;
    label?: string;
}
export interface LegacyAdapterResult {
    document: MetamapDocument;
    warnings: LegacyAdapterWarning[];
}
/**
 * Import the current concept -> paths -> outputs catalog without pretending
 * that every listed path is already an unambiguous canonical authority.
 */
export declare function adaptLegacySourcesOfTruth(legacy: LegacySourceOfTruthDocument, options?: LegacyAdapterOptions): LegacyAdapterResult;
export declare function isLegacySourceOfTruthDocument(value: unknown): value is LegacySourceOfTruthDocument;
//# sourceMappingURL=source-of-truth.d.ts.map