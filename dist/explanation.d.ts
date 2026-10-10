import type { SourceReplayBundle } from "./semantic-replay-model.js";
import type { MetamapExplanationReport, MetamapExplanationRequest, MetamapExplanationResult } from "./explanation-model.js";
export declare class MetamapExplanationError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare function metamapExplanationDigest(value: unknown): string;
export declare function parseMetamapExplanationRequest(value: unknown): MetamapExplanationRequest;
export declare function parseMetamapExplanationRequestJson(text: string): MetamapExplanationRequest;
export declare function createMetamapExplanationRequest(capture: SourceReplayBundle, options: Pick<MetamapExplanationRequest, "consumer" | "selection"> & Partial<Pick<MetamapExplanationRequest, "before" | "repairs" | "limits">>): MetamapExplanationRequest;
export declare function explainMetamap(value: unknown): MetamapExplanationResult;
export declare function parseMetamapExplanationReport(value: unknown): MetamapExplanationReport;
export declare function parseMetamapExplanationReportJson(text: string): MetamapExplanationReport;
//# sourceMappingURL=explanation.d.ts.map