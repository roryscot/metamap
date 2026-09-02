import { ConstraintRegistry } from "./constraints.js";
import type { MetamapDocument } from "./model.js";
import { RelationRegistry } from "./relations.js";
import { type ActivationResult, type CompilationResult, type CompileOptions, type MetamapViabilityPolicy, type ViabilityValidationResult, type ViableGeneration } from "./viability-model.js";
export interface CompilationRuntimeOptions extends CompileOptions {
    relationRegistry?: RelationRegistry;
    constraintRegistry?: ConstraintRegistry;
}
/** Strict runtime validation for policies received from JSON or other tools. */
export declare function validateViabilityPolicy(value: unknown): ViabilityValidationResult;
/** Validate both the portable generation shape and its content address. */
export declare function validateViableGeneration(value: unknown): ViabilityValidationResult;
/**
 * Compile a graph and contextual policy into an immutable viable generation.
 * No generation is returned if any unwaived error remains.
 */
export declare function compileMetamap(document: MetamapDocument, policy: MetamapViabilityPolicy, options?: CompilationRuntimeOptions): CompilationResult;
/**
 * Atomic in-memory activation. Rejected candidates leave the last viable
 * generation untouched and report the quarantined blast radius.
 */
export declare class MetamapActivator {
    private readonly relationRegistry;
    private readonly constraintRegistry;
    private generation?;
    constructor(relationRegistry?: RelationRegistry, constraintRegistry?: ConstraintRegistry);
    get current(): ViableGeneration | undefined;
    activate(document: MetamapDocument, policy: MetamapViabilityPolicy, options?: CompileOptions): ActivationResult;
}
/** Runtime assertion useful to callers accepting unknown JSON values. */
export declare function parseViabilityPolicy(value: unknown): MetamapViabilityPolicy;
/** Runtime assertion for persisted or externally received generations. */
export declare function parseViableGeneration(value: unknown): ViableGeneration;
//# sourceMappingURL=viability.d.ts.map