import { MetamapGraph } from "./graph.js";
import type { MetamapDocument } from "./model.js";
import type { EvidenceRecord, ViabilityConstraint, ViabilityIssue } from "./viability-model.js";
export interface ConstraintEvaluationContext {
    document: MetamapDocument;
    graph: MetamapGraph;
    activeMappings: ReadonlySet<string>;
    evidence: readonly EvidenceRecord[];
}
export type ConstraintEvaluator = (constraint: ViabilityConstraint, context: ConstraintEvaluationContext) => ViabilityIssue[];
export declare class ConstraintRegistry {
    private readonly evaluators;
    constructor();
    register(kind: string, evaluator: ConstraintEvaluator): void;
    get(kind: string): ConstraintEvaluator | undefined;
}
//# sourceMappingURL=constraints.d.ts.map