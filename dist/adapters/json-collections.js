import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { CORE_RELATION_PACK_ID, CORE_RELATION_PACK_VERSION, METAMAP_SCHEMA_VERSION, } from "../model.js";
import { makeRepositoryUri, makeUrn } from "../references.js";
import { contentDigest } from "../stable.js";
const ADAPTER_VERSION = "1.0.0";
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function decodePointerSegment(segment) {
    return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}
function resolvePointer(document, pointer) {
    if (pointer === "")
        return document;
    if (!pointer.startsWith("/"))
        return undefined;
    let current = document;
    for (const rawSegment of pointer.slice(1).split("/")) {
        const segment = decodePointerSegment(rawSegment);
        if (Array.isArray(current)) {
            const index = Number.parseInt(segment, 10);
            current = Number.isInteger(index) ? current[index] : undefined;
        }
        else if (isRecord(current)) {
            current = current[segment];
        }
        else {
            return undefined;
        }
    }
    return current;
}
function referenceValues(value) {
    if (typeof value === "string")
        return [value];
    if (Array.isArray(value)) {
        return value.filter((entry) => typeof entry === "string");
    }
    return [];
}
function discoverCollection(collection, document, config, context, repositoryPath, digest, documentEntityId, provenance, entities, mappings, diagnostics) {
    const value = resolvePointer(document, collection.pointer);
    if (!Array.isArray(value)) {
        diagnostics.push({
            severity: "error",
            code: "JSON_COLLECTION_NOT_ARRAY",
            message: `${collection.pointer} must resolve to an array`,
            path: repositoryPath,
        });
        return;
    }
    const itemIds = [];
    for (const [index, item] of value.entries()) {
        if (!isRecord(item) || typeof item[collection.idProperty] !== "string") {
            diagnostics.push({
                severity: "error",
                code: "JSON_COLLECTION_ITEM_ID_MISSING",
                message: `${collection.pointer}/${index} lacks string property ${collection.idProperty}`,
                path: repositoryPath,
            });
            continue;
        }
        const name = item[collection.idProperty];
        const labelValue = collection.labelProperty
            ? item[collection.labelProperty]
            : undefined;
        const itemId = makeUrn(context.namespace, collection.entityKind, `${config.id}:${name}`);
        itemIds.push(itemId);
        entities.set(itemId, {
            id: itemId,
            kind: collection.entityKind,
            label: typeof labelValue === "string" ? labelValue : name,
            locators: [
                {
                    uri: `${makeRepositoryUri(repositoryPath, context.repository)}#${collection.pointer}/${index}`,
                    mediaType: "application/json",
                    digest,
                },
            ],
            attributes: {
                adapter: "json-collections",
                sourceId: config.id,
                name,
                collection: collection.pointer,
                order: index,
            },
            provenance,
        });
        for (const reference of collection.references ?? []) {
            const targets = referenceValues(item[reference.property]);
            const targetIds = [];
            for (const target of targets) {
                const targetId = makeUrn(context.namespace, reference.targetKind, target);
                targetIds.push(targetId);
                if (!entities.has(targetId)) {
                    entities.set(targetId, {
                        id: targetId,
                        kind: reference.targetKind,
                        label: target,
                        attributes: {
                            name: target,
                            externalReference: true,
                        },
                        provenance: {
                            status: "inferred",
                            assertedBy: `adapter:json-collections@${ADAPTER_VERSION}`,
                        },
                    });
                }
            }
            if (targetIds.length > 0) {
                mappings.push({
                    id: makeUrn(context.namespace, "mapping", `${config.id}:${collection.pointer}:${name}:${reference.property}`),
                    relation: reference.relation ?? "core:references",
                    sources: [itemId],
                    targets: targetIds,
                    cardinality: targetIds.length === 1 ? "one-to-one" : "one-to-many",
                    lossiness: "lossless",
                    attributes: {
                        jsonProperty: reference.property,
                    },
                    provenance,
                });
            }
        }
    }
    if (itemIds.length > 0) {
        mappings.push({
            id: makeUrn(context.namespace, "mapping", `${config.id}:contains:${collection.pointer}`),
            relation: "core:contains",
            sources: [documentEntityId],
            targets: itemIds,
            cardinality: itemIds.length === 1 ? "one-to-one" : "one-to-many",
            lossiness: "lossless",
            provenance,
        });
    }
}
export class JsonCollectionsAdapter {
    id = "json-collections";
    version = ADAPTER_VERSION;
    async fingerprint(config, context) {
        const absolutePath = resolve(context.repositoryRoot, config.path);
        const source = await readFile(absolutePath, "utf8");
        return [
            {
                path: relative(context.repositoryRoot, absolutePath).replaceAll("\\", "/"),
                digest: contentDigest(source),
            },
        ];
    }
    async discover(config, context) {
        const absolutePath = resolve(context.repositoryRoot, config.path);
        const source = await readFile(absolutePath, "utf8");
        const document = JSON.parse(source);
        const digest = contentDigest(source);
        const repositoryPath = relative(context.repositoryRoot, absolutePath).replaceAll("\\", "/");
        const provenance = {
            status: "observed",
            assertedBy: `adapter:json-collections@${ADAPTER_VERSION}`,
            sourceRevision: digest,
        };
        const documentEntityId = makeUrn(context.namespace, "json-document", config.id);
        const entities = new Map([
            [
                documentEntityId,
                {
                    id: documentEntityId,
                    kind: "json-document",
                    label: config.id,
                    locators: [
                        {
                            uri: makeRepositoryUri(repositoryPath, context.repository),
                            mediaType: "application/json",
                            digest,
                        },
                    ],
                    attributes: {
                        adapter: this.id,
                        sourceId: config.id,
                        name: config.id,
                    },
                    provenance,
                },
            ],
        ]);
        const mappings = [];
        const diagnostics = [];
        for (const collection of config.collections) {
            discoverCollection(collection, document, config, context, repositoryPath, digest, documentEntityId, provenance, entities, mappings, diagnostics);
        }
        return {
            sourceId: config.id,
            adapter: this.id,
            adapterVersion: this.version,
            inputs: [{ path: repositoryPath, digest }],
            diagnostics,
            document: {
                schemaVersion: METAMAP_SCHEMA_VERSION,
                id: makeUrn(context.namespace, "metamap-shard", config.id),
                namespace: context.namespace,
                label: `JSON collection discovery: ${config.id}`,
                revision: digest,
                relationPacks: [
                    {
                        id: CORE_RELATION_PACK_ID,
                        version: CORE_RELATION_PACK_VERSION,
                    },
                ],
                entities: [...entities.values()],
                mappings,
                authorities: [],
                metadata: {
                    adapter: this.id,
                    adapterVersion: this.version,
                    sourceId: config.id,
                },
            },
        };
    }
}
//# sourceMappingURL=json-collections.js.map