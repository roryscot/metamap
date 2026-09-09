export declare const METAMAP_CONFIG_VERSION: "1.0.0";
/**
 * Open source configuration passed unchanged to the selected adapter. Built-in
 * adapters expose narrower interfaces below, while third-party adapters can
 * add JSON-compatible fields without changing Metamap core.
 */
export interface MetamapSourceConfig {
    id: string;
    adapter: string;
    readonly [key: string]: unknown;
}
export interface PrismaSourceConfig extends MetamapSourceConfig {
    id: string;
    adapter: "prisma";
    path: string;
}
export interface TypeScriptZodSourceConfig extends MetamapSourceConfig {
    id: string;
    adapter: "typescript-zod";
    roots: string[];
    exclude?: string[];
}
export interface LegacySourcesConfig extends MetamapSourceConfig {
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
export interface JsonCollectionsSourceConfig extends MetamapSourceConfig {
    id: string;
    adapter: "json-collections";
    path: string;
    collections: JsonCollectionConfig[];
}
export interface MetamapShardSourceConfig extends MetamapSourceConfig {
    id: string;
    adapter: "metamap-shard";
    path: string;
}
export interface NextjsTopologyExclusion {
    /** Repository-relative path to a discovered Next.js special file. */
    path: string;
    reason: string;
    assertedBy: string;
    /** Relations this exception may satisfy. Defaults to topology:implemented_by. */
    relations?: string[];
}
export interface NextjsAppRouterSourceConfig extends MetamapSourceConfig {
    id: string;
    adapter: "nextjs-app-router";
    /** Repository-relative App Router directory, normally app or src/app. */
    root: string;
    /** Source extensions to inspect. Defaults to ts, tsx, js, and jsx. */
    extensions?: string[];
    /** Exact, reviewed exceptions. Missing or inapplicable entries are errors. */
    exclusions?: NextjsTopologyExclusion[];
}
export type BuiltInSourceConfig = PrismaSourceConfig | TypeScriptZodSourceConfig | LegacySourcesConfig | JsonCollectionsSourceConfig | MetamapShardSourceConfig | NextjsAppRouterSourceConfig;
export interface StructureReferenceConfig {
    sourceId: string;
    /** Adapter-defined structure kind. */
    kind: string;
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
    /** Portable relation-pack documents, resolved from repositoryRoot. */
    relationPacks?: string[];
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