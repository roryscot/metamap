import type { JsonObject, Locator, MetamapDocument } from "./model.js";
import { RelationRegistry } from "./relations.js";
import type { ViableGeneration } from "./viability-model.js";
export declare const METAMAP_PROJECTION_SPEC_VERSION: "1.0.0";
export declare const METAMAP_PROJECTION_VERSION: "1.0.0";
export type ProjectionDirection = "outgoing" | "incoming";
export type ProjectionCardinality = "exactly-one" | "zero-or-one" | "one-or-more" | "many";
export interface ProjectionSelection {
    ids?: string[];
    kinds?: string[];
}
export interface ProjectionSlotSpec {
    name: string;
    relation: string;
    direction: ProjectionDirection;
    cardinality: ProjectionCardinality;
    targetKinds?: string[];
    /** Lossy structural mappings are rejected by default for runtime linkage. */
    allowLossy?: boolean;
}
/**
 * A portable request for a static view over one viable graph generation.
 * Selection fields intersect when both ids and kinds are supplied.
 */
export interface MetamapProjectionSpec {
    $schema?: string;
    schemaVersion: typeof METAMAP_PROJECTION_SPEC_VERSION;
    id: string;
    select: ProjectionSelection;
    slots: ProjectionSlotSpec[];
    metadata?: JsonObject;
}
export interface ProjectedEntity {
    id: string;
    kind: string;
    label?: string;
    schema?: string;
    locators?: Locator[];
    attributes?: JsonObject;
}
export interface ProjectedSlot {
    name: string;
    relation: string;
    direction: ProjectionDirection;
    cardinality: ProjectionCardinality;
    mappings: string[];
    targets: ProjectedEntity[];
}
export interface ProjectedEntry {
    subject: ProjectedEntity;
    slots: ProjectedSlot[];
}
export interface MetamapProjection {
    $schema?: string;
    schemaVersion: typeof METAMAP_PROJECTION_VERSION;
    id: string;
    digest: string;
    generation: {
        id: string;
        digest: string;
    };
    graph: {
        id: string;
        digest: string;
    };
    spec: {
        id: string;
        digest: string;
    };
    entries: ProjectedEntry[];
}
export interface ProjectionIssue {
    severity: "error";
    code: string;
    message: string;
    subjectId?: string;
    slot?: string;
    path?: string;
}
export type ProjectionCompilationResult = {
    status: "projected";
    projection: MetamapProjection;
    issues: ProjectionIssue[];
} | {
    status: "rejected";
    issues: ProjectionIssue[];
};
export interface ProjectionCompileOptions {
    relationRegistry?: RelationRegistry;
}
export interface TypeScriptProjectionOptions {
    exportName?: string;
}
export declare function validateProjectionSpec(value: unknown): {
    valid: boolean;
    issues: ProjectionIssue[];
};
export declare function parseProjectionSpec(value: unknown): MetamapProjectionSpec;
/** Validate both the portable projection shape and its content address. */
export declare function validateProjection(value: unknown): {
    valid: boolean;
    issues: ProjectionIssue[];
};
export declare function parseProjection(value: unknown): MetamapProjection;
/**
 * Resolve a declarative static projection against exactly one viable
 * generation. Stale generations, inactive links, ambiguity, missing required
 * slots, kind mismatches, and undeclared relations fail closed.
 */
export declare function compileProjection(document: MetamapDocument, generation: ViableGeneration, spec: MetamapProjectionSpec, options?: ProjectionCompileOptions): ProjectionCompilationResult;
/** Emit a dependency-free, immutable TypeScript lookup table. */
export declare function emitTypeScriptProjection(projection: MetamapProjection, options?: TypeScriptProjectionOptions): string;
//# sourceMappingURL=projection.d.ts.map