import type { AdapterResult } from "./adapters/types.js";
import type { MetamapConfig } from "./config.js";
import type { GraphDiff } from "./diff.js";
import type { MetamapDocument, RelationPack } from "./model.js";
import type { SourceReceipt } from "./semantic-replay-model.js";
import type { MetamapSnapshot } from "./workspace.js";

/** Captured existing records, never an adapter installation or filesystem grant. */
export interface MetamapSourceCapture {
  $schema?: string;
  schemaVersion: "1.0.0";
  id: string;
  digest: string;
  config: MetamapConfig;
  adapters: AdapterResult[];
  relationPacks: RelationPack[];
  graph: MetamapDocument;
}

export interface CapturedSourceLineage {
  sourceSnapshot: MetamapSnapshot;
  sourceReceipts: SourceReceipt[];
}

export interface SourceChange {
  scope: "workspace" | "source";
  subject: string;
  component:
    | "source"
    | "configuration"
    | "adapter"
    | "revision"
    | "inputs"
    | "shard"
    | "relation-packs"
    | "graph";
  beforeDigest: string | null;
  afterDigest: string | null;
}

export interface SourceInspection {
  schemaVersion: "1.0.0";
  capture: { id: string; digest: string };
  sourceGraph: { id: string; digest: string };
  evaluatedGraph: { id: string; digest: string };
  relationship: "identical" | "candidate-differs";
  graphChanges: GraphDiff;
  lineage: {
    status: "verified-record-bindings";
    receipts: string[];
    recordedInputDigests: number;
    rawInputs: "not-captured";
  };
  sourceRediscovery:
    | { status: "unavailable"; reason: string }
    | {
        status: "current" | "changed";
        currentCapture: { id: string; digest: string };
        changes: SourceChange[];
      };
  authentication: "not-evaluated";
  authorizationNow: "not-evaluated";
  active: "not-evaluated";
}

export interface SourceRediscoveryOptions {
  /** Explicit caller authority. Captured paths and configs never supply roots. */
  permittedRoots: readonly string[];
}
