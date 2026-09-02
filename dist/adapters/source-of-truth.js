import { CORE_RELATION_PACK_ID, CORE_RELATION_PACK_VERSION, METAMAP_SCHEMA_VERSION, } from "../model.js";
import { hasAmbiguousPathLanguage, isPathPattern, makeRepositoryUri, makeUrn, } from "../references.js";
const provenance = {
    status: "declared",
    assertedBy: "adapter:legacy-sources-of-truth",
};
function asAttributes(entry) {
    const attributes = {};
    if (entry.updateSteps)
        attributes.updateSteps = entry.updateSteps;
    if (entry.note)
        attributes.note = entry.note;
    return attributes;
}
function outputLooksLikePath(output) {
    return output.includes("/") && !output.includes(" ");
}
/**
 * Import the current concept -> paths -> outputs catalog without pretending
 * that every listed path is already an unambiguous canonical authority.
 */
export function adaptLegacySourcesOfTruth(legacy, options = {}) {
    const namespace = options.namespace ?? "metamap";
    const repository = options.repository ?? "repository";
    const entities = new Map();
    const mappings = [];
    const authorities = [];
    const warnings = [];
    const addEntity = (entity) => {
        entities.set(entity.id, entity);
    };
    for (const entry of legacy.sourcesOfTruth) {
        const conceptId = makeUrn(namespace, "concept", entry.id);
        addEntity({
            id: conceptId,
            kind: "concept",
            label: entry.label,
            attributes: asAttributes(entry),
            provenance,
        });
        const authorityMode = entry.paths.length === 1 ? "canonical" : "candidate";
        if (entry.paths.length > 1) {
            warnings.push({
                code: "LEGACY_MULTIPLE_SOURCES",
                message: `${entry.id} has ${entry.paths.length} sources with no fact-level ownership`,
                entryId: entry.id,
            });
        }
        for (const [pathIndex, rawPath] of entry.paths.entries()) {
            const artifactId = makeUrn("metamap", "legacy-artifact", rawPath);
            addEntity({
                id: artifactId,
                kind: "artifact",
                label: rawPath,
                locators: [{ uri: makeRepositoryUri(rawPath, repository) }],
                attributes: { rawPath },
                provenance,
            });
            mappings.push({
                id: makeUrn("metamap", "mapping", `${entry.id}:references:${pathIndex}`),
                relation: "core:references",
                sources: [conceptId],
                targets: [artifactId],
                cardinality: "one-to-one",
                lossiness: "unknown",
                provenance,
            });
            authorities.push({
                id: makeUrn("metamap", "authority", `${entry.id}:${pathIndex}`),
                concept: conceptId,
                source: artifactId,
                facts: ["*"],
                mode: authorityMode,
                provenance,
            });
            if (hasAmbiguousPathLanguage(rawPath)) {
                warnings.push({
                    code: "LEGACY_AMBIGUOUS_PATH",
                    message: `${entry.id} contains prose where a resolvable locator is required`,
                    entryId: entry.id,
                    value: rawPath,
                });
            }
            if (isPathPattern(rawPath)) {
                warnings.push({
                    code: "LEGACY_PATH_PATTERN",
                    message: `${entry.id} uses a path pattern that requires an adapter to resolve`,
                    entryId: entry.id,
                    value: rawPath,
                });
            }
        }
        for (const [outputIndex, output] of entry.outputs.entries()) {
            const outputId = makeUrn("metamap", "legacy-output", output);
            addEntity({
                id: outputId,
                kind: "projection",
                label: output,
                locators: outputLooksLikePath(output)
                    ? [{ uri: makeRepositoryUri(output, repository) }]
                    : undefined,
                attributes: { legacyDescription: output },
                provenance,
            });
            mappings.push({
                id: makeUrn("metamap", "mapping", `${entry.id}:generates:${outputIndex}`),
                relation: "core:generates",
                sources: [conceptId],
                targets: [outputId],
                cardinality: "one-to-one",
                lossiness: "unknown",
                provenance,
            });
        }
        if (entry.specDoc) {
            const specId = makeUrn("metamap", "legacy-artifact", entry.specDoc);
            addEntity({
                id: specId,
                kind: "specification",
                label: entry.specDoc,
                locators: [{ uri: makeRepositoryUri(entry.specDoc, repository) }],
                attributes: { rawPath: entry.specDoc },
                provenance,
            });
            mappings.push({
                id: makeUrn("metamap", "mapping", `${entry.id}:specified-by`),
                relation: "core:specified_by",
                sources: [conceptId],
                targets: [specId],
                cardinality: "one-to-one",
                lossiness: "unknown",
                provenance,
            });
        }
    }
    return {
        document: {
            $schema: "./schemas/metamap-graph.schema.json",
            schemaVersion: METAMAP_SCHEMA_VERSION,
            id: options.documentId ??
                makeUrn(namespace, "metamap", "legacy-sources-of-truth"),
            namespace,
            label: options.label ?? "Imported sources of truth",
            relationPacks: [
                {
                    id: CORE_RELATION_PACK_ID,
                    version: CORE_RELATION_PACK_VERSION,
                },
            ],
            entities: [...entities.values()],
            mappings,
            authorities,
            metadata: {
                adapter: "legacy-sources-of-truth",
                legacyDescription: legacy.description ?? "",
            },
        },
        warnings,
    };
}
export function isLegacySourceOfTruthDocument(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const candidate = value;
    return (Array.isArray(candidate.sourcesOfTruth) &&
        candidate.sourcesOfTruth.every((entry) => {
            if (typeof entry !== "object" || entry === null)
                return false;
            const item = entry;
            return (typeof item.id === "string" &&
                typeof item.label === "string" &&
                Array.isArray(item.paths) &&
                item.paths.every((path) => typeof path === "string") &&
                Array.isArray(item.outputs) &&
                item.outputs.every((output) => typeof output === "string"));
        }));
}
//# sourceMappingURL=source-of-truth.js.map