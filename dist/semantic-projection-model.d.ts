import type { ContentBinding, DerivationUncertainty } from "./derivation-model.js";
import type { MappingDependency } from "./semantic-model.js";
import type { MetamapProjection, MetamapProjectionSpec, ProjectionCompilationResult } from "./projection.js";
import type { MetamapPathTree, PathTreeCompilationResult } from "./path-tree.js";
export interface SemanticProjectionSpec extends Omit<MetamapProjectionSpec, "schemaVersion"> {
    schemaVersion: "2.0.0";
    consumer: string;
    budget: string | null;
}
export interface ProjectionRiskSummary {
    status: "not-evaluated" | "evaluated";
    budget: ContentBinding | null;
    classifications: Array<{
        mapping: string;
        classification: string;
        cost: number;
    }>;
    totalCost: number | null;
    lossyMappings: string[];
    inferredMappings: string[];
    uncertainty: Array<{
        mapping: string;
        dimensions: DerivationUncertainty[];
    }>;
}
export interface SemanticProjection extends Omit<MetamapProjection, "schemaVersion"> {
    schemaVersion: "2.0.0";
    semantic: {
        consumer: string;
        usedMappings: string[];
        dependencies: MappingDependency[];
        derivations: ContentBinding[];
        risk: ProjectionRiskSummary;
    };
}
export type SemanticProjectionResult = (Omit<Extract<ProjectionCompilationResult, {
    status: "projected";
}>, "projection"> & {
    projection: SemanticProjection;
}) | Extract<ProjectionCompilationResult, {
    status: "rejected";
}>;
export interface SemanticPathTree extends Omit<MetamapPathTree, "schemaVersion"> {
    schemaVersion: "2.0.0";
}
export type SemanticPathTreeResult = (Omit<Extract<PathTreeCompilationResult, {
    status: "projected";
}>, "pathTree"> & {
    pathTree: SemanticPathTree;
}) | Extract<PathTreeCompilationResult, {
    status: "rejected";
}>;
//# sourceMappingURL=semantic-projection-model.d.ts.map