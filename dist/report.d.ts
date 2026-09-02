import type { AdapterResult } from "./adapters/types.js";
import type { DriftIssue } from "./correspondence.js";
import type { GraphDiff } from "./diff.js";
import type { MetamapDocument, ValidationResult } from "./model.js";
export interface MetamapReportInput {
    graph: MetamapDocument;
    adapters: readonly AdapterResult[];
    driftIssues: readonly DriftIssue[];
    validation: ValidationResult;
    diff: GraphDiff;
    cacheHits?: readonly string[];
}
export declare function renderDriftReport(input: MetamapReportInput): string;
export declare function renderGraphDocumentation(graph: MetamapDocument, correspondences: readonly {
    id: string;
}[]): string;
//# sourceMappingURL=report.d.ts.map