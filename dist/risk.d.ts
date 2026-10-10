import type { DerivationIssue } from "./derivation-model.js";
import type { MetamapDocument } from "./model.js";
import type { ConsumerRiskBudget, SemanticGeneration } from "./semantic-model.js";
import type { ProjectionRiskSummary, SemanticProjectionSpec } from "./semantic-projection-model.js";
/** Budget rules use the same selectors as viability declarations. */
export declare function consumerBudgetIssues(graph: MetamapDocument, budgets: readonly ConsumerRiskBudget[]): DerivationIssue[];
/** Account over the checked unique projection closure; costs are policy values. */
export declare function evaluateConsumerRisk(graph: MetamapDocument, generation: SemanticGeneration, spec: SemanticProjectionSpec, usedMappings: readonly string[]): {
    risk: ProjectionRiskSummary;
    issues: DerivationIssue[];
};
//# sourceMappingURL=risk.d.ts.map