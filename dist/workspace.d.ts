import type { AdapterResult } from "./adapters/types.js";
import type { LoadedMetamapConfig } from "./config.js";
import { type DriftIssue } from "./correspondence.js";
import { type GraphDiff } from "./diff.js";
import type { MetamapDocument, ValidationResult } from "./model.js";
declare const SNAPSHOT_VERSION = "1.0.0";
export interface MetamapSnapshot {
    schemaVersion: typeof SNAPSHOT_VERSION;
    graphId: string;
    graphRevision: string;
    graphDigest: string;
    configDigest: string;
    sources: Array<{
        id: string;
        adapter: string;
        adapterVersion: string;
        inputs: AdapterResult["inputs"];
    }>;
    counts: {
        entities: number;
        mappings: number;
        authorities: number;
    };
}
export interface WorkspaceDiscovery {
    graph: MetamapDocument;
    adapters: AdapterResult[];
    driftIssues: DriftIssue[];
    validation: ValidationResult;
    snapshot: MetamapSnapshot;
    cacheHits: string[];
}
export interface WorkspaceCheck extends WorkspaceDiscovery {
    baseline?: MetamapDocument;
    diff: GraphDiff;
    baselineSeverity: "error" | "warning" | "ignore";
}
export declare function discoverWorkspace(loaded: LoadedMetamapConfig, options?: {
    useCache?: boolean;
}): Promise<WorkspaceDiscovery>;
export declare function checkWorkspace(loaded: LoadedMetamapConfig, options?: {
    useCache?: boolean;
}): Promise<WorkspaceCheck>;
export declare function writeWorkspaceOutputs(loaded: LoadedMetamapConfig, discovery: WorkspaceDiscovery): Promise<void>;
export declare function workspaceHasErrors(discovery: WorkspaceDiscovery): boolean;
export {};
//# sourceMappingURL=workspace.d.ts.map