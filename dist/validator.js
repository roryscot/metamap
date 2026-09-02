import { METAMAP_SCHEMA_VERSION, } from "./model.js";
import { isReferenceIdentifier, isRelationIdentifier } from "./references.js";
import { RelationRegistry } from "./relations.js";
function issue(severity, code, message, path, subjectId) {
    return { severity, code, message, path, subjectId };
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isJsonValue(value) {
    if (value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean") {
        return true;
    }
    if (Array.isArray(value)) {
        return value.every(isJsonValue);
    }
    return isRecord(value) && Object.values(value).every(isJsonValue);
}
function validateProvenance(value, path, issues) {
    if (!isRecord(value)) {
        issues.push(issue("error", "INVALID_PROVENANCE", "Expected an object", path));
        return false;
    }
    const statuses = new Set(["declared", "observed", "generated", "inferred"]);
    if (typeof value.status !== "string" || !statuses.has(value.status)) {
        issues.push(issue("error", "INVALID_PROVENANCE_STATUS", "Provenance status must be declared, observed, generated, or inferred", `${path}.status`));
    }
    if (typeof value.assertedBy !== "string" || value.assertedBy.length === 0) {
        issues.push(issue("error", "INVALID_ASSERTER", "Provenance assertedBy must be a non-empty string", `${path}.assertedBy`));
    }
    if (value.confidence !== undefined &&
        (typeof value.confidence !== "number" ||
            value.confidence < 0 ||
            value.confidence > 1)) {
        issues.push(issue("error", "INVALID_CONFIDENCE", "Confidence must be between 0 and 1", `${path}.confidence`));
    }
    return true;
}
function validateStringArray(value, path, issues, options = {}) {
    if (!Array.isArray(value)) {
        issues.push(issue("error", "EXPECTED_ARRAY", "Expected an array", path));
        return false;
    }
    if (options.nonEmpty && value.length === 0) {
        issues.push(issue("error", "EMPTY_ARRAY", "Array must not be empty", path));
    }
    for (const [index, entry] of value.entries()) {
        if (typeof entry !== "string" || entry.length === 0) {
            issues.push(issue("error", "EXPECTED_STRING", "Expected a non-empty string", `${path}[${index}]`));
        }
        else if (options.identifiers && !isReferenceIdentifier(entry)) {
            issues.push(issue("error", "INVALID_IDENTIFIER", `Expected a URI-like identifier, received ${entry}`, `${path}[${index}]`));
        }
    }
    return true;
}
/** Runtime shape validation for documents read from JSON or external adapters. */
export function validateDocumentShape(value) {
    const issues = [];
    if (!isRecord(value)) {
        return [
            issue("error", "INVALID_DOCUMENT", "Metamap document must be an object", "$"),
        ];
    }
    if (value.schemaVersion !== METAMAP_SCHEMA_VERSION) {
        issues.push(issue("error", "UNSUPPORTED_SCHEMA_VERSION", `Expected schemaVersion ${METAMAP_SCHEMA_VERSION}`, "$.schemaVersion"));
    }
    if (!isReferenceIdentifier(value.id)) {
        issues.push(issue("error", "INVALID_DOCUMENT_ID", "Document id must be URI-like", "$.id"));
    }
    if (typeof value.namespace !== "string" || value.namespace.length === 0) {
        issues.push(issue("error", "INVALID_NAMESPACE", "Namespace must be a non-empty string", "$.namespace"));
    }
    if (value.relationPacks !== undefined) {
        if (!Array.isArray(value.relationPacks)) {
            issues.push(issue("error", "EXPECTED_ARRAY", "Relation packs must be an array", "$.relationPacks"));
        }
        else {
            for (const [index, pack] of value.relationPacks.entries()) {
                const path = `$.relationPacks[${index}]`;
                if (!isRecord(pack)) {
                    issues.push(issue("error", "INVALID_RELATION_PACK_REFERENCE", "Relation pack reference must be an object", path));
                    continue;
                }
                if (!isReferenceIdentifier(pack.id)) {
                    issues.push(issue("error", "INVALID_IDENTIFIER", "Relation pack id must be URI-like", `${path}.id`));
                }
                if (typeof pack.version !== "string" || pack.version.length === 0) {
                    issues.push(issue("error", "INVALID_RELATION_PACK_VERSION", "Relation pack version must be a non-empty string", `${path}.version`));
                }
            }
        }
    }
    if (!Array.isArray(value.entities)) {
        issues.push(issue("error", "EXPECTED_ARRAY", "Expected an array", "$.entities"));
    }
    else {
        for (const [index, entity] of value.entities.entries()) {
            const path = `$.entities[${index}]`;
            if (!isRecord(entity)) {
                issues.push(issue("error", "INVALID_ENTITY", "Entity must be an object", path));
                continue;
            }
            if (!isReferenceIdentifier(entity.id)) {
                issues.push(issue("error", "INVALID_ENTITY_ID", "Entity id must be URI-like", `${path}.id`));
            }
            if (typeof entity.kind !== "string" || entity.kind.length === 0) {
                issues.push(issue("error", "INVALID_ENTITY_KIND", "Entity kind is required", `${path}.kind`));
            }
            if (entity.locators !== undefined) {
                if (!Array.isArray(entity.locators)) {
                    issues.push(issue("error", "EXPECTED_ARRAY", "Locators must be an array", `${path}.locators`));
                }
                else {
                    for (const [locatorIndex, locator] of entity.locators.entries()) {
                        const locatorPath = `${path}.locators[${locatorIndex}]`;
                        if (!isRecord(locator) || !isReferenceIdentifier(locator.uri)) {
                            issues.push(issue("error", "INVALID_LOCATOR", "Locator must have a URI-like uri", locatorPath));
                        }
                    }
                }
            }
            if (entity.attributes !== undefined && !isJsonValue(entity.attributes)) {
                issues.push(issue("error", "INVALID_ATTRIBUTES", "Attributes must contain JSON values", `${path}.attributes`));
            }
            if (entity.provenance !== undefined) {
                validateProvenance(entity.provenance, `${path}.provenance`, issues);
            }
        }
    }
    if (!Array.isArray(value.mappings)) {
        issues.push(issue("error", "EXPECTED_ARRAY", "Expected an array", "$.mappings"));
    }
    else {
        for (const [index, mapping] of value.mappings.entries()) {
            const path = `$.mappings[${index}]`;
            if (!isRecord(mapping)) {
                issues.push(issue("error", "INVALID_MAPPING", "Mapping must be an object", path));
                continue;
            }
            if (!isReferenceIdentifier(mapping.id)) {
                issues.push(issue("error", "INVALID_MAPPING_ID", "Mapping id must be URI-like", `${path}.id`));
            }
            if (!isRelationIdentifier(mapping.relation)) {
                issues.push(issue("error", "INVALID_RELATION_ID", "Relation must use namespace:name form", `${path}.relation`));
            }
            validateStringArray(mapping.sources, `${path}.sources`, issues, {
                nonEmpty: true,
                identifiers: true,
            });
            validateStringArray(mapping.targets, `${path}.targets`, issues, {
                nonEmpty: true,
                identifiers: true,
            });
            if (typeof mapping.cardinality !== "string" ||
                !["one-to-one", "one-to-many", "many-to-one", "many-to-many"].includes(mapping.cardinality)) {
                issues.push(issue("error", "INVALID_CARDINALITY", "Invalid mapping cardinality", `${path}.cardinality`));
            }
            if (typeof mapping.lossiness !== "string" ||
                !["lossless", "lossy", "unknown"].includes(mapping.lossiness)) {
                issues.push(issue("error", "INVALID_LOSSINESS", "Invalid mapping lossiness", `${path}.lossiness`));
            }
            validateProvenance(mapping.provenance, `${path}.provenance`, issues);
        }
    }
    if (!Array.isArray(value.authorities)) {
        issues.push(issue("error", "EXPECTED_ARRAY", "Expected an array", "$.authorities"));
    }
    else {
        for (const [index, authority] of value.authorities.entries()) {
            const path = `$.authorities[${index}]`;
            if (!isRecord(authority)) {
                issues.push(issue("error", "INVALID_AUTHORITY", "Authority must be an object", path));
                continue;
            }
            for (const key of ["id", "concept", "source"]) {
                if (!isReferenceIdentifier(authority[key])) {
                    issues.push(issue("error", "INVALID_IDENTIFIER", `${key} must be URI-like`, `${path}.${key}`));
                }
            }
            validateStringArray(authority.facts, `${path}.facts`, issues, {
                nonEmpty: true,
            });
            if (typeof authority.mode !== "string" ||
                !["canonical", "delegated", "candidate"].includes(authority.mode)) {
                issues.push(issue("error", "INVALID_AUTHORITY_MODE", "Invalid authority mode", `${path}.mode`));
            }
            if (authority.mode === "delegated") {
                if (!isReferenceIdentifier(authority.delegatedFrom)) {
                    issues.push(issue("error", "INVALID_DELEGATION_PARENT", "Delegated authority must reference its parent declaration", `${path}.delegatedFrom`));
                }
            }
            else if (authority.delegatedFrom !== undefined) {
                issues.push(issue("error", "UNEXPECTED_DELEGATION_PARENT", "Only delegated authority may declare delegatedFrom", `${path}.delegatedFrom`));
            }
            validateProvenance(authority.provenance, `${path}.provenance`, issues);
        }
    }
    return issues;
}
function cardinalityMatches(mapping) {
    switch (mapping.cardinality) {
        case "one-to-one":
            return mapping.sources.length === 1 && mapping.targets.length === 1;
        case "one-to-many":
            return mapping.sources.length === 1;
        case "many-to-one":
            return mapping.targets.length === 1;
        case "many-to-many":
            return true;
    }
}
function factsOverlap(a, b) {
    if (a.facts.includes("*") || b.facts.includes("*")) {
        return true;
    }
    const bFacts = new Set(b.facts);
    return a.facts.some((fact) => bFacts.has(fact));
}
function factsCover(parent, child) {
    if (parent.facts.includes("*"))
        return true;
    if (child.facts.includes("*"))
        return false;
    const parentFacts = new Set(parent.facts);
    return child.facts.every((fact) => parentFacts.has(fact));
}
function isDelegationAncestor(ancestorId, descendantId, authorities) {
    const visited = new Set();
    let current = authorities.get(descendantId);
    while (current?.mode === "delegated" && !visited.has(current.id)) {
        if (current.delegatedFrom === ancestorId)
            return true;
        visited.add(current.id);
        current = authorities.get(current.delegatedFrom);
    }
    return false;
}
function findDelegationCycle(authorities) {
    const byId = new Map(authorities.map((authority) => [authority.id, authority]));
    const visited = new Set();
    const active = new Set();
    const stack = [];
    const visit = (authorityId) => {
        if (active.has(authorityId)) {
            const start = stack.indexOf(authorityId);
            return [...stack.slice(start), authorityId];
        }
        if (visited.has(authorityId))
            return undefined;
        visited.add(authorityId);
        active.add(authorityId);
        stack.push(authorityId);
        const authority = byId.get(authorityId);
        if (authority?.mode === "delegated") {
            const cycle = visit(authority.delegatedFrom);
            if (cycle)
                return cycle;
        }
        stack.pop();
        active.delete(authorityId);
        return undefined;
    };
    for (const authority of authorities) {
        const cycle = visit(authority.id);
        if (cycle)
            return cycle;
    }
    return undefined;
}
function findCycle(mappings, relation) {
    const adjacency = new Map();
    for (const mapping of mappings) {
        if (mapping.relation !== relation)
            continue;
        for (const source of mapping.sources) {
            const targets = adjacency.get(source) ?? new Set();
            for (const target of mapping.targets)
                targets.add(target);
            adjacency.set(source, targets);
        }
    }
    const visited = new Set();
    const active = new Set();
    const stack = [];
    const visit = (entityId) => {
        if (active.has(entityId)) {
            const start = stack.indexOf(entityId);
            return [...stack.slice(start), entityId];
        }
        if (visited.has(entityId))
            return undefined;
        visited.add(entityId);
        active.add(entityId);
        stack.push(entityId);
        for (const target of adjacency.get(entityId) ?? []) {
            const cycle = visit(target);
            if (cycle)
                return cycle;
        }
        stack.pop();
        active.delete(entityId);
        return undefined;
    };
    for (const entityId of adjacency.keys()) {
        const cycle = visit(entityId);
        if (cycle)
            return cycle;
    }
    return undefined;
}
/** Semantic validation after the JSON document has passed shape validation. */
export function validateDocumentSemantics(document, registry = new RelationRegistry()) {
    const issues = [];
    const seenIds = new Map();
    const registerId = (id, path) => {
        const previous = seenIds.get(id);
        if (previous) {
            issues.push(issue("error", "DUPLICATE_ID", `Identifier ${id} is already used at ${previous}`, path, id));
        }
        else {
            seenIds.set(id, path);
        }
    };
    const entities = new Map();
    document.entities.forEach((entity, index) => {
        const path = `$.entities[${index}]`;
        registerId(entity.id, `${path}.id`);
        entities.set(entity.id, entity);
        const locatorUris = entity.locators?.map((locator) => locator.uri) ?? [];
        if (new Set(locatorUris).size !== locatorUris.length) {
            issues.push(issue("warning", "DUPLICATE_LOCATOR", "Entity contains duplicate locators", `${path}.locators`, entity.id));
        }
    });
    for (const pack of document.relationPacks ?? []) {
        if (!registry.hasPack(pack.id, pack.version)) {
            issues.push(issue("error", "UNAVAILABLE_RELATION_PACK", `Relation pack ${pack.id}@${pack.version} is not registered`, "$.relationPacks", pack.id));
        }
    }
    document.mappings.forEach((mapping, index) => {
        const path = `$.mappings[${index}]`;
        registerId(mapping.id, `${path}.id`);
        if (new Set(mapping.sources).size !== mapping.sources.length) {
            issues.push(issue("error", "DUPLICATE_ENDPOINT", "Mapping sources must be unique", `${path}.sources`, mapping.id));
        }
        if (new Set(mapping.targets).size !== mapping.targets.length) {
            issues.push(issue("error", "DUPLICATE_ENDPOINT", "Mapping targets must be unique", `${path}.targets`, mapping.id));
        }
        const definition = registry.get(mapping.relation);
        if (!definition) {
            issues.push(issue("error", "UNKNOWN_RELATION", `Relation ${mapping.relation} is not registered`, `${path}.relation`, mapping.id));
        }
        else {
            if (definition.cardinalities &&
                !definition.cardinalities.includes(mapping.cardinality)) {
                issues.push(issue("error", "UNSUPPORTED_CARDINALITY", `${mapping.relation} does not allow ${mapping.cardinality}`, `${path}.cardinality`, mapping.id));
            }
            if (!cardinalityMatches(mapping)) {
                issues.push(issue("error", "CARDINALITY_MISMATCH", `${mapping.cardinality} does not match ${mapping.sources.length} source(s) and ${mapping.targets.length} target(s)`, path, mapping.id));
            }
        }
        for (const [side, endpointIds] of [
            ["sources", mapping.sources],
            ["targets", mapping.targets],
        ]) {
            endpointIds.forEach((entityId, endpointIndex) => {
                const entity = entities.get(entityId);
                if (!entity) {
                    issues.push(issue("error", "UNRESOLVED_ENDPOINT", `Mapping endpoint ${entityId} does not resolve`, `${path}.${side}[${endpointIndex}]`, mapping.id));
                    return;
                }
                const allowedKinds = side === "sources"
                    ? definition?.sourceKinds
                    : definition?.targetKinds;
                if (allowedKinds &&
                    !allowedKinds.includes("*") &&
                    !allowedKinds.includes(entity.kind)) {
                    issues.push(issue("error", "INVALID_ENDPOINT_KIND", `${mapping.relation} does not allow ${entity.kind} on ${side}`, `${path}.${side}[${endpointIndex}]`, mapping.id));
                }
            });
        }
    });
    document.authorities.forEach((authority, index) => {
        const path = `$.authorities[${index}]`;
        registerId(authority.id, `${path}.id`);
        if (!entities.has(authority.concept)) {
            issues.push(issue("error", "UNRESOLVED_CONCEPT", `Authority concept ${authority.concept} does not resolve`, `${path}.concept`, authority.id));
        }
        if (!entities.has(authority.source)) {
            issues.push(issue("error", "UNRESOLVED_AUTHORITY_SOURCE", `Authority source ${authority.source} does not resolve`, `${path}.source`, authority.id));
        }
        if (new Set(authority.facts).size !== authority.facts.length) {
            issues.push(issue("error", "DUPLICATE_FACT", "Authority facts must be unique", `${path}.facts`, authority.id));
        }
        if (authority.mode === "candidate") {
            issues.push(issue("warning", "UNRESOLVED_AUTHORITY", `Authority for ${authority.concept} remains a candidate`, path, authority.id));
        }
    });
    const canonical = document.authorities.filter((authority) => authority.mode === "canonical");
    const authoritiesById = new Map(document.authorities.map((authority) => [authority.id, authority]));
    for (let left = 0; left < canonical.length; left += 1) {
        for (let right = left + 1; right < canonical.length; right += 1) {
            const a = canonical[left];
            const b = canonical[right];
            if (a.concept === b.concept && factsOverlap(a, b)) {
                issues.push(issue("error", "AUTHORITY_CONFLICT", `Canonical authorities ${a.id} and ${b.id} overlap for ${a.concept}`, "$.authorities", a.concept));
            }
        }
    }
    const delegatedAuthorities = document.authorities.filter((authority) => authority.mode === "delegated");
    for (const delegated of delegatedAuthorities) {
        const parent = authoritiesById.get(delegated.delegatedFrom);
        if (!parent) {
            issues.push(issue("error", "UNRESOLVED_DELEGATION_PARENT", `Delegated authority ${delegated.id} references missing parent ${delegated.delegatedFrom}`, "$.authorities", delegated.id));
            continue;
        }
        if (parent.mode === "candidate") {
            issues.push(issue("error", "INVALID_DELEGATION_PARENT", `Delegated authority ${delegated.id} cannot descend from candidate ${parent.id}`, "$.authorities", delegated.id));
        }
        if (parent.concept !== delegated.concept) {
            issues.push(issue("error", "DELEGATION_CONCEPT_MISMATCH", `Delegation ${delegated.id} changes concept from ${parent.concept} to ${delegated.concept}`, "$.authorities", delegated.id));
        }
        if (!factsCover(parent, delegated)) {
            issues.push(issue("error", "DELEGATION_FACT_WIDENING", `Delegation ${delegated.id} contains facts not owned by ${parent.id}`, "$.authorities", delegated.id));
        }
    }
    for (let left = 0; left < delegatedAuthorities.length; left += 1) {
        for (let right = left + 1; right < delegatedAuthorities.length; right += 1) {
            const a = delegatedAuthorities[left];
            const b = delegatedAuthorities[right];
            const sameBranch = isDelegationAncestor(a.id, b.id, authoritiesById) ||
                isDelegationAncestor(b.id, a.id, authoritiesById);
            if (a.concept === b.concept && factsOverlap(a, b) && !sameBranch) {
                issues.push(issue("error", "DELEGATION_BRANCH_CONFLICT", `Delegated authorities ${a.id} and ${b.id} overlap without an ancestor relationship`, "$.authorities", a.concept));
            }
        }
    }
    const delegationCycle = findDelegationCycle(document.authorities);
    if (delegationCycle) {
        issues.push(issue("error", "DELEGATION_CYCLE", `Authority delegation contains a cycle: ${delegationCycle.join(" -> ")}`, "$.authorities", delegationCycle[0]));
    }
    for (const definition of registry.all()) {
        if (definition.cyclePolicy !== "forbid")
            continue;
        const cycle = findCycle(document.mappings, definition.id);
        if (cycle) {
            issues.push(issue("error", "FORBIDDEN_RELATION_CYCLE", `${definition.id} contains a cycle: ${cycle.join(" -> ")}`, "$.mappings", definition.id));
        }
    }
    return issues;
}
export function validateMetamapDocument(value, registry = new RelationRegistry()) {
    const shapeIssues = validateDocumentShape(value);
    const hasShapeErrors = shapeIssues.some((entry) => entry.severity === "error");
    const semanticIssues = hasShapeErrors
        ? []
        : validateDocumentSemantics(value, registry);
    const issues = [...shapeIssues, ...semanticIssues];
    return {
        valid: !issues.some((entry) => entry.severity === "error"),
        issues,
    };
}
//# sourceMappingURL=validator.js.map