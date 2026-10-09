import { type ReplayValidationResult } from "./replay.js";
import type { SemanticCounterfactualReport, SemanticCounterfactualResult } from "./semantic-counterfactual-model.js";
export declare function semanticCounterfactualDigest(report: SemanticCounterfactualReport): string;
export declare function validateSemanticCounterfactualReport(value: unknown): ReplayValidationResult;
export declare function parseSemanticCounterfactualReport(value: unknown): SemanticCounterfactualReport;
export declare function parseSemanticCounterfactualJson(text: string): SemanticCounterfactualReport;
/** Reproduces both inputs before explaining their differences; never activates. */
export declare function compareSemanticMetamapBundles(beforeValue: unknown, afterValue: unknown): SemanticCounterfactualResult;
//# sourceMappingURL=semantic-counterfactual.d.ts.map