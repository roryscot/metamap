import type { CorrespondenceDerivation, DerivationBounds, DerivationUncertainty, PackContentBinding, UncertaintyDimension, UncertaintyStatus } from "./derivation-model.js";
import type { RelationPack } from "./model.js";
import type { CompilationResult, MappingViabilityDeclaration, MappingViabilitySelector, MetamapViabilityPolicy, ViableGeneration } from "./viability-model.js";
export interface UncertaintyAssessment {
    id: string;
    subject: string;
    dimension: UncertaintyDimension;
    status: UncertaintyStatus;
    evidence: string[];
    assessor: string;
    sourceRevision: string;
    measurementModel?: string;
    notApplicableReason?: string;
}
export interface UncertaintyRequirement {
    id: string;
    select: MappingViabilitySelector;
    dimension: UncertaintyDimension;
    allowedStates: UncertaintyStatus[];
    requireEvidence: boolean;
}
export interface MappingRiskClassification {
    id: string;
    select: MappingViabilitySelector;
    classification: string;
    cost: number;
}
export interface ConsumerRiskBudget {
    id: string;
    consumer: string;
    classifications: MappingRiskClassification[];
    maximumTotalCost: number;
    maximumLossyMappings?: number;
    maximumInferredMappings?: number;
    requireCompleteClassification: true;
    requireCompleteDependencies: true;
}
export interface MetamapSemanticPolicy extends Omit<MetamapViabilityPolicy, "schemaVersion"> {
    schemaVersion: "2.0.0";
    derivations: CorrespondenceDerivation[];
    derivationLimits: DerivationBounds;
    assessments: UncertaintyAssessment[];
    uncertaintyRequirements: UncertaintyRequirement[];
    riskBudgets: ConsumerRiskBudget[];
}
export interface MappingDependency {
    mapping: string;
    premises: string[];
    derivation?: {
        id: string;
        digest: string;
    };
}
export interface SemanticGeneration extends Omit<ViableGeneration, "schemaVersion"> {
    schemaVersion: "2.0.0";
    semantic: {
        interpretation: "declared-law-application";
        packs: Array<{
            binding: PackContentBinding;
            value: RelationPack;
        }>;
        derivations: CorrespondenceDerivation[];
        derivationLimits: DerivationBounds;
        declarations: Array<{
            mapping: string;
            declaration: MappingViabilityDeclaration;
        }>;
        dependencies: MappingDependency[];
        assessments: UncertaintyAssessment[];
        uncertaintyRequirements: UncertaintyRequirement[];
        uncertainty: Array<{
            mapping: string;
            dimensions: DerivationUncertainty[];
        }>;
        riskBudgets: ConsumerRiskBudget[];
        riskEvaluation: "not-evaluated" | "available-for-projection";
    };
}
export type SemanticCompilationResult = (Omit<Extract<CompilationResult, {
    status: "viable";
}>, "generation"> & {
    generation: SemanticGeneration;
}) | Extract<CompilationResult, {
    status: "rejected";
}>;
//# sourceMappingURL=semantic-model.d.ts.map