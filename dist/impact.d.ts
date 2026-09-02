import type { MetamapDocument } from "./model.js";
import { RelationRegistry } from "./relations.js";
import type { ImpactReport, MetamapViabilityPolicy } from "./viability-model.js";
export interface ImpactOptions {
    changedSubjects: readonly string[];
    activeMappings?: ReadonlySet<string>;
    policy?: MetamapViabilityPolicy;
    registry?: RelationRegistry;
}
/**
 * Calculate the causal blast radius of changed subjects. Paths include mapping
 * identifiers so a diagnostic explains why each downstream subject is affected.
 */
export declare function analyzeImpact(document: MetamapDocument, options: ImpactOptions): ImpactReport;
//# sourceMappingURL=impact.d.ts.map