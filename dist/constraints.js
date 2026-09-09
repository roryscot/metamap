import { isReferenceIdentifier, isRelationIdentifier } from "./references.js";
function issue(constraint, code, message, subjectId) {
    return {
        severity: "error",
        code,
        message,
        subjectId: subjectId ?? constraint.id,
    };
}
function parameterString(parameters, name) {
    const value = parameters?.[name];
    return typeof value === "string" ? value : undefined;
}
function parameterNumber(parameters, name) {
    const value = parameters?.[name];
    return typeof value === "number" ? value : undefined;
}
function parameterBoolean(parameters, name) {
    const value = parameters?.[name];
    return typeof value === "boolean" ? value : undefined;
}
function parameterObject(parameters, name) {
    const value = parameters?.[name];
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
function parameterStrings(parameters, name) {
    const value = parameters?.[name];
    return Array.isArray(value) &&
        value.every((entry) => typeof entry === "string")
        ? value
        : undefined;
}
function activeMappings(context) {
    return context.document.mappings.filter((mapping) => context.activeMappings.has(mapping.id));
}
function unexpectedParameters(constraint, allowed) {
    const unexpected = Object.keys(constraint.parameters ?? {}).filter((name) => !allowed.includes(name));
    return unexpected.length === 0
        ? []
        : [
            issue(constraint, "INVALID_CONSTRAINT_PARAMETERS", `${constraint.id} has unsupported parameter(s): ${unexpected.join(", ")}`),
        ];
}
const requiresEvidence = (constraint, context) => {
    const unexpected = unexpectedParameters(constraint, [
        "minimumConfidence",
        "kinds",
    ]);
    if (unexpected.length > 0)
        return unexpected;
    const minimumConfidence = parameterNumber(constraint.parameters, "minimumConfidence") ?? 0;
    const kinds = parameterStrings(constraint.parameters, "kinds");
    if ((constraint.parameters?.minimumConfidence !== undefined &&
        parameterNumber(constraint.parameters, "minimumConfidence") ===
            undefined) ||
        minimumConfidence < 0 ||
        minimumConfidence > 1 ||
        (constraint.parameters?.kinds !== undefined && kinds === undefined)) {
        return [
            issue(constraint, "INVALID_CONSTRAINT_PARAMETERS", `${constraint.id} minimumConfidence must be between 0 and 1`),
        ];
    }
    const allowedKinds = kinds ? new Set(kinds) : undefined;
    const mappingIds = new Set(context.document.mappings.map((entry) => entry.id));
    return constraint.subjects.flatMap((subject) => {
        if (mappingIds.has(subject) && !context.activeMappings.has(subject))
            return [];
        const supporting = context.evidence.filter((entry) => entry.result === "supports" &&
            entry.subjects.includes(subject) &&
            (!allowedKinds || allowedKinds.has(entry.kind)) &&
            (entry.confidence ?? 0) >= minimumConfidence);
        return supporting.length > 0
            ? []
            : [
                issue(constraint, "REQUIRED_EVIDENCE_MISSING", `${subject} has no supporting evidence meeting ${constraint.id}`, subject),
            ];
    });
};
function matchingMappings(constraint, context, subject) {
    const relation = parameterString(constraint.parameters, "relation");
    const target = parameterString(constraint.parameters, "target");
    const direction = parameterString(constraint.parameters, "direction") ?? "source";
    return activeMappings(context).filter((mapping) => {
        const subjectMatches = direction === "target"
            ? mapping.targets.includes(subject)
            : direction === "either"
                ? mapping.sources.includes(subject) ||
                    mapping.targets.includes(subject)
                : mapping.sources.includes(subject);
        return (subjectMatches &&
            (!relation || mapping.relation === relation) &&
            (!target || mapping.targets.includes(target)));
    });
}
function validateMappingParameters(constraint) {
    const unexpected = unexpectedParameters(constraint, [
        "relation",
        "target",
        "direction",
    ]);
    if (unexpected.length > 0)
        return unexpected;
    const direction = parameterString(constraint.parameters, "direction");
    const relation = parameterString(constraint.parameters, "relation");
    const target = parameterString(constraint.parameters, "target");
    const invalidTypedParameter = (constraint.parameters?.direction !== undefined && !direction) ||
        (constraint.parameters?.relation !== undefined && !relation) ||
        (constraint.parameters?.target !== undefined && !target);
    if (invalidTypedParameter ||
        (direction && !["source", "target", "either"].includes(direction)) ||
        (relation && !isRelationIdentifier(relation)) ||
        (target && !isReferenceIdentifier(target))) {
        return [
            issue(constraint, "INVALID_CONSTRAINT_PARAMETERS", `${constraint.id} has an invalid relation, target, or direction parameter`),
        ];
    }
    return [];
}
const requiresMapping = (constraint, context) => {
    const invalid = validateMappingParameters(constraint);
    if (invalid.length > 0)
        return invalid;
    return constraint.subjects.flatMap((subject) => matchingMappings(constraint, context, subject).length > 0
        ? []
        : [
            issue(constraint, "REQUIRED_MAPPING_MISSING", `${subject} has no active mapping meeting ${constraint.id}`, subject),
        ]);
};
const forbidsMapping = (constraint, context) => {
    const invalid = validateMappingParameters(constraint);
    if (invalid.length > 0)
        return invalid;
    return constraint.subjects.flatMap((subject) => {
        const matches = matchingMappings(constraint, context, subject);
        return matches.length === 0
            ? []
            : [
                issue(constraint, "FORBIDDEN_MAPPING_ACTIVE", `${subject} has forbidden active mapping(s): ${matches.map((entry) => entry.id).join(", ")}`, subject),
            ];
    });
};
const uniqueTarget = (constraint, context) => {
    const invalid = validateMappingParameters(constraint);
    if (invalid.length > 0)
        return invalid;
    return constraint.subjects.flatMap((subject) => {
        const direction = parameterString(constraint.parameters, "direction") ?? "source";
        const targets = new Set(matchingMappings(constraint, context, subject).flatMap((mapping) => {
            if (direction === "target")
                return mapping.sources;
            if (direction === "either") {
                return mapping.sources.includes(subject)
                    ? mapping.targets
                    : mapping.sources;
            }
            return mapping.targets;
        }));
        return targets.size <= 1
            ? []
            : [
                issue(constraint, "NON_UNIQUE_MAPPING_TARGET", `${subject} resolves to ${targets.size} active targets under ${constraint.id}`, subject),
            ];
    });
};
const requiresAuthority = (constraint, context) => {
    const unexpected = unexpectedParameters(constraint, ["fact"]);
    if (unexpected.length > 0)
        return unexpected;
    const fact = parameterString(constraint.parameters, "fact");
    if (!fact) {
        return [
            issue(constraint, "INVALID_CONSTRAINT_PARAMETERS", `${constraint.id} requires a string fact parameter`),
        ];
    }
    return constraint.subjects.flatMap((subject) => {
        const resolution = context.graph.resolveAuthority(subject, fact);
        return resolution.status === "resolved"
            ? []
            : [
                issue(constraint, "REQUIRED_AUTHORITY_UNRESOLVED", `${subject} has ${resolution.status} authority for ${fact}`, subject),
            ];
    });
};
function entityMatches(entity, kinds, attributes) {
    if (!kinds.includes(entity.kind))
        return false;
    return Object.entries(attributes ?? {}).every(([key, value]) => JSON.stringify(entity.attributes?.[key]) === JSON.stringify(value));
}
function topologyExcluded(entity, relation) {
    if (entity.attributes?.topologyDisposition !== "excluded")
        return false;
    const relations = entity.attributes.exclusionRelations;
    if (relation === undefined || relations === undefined)
        return true;
    return Array.isArray(relations) && relations.includes(relation);
}
function validateTopologyExclusion(constraint, entity) {
    if (!topologyExcluded(entity))
        return [];
    if (typeof entity.attributes?.exclusionReason !== "string" ||
        entity.attributes.exclusionReason.length === 0 ||
        typeof entity.attributes?.exclusionOwner !== "string" ||
        entity.attributes.exclusionOwner.length === 0) {
        return [
            issue(constraint, "INVALID_TOPOLOGY_EXCLUSION", `${entity.id} is excluded without a non-empty exclusionReason and exclusionOwner`, entity.id),
        ];
    }
    const relations = entity.attributes?.exclusionRelations;
    if (relations !== undefined &&
        (!Array.isArray(relations) ||
            relations.length === 0 ||
            !relations.every((entry) => typeof entry === "string" && isRelationIdentifier(entry)))) {
        return [
            issue(constraint, "INVALID_TOPOLOGY_EXCLUSION", `${entity.id} has invalid exclusionRelations`, entity.id),
        ];
    }
    return [];
}
function topologyMappings(context, subject, relation, direction) {
    return activeMappings(context).filter((mapping) => mapping.relation === relation &&
        (direction === "source"
            ? mapping.sources.includes(subject)
            : mapping.targets.includes(subject)));
}
function topologyCounterparts(mappings, direction) {
    return [
        ...new Set(mappings.flatMap((mapping) => direction === "source" ? mapping.targets : mapping.sources)),
    ];
}
const topologyRelationTotality = (constraint, context) => {
    const allowed = [
        "subjectKinds",
        "subjectAttributes",
        "relation",
        "direction",
        "cardinality",
        "counterpartKinds",
        "allowExcluded",
    ];
    const unexpected = unexpectedParameters(constraint, allowed);
    if (unexpected.length > 0)
        return unexpected;
    const subjectKinds = parameterStrings(constraint.parameters, "subjectKinds");
    const subjectAttributes = parameterObject(constraint.parameters, "subjectAttributes");
    const relation = parameterString(constraint.parameters, "relation");
    const direction = parameterString(constraint.parameters, "direction");
    const cardinality = parameterString(constraint.parameters, "cardinality");
    const counterpartKinds = parameterStrings(constraint.parameters, "counterpartKinds");
    const allowExcluded = parameterBoolean(constraint.parameters, "allowExcluded") ?? false;
    if (!subjectKinds ||
        subjectKinds.length === 0 ||
        !relation ||
        !isRelationIdentifier(relation) ||
        !direction ||
        !["source", "target"].includes(direction) ||
        !cardinality ||
        !["exactly-one", "zero-or-one", "one-or-more", "many"].includes(cardinality) ||
        (constraint.parameters?.subjectAttributes !== undefined &&
            !subjectAttributes) ||
        (constraint.parameters?.counterpartKinds !== undefined &&
            !counterpartKinds) ||
        (constraint.parameters?.allowExcluded !== undefined &&
            parameterBoolean(constraint.parameters, "allowExcluded") === undefined)) {
        return [
            issue(constraint, "INVALID_CONSTRAINT_PARAMETERS", `${constraint.id} requires subjectKinds, a relation, source|target direction, and a supported cardinality`),
        ];
    }
    const kinds = new Map(context.document.entities.map((entry) => [entry.id, entry.kind]));
    const subjects = context.document.entities.filter((entry) => entityMatches(entry, subjectKinds, subjectAttributes));
    if (subjects.length === 0) {
        return [
            issue(constraint, "EMPTY_TOPOLOGY_SELECTION", `${constraint.id} selects no topology entities`),
        ];
    }
    return subjects.flatMap((subject) => {
        const exclusionIssues = validateTopologyExclusion(constraint, subject);
        const matches = topologyMappings(context, subject.id, relation, direction);
        if (topologyExcluded(subject, relation)) {
            if (!allowExcluded) {
                return [
                    ...exclusionIssues,
                    issue(constraint, "TOPOLOGY_EXCLUSION_NOT_ALLOWED", `${subject.id} is excluded, but ${constraint.id} does not allow exclusions`, subject.id),
                ];
            }
            return matches.length === 0
                ? exclusionIssues
                : [
                    ...exclusionIssues,
                    issue(constraint, "EXCLUDED_TOPOLOGY_SUBJECT_MAPPED", `${subject.id} is both excluded and mapped through ${relation}`, subject.id),
                ];
        }
        const counterparts = topologyCounterparts(matches, direction);
        const wrongKinds = counterpartKinds
            ? counterparts.filter((id) => {
                const kind = kinds.get(id);
                return kind === undefined || !counterpartKinds.includes(kind);
            })
            : [];
        const count = counterparts.length;
        const missing = (cardinality === "exactly-one" || cardinality === "one-or-more") &&
            count === 0;
        const ambiguous = (cardinality === "exactly-one" || cardinality === "zero-or-one") &&
            count > 1;
        return [
            ...exclusionIssues,
            ...(wrongKinds.length > 0
                ? [
                    issue(constraint, "TOPOLOGY_COUNTERPART_KIND_MISMATCH", `${subject.id} resolves through ${relation} to disallowed kind(s): ${wrongKinds.join(", ")}`, subject.id),
                ]
                : []),
            ...(missing
                ? [
                    issue(constraint, "TOPOLOGY_REQUIRED_RELATION_MISSING", `${subject.id} has no active ${relation} counterpart`, subject.id),
                ]
                : []),
            ...(ambiguous
                ? [
                    issue(constraint, "TOPOLOGY_RELATION_AMBIGUOUS", `${subject.id} resolves through ${relation} to ${count} counterparts`, subject.id),
                ]
                : []),
        ];
    });
};
const topologyReachable = (constraint, context) => {
    const unexpected = unexpectedParameters(constraint, [
        "root",
        "relation",
        "subjectKinds",
        "subjectAttributes",
    ]);
    if (unexpected.length > 0)
        return unexpected;
    const root = parameterString(constraint.parameters, "root");
    const relation = parameterString(constraint.parameters, "relation");
    const subjectKinds = parameterStrings(constraint.parameters, "subjectKinds");
    const subjectAttributes = parameterObject(constraint.parameters, "subjectAttributes");
    const known = new Set(context.document.entities.map((entry) => entry.id));
    if (!root ||
        !known.has(root) ||
        !relation ||
        !isRelationIdentifier(relation) ||
        !subjectKinds ||
        subjectKinds.length === 0 ||
        (constraint.parameters?.subjectAttributes !== undefined &&
            !subjectAttributes)) {
        return [
            issue(constraint, "INVALID_CONSTRAINT_PARAMETERS", `${constraint.id} requires a known root, relation, and subjectKinds`),
        ];
    }
    const outgoing = new Map();
    for (const mapping of activeMappings(context).filter((entry) => entry.relation === relation)) {
        for (const source of mapping.sources) {
            const targets = outgoing.get(source) ?? [];
            targets.push(...mapping.targets);
            outgoing.set(source, targets);
        }
    }
    const visited = new Set([root]);
    const queue = [root];
    for (let index = 0; index < queue.length; index += 1) {
        for (const target of outgoing.get(queue[index]) ?? []) {
            if (!visited.has(target)) {
                visited.add(target);
                queue.push(target);
            }
        }
    }
    const selected = context.document.entities.filter((entry) => entityMatches(entry, subjectKinds, subjectAttributes));
    if (selected.length === 0) {
        return [
            issue(constraint, "EMPTY_TOPOLOGY_SELECTION", `${constraint.id} selects no topology entities`),
        ];
    }
    return selected.flatMap((entity) => visited.has(entity.id)
        ? []
        : [
            issue(constraint, "TOPOLOGY_ENTITY_UNREACHABLE", `${entity.id} is not reachable from ${root} through ${relation}`, entity.id),
        ]);
};
const topologyContextSatisfied = (constraint, context) => {
    const unexpected = unexpectedParameters(constraint, [
        "subjectKinds",
        "subjectAttributes",
        "requiresRelation",
        "providesRelation",
        "renderedInRelation",
        "parentRelation",
        "hostsProviderRelation",
    ]);
    if (unexpected.length > 0)
        return unexpected;
    const subjectKinds = parameterStrings(constraint.parameters, "subjectKinds");
    const subjectAttributes = parameterObject(constraint.parameters, "subjectAttributes");
    const requiresRelation = parameterString(constraint.parameters, "requiresRelation");
    const providesRelation = parameterString(constraint.parameters, "providesRelation");
    const renderedInRelation = parameterString(constraint.parameters, "renderedInRelation");
    const parentRelation = parameterString(constraint.parameters, "parentRelation");
    const hostsProviderRelation = parameterString(constraint.parameters, "hostsProviderRelation");
    const relations = [
        requiresRelation,
        providesRelation,
        renderedInRelation,
        parentRelation,
        hostsProviderRelation,
    ];
    if (!subjectKinds ||
        subjectKinds.length === 0 ||
        relations.some((entry) => !entry || !isRelationIdentifier(entry)) ||
        (constraint.parameters?.subjectAttributes !== undefined &&
            !subjectAttributes)) {
        return [
            issue(constraint, "INVALID_CONSTRAINT_PARAMETERS", `${constraint.id} requires subjectKinds and five valid topology relations`),
        ];
    }
    const active = activeMappings(context);
    const outgoingTargets = (source, relation) => [
        ...new Set(active
            .filter((mapping) => mapping.relation === relation && mapping.sources.includes(source))
            .flatMap((mapping) => mapping.targets)),
    ];
    const incomingSources = (target, relation) => [
        ...new Set(active
            .filter((mapping) => mapping.relation === relation && mapping.targets.includes(target))
            .flatMap((mapping) => mapping.sources)),
    ];
    const selected = context.document.entities.filter((entry) => entityMatches(entry, subjectKinds, subjectAttributes) &&
        !topologyExcluded(entry, requiresRelation));
    if (selected.length === 0) {
        return [
            issue(constraint, "EMPTY_TOPOLOGY_SELECTION", `${constraint.id} selects no topology entities`),
        ];
    }
    return selected.flatMap((subject) => {
        const required = outgoingTargets(subject.id, requiresRelation);
        const initialScopes = outgoingTargets(subject.id, renderedInRelation);
        return required.flatMap((requiredContext) => {
            let level = [...initialScopes];
            const visited = new Set();
            while (level.length > 0) {
                const providers = new Set();
                for (const scope of level) {
                    for (const contextId of outgoingTargets(scope, providesRelation)) {
                        if (contextId === requiredContext)
                            providers.add(scope);
                    }
                    for (const provider of outgoingTargets(scope, hostsProviderRelation)) {
                        if (outgoingTargets(provider, providesRelation).includes(requiredContext)) {
                            providers.add(provider);
                        }
                    }
                }
                if (providers.size === 1)
                    return [];
                if (providers.size > 1) {
                    return [
                        issue(constraint, "TOPOLOGY_CONTEXT_PROVIDER_AMBIGUOUS", `${subject.id} resolves ${requiredContext} to ${providers.size} providers at the same scope depth`, subject.id),
                    ];
                }
                const next = new Set();
                for (const scope of level) {
                    visited.add(scope);
                    for (const parent of incomingSources(scope, parentRelation)) {
                        if (!visited.has(parent))
                            next.add(parent);
                    }
                }
                level = [...next];
            }
            return [
                issue(constraint, "TOPOLOGY_CONTEXT_PROVIDER_MISSING", `${subject.id} requires ${requiredContext}, but no provider dominates its rendering scope`, subject.id),
            ];
        });
    });
};
export class ConstraintRegistry {
    evaluators = new Map();
    constructor() {
        this.register("core:requires-evidence", requiresEvidence);
        this.register("core:requires-mapping", requiresMapping);
        this.register("core:forbids-mapping", forbidsMapping);
        this.register("core:unique-target", uniqueTarget);
        this.register("core:requires-authority", requiresAuthority);
        this.register("topology:relation-totality", topologyRelationTotality);
        this.register("topology:reachable", topologyReachable);
        this.register("topology:context-satisfied", topologyContextSatisfied);
    }
    register(kind, evaluator) {
        if (this.evaluators.has(kind)) {
            throw new Error(`Constraint evaluator ${kind} is already registered`);
        }
        this.evaluators.set(kind, evaluator);
    }
    get(kind) {
        return this.evaluators.get(kind);
    }
}
//# sourceMappingURL=constraints.js.map