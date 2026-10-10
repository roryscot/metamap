import type {
  CounterfactualReport,
  CounterfactualRecordChanges,
  CounterfactualResult,
} from "./counterfactual.js";
import type {
  SemanticReplayInputs,
  SemanticReplayInputName,
} from "./semantic-replay-model.js";
import type { SourceChange, SourceInspection } from "./provenance-model.js";
export interface SemanticCounterfactualReport extends Omit<
  CounterfactualReport,
  "schemaVersion" | "inputChanges"
> {
  $schema?: string;
  schemaVersion: "2.0.0";
  inputChanges: Array<{
    input: keyof SemanticReplayInputs;
    beforeDigest: string;
    afterDigest: string;
  }>;
  semantic: {
    derivations: CounterfactualRecordChanges;
    assessments: CounterfactualRecordChanges;
    uncertaintyRequirements: CounterfactualRecordChanges;
    riskBudgets: CounterfactualRecordChanges;
    sourceReceipts: CounterfactualRecordChanges;
    projections: Array<{
      specId: string;
      beforeKnown: boolean;
      afterKnown: boolean;
      usedMappingsChanged: boolean | null;
      dependenciesChanged: boolean | null;
      riskChanged: boolean | null;
    }>;
  };
}
export type SemanticCounterfactualResult =
  | { status: "compared"; report: SemanticCounterfactualReport }
  | Extract<CounterfactualResult, { status: "rejected" }>;
export interface SourceCounterfactualReport extends Omit<
  SemanticCounterfactualReport,
  "schemaVersion" | "inputChanges"
> {
  schemaVersion: "3.0.0";
  inputChanges: Array<{
    input: SemanticReplayInputName;
    beforeDigest: string;
    afterDigest: string;
  }>;
  provenance: {
    before: SourceInspection;
    after: SourceInspection;
    changes: SourceChange[];
  };
}
export type SourceCounterfactualResult =
  | { status: "compared"; report: SourceCounterfactualReport }
  | Extract<CounterfactualResult, { status: "rejected" }>;
