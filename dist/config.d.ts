export declare const METAMAP_CONFIG_VERSION: "1.0.0";
export interface PrismaSourceConfig {
    id: string;
    adapter: "prisma";
    path: string;
}
export interface TypeScriptZodSourceConfig {
    id: string;
    adapter: "typescript-zod";
    roots: string[];
    exclude?: string[];
}
export interface LegacySourcesConfig {
    id: string;
    adapter: "legacy-sources";
    path: string;
}
export interface JsonReferenceConfig {
    property: string;
    targetKind: string;
    relation?: string;
}
export interface JsonCollectionConfig {
    pointer: string;
    idProperty: string;
    labelProperty?: string;
    entityKind: string;
    references?: JsonReferenceConfig[];
}
export interface JsonCollectionsSourceConfig {
    id: string;
    adapter: "json-collections";
    path: string;
    collections: JsonCollectionConfig[];
}
export type MetamapSourceConfig = PrismaSourceConfig | TypeScriptZodSourceConfig | LegacySourcesConfig | JsonCollectionsSourceConfig;
export interface StructureReferenceConfig {
    sourceId: string;
    kind: "model" | "schema" | "enum";
    name: string;
}
export type ComparedFact = "type" | "presence" | "nullability" | "cardinality";
export interface FieldPairConfig {
    source: string;
    target: string;
    compare?: ComparedFact[];
    allowDifferences?: ComparedFact[];
    transform?: string;
    note?: string;
}
export interface FieldCorrespondenceConfig {
    pairs: FieldPairConfig[];
    ignoreSource?: string[];
    ignoreTarget?: string[];
    requireSourceCoverage?: boolean;
    requireTargetCoverage?: boolean;
}
export interface EnumCorrespondenceConfig {
    allowSourceOnly?: string[];
    allowTargetOnly?: string[];
}
export interface CorrespondenceAuthorityConfig {
    side: "source" | "target";
    facts: string[];
}
export interface CorrespondenceConfig {
    id: string;
    source: StructureReferenceConfig;
    target: StructureReferenceConfig;
    relation?: string;
    fields?: FieldCorrespondenceConfig;
    enumValues?: EnumCorrespondenceConfig;
    authority?: CorrespondenceAuthorityConfig;
}
export interface MetamapOutputConfig {
    graph: string;
    snapshot: string;
    report: string;
    documentation: string;
    cache?: string;
}
export interface MetamapPolicyConfig {
    baselineChanges?: "error" | "warning" | "ignore";
    unconfiguredStructures?: "error" | "warning" | "ignore";
}
export interface MetamapConfig {
    $schema?: string;
    schemaVersion: typeof METAMAP_CONFIG_VERSION;
    id: string;
    label?: string;
    namespace: string;
    repository: string;
    repositoryRoot: string;
    sources: MetamapSourceConfig[];
    correspondences: CorrespondenceConfig[];
    outputs: MetamapOutputConfig;
    policy?: MetamapPolicyConfig;
}
export interface LoadedMetamapConfig {
    config: MetamapConfig;
    configPath: string;
    configDirectory: string;
    repositoryRoot: string;
}
/**
 * A deliberately strict runtime gate for configuration read by the CLI.
 * The JSON Schema remains the complete language-neutral contract.
 */
export declare function parseMetamapConfig(value: unknown): MetamapConfig;
export declare function loadMetamapConfig(path: string): Promise<LoadedMetamapConfig>;
//# sourceMappingURL=config.d.ts.map