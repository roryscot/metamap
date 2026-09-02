import type { JsonObject, JsonPrimitive, Locator } from "./model.js";
export declare const METAMAP_VIABILITY_POLICY_VERSION: "1.0.0";
export declare const METAMAP_GENERATION_VERSION: "1.0.0";
export type ContextValue = JsonPrimitive | JsonPrimitive[];
export type EvaluationContext = Record<string, ContextValue>;
export type ContextExpression = {
    key: string;
    operator: "equals" | "not-equals";
    value: JsonPrimitive;
} | {
    key: string;
    operator: "in" | "not-in";
    values: JsonPrimitive[];
} | {
    key: string;
    operator: "exists";
    value?: boolean;
} | {
    all: ContextExpression[];
} | {
    any: ContextExpression[];
} | {
    not: ContextExpression;
};
export interface MappingApplicability {
    /** The mapping is inactive unless this expression matches. */
    when?: ContextExpression;
    /** The mapping is inhibited when this expression matches. */
    unless?: ContextExpression;
}
export type MappingCoverage = "total" | "partial";
export type MappingDeterminism = "deterministic" | "nondeterministic";
export type MappingReversibility = "reversible" | "irreversible";
/**
 * Contextual semantics for one graph mapping. Every graph mapping must have
 * exactly one declaration before the graph can become a viable generation.
 */
export interface MappingViabilityDeclaration {
    mapping: string;
    coverage: MappingCoverage;
    determinism: MappingDeterminism;
    reversibility: MappingReversibility;
    applicability?: MappingApplicability;
}
export type EvidenceResult = "supports" | "contradicts" | "inconclusive";
export interface EvidenceRecord {
    id: string;
    subjects: string[];
    kind: string;
    result: EvidenceResult;
    producer: string;
    observedAt?: string;
    confidence?: number;
    locator?: Locator;
    digest?: string;
    attributes?: JsonObject;
}
/**
 * Constraint kinds are identifiers so domain packs can be language-neutral.
 * The reference compiler ships evaluators for the core:* kinds documented in
 * ARCHITECTURE.md and rejects unknown kinds instead of silently skipping them.
 */
export interface ViabilityConstraint {
    id: string;
    kind: string;
    subjects: string[];
    parameters?: JsonObject;
}
export interface ViabilityWaiver {
    id: string;
    codes: string[];
    subjects: string[];
    reason: string;
    expiresAt: string;
    assertedBy: string;
}
export interface GraphBinding {
    id: string;
    revision?: string;
    digest?: string;
}
export interface MetamapViabilityPolicy {
    $schema?: string;
    schemaVersion: typeof METAMAP_VIABILITY_POLICY_VERSION;
    id: string;
    graph: GraphBinding;
    mappings: MappingViabilityDeclaration[];
    constraints: ViabilityConstraint[];
    evidence: EvidenceRecord[];
    waivers?: ViabilityWaiver[];
    metadata?: JsonObject;
}
export type ViabilitySeverity = "error" | "warning";
export interface ViabilityIssue {
    severity: ViabilitySeverity;
    code: string;
    message: string;
    path?: string;
    subjectId?: string;
    causalPath?: string[];
    waivedBy?: string;
}
export interface ViabilityValidationResult {
    valid: boolean;
    issues: ViabilityIssue[];
}
export type InactiveMappingReason = "when-not-satisfied" | "inhibited";
export interface InactiveMapping {
    id: string;
    reason: InactiveMappingReason;
}
export interface ImpactPath {
    subjectId: string;
    path: string[];
}
export interface ImpactReport {
    changedSubjects: string[];
    affectedSubjects: string[];
    paths: ImpactPath[];
}
export interface ViableGeneration {
    $schema?: string;
    schemaVersion: typeof METAMAP_GENERATION_VERSION;
    id: string;
    digest: string;
    evaluatedAt: string;
    graph: {
        id: string;
        revision?: string;
        digest: string;
    };
    policy: {
        id: string;
        digest: string;
    };
    context: EvaluationContext;
    activeMappings: string[];
    inactiveMappings: InactiveMapping[];
    evidence: string[];
    waiversApplied: string[];
}
export interface CompileOptions {
    context?: EvaluationContext;
    evaluatedAt?: string;
    changedSubjects?: readonly string[];
}
export type CompilationResult = {
    status: "viable";
    generation: ViableGeneration;
    issues: ViabilityIssue[];
    impact: ImpactReport;
} | {
    status: "rejected";
    issues: ViabilityIssue[];
    impact: ImpactReport;
    quarantinedSubjects: string[];
};
export type ActivationResult = {
    activated: true;
    current: ViableGeneration;
    compilation: Extract<CompilationResult, {
        status: "viable";
    }>;
} | {
    activated: false;
    current?: ViableGeneration;
    compilation: Extract<CompilationResult, {
        status: "rejected";
    }>;
};
//# sourceMappingURL=viability-model.d.ts.map