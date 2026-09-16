import { type MetamapProjection, type MetamapProjectionSpec, type PathTreeDelimiter, type ProjectedEntity, type ProjectionIssue } from "./projection.js";
export declare const METAMAP_PATH_TREE_VERSION: "1.0.0";
export interface PathTreeOccupant {
    id: string;
    kind: string;
    label?: string;
    slots: Record<string, ProjectedEntity | ProjectedEntity[] | null>;
}
export interface PathTreeNode {
    _: string;
    $?: PathTreeOccupant;
    [segment: string]: PathTreeNode | PathTreeOccupant | string | undefined;
}
export interface MetamapPathTree {
    $schema?: string;
    schemaVersion: typeof METAMAP_PATH_TREE_VERSION;
    id: string;
    digest: string;
    projection: {
        id: string;
        digest: string;
    };
    spec: {
        id: string;
        digest: string;
    };
    attribute: string;
    delimiter: PathTreeDelimiter;
    params: string[];
    tree: PathTreeNode;
}
export type PathTreeCompilationResult = {
    status: "projected";
    pathTree: MetamapPathTree;
    issues: ProjectionIssue[];
} | {
    status: "rejected";
    issues: ProjectionIssue[];
};
/**
 * Compile a nested path tree from a viable static projection. Paths are facts
 * owned by the selected subjects; the compiler never infers them from labels
 * or identities.
 */
export declare function compilePathTree(projection: MetamapProjection, spec: MetamapProjectionSpec): PathTreeCompilationResult;
export declare function validatePathTree(value: unknown): {
    valid: boolean;
    issues: ProjectionIssue[];
};
export declare function parsePathTree(value: unknown): MetamapPathTree;
/**
 * Replace `:param`, `*param`, and optional `*param?` tokens in `_` path
 * templates. Child keys and `$` occupants stay immutable. The input tree is
 * not mutated.
 */
export declare function hydratePathTree<T extends PathTreeNode>(tree: T, params: Record<string, string>, options?: {
    delimiter?: PathTreeDelimiter;
    requiredParams?: readonly string[];
}): T;
/** Emit a dependency-free nested path tree with a hydrate helper. */
export declare function emitTypeScriptPathTree(pathTree: MetamapPathTree, options?: {
    exportName?: string;
}): string;
//# sourceMappingURL=path-tree.d.ts.map