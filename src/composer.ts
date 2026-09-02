import {
  METAMAP_SCHEMA_VERSION,
  type AuthorityDeclaration,
  type MetamapDocument,
  type MetamapEntity,
  type RelationPackReference,
  type StructuralMapping,
} from "./model.js";

export class MetamapCompositionError extends Error {
  constructor(
    message: string,
    public readonly identifier?: string,
  ) {
    super(message);
    this.name = "MetamapCompositionError";
  }
}

export interface CompositionOptions {
  id: string;
  namespace: string;
  label?: string;
  revision?: string;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}

function equivalent(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right))
  );
}

function mergeById<T extends { id: string }>(
  documents: readonly MetamapDocument[],
  select: (document: MetamapDocument) => readonly T[],
  kind: string,
): T[] {
  const merged = new Map<string, T>();
  for (const document of documents) {
    for (const item of select(document)) {
      const existing = merged.get(item.id);
      if (existing && !equivalent(existing, item)) {
        throw new MetamapCompositionError(
          `Conflicting ${kind} definition for ${item.id}`,
          item.id,
        );
      }
      merged.set(item.id, existing ?? item);
    }
  }
  return [...merged.values()];
}

function mergeRelationPacks(
  documents: readonly MetamapDocument[],
): RelationPackReference[] {
  const merged = new Map<string, RelationPackReference>();
  for (const document of documents) {
    for (const pack of document.relationPacks ?? []) {
      const existing = merged.get(pack.id);
      if (existing && existing.version !== pack.version) {
        throw new MetamapCompositionError(
          `Relation pack ${pack.id} has incompatible versions ${existing.version} and ${pack.version}`,
          pack.id,
        );
      }
      if (existing && !equivalent(existing, pack)) {
        throw new MetamapCompositionError(
          `Relation pack ${pack.id}@${pack.version} has conflicting references`,
          pack.id,
        );
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
export function composeMetamapDocuments(
  documents: readonly MetamapDocument[],
  options: CompositionOptions,
): MetamapDocument {
  if (documents.length === 0) {
    throw new MetamapCompositionError("At least one metamap shard is required");
  }
  const documentIds = new Set<string>();
  for (const document of documents) {
    if (document.schemaVersion !== METAMAP_SCHEMA_VERSION) {
      throw new MetamapCompositionError(
        `Cannot compose ${document.id}: unsupported schema ${document.schemaVersion}`,
        document.id,
      );
    }
    if (documentIds.has(document.id)) {
      throw new MetamapCompositionError(
        `Duplicate shard id ${document.id}`,
        document.id,
      );
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
    entities: mergeById<MetamapEntity>(
      documents,
      (item) => item.entities,
      "entity",
    ),
    mappings: mergeById<StructuralMapping>(
      documents,
      (item) => item.mappings,
      "mapping",
    ),
    authorities: mergeById<AuthorityDeclaration>(
      documents,
      (item) => item.authorities,
      "authority",
    ),
    metadata: {
      composedFrom: documents.map((document) => document.id),
    },
  };
}
