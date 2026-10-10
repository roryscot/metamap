import { type LoadedMetamapConfig, type MetamapConfig } from "./config.js";
import type { MetamapDocument } from "./model.js";
import type { CapturedSourceLineage, MetamapSourceCapture, SourceChange, SourceInspection, SourceRediscoveryOptions } from "./provenance-model.js";
import { RelationRegistry } from "./relations.js";
import type { ReplayIssue, ReplayValidationResult } from "./replay.js";
import type { SourceReceipt } from "./semantic-replay-model.js";
import { type WorkspaceDiscovery } from "./workspace.js";
export declare function sourceCaptureDigest(capture: MetamapSourceCapture): string;
export declare function sourceReceiptDigest(receipt: SourceReceipt): string;
export declare function validateSourceReceipt(value: unknown): ReplayValidationResult;
export declare function parseSourceReceipt(value: unknown): SourceReceipt;
export declare function parseSourceReceiptJson(text: string): SourceReceipt;
export declare function validateSourceInspection(value: unknown): ReplayValidationResult;
export declare function parseSourceInspection(value: unknown): SourceInspection;
export declare function parseSourceInspectionJson(text: string): SourceInspection;
export declare function validateSourceCapture(value: unknown): ReplayValidationResult;
export declare function parseSourceCapture(value: unknown): MetamapSourceCapture;
export declare function parseSourceCaptureJson(text: string): MetamapSourceCapture;
/** Existing discovery supplies the inventory. No source reads or registry substitution here. */
export declare function createSourceCapture(config: MetamapConfig, discovery: WorkspaceDiscovery, relationRegistry?: RelationRegistry): MetamapSourceCapture;
export declare function sourceCaptureLineage(value: MetamapSourceCapture): CapturedSourceLineage;
export declare function sourceLineageIssues(capture: MetamapSourceCapture, lineage: CapturedSourceLineage): ReplayIssue[];
/** Verify recorded bindings, not authentication, current truth or raw-source reconstruction. */
export declare function inspectSourceCapture(value: MetamapSourceCapture, evaluatedGraph?: MetamapDocument): SourceInspection;
export declare function compareSourceCaptures(beforeValue: MetamapSourceCapture, afterValue: MetamapSourceCapture): SourceChange[];
/** Strict config read with caller authority checked before reading any config bytes. */
export declare function loadPermittedWorkspace(configPath: string, options: SourceRediscoveryOptions): Promise<LoadedMetamapConfig>;
/** Explicit local discovery; no cache, graph, documentation or activation writes. */
export declare function captureWorkspaceSources(configPath: string, options: SourceRediscoveryOptions): Promise<MetamapSourceCapture>;
/** Uses only the separately selected current workspace, never the capture's locators. */
export declare function inspectCurrentSources(capture: MetamapSourceCapture, configPath: string, options: SourceRediscoveryOptions, evaluatedGraph?: MetamapDocument): Promise<SourceInspection>;
//# sourceMappingURL=provenance.d.ts.map