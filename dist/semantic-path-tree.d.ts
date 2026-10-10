import type { SemanticPathTree, SemanticPathTreeResult, SemanticProjection, SemanticProjectionSpec } from "./semantic-projection-model.js";
import type { MetamapProjection, MetamapProjectionSpec, ProjectionIssue } from "./projection.js";
import type { PathTreeCompilationResult } from "./path-tree.js";
export declare function semanticPathTreeDigest(tree: SemanticPathTree): string;
export declare function validateSemanticPathTree(value: unknown): {
    valid: boolean;
    issues: ProjectionIssue[];
};
export declare function parseSemanticPathTree(value: unknown): SemanticPathTree;
export declare function parseSemanticPathTreeJson(text: string): SemanticPathTree;
type LegacyTreeCompiler = (projection: MetamapProjection, spec: MetamapProjectionSpec) => PathTreeCompilationResult;
export declare function compileSemanticPathTree(projection: SemanticProjection, spec: SemanticProjectionSpec, legacy: LegacyTreeCompiler): SemanticPathTreeResult;
export {};
//# sourceMappingURL=semantic-path-tree.d.ts.map