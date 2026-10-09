import type { CounterfactualReport, CounterfactualRecordChanges, CounterfactualResult } from "./counterfactual.js";
import type { SemanticReplayInputs } from "./semantic-replay-model.js";
export interface SemanticCounterfactualReport extends Omit<CounterfactualReport, "schemaVersion" | "inputChanges"> {
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
export type SemanticCounterfactualResult = {
    status: "compared";
    report: SemanticCounterfactualReport;
} | Extract<CounterfactualResult, {
    status: "rejected";
}>;
//# sourceMappingURL=semantic-counterfactual-model.d.ts.map