import type {
  AuthorityDeclaration,
  MetamapDocument,
  MetamapEntity,
  StructuralMapping,
} from "./model.js";
import { valuesEqual } from "./stable.js";

export type GraphRecordKind = "entity" | "mapping" | "authority";
export type GraphChangeKind = "added" | "removed" | "changed";

export interface GraphChange {
  change: GraphChangeKind;
  kind: GraphRecordKind;
  id: string;
  changedProperties?: string[];
}

export interface GraphDiff {
  changes: GraphChange[];
  counts: Record<GraphChangeKind, number>;
}

function changedProperties(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): string[] {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].filter((key) => !valuesEqual(left[key], right[key])).sort();
}

function compareRecords<T extends { id: string }>(
  kind: GraphRecordKind,
  before: readonly T[],
  after: readonly T[],
): GraphChange[] {
  const changes: GraphChange[] = [];
  const beforeById = new Map(before.map((record) => [record.id, record]));
  const afterById = new Map(after.map((record) => [record.id, record]));
  for (const [id, record] of beforeById) {
    const current = afterById.get(id);
    if (!current) {
      changes.push({ change: "removed", kind, id });
    } else if (!valuesEqual(record, current)) {
      changes.push({
        change: "changed",
        kind,
        id,
        changedProperties: changedProperties(
          record as Record<string, unknown>,
          current as Record<string, unknown>,
        ),
      });
    }
  }
  for (const id of afterById.keys()) {
    if (!beforeById.has(id)) changes.push({ change: "added", kind, id });
  }
  return changes;
}

export function diffMetamapDocuments(
  before: MetamapDocument,
  after: MetamapDocument,
): GraphDiff {
  const changes = [
    ...compareRecords<MetamapEntity>("entity", before.entities, after.entities),
    ...compareRecords<StructuralMapping>(
      "mapping",
      before.mappings,
      after.mappings,
    ),
    ...compareRecords<AuthorityDeclaration>(
      "authority",
      before.authorities,
      after.authorities,
    ),
  ].sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id),
  );
  return {
    changes,
    counts: {
      added: changes.filter((entry) => entry.change === "added").length,
      removed: changes.filter((entry) => entry.change === "removed").length,
      changed: changes.filter((entry) => entry.change === "changed").length,
    },
  };
}

export function emptyGraphDiff(): GraphDiff {
  return { changes: [], counts: { added: 0, removed: 0, changed: 0 } };
}
