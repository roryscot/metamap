import type { MetamapRepairReport, MetamapRepairRequest, MetamapRepairSearchOptions, MetamapRepairSearchResult } from "./repair-model.js";
export declare class MetamapRepairError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** All new repair content except its own id/digest participates in its address. */
export declare function metamapRepairDigest(value: unknown): string;
/** Parses data, verifies the original evaluation, and never rediscoveries sources. */
export declare function parseMetamapRepairRequest(value: unknown): MetamapRepairRequest;
export declare function parseMetamapRepairRequestJson(text: string): MetamapRepairRequest;
export declare function createMetamapRepairRequest(baseline: MetamapRepairRequest["baseline"], options: Pick<MetamapRepairRequest, "consumer" | "requiredProjections" | "allowedFacts" | "protectedFacts" | "edits" | "bounds">): MetamapRepairRequest;
/** Cooperative bounded search over supplied data. No source, file or active-state writes. */
export declare function searchMetamapRepairs(value: unknown, options?: MetamapRepairSearchOptions): Promise<MetamapRepairSearchResult>;
/** Recomputes attempts, patches, outcomes, requirements, ordering and coverage. */
export declare function parseMetamapRepairReport(value: unknown): MetamapRepairReport;
export declare function parseMetamapRepairReportJson(text: string): MetamapRepairReport;
//# sourceMappingURL=repair.d.ts.map