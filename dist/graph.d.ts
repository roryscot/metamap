import { type AuthorityResolution, type MetamapDocument, type MetamapEntity, type StructuralMapping, type TraversalOptions, type TraversalVisit, type ValidationIssue } from "./model.js";
import { RelationRegistry } from "./relations.js";
export declare class MetamapValidationError extends Error {
    readonly issues: ValidationIssue[];
    constructor(issues: ValidationIssue[]);
}
export interface MetamapGraphOptions {
    registry?: RelationRegistry;
    validate?: boolean;
}
/** Indexed, immutable query view over a language-neutral metamap document. */
export declare class MetamapGraph {
    readonly document: MetamapDocument;
    readonly registry: RelationRegistry;
    readonly validationIssues: ValidationIssue[];
    private readonly entitiesById;
    private readonly mappingsById;
    private readonly mappingsByEntity;
    private readonly authoritiesByConcept;
    private readonly delegationsByParent;
    constructor(document: MetamapDocument, options?: MetamapGraphOptions);
    static from(value: unknown, options?: MetamapGraphOptions): MetamapGraph;
    getEntity(id: string): MetamapEntity | undefined;
    getMapping(id: string): StructuralMapping | undefined;
    mappingsFor(entityId: string, options?: Pick<TraversalOptions, "direction" | "relations">): StructuralMapping[];
    neighbors(entityId: string, options?: Pick<TraversalOptions, "direction" | "relations">): Array<{
        entity: MetamapEntity;
        mapping: StructuralMapping;
    }>;
    trace(entityId: string, options?: TraversalOptions): TraversalVisit[];
    resolveAuthority(conceptId: string, fact: string): AuthorityResolution;
    private linkedEntityIds;
}
//# sourceMappingURL=graph.d.ts.map