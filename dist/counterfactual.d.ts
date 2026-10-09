import { type GraphDiff } from "./diff.js";
import type { ProjectedSlot, ProjectionIssue } from "./projection.js";
import { type MetamapReplayBundle, type ReplayIssue, type ReplayOutputs } from "./replay.js";
import { valuesEqual } from "./stable.js";
import type { ImpactReport, ViabilityIssue } from "./viability-model.js";
import type { SemanticReplayBundle, SemanticReplayInputs, SemanticReplayOutputs } from "./semantic-replay-model.js";
import type { SemanticCounterfactualResult } from "./semantic-counterfactual-model.js";
type ComparableBundle = MetamapReplayBundle | SemanticReplayBundle;
type ComparableOutputs = ReplayOutputs | SemanticReplayOutputs;
export declare const METAMAP_COUNTERFACTUAL_VERSION: "1.0.0";
export interface CounterfactualInputChange {
    input: keyof MetamapReplayBundle["inputs"];
    beforeDigest: string;
    afterDigest: string;
}
export interface CounterfactualIssue {
    stage: "compilation" | "projection" | "path-tree";
    specId?: string;
    issue: ViabilityIssue | ProjectionIssue;
}
export interface CounterfactualRecordChanges {
    added: string[];
    removed: string[];
    changed: string[];
}
export interface CounterfactualSlotChange {
    name: string;
    before?: ProjectedSlot;
    after?: ProjectedSlot;
}
export interface CounterfactualEntryChange {
    subjectId: string;
    change: "added" | "removed" | "changed";
    subjectChanged: boolean;
    slots: CounterfactualSlotChange[];
}
export type CounterfactualProjectionState = "projected" | "rejected" | "generation-rejected" | "not-requested";
export interface CounterfactualProjectionChange {
    specId: string;
    before: CounterfactualProjectionState;
    after: CounterfactualProjectionState;
    bindingsChanged: boolean;
    entries: CounterfactualEntryChange[];
    pathTreeChanged: boolean;
}
export interface CounterfactualReport {
    schemaVersion: typeof METAMAP_COUNTERFACTUAL_VERSION;
    id: string;
    digest: string;
    before: {
        bundle: string;
        digest: string;
        admitted: boolean;
    };
    after: {
        bundle: string;
        digest: string;
        admitted: boolean;
    };
    inputChanges: CounterfactualInputChange[];
    graph: GraphDiff;
    issues: {
        introduced: CounterfactualIssue[];
        resolved: CounterfactualIssue[];
    };
    mappingStates: {
        beforeKnown: boolean;
        afterKnown: boolean;
        activated: string[];
        deactivated: string[];
    };
    evidence: CounterfactualRecordChanges & {
        recordedSupportLost: string[];
        recordedSupportGained: string[];
    };
    projections: CounterfactualProjectionChange[];
    impact: {
        interpretation: "declared-dependency-propagation";
        before: ImpactReport;
        after: ImpactReport;
    };
}
export type CounterfactualResult = {
    status: "compared";
    report: CounterfactualReport;
} | {
    status: "rejected";
    issues: Array<ReplayIssue & {
        side: "before" | "after";
    }>;
};
export declare function validateCounterfactualReport(value: unknown): {
    valid: boolean;
    issues: ReplayIssue[];
};
/** Compare two independently reproduced candidates. Never repairs, rebinds, or activates. */
export declare function compareReplayEvaluationContent(before: ComparableBundle, after: ComparableBundle, left: ComparableOutputs, right: ComparableOutputs, beforeAdmitted: boolean, afterAdmitted: boolean, equals?: typeof valuesEqual, inputDigest?: (input: keyof SemanticReplayInputs, value: unknown) => string): {
    before: {
        bundle: string;
        digest: string;
        admitted: boolean;
    };
    after: {
        bundle: string;
        digest: string;
        admitted: boolean;
    };
    inputChanges: {
        input: keyof SemanticReplayInputs;
        beforeDigest: string;
        afterDigest: string;
    }[];
    graph: GraphDiff;
    issues: {
        introduced: CounterfactualIssue[];
        resolved: CounterfactualIssue[];
    };
    mappingStates: {
        beforeKnown: boolean;
        afterKnown: boolean;
        activated: string[];
        deactivated: string[];
    };
    evidence: {
        recordedSupportLost: string[];
        recordedSupportGained: string[];
        added: string[];
        removed: string[];
        changed: string[];
    };
    projections: CounterfactualProjectionChange[];
    impact: {
        interpretation: "declared-dependency-propagation";
        before: ImpactReport;
        after: ImpactReport;
    };
};
export declare function compareMetamapBundles(beforeValue: SemanticReplayBundle, afterValue: SemanticReplayBundle): SemanticCounterfactualResult;
export declare function compareMetamapBundles(beforeValue: MetamapReplayBundle, afterValue: MetamapReplayBundle): CounterfactualResult;
export declare function compareMetamapBundles(beforeValue: unknown, afterValue: unknown): CounterfactualResult | SemanticCounterfactualResult;
export {};
//# sourceMappingURL=counterfactual.d.ts.map