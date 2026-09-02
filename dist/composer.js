import { METAMAP_SCHEMA_VERSION, } from "./model.js";
export class MetamapCompositionError extends Error {
    identifier;
    constructor(message, identifier) {
        super(message);
        this.identifier = identifier;
        this.name = "MetamapCompositionError";
    }
}
function stableValue(value) {
    if (Array.isArray(value))
        return value.map(stableValue);
    if (typeof value !== "object" || value === null)
        return value;
    return Object.fromEntries(Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]));
}
function equivalent(left, right) {
    return (JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right)));
}
function mergeById(documents, select, kind) {
    const merged = new Map();
    for (const document of documents) {
        for (const item of select(document)) {
            const existing = merged.get(item.id);
            if (existing && !equivalent(existing, item)) {
                throw new MetamapCompositionError(`Conflicting ${kind} definition for ${item.id}`, item.id);
            }
            merged.set(item.id, existing ?? item);
        }
    }
    return [...merged.values()];
}
function mergeRelationPacks(documents) {
    const merged = new Map();
    for (const document of documents) {
        for (const pack of document.relationPacks ?? []) {
            const existing = merged.get(pack.id);
            if (existing && existing.version !== pack.version) {
                throw new MetamapCompositionError(`Relation pack ${pack.id} has incompatible versions ${existing.version} and ${pack.version}`, pack.id);
            }
            if (existing && !equivalent(existing, pack)) {
                throw new MetamapCompositionError(`Relation pack ${pack.id}@${pack.version} has conflicting references`, pack.id);
            }
            merged.set(pack.id, existing ?? pack);
        }
    }
    return [...merged.values()];
}
/**
 * Compose independently emitted graph shards. Cross-shard references are
 * resolved when the resulting document is passed to MetamapGraph.
 */
export function composeMetamapDocuments(documents, options) {
    if (documents.length === 0) {
        throw new MetamapCompositionError("At least one metamap shard is required");
    }
    const documentIds = new Set();
    for (const document of documents) {
        if (document.schemaVersion !== METAMAP_SCHEMA_VERSION) {
            throw new MetamapCompositionError(`Cannot compose ${document.id}: unsupported schema ${document.schemaVersion}`, document.id);
        }
        if (documentIds.has(document.id)) {
            throw new MetamapCompositionError(`Duplicate shard id ${document.id}`, document.id);
        }
        documentIds.add(document.id);
    }
    return {
        $schema: "./schemas/metamap-graph.schema.json",
        schemaVersion: METAMAP_SCHEMA_VERSION,
        id: options.id,
        namespace: options.namespace,
        label: options.label,
        revision: options.revision,
        relationPacks: mergeRelationPacks(documents),
        entities: mergeById(documents, (item) => item.entities, "entity"),
        mappings: mergeById(documents, (item) => item.mappings, "mapping"),
        authorities: mergeById(documents, (item) => item.authorities, "authority"),
        metadata: {
            composedFrom: documents.map((document) => document.id),
        },
    };
}
//# sourceMappingURL=composer.js.map