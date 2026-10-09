import type { MetamapDocument } from "./model.js";
import type { MetamapSemanticPolicy, SemanticCompilationResult, SemanticGeneration } from "./semantic-model.js";
import type { CompilationRuntimeOptions } from "./viability.js";
import type { CompilationResult, MappingViabilityDeclaration, MetamapViabilityPolicy, ViabilityValidationResult } from "./viability-model.js";
export declare function validateSemanticPolicy(value: unknown): ViabilityValidationResult;
export declare function parseSemanticPolicy(value: unknown): MetamapSemanticPolicy;
export declare function semanticGenerationDigest(value: SemanticGeneration): string;
export declare function validateSemanticGeneration(value: unknown): ViabilityValidationResult;
export declare function parseSemanticGeneration(value: unknown): SemanticGeneration;
export declare function legacyPolicyView(policy: MetamapSemanticPolicy): MetamapViabilityPolicy;
interface LegacyCompiler {
    compile: (graph: MetamapDocument, policy: MetamapViabilityPolicy, options: CompilationRuntimeOptions) => CompilationResult;
    declarations: (graph: MetamapDocument, policy: MetamapViabilityPolicy) => Map<string, MappingViabilityDeclaration[]>;
}
/** Reuse the contextual compiler; add nonwaivable checks for the selected profile. */
export declare function compileSemanticMetamap(graph: MetamapDocument, policy: MetamapSemanticPolicy, options: CompilationRuntimeOptions, legacy: LegacyCompiler): SemanticCompilationResult;
export {};
//# sourceMappingURL=semantic.d.ts.map