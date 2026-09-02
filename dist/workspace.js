import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createDefaultAdapterRegistry, } from "./adapters/registry.js";
import { materializeCorrespondences, } from "./correspondence.js";
import { diffMetamapDocuments, emptyGraphDiff, } from "./diff.js";
import { composeMetamapDocuments } from "./composer.js";
import { loadRelationPack } from "./relation-pack.js";
import { RelationRegistry } from "./relations.js";
import { renderDriftReport, renderGraphDocumentation } from "./report.js";
import { stableJson, valueDigest } from "./stable.js";
import { validateMetamapDocument } from "./validator.js";
const CACHE_VERSION = "1.0.0";
const SNAPSHOT_VERSION = "1.0.0";
function outputPath(loaded, path) {
    return resolve(loaded.repositoryRoot, path);
}
async function readJsonIfPresent(path) {
    try {
        return JSON.parse(await readFile(path, "utf8"));
    }
    catch (error) {
        if (typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "ENOENT") {
            return undefined;
        }
        throw error;
    }
}
async function discoverWithCache(adapter, config, context, cacheDirectory, useCache) {
    const inputs = await adapter.fingerprint(config, context);
    const key = valueDigest({
        adapter: adapter.id,
        adapterVersion: adapter.version,
        config,
        inputs,
    });
    const safeId = config.id.replaceAll(/[^A-Za-z0-9._-]/g, "_");
    const cachePath = resolve(cacheDirectory, `${safeId}.json`);
    if (useCache) {
        const cached = await readJsonIfPresent(cachePath);
        if (typeof cached === "object" &&
            cached !== null &&
            "cacheVersion" in cached &&
            cached.cacheVersion === CACHE_VERSION &&
            "key" in cached &&
            cached.key === key &&
            "result" in cached) {
            return { result: cached.result, cacheHit: true };
        }
    }
    const result = await adapter.discover(config, context);
    const entry = {
        cacheVersion: CACHE_VERSION,
        key,
        result,
    };
    await mkdir(cacheDirectory, { recursive: true });
    await writeFile(cachePath, stableJson(entry, true), "utf8");
    return { result, cacheHit: false };
}
async function discoverSource(source, context, cacheDirectory, useCache, registry) {
    return discoverWithCache(registry.require(source.adapter), source, context, cacheDirectory, useCache);
}
async function configureRelationPacks(loaded, registry) {
    const packs = await Promise.all((loaded.config.relationPacks ?? []).map(async (configuredPath) => ({
        configuredPath,
        pack: await loadRelationPack(resolve(loaded.repositoryRoot, configuredPath)),
    })));
    for (const { pack } of packs)
        registry.registerPack(pack);
    return packs;
}
function withConfiguredRelationPacks(document, configured) {
    const references = new Map((document.relationPacks ?? []).map((entry) => [entry.id, entry]));
    for (const { configuredPath, pack } of configured) {
        const existing = references.get(pack.id);
        if (existing && existing.version !== pack.version) {
            throw new Error(`Relation pack ${pack.id} is referenced at both ${existing.version} and ${pack.version}`);
        }
        references.set(pack.id, {
            ...existing,
            id: pack.id,
            version: pack.version,
            uri: configuredPath,
            digest: valueDigest(pack),
        });
    }
    return {
        ...document,
        relationPacks: [...references.values()].sort((left, right) => left.id.localeCompare(right.id)),
    };
}
function unconfiguredStructureIssues(config, graph, configured) {
    const severity = config.policy?.unconfiguredStructures ?? "ignore";
    if (severity === "ignore")
        return [];
    const unconfigured = graph.entities.filter((entity) => {
        const structureKind = entity.attributes?.structureKind;
        const external = entity.attributes?.externalReference;
        return (typeof structureKind === "string" &&
            new Set(["model", "schema", "enum"]).has(structureKind) &&
            external !== true &&
            !configured.has(entity.id));
    });
    const bySource = new Map();
    for (const entity of unconfigured) {
        const sourceId = String(entity.attributes?.sourceId ?? "unknown");
        const entries = bySource.get(sourceId) ?? [];
        entries.push(entity);
        bySource.set(sourceId, entries);
    }
    return [...bySource].map(([sourceId, entities]) => ({
        severity,
        code: "UNCONFIGURED_STRUCTURES",
        message: `${sourceId} has ${entities.length} structure(s) outside the configured vertical slice: ${entities
            .slice(0, 12)
            .map((entity) => String(entity.attributes?.name))
            .join(", ")}${entities.length > 12 ? ", …" : ""}`,
        sourceId,
        fact: "coverage",
    }));
}
function makeSnapshot(graph, adapters, configDigest) {
    return {
        schemaVersion: SNAPSHOT_VERSION,
        graphId: graph.id,
        graphRevision: graph.revision ?? "unversioned",
        graphDigest: valueDigest(graph),
        configDigest,
        sources: adapters.map((adapter) => ({
            id: adapter.sourceId,
            adapter: adapter.adapter,
            adapterVersion: adapter.adapterVersion,
            inputs: adapter.inputs,
        })),
        counts: {
            entities: graph.entities.length,
            mappings: graph.mappings.length,
            authorities: graph.authorities.length,
        },
    };
}
export async function discoverWorkspace(loaded, options = {}) {
    const adapterRegistry = options.adapterRegistry ?? createDefaultAdapterRegistry();
    const relationRegistry = options.relationRegistry ?? new RelationRegistry();
    const configuredRelationPacks = await configureRelationPacks(loaded, relationRegistry);
    const context = {
        namespace: loaded.config.namespace,
        repository: loaded.config.repository,
        repositoryRoot: loaded.repositoryRoot,
    };
    const cacheDirectory = outputPath(loaded, loaded.config.outputs.cache ?? ".cache/metamap");
    const discoveredSources = await Promise.all(loaded.config.sources.map((source) => discoverSource(source, context, cacheDirectory, options.useCache ?? true, adapterRegistry)));
    const adapters = discoveredSources.map((entry) => entry.result);
    const cacheHits = discoveredSources
        .filter((entry) => entry.cacheHit)
        .map((entry) => entry.result.sourceId);
    const configDigest = valueDigest(loaded.config);
    const graphRevision = valueDigest({
        configDigest,
        sources: adapters.map((adapter) => ({
            id: adapter.sourceId,
            adapterVersion: adapter.adapterVersion,
            inputs: adapter.inputs,
        })),
    });
    const discovered = composeMetamapDocuments(adapters.map((adapter) => adapter.document), {
        id: `${loaded.config.id}:discovered`,
        namespace: loaded.config.namespace,
        label: "Observed repository structures",
        revision: graphRevision,
    });
    const declared = materializeCorrespondences(loaded.config.namespace, `${loaded.config.id}:declared`, discovered, loaded.config.correspondences, configDigest);
    const graph = withConfiguredRelationPacks(composeMetamapDocuments([discovered, declared.document], {
        id: loaded.config.id,
        namespace: loaded.config.namespace,
        label: loaded.config.label ?? "Metamap",
        revision: graphRevision,
    }), configuredRelationPacks);
    const driftIssues = [
        ...declared.issues,
        ...unconfiguredStructureIssues(loaded.config, graph, declared.configuredStructureIds),
    ];
    const validation = validateMetamapDocument(graph, relationRegistry);
    return {
        graph,
        adapters,
        driftIssues,
        validation,
        snapshot: makeSnapshot(graph, adapters, configDigest),
        cacheHits,
    };
}
export async function checkWorkspace(loaded, options = {}) {
    const current = await discoverWorkspace(loaded, options);
    const baselinePath = outputPath(loaded, loaded.config.outputs.graph);
    const baselineValue = await readJsonIfPresent(baselinePath);
    const relationRegistry = options.relationRegistry ?? new RelationRegistry();
    await configureRelationPacks(loaded, relationRegistry);
    const baselineValidation = baselineValue
        ? validateMetamapDocument(baselineValue, relationRegistry)
        : undefined;
    const baseline = baselineValue && baselineValidation?.valid
        ? baselineValue
        : undefined;
    const diff = baseline
        ? diffMetamapDocuments(baseline, current.graph)
        : emptyGraphDiff();
    const baselineSeverity = loaded.config.policy?.baselineChanges ?? "error";
    if (!baseline) {
        current.driftIssues.push({
            severity: "error",
            code: "BASELINE_MISSING_OR_INVALID",
            message: `${loaded.config.outputs.graph} is missing or invalid; run metamap generate`,
        });
    }
    else if (diff.changes.length > 0 && baselineSeverity !== "ignore") {
        current.driftIssues.push({
            severity: baselineSeverity,
            code: "BASELINE_DRIFT",
            message: `${diff.changes.length} graph record(s) differ from the committed baseline`,
        });
    }
    return { ...current, baseline, diff, baselineSeverity };
}
async function writeOutput(path, content) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
}
export async function writeWorkspaceOutputs(loaded, discovery) {
    const cleanDiff = emptyGraphDiff();
    await Promise.all([
        writeOutput(outputPath(loaded, loaded.config.outputs.graph), stableJson(discovery.graph, true)),
        writeOutput(outputPath(loaded, loaded.config.outputs.snapshot), stableJson(discovery.snapshot, true)),
        writeOutput(outputPath(loaded, loaded.config.outputs.report), 
        // Cache hits are an execution detail, not repository state. Keeping them
        // out of committed output makes generation byte-for-byte reproducible.
        renderDriftReport({ ...discovery, cacheHits: [], diff: cleanDiff })),
        writeOutput(outputPath(loaded, loaded.config.outputs.documentation), renderGraphDocumentation(discovery.graph, loaded.config.correspondences)),
    ]);
}
export function workspaceHasErrors(discovery) {
    return (!discovery.validation.valid ||
        discovery.adapters.some((adapter) => adapter.diagnostics.some((issue) => issue.severity === "error")) ||
        discovery.driftIssues.some((issue) => issue.severity === "error"));
}
//# sourceMappingURL=workspace.js.map