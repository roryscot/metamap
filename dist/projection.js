import { readFileSync } from "node:fs";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { isReferenceIdentifier, isRelationIdentifier } from "./references.js";
import { RelationRegistry } from "./relations.js";
import { stableJson, valueDigest } from "./stable.js";
import { validateViableGeneration } from "./viability.js";
import { validateMetamapDocument } from "./validator.js";
export const METAMAP_PROJECTION_SPEC_VERSION = "1.0.0";
export const METAMAP_PROJECTION_VERSION = "1.0.0";
const Ajv2020 = Ajv2020Module.default;
const addFormats = addFormatsModule.default;
const specSchema = JSON.parse(readFileSync(new URL("../schemas/metamap-projection-spec.schema.json", import.meta.url), "utf8"));
const projectionSchema = JSON.parse(readFileSync(new URL("../schemas/metamap-projection.schema.json", import.meta.url), "utf8"));
const specSchemaValidator = addFormats(new Ajv2020({ allErrors: true, strict: true })).compile(specSchema);
const projectionSchemaValidator = addFormats(new Ajv2020({ allErrors: true, strict: true })).compile(projectionSchema);
function issue(code, message, options = {}) {
    return { severity: "error", code, message, ...options };
}
function schemaIssues(errors) {
    return (errors ?? []).map((error) => issue("INVALID_PROJECTION_SPEC", error.message ?? "Projection specification is invalid", { path: error.instancePath || "$" }));
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function validateProjectionSpec(value) {
    if (!specSchemaValidator(value)) {
        return { valid: false, issues: schemaIssues(specSchemaValidator.errors) };
    }
    const spec = value;
    const issues = [];
    if (!isReferenceIdentifier(spec.id)) {
        issues.push(issue("INVALID_PROJECTION_SPEC_ID", `${spec.id} is not URI-like`, {
            path: "$.id",
        }));
    }
    const names = new Set();
    for (const [index, slot] of spec.slots.entries()) {
        if (names.has(slot.name)) {
            issues.push(issue("DUPLICATE_PROJECTION_SLOT", `Projection slot ${slot.name} is declared more than once`, {
                slot: slot.name,
                path: `$.slots[${index}].name`,
            }));
        }
        names.add(slot.name);
        if (!isRelationIdentifier(slot.relation)) {
            issues.push(issue("INVALID_PROJECTION_RELATION", `${slot.relation} is not a relation identifier`, {
                slot: slot.name,
                path: `$.slots[${index}].relation`,
            }));
        }
    }
    if (spec.pathTree?.delimiter?.includes(":")) {
        issues.push(issue("INVALID_PATH_TREE_DELIMITER", "Path-tree delimiter cannot contain ':' because that marks path parameters", { path: "$.pathTree.delimiter" }));
    }
    return { valid: issues.length === 0, issues };
}
export function parseProjectionSpec(value) {
    const result = validateProjectionSpec(value);
    if (!result.valid || !isRecord(value)) {
        throw new Error(`Invalid Metamap projection specification: ${result.issues
            .map((entry) => `${entry.path ?? "$"} ${entry.message}`)
            .join("; ")}`);
    }
    return value;
}
/** Validate both the portable projection shape and its content address. */
export function validateProjection(value) {
    if (!projectionSchemaValidator(value)) {
        return {
            valid: false,
            issues: (projectionSchemaValidator.errors ?? []).map((error) => issue("INVALID_PROJECTION", error.message ?? "Projection is invalid", {
                path: error.instancePath || "$",
            })),
        };
    }
    const projection = value;
    const { $schema: _schema, id, digest, ...content } = projection;
    const expectedDigest = valueDigest(content);
    const expectedId = `urn:metamap:projection:${expectedDigest.replace(/^sha256:/, "")}`;
    const issues = [];
    if (digest !== expectedDigest) {
        issues.push(issue("PROJECTION_DIGEST_MISMATCH", `Projection digest ${digest} does not match ${expectedDigest}`, { subjectId: id }));
    }
    if (id !== expectedId) {
        issues.push(issue("PROJECTION_ID_MISMATCH", `Projection id ${id} does not match its content address`, { subjectId: id }));
    }
    return { valid: issues.length === 0, issues };
}
export function parseProjection(value) {
    const result = validateProjection(value);
    if (!result.valid || !isRecord(value)) {
        throw new Error(`Invalid Metamap projection: ${result.issues
            .map((entry) => `${entry.path ?? "$"} ${entry.message}`)
            .join("; ")}`);
    }
    return value;
}
function projectEntity(entity) {
    return {
        id: entity.id,
        kind: entity.kind,
        ...(entity.label === undefined ? {} : { label: entity.label }),
        ...(entity.schema === undefined ? {} : { schema: entity.schema }),
        ...(entity.locators === undefined
            ? {}
            : { locators: structuredClone(entity.locators) }),
        ...(entity.attributes === undefined
            ? {}
            : { attributes: structuredClone(entity.attributes) }),
    };
}
function cardinalityIssue(cardinality, count) {
    if (cardinality === "exactly-one") {
        if (count === 0)
            return "missing";
        if (count > 1)
            return "ambiguous";
    }
    if (cardinality === "zero-or-one" && count > 1)
        return "ambiguous";
    if (cardinality === "one-or-more" && count === 0)
        return "missing";
    return undefined;
}
function deepFreeze(value) {
    if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
        return value;
    }
    for (const child of Object.values(value)) {
        deepFreeze(child);
    }
    return Object.freeze(value);
}
function indexMapping(index, subjectId, mapping) {
    let byRelation = index.get(subjectId);
    if (!byRelation) {
        byRelation = new Map();
        index.set(subjectId, byRelation);
    }
    const mappings = byRelation.get(mapping.relation) ?? [];
    mappings.push(mapping);
    byRelation.set(mapping.relation, mappings);
}
function activeMappingIndexes(document, activeMappingIds) {
    const outgoing = new Map();
    const incoming = new Map();
    const active = document.mappings
        .filter((mapping) => activeMappingIds.has(mapping.id))
        .sort((left, right) => left.id.localeCompare(right.id));
    for (const mapping of active) {
        for (const source of mapping.sources) {
            indexMapping(outgoing, source, mapping);
        }
        for (const target of mapping.targets) {
            indexMapping(incoming, target, mapping);
        }
    }
    return { outgoing, incoming };
}
/**
 * Resolve a declarative static projection against exactly one viable
 * generation. Stale generations, inactive links, ambiguity, missing required
 * slots, kind mismatches, and undeclared relations fail closed.
 */
