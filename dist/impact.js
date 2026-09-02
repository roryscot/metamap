import { RelationRegistry } from "./relations.js";
function addEdge(adjacency, source, target, mapping) {
    const edges = adjacency.get(source) ?? [];
    edges.push({ mapping, target });
    adjacency.set(source, edges);
}
function mappingEdges(document, activeMappings, registry) {
    const adjacency = new Map();
    for (const mapping of document.mappings) {
        if (activeMappings && !activeMappings.has(mapping.id))
            continue;
        const direction = registry.get(mapping.relation)?.impactDirection ?? "both";
        if (direction === "none")
            continue;
        for (const source of mapping.sources) {
            for (const target of mapping.targets) {
                if (direction === "source-to-target" || direction === "both") {
                    addEdge(adjacency, source, target, mapping);
                }
                if (direction === "target-to-source" || direction === "both") {
                    addEdge(adjacency, target, source, mapping);
                }
            }
        }
    }
    return adjacency;
}
/**
 * Calculate the causal blast radius of changed subjects. Paths include mapping
 * identifiers so a diagnostic explains why each downstream subject is affected.
 */
export function analyzeImpact(document, options) {
    const registry = options.registry ?? new RelationRegistry();
    const adjacency = mappingEdges(document, options.activeMappings, registry);
    const mappings = new Map(document.mappings.map((entry) => [entry.id, entry]));
    const authorities = new Map(document.authorities.map((entry) => [entry.id, entry]));
    const constraints = new Map((options.policy?.constraints ?? []).map((entry) => [entry.id, entry]));
    const evidence = new Map((options.policy?.evidence ?? []).map((entry) => [entry.id, entry]));
    const paths = new Map();
    const queue = [];
    const enqueue = (subjectId, path) => {
        if (paths.has(subjectId))
            return;
        paths.set(subjectId, path);
        queue.push(subjectId);
    };
    for (const changed of [...new Set(options.changedSubjects)].sort()) {
        enqueue(changed, [changed]);
        const changedMapping = mappings.get(changed);
        if (changedMapping) {
            for (const endpoint of [
                ...changedMapping.sources,
                ...changedMapping.targets,
            ]) {
                enqueue(endpoint, [changed, endpoint]);
            }
        }
        const authority = authorities.get(changed);
        if (authority) {
            enqueue(authority.concept, [changed, authority.concept]);
            enqueue(authority.source, [changed, authority.source]);
        }
        for (const subject of constraints.get(changed)?.subjects ?? []) {
            enqueue(subject, [changed, subject]);
        }
        for (const subject of evidence.get(changed)?.subjects ?? []) {
            enqueue(subject, [changed, subject]);
        }
    }
    while (queue.length > 0) {
        const current = queue.shift();
        if (!current)
            continue;
        const currentPath = paths.get(current) ?? [current];
        for (const edge of adjacency.get(current) ?? []) {
            const mappingPath = [...currentPath, edge.mapping.id];
            if (!paths.has(edge.mapping.id)) {
                paths.set(edge.mapping.id, mappingPath);
            }
            enqueue(edge.target, [...mappingPath, edge.target]);
        }
    }
    const pathEntries = [...paths]
        .map(([subjectId, path]) => ({ subjectId, path }))
        .sort((left, right) => left.subjectId.localeCompare(right.subjectId));
    return {
        changedSubjects: [...new Set(options.changedSubjects)].sort(),
        affectedSubjects: pathEntries.map((entry) => entry.subjectId),
        paths: pathEntries,
    };
}
//# sourceMappingURL=impact.js.map