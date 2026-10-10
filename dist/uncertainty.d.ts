import { type ContentBinding, type CorrespondenceDerivation, type DerivationIssue, type DerivationUncertainty, type UncertaintyDimension } from "./derivation-model.js";
import type { MetamapDocument, StructuralMapping } from "./model.js";
import type { UncertaintyAssessment, UncertaintyRequirement } from "./semantic-model.js";
import type { EvidenceRecord } from "./viability-model.js";
export interface UncertaintyInputs {
    assessments: readonly UncertaintyAssessment[];
    evidence: readonly EvidenceRecord[];
}
export declare const emptyUncertaintyInputs: UncertaintyInputs;
/** Checks recorded claims and their scope; it does not authenticate evidence. */
export declare function validateUncertaintyInputs(graph: MetamapDocument, inputs: UncertaintyInputs, prospectiveSubject?: string, proofIds?: readonly string[]): DerivationIssue[];
export declare function unknownDimension(dimension: UncertaintyDimension): DerivationUncertainty;
/** A qualitative meet, never an arithmetic confidence combination. */
export declare function combineUncertainty(dimension: UncertaintyDimension, values: readonly DerivationUncertainty[]): DerivationUncertainty;
export declare function mappingUncertainty(graph: MetamapDocument, mapping: StructuralMapping, inputs: UncertaintyInputs, premises?: readonly (readonly DerivationUncertainty[])[]): DerivationUncertainty[];
export declare function uncertaintyDependencies(summary: readonly DerivationUncertainty[], inputs: UncertaintyInputs): ContentBinding[];
export declare function graphUncertainty(graph: MetamapDocument, proofs: readonly CorrespondenceDerivation[], inputs: UncertaintyInputs): Array<{
    mapping: string;
    dimensions: DerivationUncertainty[];
}>;
/** Checks internal completeness only; record truth needs the bound original inputs. */
export declare function uncertaintySummaryIssues(summaries: ReturnType<typeof graphUncertainty>): DerivationIssue[];
export declare function uncertaintyRequirementIssues(graph: MetamapDocument, active: ReadonlySet<string>, summaries: ReturnType<typeof graphUncertainty>, requirements: readonly UncertaintyRequirement[], inputs: UncertaintyInputs): DerivationIssue[];
//# sourceMappingURL=uncertainty.d.ts.map