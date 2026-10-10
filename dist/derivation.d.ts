import { type CorrespondenceCompositionRequest, type CorrespondenceCompositionResult, type CorrespondenceDerivation, type DerivationBounds, type DerivationIssue } from "./derivation-model.js";
import type { MetamapDocument } from "./model.js";
import { RelationRegistry } from "./relations.js";
import type { EvaluationContext } from "./viability-model.js";
import { type UncertaintyInputs } from "./uncertainty.js";
export declare function derivationDigest(value: CorrespondenceDerivation): string;
export declare function parseCorrespondenceDerivation(value: unknown): CorrespondenceDerivation;
export declare function parseCompositionRequest(value: unknown): CorrespondenceCompositionRequest;
export declare function parseCompositionResult(value: unknown): CorrespondenceCompositionResult;
export declare function parseCompositionRequestJson(text: string): CorrespondenceCompositionRequest;
type FailureStatus = "rejected" | "unsupported" | "unknown" | "incomplete";
/** Read-only proposal. It grants no authority and does not mutate the graph. */
export declare function composeCorrespondences(graph: MetamapDocument, request: CorrespondenceCompositionRequest, registry?: RelationRegistry): CorrespondenceCompositionResult;
export interface DerivationValidationResult {
    status: "valid" | FailureStatus;
    issues: DerivationIssue[];
    checked: CorrespondenceDerivation[];
}
/** Check every supplied claim and every graph proof reference, without admission. */
export declare function validateCorrespondenceDerivations(graph: MetamapDocument, derivations: readonly CorrespondenceDerivation[], context: EvaluationContext, bounds: DerivationBounds, registry?: RelationRegistry, uncertainty?: UncertaintyInputs): DerivationValidationResult;
/** Profile conflicts apply to active facts, not to the graph's possibilities. */
export declare function executableRelationConflictIssues(graph: MetamapDocument, active: ReadonlySet<string>, registry: RelationRegistry): DerivationIssue[];
export {};
//# sourceMappingURL=derivation.d.ts.map