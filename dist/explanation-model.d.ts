import type { CounterfactualIssue } from "./counterfactual.js";
import type { CorrespondenceDerivation, DerivationUncertainty } from "./derivation-model.js";
import type { GovernanceRequirement } from "./governance-model.js";
import type { AuthorityDeclaration, MetamapEntity, RelationLaw, StructuralMapping } from "./model.js";
import type { SourceInspection } from "./provenance-model.js";
import type { MetamapRepairAttempt, MetamapRepairReport } from "./repair-model.js";
import type { SourceCounterfactualReport } from "./semantic-counterfactual-model.js";
import type { MappingDependency, UncertaintyAssessment } from "./semantic-model.js";
import type { ProjectionRiskSummary, SemanticPathTreeResult, SemanticProjectionSpec } from "./semantic-projection-model.js";
import type { SourceReceipt, SourceReplayBundle } from "./semantic-replay-model.js";
import type { EvidenceRecord, MappingViabilityDeclaration } from "./viability-model.js";
import type { ProjectedEntry } from "./projection.js";
export type ExplanationRecordState = "known" | "missing" | "ambiguous";
export interface MetamapExplanationRequest {
    $schema?: string;
    schemaVersion: "1.0.0";
    id: string;
    digest: string;
    capture: SourceReplayBundle;
    before: SourceReplayBundle | null;
    repairs: MetamapRepairReport | null;
    consumer: string;
    selection: {
        kind: "entity" | "mapping";
        id: string;
        projection: string | null;
    };
    limits: {
        maximumSubjects: number;
        maximumMappings: number;
    };
}
export interface ExplanationSubject {
    id: string;
    state: ExplanationRecordState;
    current: MetamapEntity[];
    before: MetamapEntity[];
}
export interface ExplanationProof {
    record: CorrespondenceDerivation;
    validation: "checked" | "recorded";
    /** All exact pack/law matches are retained; an empty list is unavailable. */
    rules: RelationLaw[];
}
export interface ExplanationMapping {
    id: string;
    state: ExplanationRecordState;
    current: StructuralMapping[];
    before: StructuralMapping[];
    interpretation: "asserted" | "derived" | "mixed" | "unavailable";
    activity: "active" | "inactive" | "unavailable";
    declarationState: ExplanationRecordState;
    declarations: MappingViabilityDeclaration[];
    proofs: ExplanationProof[];
    dependencies: MappingDependency[];
    uncertainty: {
        validation: "checked" | "unavailable";
        dimensions: DerivationUncertainty[];
    };
    assessments: UncertaintyAssessment[];
    evidence: EvidenceRecord[];
    riskCharges: Array<{
        projection: string;
        classification: string;
        cost: number;
    }>;
}
export interface ExplanationSource {
    side: "current" | "before";
    source: string;
    receipt: SourceReceipt;
    /** Exact captured membership, never attribution inferred from a label. */
    records: Array<{
        kind: "entity" | "mapping" | "authority";
        id: string;
        state: "identical" | "candidate-differs" | "ambiguous" | "missing";
    }>;
}
export interface ExplanationProjection {
    spec: SemanticProjectionSpec;
    status: "projected" | "rejected" | "generation-rejected";
    entries: ProjectedEntry[];
    risk: ProjectionRiskSummary | null;
    riskScope: "whole-projection";
    pathTree: SemanticPathTreeResult | null;
}
export interface ExplanationIssue extends CounterfactualIssue {
    relevance: "selection" | "dependency" | "other" | "global";
}
export interface MetamapExplanationReport {
    $schema?: string;
    schemaVersion: "1.0.0";
    id: string;
    digest: string;
    request: MetamapExplanationRequest;
    selection: {
        state: ExplanationRecordState;
        occurrences: number;
    };
    admission: "viable" | "rejected";
    subjects: ExplanationSubject[];
    mappings: ExplanationMapping[];
    ownership: {
        interpretation: "declared-fact-ownership";
        authentication: "not-evaluated";
        declarations: AuthorityDeclaration[];
    };
    sources: ExplanationSource[];
    sourceInspection: SourceInspection;
    projections: ExplanationProjection[];
    issues: ExplanationIssue[];
    navigation: {
        subjectIds: string[];
        mappingIds: string[];
        omittedSubjects: number;
        omittedMappings: number;
        status: "complete" | "truncated";
    };
    comparison: {
        status: "compared" | "unavailable";
        reason: string;
        report: SourceCounterfactualReport | null;
    };
    approval: {
        status: "approval-required" | "unavailable";
        requirements: GovernanceRequirement[];
        currentAuthority: "not-evaluated";
        active: "not-evaluated";
        reason: string;
    };
    alternatives: {
        status: "verified" | "not-supplied";
        attempts: MetamapRepairAttempt["id"][];
        applied: false;
    };
    causality: {
        interpretation: "declared-dependency-propagation";
        uniqueCause: "not-established";
        limitations: string[];
    };
}
export interface MetamapExplanationIssue {
    code: string;
    message: string;
}
export type MetamapExplanationResult = {
    status: "explained";
    report: MetamapExplanationReport;
} | {
    status: "rejected";
    issues: MetamapExplanationIssue[];
};
//# sourceMappingURL=explanation-model.d.ts.map