export function compileProjection(document, generation, spec, options = {}) {
    const relationRegistry = options.relationRegistry ?? new RelationRegistry();
    const specValidation = validateProjectionSpec(spec);
    const generationValidation = validateViableGeneration(generation);
    const graphValidation = validateMetamapDocument(document, relationRegistry);
    const issues = [
        ...specValidation.issues,
        ...generationValidation.issues.map((entry) => issue(entry.code, entry.message, {
            subjectId: entry.subjectId,
            path: entry.path,
        })),
        ...graphValidation.issues
            .filter((entry) => entry.severity === "error")
            .map((entry) => issue(entry.code, entry.message, {
            subjectId: entry.subjectId,
            path: entry.path,
        })),
    ];
    if (!specValidation.valid ||
        !generationValidation.valid ||
        !graphValidation.valid) {
        return { status: "rejected", issues };
    }
    const graphDigest = valueDigest(document);
    if (generation.graph.id !== document.id) {
        issues.push(issue("PROJECTION_GRAPH_ID_MISMATCH", `Generation is bound to ${generation.graph.id}, not ${document.id}`, { subjectId: generation.id }));
    }
    if (generation.graph.digest !== graphDigest) {
        issues.push(issue("STALE_PROJECTION_GENERATION", `Generation graph digest does not match ${document.id}`, { subjectId: generation.id }));
    }
    for (const slot of spec.slots) {
        if (!relationRegistry.get(slot.relation)) {
            issues.push(issue("UNKNOWN_PROJECTION_RELATION", `Projection slot ${slot.name} uses unregistered relation ${slot.relation}`, { slot: slot.name }));
        }
    }
    const entities = new Map(document.entities.map((entry) => [entry.id, entry]));
    const activeMappingIds = new Set(generation.activeMappings);
    const graphMappingIds = new Set(document.mappings.map((entry) => entry.id));
    for (const mappingId of activeMappingIds) {
        if (!graphMappingIds.has(mappingId)) {
            issues.push(issue("UNKNOWN_ACTIVE_MAPPING", `Generation activates mapping ${mappingId}, which is absent from the graph`, { subjectId: mappingId }));
        }
    }
    const mappingIndexes = activeMappingIndexes(document, activeMappingIds);
    const explicitIds = spec.select.ids ? new Set(spec.select.ids) : undefined;
    const selectedKinds = spec.select.kinds
        ? new Set(spec.select.kinds)
        : undefined;
    for (const id of explicitIds ?? []) {
        if (!entities.has(id)) {
            issues.push(issue("UNKNOWN_PROJECTION_SUBJECT", `Projection selects missing entity ${id}`, {
                subjectId: id,
            }));
        }
    }
    const subjects = document.entities
        .filter((entity) => (!explicitIds || explicitIds.has(entity.id)) &&
        (!selectedKinds || selectedKinds.has(entity.kind)))
        .sort((left, right) => left.id.localeCompare(right.id));
    if (subjects.length === 0) {
        issues.push(issue("EMPTY_PROJECTION", `Projection ${spec.id} selected no graph entities`, { subjectId: spec.id }));
    }
    const entries = [];
    for (const subject of subjects) {
        const projectedSlots = [];
        for (const slot of spec.slots) {
            const index = slot.direction === "outgoing"
                ? mappingIndexes.outgoing
                : mappingIndexes.incoming;
            const matching = index.get(subject.id)?.get(slot.relation) ?? [];
            const targetIds = new Set();
            for (const mapping of matching) {
                if (mapping.lossiness === "lossy" && slot.allowLossy !== true) {
                    issues.push(issue("LOSSY_PROJECTION_LINK", `${mapping.id} is lossy but slot ${slot.name} does not allow lossy linkage`, { subjectId: subject.id, slot: slot.name }));
                }
                const candidates = slot.direction === "outgoing" ? mapping.targets : mapping.sources;
                for (const id of candidates)
                    targetIds.add(id);
            }
            const unfilteredTargets = [...targetIds]
                .map((id) => entities.get(id))
                .filter((entry) => entry !== undefined);
            const allowedKinds = slot.targetKinds
                ? new Set(slot.targetKinds)
                : undefined;
            const targets = unfilteredTargets
                .filter((entity) => !allowedKinds || allowedKinds.has(entity.kind))
                .sort((left, right) => left.id.localeCompare(right.id));
            if (allowedKinds && unfilteredTargets.length !== targets.length) {
                const rejectedKinds = [
                    ...new Set(unfilteredTargets
                        .filter((entity) => !allowedKinds.has(entity.kind))
                        .map((entity) => entity.kind)),
                ].sort();
                issues.push(issue("PROJECTION_TARGET_KIND_MISMATCH", `${subject.id} slot ${slot.name} resolved disallowed target kind(s): ${rejectedKinds.join(", ")}`, { subjectId: subject.id, slot: slot.name }));
            }
            const cardinality = cardinalityIssue(slot.cardinality, targets.length);
            if (cardinality === "missing") {
                issues.push(issue("REQUIRED_PROJECTION_TARGET_MISSING", `${subject.id} slot ${slot.name} requires ${slot.cardinality}, resolved ${targets.length}`, { subjectId: subject.id, slot: slot.name }));
            }
            else if (cardinality === "ambiguous") {
                issues.push(issue("AMBIGUOUS_PROJECTION_TARGET", `${subject.id} slot ${slot.name} requires ${slot.cardinality}, resolved ${targets.length}: ${targets
                    .map((entry) => entry.id)
                    .join(", ")}`, { subjectId: subject.id, slot: slot.name }));
            }
            projectedSlots.push({
                name: slot.name,
                relation: slot.relation,
                direction: slot.direction,
                cardinality: slot.cardinality,
                mappings: matching.map((entry) => entry.id),
                targets: targets.map(projectEntity),
            });
        }
        entries.push({
            subject: projectEntity(subject),
            slots: projectedSlots.sort((left, right) => left.name.localeCompare(right.name)),
        });
    }
    if (issues.length > 0)
        return { status: "rejected", issues };
    const projectionContent = {
        schemaVersion: METAMAP_PROJECTION_VERSION,
        generation: { id: generation.id, digest: generation.digest },
        graph: { id: document.id, digest: graphDigest },
        spec: { id: spec.id, digest: valueDigest(spec) },
        entries,
    };
    const digest = valueDigest(projectionContent);
    return {
        status: "projected",
        issues: [],
        projection: deepFreeze({
            $schema: "https://raw.githubusercontent.com/roryscot/metamap/v0.4.0/schemas/metamap-projection.schema.json",
            ...projectionContent,
            id: `urn:metamap:projection:${digest.replace(/^sha256:/, "")}`,
            digest,
        }),
    };
}
export function collapseProjectedSlots(entry) {
    return Object.fromEntries(entry.slots.map((slot) => [
        slot.name,
        slot.cardinality === "exactly-one"
            ? slot.targets[0]
            : slot.cardinality === "zero-or-one"
                ? (slot.targets[0] ?? null)
                : slot.targets,
    ]));
}
export function validateExportName(value) {
    const reserved = new Set([
        "await",
        "break",
        "case",
        "catch",
        "class",
        "const",
        "continue",
        "debugger",
        "default",
        "delete",
        "do",
        "else",
        "enum",
        "export",
        "extends",
        "false",
        "finally",
        "for",
        "function",
        "if",
        "import",
        "implements",
        "in",
        "instanceof",
        "interface",
        "let",
        "new",
        "null",
        "package",
        "private",
        "protected",
        "public",
        "return",
        "static",
        "super",
        "switch",
        "this",
        "throw",
        "true",
        "try",
        "typeof",
        "var",
        "void",
        "while",
        "with",
        "yield",
    ]);
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) || reserved.has(value)) {
        throw new Error(`${value} is not a valid TypeScript export identifier`);
    }
}
/** Emit a dependency-free, immutable TypeScript lookup table. */
export function emitTypeScriptProjection(projection, options = {}) {
    const exportName = options.exportName ?? "metamapProjection";
    validateExportName(exportName);
    const table = Object.fromEntries(projection.entries.map((entry) => [
        entry.subject.id,
        {
            subject: entry.subject,
            slots: collapseProjectedSlots(entry),
        },
    ]));
    const typeName = `${exportName[0].toUpperCase()}${exportName.slice(1)}Id`;
    return (`/* Generated by Metamap from ${projection.id}. Do not edit. */\n` +
        `export const ${exportName} = ${stableJson(table, true).trimEnd()} as const;\n\n` +
        `export type ${typeName} = keyof typeof ${exportName};\n\n` +
        `export function resolve${exportName[0].toUpperCase()}${exportName.slice(1)}(id: string): (typeof ${exportName})[${typeName}] {\n` +
        `  if (!Object.prototype.hasOwnProperty.call(${exportName}, id)) {\n` +
        `    throw new Error(\`Unknown Metamap identity \${id}\`);\n` +
        `  }\n` +
        `  return ${exportName}[id as ${typeName}];\n` +
        `}\n`);
}
//# sourceMappingURL=projection.js.map