import type { MetamapDocument } from "./model.js";
import type { SemanticGeneration } from "./semantic-model.js";
import type { SemanticProjection, SemanticProjectionResult, SemanticProjectionSpec } from "./semantic-projection-model.js";
import type { MetamapProjectionSpec, ProjectionCompilationResult, ProjectionCompileOptions, ProjectionIssue } from "./projection.js";
import type { ViableGeneration } from "./viability-model.js";
export declare function legacyProjectionSpecView(spec: SemanticProjectionSpec): MetamapProjectionSpec;
export declare function parseSemanticProjectionSpec(value: unknown): SemanticProjectionSpec;
export declare function parseSemanticProjectionSpecJson(text: string): SemanticProjectionSpec;
export declare function semanticProjectionDigest(projection: SemanticProjection): string;
export declare function validateSemanticProjection(value: unknown): {
    valid: boolean;
    issues: ProjectionIssue[];
};
export declare function parseSemanticProjection(value: unknown): SemanticProjection;
export declare function parseSemanticProjectionJson(text: string): SemanticProjection;
type LegacyProjector = (graph: MetamapDocument, generation: ViableGeneration, spec: MetamapProjectionSpec, options: ProjectionCompileOptions) => ProjectionCompilationResult;
/** Preserve the existing selection algorithm; validate and bind new semantics. */
export declare function compileSemanticProjection(graph: MetamapDocument, generation: SemanticGeneration, spec: SemanticProjectionSpec, options: ProjectionCompileOptions, legacy: LegacyProjector): SemanticProjectionResult;
export {};
//# sourceMappingURL=semantic-projection.d.ts.map