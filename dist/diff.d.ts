import type { MetamapDocument } from "./model.js";
export type GraphRecordKind = "entity" | "mapping" | "authority";
export type GraphChangeKind = "added" | "removed" | "changed";
export interface GraphChange {
    change: GraphChangeKind;
    kind: GraphRecordKind;
    id: string;
    changedProperties?: string[];
}
export interface GraphDiff {
    changes: GraphChange[];
    counts: Record<GraphChangeKind, number>;
}
export declare function diffMetamapDocuments(before: MetamapDocument, after: MetamapDocument): GraphDiff;
export declare function emptyGraphDiff(): GraphDiff;
//# sourceMappingURL=diff.d.ts.map