import { valuesEqual } from "./stable.js";
function changedProperties(left, right) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].filter((key) => !valuesEqual(left[key], right[key])).sort();
}
function compareRecords(kind, before, after) {
    const changes = [];
    const beforeById = new Map(before.map((record) => [record.id, record]));
    const afterById = new Map(after.map((record) => [record.id, record]));
    for (const [id, record] of beforeById) {
        const current = afterById.get(id);
        if (!current) {
            changes.push({ change: "removed", kind, id });
        }
        else if (!valuesEqual(record, current)) {
            changes.push({
                change: "changed",
                kind,
                id,
                changedProperties: changedProperties(record, current),
            });
        }
    }
    for (const id of afterById.keys()) {
        if (!beforeById.has(id))
            changes.push({ change: "added", kind, id });
    }
    return changes;
}
export function diffMetamapDocuments(before, after) {
    const changes = [
        ...compareRecords("entity", before.entities, after.entities),
        ...compareRecords("mapping", before.mappings, after.mappings),
        ...compareRecords("authority", before.authorities, after.authorities),
    ].sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
    return {
        changes,
        counts: {
            added: changes.filter((entry) => entry.change === "added").length,
            removed: changes.filter((entry) => entry.change === "removed").length,
            changed: changes.filter((entry) => entry.change === "changed").length,
        },
    };
}
export function emptyGraphDiff() {
    return { changes: [], counts: { added: 0, removed: 0, changed: 0 } };
}
//# sourceMappingURL=diff.js.map