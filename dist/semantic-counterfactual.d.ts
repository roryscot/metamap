import { type ReplayValidationResult } from "./replay.js";
import type { SemanticCounterfactualReport, SemanticCounterfactualResult, SourceCounterfactualReport, SourceCounterfactualResult } from "./semantic-counterfactual-model.js";
export declare function semanticCounterfactualDigest(report: SemanticCounterfactualReport | SourceCounterfactualReport): string;
export declare function validateSemanticCounterfactualReport(value: unknown): ReplayValidationResult;
export declare function validateSourceCounterfactualReport(value: unknown): ReplayValidationResult;
export declare function parseSemanticCounterfactualReport(value: unknown): SemanticCounterfactualReport;
export declare function parseSemanticCounterfactualJson(text: string): SemanticCounterfactualReport;
export declare function parseSourceCounterfactualReport(value: unknown): SourceCounterfactualReport;
export declare function parseSourceCounterfactualJson(text: string): SourceCounterfactualReport;
/** Reproduces both inputs before explaining their differences; never activates. */
export declare function compareSemanticMetamapBundles(beforeValue: unknown, afterValue: unknown): SemanticCounterfactualResult | SourceCounterfactualResult;
//# sourceMappingURL=semantic-counterfactual.d.ts.map