import type { CounterfactualIssue } from "./counterfactual.js";
import type {
  GovernanceRequirement,
  GovernanceScope,
} from "./governance-model.js";
import type { MetamapDocument, StructuralMapping } from "./model.js";
import type { MetamapSemanticPolicy } from "./semantic-model.js";
import type { SourceCounterfactualReport } from "./semantic-counterfactual-model.js";
import type { SourceReplayBundle } from "./semantic-replay-model.js";
import type {
  GraphBinding,
  MappingViabilityDeclaration,
} from "./viability-model.js";

interface RepairEditBase {
  id: string;
  /** Explicit ordinal proposal cost; neither a probability nor evidence. */
  semanticCost: number;
}
export type MetamapRepairEdit = RepairEditBase &
  (
    | { kind: "restore-mapping"; mapping: StructuralMapping }
    | {
        kind: "select-target";
        mappingIndex: number;
        expectedDigest: string;
        target: string;
      }
    | {
        kind: "remove-duplicate";
        mappingIndex: number;
        expectedDigest: string;
        keepIndex: number;
        keepDigest: string;
      }
    | {
        kind: "supply-declaration";
        declaration: Extract<MappingViabilityDeclaration, { mapping: string }>;
      }
  );
export interface MetamapRepairBounds {
  maximumCandidates: number;
  maximumEdits: number;
  maximumDerivationDepth: number;
  /** Cooperative deadline; a started synchronous compiler step can overrun. */
  maximumElapsedMilliseconds: number;
}
export interface MetamapRepairRequest {
  $schema?: string;
  schemaVersion: "1.0.0";
  id: string;
  digest: string;
  baseline: SourceReplayBundle;
  consumer: string;
  requiredProjections: string[];
  /** Proposal boundaries only. These scopes never establish authorization. */
  allowedFacts: GovernanceScope[];
  protectedFacts: GovernanceScope[];
  edits: MetamapRepairEdit[];
  bounds: MetamapRepairBounds;
  ranking: ["edited-records", "semantic-cost", "proposal-id"];
}
export interface MetamapRepairIssue {
  code: string;
  message: string;
  edit?: string;
}
export interface MetamapRepairPatch {
  graph: { beforeDigest: string; afterDigest: string; value: MetamapDocument };
  policy: {
    beforeDigest: string;
    afterDigest: string;
    value: MetamapSemanticPolicy;
  };
  bindingUpdates: Array<{
    subject: string;
    fact: "policy.graph";
    before: GraphBinding;
    after: GraphBinding;
  }>;
}
interface RepairAttemptBase {
  id: string;
  digest: string;
  request: { id: string; digest: string };
  edits: string[];
}
export type MetamapRepairAttempt = RepairAttemptBase &
  (
    | { status: "blocked"; issues: MetamapRepairIssue[] }
    | {
        status: "evaluated";
        patch: MetamapRepairPatch;
        candidate: SourceReplayBundle;
        comparison: SourceCounterfactualReport;
        admitted: boolean;
        viable: boolean;
        authorization: "approval-required" | "unavailable";
        requirements: GovernanceRequirement[];
        rank: { editedRecords: number; semanticCost: number };
        remainingFailures: CounterfactualIssue[];
      }
  );
export type MetamapRepairStopReason =
  "candidate-limit" | "edit-limit" | "elapsed-limit" | "cancelled";
export interface MetamapRepairReport {
  $schema?: string;
  schemaVersion: "1.0.0";
  id: string;
  digest: string;
  request: MetamapRepairRequest;
  status: "complete" | "incomplete";
  applied: false;
  space: "nonempty-subsets-of-supplied-edits";
  attempts: MetamapRepairAttempt[];
  /** Viable attempt IDs, in the request's declared rank order. */
  proposals: string[];
  coverage: {
    totalCombinations: string;
    attempted: number;
    unexamined: string;
    excludedByEditLimit: string;
    elapsedMilliseconds: number;
    stopReasons: MetamapRepairStopReason[];
  };
  minimality: {
    status: "within-finite-space" | "not-established";
    proposal: string | null;
    global: false;
  };
}
export type MetamapRepairSearchResult =
  | { status: "searched"; report: MetamapRepairReport }
  | { status: "rejected"; issues: MetamapRepairIssue[] };
export interface MetamapRepairSearchOptions {
  signal?: AbortSignal;
}
