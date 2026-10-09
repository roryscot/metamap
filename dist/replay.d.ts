import type { MetamapDocument, RelationPack } from "./model.js";
import { type PathTreeCompilationResult } from "./path-tree.js";
import { type MetamapProjectionSpec, type ProjectionCompilationResult } from "./projection.js";
import { RelationRegistry } from "./relations.js";
import type { MetamapSemanticPolicy } from "./semantic-model.js";
import type { CaptureSemanticReplayOptions, SemanticReplayBundle, SemanticReplayResult } from "./semantic-replay-model.js";
import type { CompilationResult, EvaluationContext, MetamapViabilityPolicy } from "./viability-model.js";
export declare const METAMAP_REPLAY_VERSION: "1.0.0";
export interface ReplayDependencyIdentity {
    name: string;
    version: string;
    digest: string;
}
/** Exact local executable identity, not an authentication or approval claim. */
export interface ReplayCompilerIdentity {
    name: string;
    version: string;
    format: "source" | "distribution";
    digest: string;
    runtime: {
        node: string;
        icu: string;
        locale: string;
    };
    dependencies: ReplayDependencyIdentity[];
}
export interface ReplayInputs {
    graph: MetamapDocument;
    policy: MetamapViabilityPolicy;
    relationPacks: RelationPack[];
    context: EvaluationContext;
    evaluatedAt: string;
    changedSubjects: string[];
    projections: MetamapProjectionSpec[];
}
export interface ReplayProjectionOutput {
    specId: string;
    result: ProjectionCompilationResult;
    pathTree?: PathTreeCompilationResult;
}
export interface ReplayOutputs {
    compilation: CompilationResult;
    projections: ReplayProjectionOutput[];
}
export interface MetamapReplayBundle {
    $schema?: string;
    schemaVersion: typeof METAMAP_REPLAY_VERSION;
    id: string;
    digest: string;
    compiler: ReplayCompilerIdentity;
    constraintExecutor: "builtin";
    inputs: ReplayInputs;
    expected: ReplayOutputs;
}
export interface ReplayIssue {
    code: string;
    message: string;
    path?: string;
}
export interface ReplayValidationResult {
    valid: boolean;
    issues: ReplayIssue[];
}
export type ReplayResult = {
    status: "verified";
    bundle: string;
    admitted: boolean;
    outputs: ReplayOutputs;
} | {
    status: "rejected";
    bundle?: string;
    issues: ReplayIssue[];
    actual?: ReplayOutputs;
};
export interface CaptureReplayOptions {
    /** Required: replay must never acquire a new evaluation time. */
    evaluatedAt: string;
    context?: EvaluationContext;
    changedSubjects?: readonly string[];
    projections?: readonly MetamapProjectionSpec[];
    relationRegistry?: RelationRegistry;
}
/** Source and packaged JavaScript are distinct executors; neither is substituted. */
export declare function replayCompilerIdentity(): ReplayCompilerIdentity;
/** Validate shape, captured dependency completeness, and content addresses. */
export declare function validateReplayBundle(value: unknown): ReplayValidationResult;
export declare function parseReplayBundle(value: unknown): MetamapReplayBundle;
/** Capture compiler evaluation only. Sources, evidence producers, and activation stay outside this operation. */
export declare function captureReplayBundle(graph: MetamapDocument, policy: MetamapSemanticPolicy, options: CaptureSemanticReplayOptions): SemanticReplayBundle;
export declare function captureReplayBundle(graph: MetamapDocument, policy: MetamapViabilityPolicy, options: CaptureReplayOptions): MetamapReplayBundle;
export declare function captureReplayBundle(graph: MetamapDocument, policy: MetamapViabilityPolicy | MetamapSemanticPolicy, options: CaptureReplayOptions | CaptureSemanticReplayOptions): MetamapReplayBundle | SemanticReplayBundle;
/** Recompute with an exact installed executor. A verified rejection is still not admitted. */
export declare function replayMetamap(value: SemanticReplayBundle): SemanticReplayResult;
export declare function replayMetamap(value: MetamapReplayBundle): ReplayResult;
export declare function replayMetamap(value: unknown): ReplayResult | SemanticReplayResult;
//# sourceMappingURL=replay.d.ts.map