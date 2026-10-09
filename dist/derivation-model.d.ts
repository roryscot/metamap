import type { StructuralMapping } from "./model.js";
import type { EvaluationContext } from "./viability-model.js";
import type { EvidenceRecord } from "./viability-model.js";
import type { UncertaintyAssessment } from "./semantic-model.js";
export declare const METAMAP_DERIVATION_VERSION: "1.0.0";
export declare const DERIVATION_ATTRIBUTE: "metamap:derivation";
export declare const UNCERTAINTY_DIMENSIONS: readonly ["identity", "context", "provenance", "completeness", "causal-relevance", "conflicting-authority"];
export type UncertaintyDimension = (typeof UNCERTAINTY_DIMENSIONS)[number];
export type UncertaintyStatus = "supported" | "contradicted" | "unknown" | "not-applicable";
export interface ContentBinding {
    id: string;
    digest: string;
}
export interface PackContentBinding extends ContentBinding {
    version: string;
}
export interface DerivationPremise {
    mapping: string;
    digest: string;
    derivation?: ContentBinding;
}
export interface DerivationUncertainty {
    dimension: UncertaintyDimension;
    status: UncertaintyStatus;
    evidence: string[];
    assessments: string[];
    measurementModels: string[];
    sourceRevisions: string[];
}
export interface CorrespondenceDerivation {
    $schema?: string;
    schemaVersion: typeof METAMAP_DERIVATION_VERSION;
    id: string;
    digest: string;
    interpretation: "declared-law-application";
    rule: {
        id: string;
        pack: PackContentBinding;
        imports: PackContentBinding[];
    };
    premises: DerivationPremise[];
    /** The mapping value before adding its own proof back-reference. */
    result: StructuralMapping;
    context: EvaluationContext;
    contextDigest: string;
    dependencies: ContentBinding[];
    depth: number;
    derivationCount: number;
    uncertainty: DerivationUncertainty[];
}
export interface DerivationBounds {
    maxDepth: number;
    maxDerivations: number;
}
export interface CorrespondenceCompositionRequest {
    schemaVersion: "1.0.0";
    law: string;
    premises: string[];
    context: EvaluationContext;
    bounds: DerivationBounds;
    resultId?: string;
    derivations: CorrespondenceDerivation[];
    assessments: UncertaintyAssessment[];
    evidence: EvidenceRecord[];
}
export interface DerivationIssue {
    code: string;
    message: string;
    subjectId?: string;
    path?: string;
}
export type CorrespondenceCompositionResult = {
    schemaVersion: "1.0.0";
    status: "proposed";
    mapping: StructuralMapping;
    derivation: CorrespondenceDerivation;
    issues: DerivationIssue[];
} | {
    schemaVersion: "1.0.0";
    status: "rejected" | "unsupported" | "unknown" | "incomplete";
    issues: DerivationIssue[];
};
//# sourceMappingURL=derivation-model.d.ts.map