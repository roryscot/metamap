import type { ComparedFact, CorrespondenceConfig } from "./config.js";
import { type MetamapDocument } from "./model.js";
export interface DriftIssue {
    severity: "error" | "warning" | "info";
    code: string;
    message: string;
    correspondenceId?: string;
    sourceId?: string;
    targetId?: string;
    fact?: ComparedFact | "enum-values" | "coverage";
}
export interface CorrespondenceResult {
    document: MetamapDocument;
    issues: DriftIssue[];
    configuredStructureIds: Set<string>;
}
export declare function materializeCorrespondences(namespace: string, documentId: string, discovered: MetamapDocument, configurations: readonly CorrespondenceConfig[], configRevision: string): CorrespondenceResult;
//# sourceMappingURL=correspondence.d.ts.map