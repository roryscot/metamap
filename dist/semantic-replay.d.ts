import type { MetamapDocument } from "./model.js";
import type { ReplayCompilerIdentity, ReplayValidationResult } from "./replay.js";
import type { MetamapSemanticPolicy } from "./semantic-model.js";
import type { CaptureSemanticReplayOptions, SemanticReplayBundle, SemanticReplayResult } from "./semantic-replay-model.js";
export declare function semanticReplayDigest(bundle: SemanticReplayBundle): string;
export declare function validateSemanticReplayBundle(value: unknown): ReplayValidationResult;
export declare function parseSemanticReplayBundle(value: unknown): SemanticReplayBundle;
export declare function parseSemanticReplayJson(text: string): SemanticReplayBundle;
export declare function captureSemanticReplayBundle(graph: MetamapDocument, policy: MetamapSemanticPolicy, options: CaptureSemanticReplayOptions, compilerIdentity: () => ReplayCompilerIdentity): SemanticReplayBundle;
/** No source fetches, named-code loading, graph mutation or activation. */
export declare function replaySemanticMetamap(value: unknown, compilerIdentity: () => ReplayCompilerIdentity): SemanticReplayResult;
//# sourceMappingURL=semantic-replay.d.ts.map