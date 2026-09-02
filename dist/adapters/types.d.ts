import type { MetamapDocument } from "../model.js";
import type { MetamapSourceConfig } from "../config.js";
export interface AdapterInput {
    path: string;
    digest: string;
}
export interface AdapterDiagnostic {
    severity: "warning" | "error";
    code: string;
    message: string;
    path?: string;
    subjectId?: string;
}
export interface AdapterContext {
    namespace: string;
    repository: string;
    repositoryRoot: string;
}
export interface AdapterResult {
    sourceId: string;
    adapter: string;
    adapterVersion: string;
    inputs: AdapterInput[];
    document: MetamapDocument;
    diagnostics: AdapterDiagnostic[];
}
export interface MetamapAdapter<TConfig extends MetamapSourceConfig = MetamapSourceConfig> {
    readonly id: TConfig["adapter"];
    readonly version: string;
    fingerprint(config: TConfig, context: AdapterContext): Promise<AdapterInput[]>;
    discover(config: TConfig, context: AdapterContext): Promise<AdapterResult>;
}
//# sourceMappingURL=types.d.ts.map