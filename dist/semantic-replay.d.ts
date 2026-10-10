import type { MetamapDocument } from "./model.js";
import type { ReplayCompilerIdentity, ReplayValidationResult } from "./replay.js";
import type { MetamapSemanticPolicy } from "./semantic-model.js";
import type { CaptureSemanticReplayOptions, CaptureSourceReplayOptions, SemanticReplayBundle, SemanticReplayResult, SourceReplayBundle, SourceReplayResult } from "./semantic-replay-model.js";
export declare function semanticReplayDigest(bundle: SemanticReplayBundle | SourceReplayBundle): string;
export declare function validateSemanticReplayBundle(value: unknown): ReplayValidationResult;
export declare function validateSourceReplayBundle(value: unknown): ReplayValidationResult;
export declare function parseSemanticReplayBundle(value: unknown): SemanticReplayBundle;
export declare function parseSemanticReplayJson(text: string): SemanticReplayBundle;
export declare function parseSourceReplayBundle(value: unknown): SourceReplayBundle;
export declare function parseSourceReplayJson(text: string): SourceReplayBundle;
export declare function captureSemanticReplayBundle(graph: MetamapDocument, policy: MetamapSemanticPolicy, options: CaptureSourceReplayOptions, compilerIdentity: () => ReplayCompilerIdentity): SourceReplayBundle;
export declare function captureSemanticReplayBundle(graph: MetamapDocument, policy: MetamapSemanticPolicy, options: CaptureSemanticReplayOptions, compilerIdentity: () => ReplayCompilerIdentity): SemanticReplayBundle;
export declare function captureSemanticReplayBundle(graph: MetamapDocument, policy: MetamapSemanticPolicy, options: CaptureSemanticReplayOptions | CaptureSourceReplayOptions, compilerIdentity: () => ReplayCompilerIdentity): SemanticReplayBundle | SourceReplayBundle;
/** No source fetches, named-code loading, graph mutation or activation. */
export declare function replaySemanticMetamap(value: unknown, compilerIdentity: () => ReplayCompilerIdentity): SemanticReplayResult | SourceReplayResult;
//# sourceMappingURL=semantic-replay.d.ts.map