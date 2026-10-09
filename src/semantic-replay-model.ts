import type { AdapterInput } from "./adapters/types.js";
import type { MetamapDocument, RelationPack } from "./model.js";
import type {
  ReplayCompilerIdentity,
  ReplayIssue,
  ReplayValidationResult,
} from "./replay.js";
import type {
  MetamapSemanticPolicy,
  SemanticCompilationResult,
} from "./semantic-model.js";
import type {
  SemanticPathTreeResult,
  SemanticProjectionResult,
  SemanticProjectionSpec,
} from "./semantic-projection-model.js";
import type { EvaluationContext } from "./viability-model.js";
import type { MetamapSnapshot } from "./workspace.js";
import type { RelationRegistry } from "./relations.js";

export interface SourceReceipt {
  $schema?: string;
  schemaVersion: "1.0.0";
  id: string;
  digest: string;
  source: string;
  sourceRevision: string;
  adapter: { id: string; version: string };
  configDigest: string;
  inputs: AdapterInput[];
  shard: { id: string; digest: string };
}
export interface SemanticReplayInputs {
  graph: MetamapDocument;
  policy: MetamapSemanticPolicy;
  relationPacks: RelationPack[];
  context: EvaluationContext;
  evaluatedAt: string;
  changedSubjects: string[];
  projections: SemanticProjectionSpec[];
  sourceSnapshot: MetamapSnapshot | null;
  sourceReceipts: SourceReceipt[];
}
export interface SemanticReplayOutputs {
  compilation: SemanticCompilationResult;
  projections: Array<{
    specId: string;
    result: SemanticProjectionResult;
    pathTree?: SemanticPathTreeResult;
  }>;
}
export interface SemanticReplayBundle {
  $schema?: string;
  schemaVersion: "2.0.0";
  id: string;
  digest: string;
  compiler: ReplayCompilerIdentity;
  constraintExecutor: "builtin";
  inputs: SemanticReplayInputs;
  expected: SemanticReplayOutputs;
}
export interface CaptureSemanticReplayOptions {
  evaluatedAt: string;
  context?: EvaluationContext;
  changedSubjects?: readonly string[];
  projections?: readonly SemanticProjectionSpec[];
  relationRegistry?: RelationRegistry;
  sourceSnapshot?: MetamapSnapshot;
  sourceReceipts?: readonly SourceReceipt[];
}
export type SemanticReplayResult =
  | {
      status: "verified";
      bundle: string;
      admitted: boolean;
      outputs: SemanticReplayOutputs;
    }
  | {
      status: "rejected";
      bundle?: string;
      issues: ReplayIssue[];
      actual?: SemanticReplayOutputs;
    };
export type SemanticReplayValidationResult = ReplayValidationResult;
