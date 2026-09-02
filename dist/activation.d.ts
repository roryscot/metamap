import type { MetamapDocument } from "./model.js";
import { type CompilationRuntimeOptions } from "./viability.js";
import type { CompilationResult, MetamapViabilityPolicy, ViableGeneration } from "./viability-model.js";
export interface PersistentActivationResult {
    activated: boolean;
    path: string;
    previousDigest?: string;
    current?: ViableGeneration;
    compilation: CompilationResult;
}
/**
 * Durably promote a viable generation with a same-directory atomic rename.
 * A rejected compilation performs no write, preserving the previous file.
 */
export declare function promoteMetamapGeneration(document: MetamapDocument, policy: MetamapViabilityPolicy, outputPath: string, options?: CompilationRuntimeOptions): Promise<PersistentActivationResult>;
//# sourceMappingURL=activation.d.ts.map