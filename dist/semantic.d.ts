import { type CorrespondenceDerivation } from "./derivation-model.js";
import type { MetamapDocument } from "./model.js";
import { RelationRegistry } from "./relations.js";
import type { MetamapSemanticPolicy, MappingDependency, SemanticCompilationResult, SemanticGeneration } from "./semantic-model.js";
import type { CompilationRuntimeOptions } from "./viability.js";
import type { CompilationResult, MappingViabilityDeclaration, MetamapViabilityPolicy, ViabilityIssue, ViabilityValidationResult } from "./viability-model.js";
export declare function validateSemanticPolicy(value: unknown): ViabilityValidationResult;
export declare function parseSemanticPolicy(value: unknown): MetamapSemanticPolicy;
export declare function semanticGenerationDigest(value: SemanticGeneration): string;
export declare function validateSemanticGeneration(value: unknown): ViabilityValidationResult;
export declare function parseSemanticGeneration(value: unknown): SemanticGeneration;
export declare function legacyPolicyView(policy: MetamapSemanticPolicy): MetamapViabilityPolicy;
interface LegacyCompiler {
    compile: (graph: MetamapDocument, policy: MetamapViabilityPolicy, options: CompilationRuntimeOptions, handledEvidence?: ReadonlySet<string>) => CompilationResult;
    declarations: (graph: MetamapDocument, policy: MetamapViabilityPolicy) => Map<string, MappingViabilityDeclaration[]>;
}
export declare function derivationAdmissionIssues(proofs: readonly CorrespondenceDerivation[], active: ReadonlySet<string>, declarations: ReadonlyMap<string, readonly MappingViabilityDeclaration[]>, registry: RelationRegistry): ViabilityIssue[];
export declare function admittedMappingDependencies(graph: MetamapDocument, active: ReadonlySet<string>, records: readonly CorrespondenceDerivation[]): MappingDependency[];
/** Reuse the contextual compiler; add nonwaivable checks for the selected profile. */
export declare function compileSemanticMetamap(graph: MetamapDocument, policy: MetamapSemanticPolicy, options: CompilationRuntimeOptions, legacy: LegacyCompiler): SemanticCompilationResult;
export {};
//# sourceMappingURL=semantic.d.ts.map