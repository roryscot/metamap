import type {
  ComparedFact,
  CorrespondenceConfig,
  StructureReferenceConfig,
} from "./config.js";
import {
  CORE_RELATION_PACK_ID,
  CORE_RELATION_PACK_VERSION,
  METAMAP_SCHEMA_VERSION,
  type JsonObject,
  type JsonValue,
  type MetamapDocument,
  type MetamapEntity,
  type Provenance,
  type StructuralMapping,
} from "./model.js";
import { makeUrn } from "./references.js";

export interface DriftIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  correspondenceId?: string;
  sourceId?: string;
  targetId?: string;
  fact?: ComparedFact | "enum-values" | "coverage";
}

export interface CorrespondenceResult {
  document: MetamapDocument;
  issues: DriftIssue[];
  configuredStructureIds: Set<string>;
}

function attribute(entity: MetamapEntity, name: string): JsonValue | undefined {
  return entity.attributes?.[name];
}

function stringAttribute(
  entity: MetamapEntity,
  name: string,
): string | undefined {
  const value = attribute(entity, name);
  return typeof value === "string" ? value : undefined;
}

function booleanAttribute(
  entity: MetamapEntity,
  name: string,
): boolean | undefined {
  const value = attribute(entity, name);
  return typeof value === "boolean" ? value : undefined;
}

function structureKindMatches(
  entity: MetamapEntity,
  reference: StructureReferenceConfig,
): boolean {
  const kind = stringAttribute(entity, "structureKind");
  return (
    kind === reference.kind ||
    (reference.kind === "schema" && kind === "schema") ||
    (reference.kind === "enum" && kind === "enum")
  );
}

function resolveStructure(
  entities: readonly MetamapEntity[],
  reference: StructureReferenceConfig,
): MetamapEntity[] {
  return entities.filter(
    (entity) =>
      stringAttribute(entity, "sourceId") === reference.sourceId &&
      stringAttribute(entity, "name") === reference.name &&
      structureKindMatches(entity, reference),
  );
}

function childrenOf(
  entities: readonly MetamapEntity[],
  structureId: string,
): MetamapEntity[] {
  return entities.filter(
    (entity) => stringAttribute(entity, "structureId") === structureId,
  );
}

function byName(
  entities: readonly MetamapEntity[],
): Map<string, MetamapEntity> {
  const result = new Map<string, MetamapEntity>();
  for (const entity of entities) {
    const name = stringAttribute(entity, "name");
    if (name) result.set(name, entity);
  }
  return result;
}

function symbolicType(type: string): string {
  return type
    .replace(/^(reference|enum):/, "")
    .replace(/schema$/i, "")
    .replaceAll(/[^A-Za-z0-9]/g, "")
    .toLowerCase();
}

function typesCompatible(
  source: string | undefined,
  target: string | undefined,
): boolean {
  if (!source || !target) return source === target;
  if (source === target) return true;
  if (
    (source.startsWith("reference:") || source.startsWith("enum:")) &&
    (target.startsWith("reference:") || target.startsWith("enum:"))
  ) {
    return symbolicType(source) === symbolicType(target);
  }
  return false;
}

function factMatches(
  fact: ComparedFact,
  source: MetamapEntity,
  target: MetamapEntity,
): boolean {
  if (fact === "type") {
    return typesCompatible(
      stringAttribute(source, "dataType"),
      stringAttribute(target, "dataType"),
    );
  }
  if (fact === "cardinality") {
    return (
      stringAttribute(source, "cardinality") ===
      stringAttribute(target, "cardinality")
    );
  }
  if (fact === "presence") {
    return (
      booleanAttribute(source, "presenceRequired") ===
      booleanAttribute(target, "presenceRequired")
    );
  }
  return (
    booleanAttribute(source, "nullable") ===
    booleanAttribute(target, "nullable")
  );
}

function factDescription(fact: ComparedFact, entity: MetamapEntity): string {
  if (fact === "type") return stringAttribute(entity, "dataType") ?? "unknown";
  if (fact === "cardinality") {
    return stringAttribute(entity, "cardinality") ?? "unknown";
  }
  if (fact === "presence") {
    return `presenceRequired=${String(booleanAttribute(entity, "presenceRequired"))}`;
  }
  return `nullable=${String(booleanAttribute(entity, "nullable"))}`;
}

function mapping(
  id: string,
  relation: string,
  sourceId: string,
  targetId: string,
  provenance: Provenance,
  attributes?: JsonObject,
  transform?: string,
): StructuralMapping {
  return {
    id,
    relation,
    sources: [sourceId],
    targets: [targetId],
    cardinality: "one-to-one",
    lossiness: "unknown",
    attributes,
    transform: transform
      ? {
          adapter: "declaration",
          version: "1.0.0",
          entrypoint: transform,
          deterministic: true,
        }
      : undefined,
    provenance,
  };
}

function checkCoverage(
  side: "source" | "target",
  fields: readonly MetamapEntity[],
  mapped: ReadonlySet<string>,
  ignoredNames: readonly string[],
  required: boolean,
  correspondenceId: string,
  issues: DriftIssue[],
): void {
  const ignored = new Set(ignoredNames);
  const names = new Set(
    fields
      .filter((field) => booleanAttribute(field, "relation") !== true)
      .map((field) => stringAttribute(field, "name"))
      .filter((name): name is string => name !== undefined),
  );
  for (const ignoredName of ignored) {
    if (!names.has(ignoredName)) {
      issues.push({
        severity: "warning",
        code: "STALE_COVERAGE_IGNORE",
        message: `${side} ignore ${ignoredName} no longer resolves`,
        correspondenceId,
        fact: "coverage",
      });
    }
  }
  if (!required) return;
  for (const name of names) {
    if (!mapped.has(name) && !ignored.has(name)) {
      issues.push({
        severity: "error",
        code: "UNMAPPED_FIELD",
        message: `${side} field ${name} is neither mapped nor explicitly ignored`,
        correspondenceId,
        fact: "coverage",
      });
    }
  }
}

function processEnum(
  config: CorrespondenceConfig,
  source: MetamapEntity,
  target: MetamapEntity,
  allEntities: readonly MetamapEntity[],
  namespace: string,
  provenance: Provenance,
  mappings: StructuralMapping[],
  issues: DriftIssue[],
): void {
  const sourceValues = byName(childrenOf(allEntities, source.id));
  const targetValues = byName(childrenOf(allEntities, target.id));
  const allowedSourceOnly = new Set(config.enumValues?.allowSourceOnly ?? []);
  const allowedTargetOnly = new Set(config.enumValues?.allowTargetOnly ?? []);

  for (const [name, sourceValue] of sourceValues) {
    const targetValue = targetValues.get(name);
    if (targetValue) {
      mappings.push(
        mapping(
          makeUrn(namespace, "mapping", `${config.id}:enum-value:${name}`),
          config.relation ?? "core:derives_from",
          sourceValue.id,
          targetValue.id,
          provenance,
          { correspondenceId: config.id, value: name },
        ),
      );
    } else {
      const allowed = allowedSourceOnly.has(name);
      issues.push({
        severity: allowed ? "info" : "error",
        code: allowed ? "WAIVED_ENUM_DIFFERENCE" : "ENUM_VALUE_DRIFT",
        message: `${name} exists only in source enum ${config.source.name}`,
        correspondenceId: config.id,
        sourceId: sourceValue.id,
        fact: "enum-values",
      });
    }
  }
  for (const [name, targetValue] of targetValues) {
    if (sourceValues.has(name)) continue;
    const allowed = allowedTargetOnly.has(name);
    issues.push({
      severity: allowed ? "info" : "error",
      code: allowed ? "WAIVED_ENUM_DIFFERENCE" : "ENUM_VALUE_DRIFT",
      message: `${name} exists only in target enum ${config.target.name}`,
      correspondenceId: config.id,
      targetId: targetValue.id,
      fact: "enum-values",
    });
  }
}

export function materializeCorrespondences(
  namespace: string,
  documentId: string,
  discovered: MetamapDocument,
  configurations: readonly CorrespondenceConfig[],
  configRevision: string,
): CorrespondenceResult {
  const provenance: Provenance = {
    status: "declared",
    assertedBy: "metamap-config",
    sourceRevision: configRevision,
  };
  const entities: MetamapEntity[] = [];
  const mappings: StructuralMapping[] = [];
  const authorities: MetamapDocument["authorities"] = [];
  const issues: DriftIssue[] = [];
  const configuredStructureIds = new Set<string>();

  for (const config of configurations) {
    const sourceMatches = resolveStructure(discovered.entities, config.source);
    const targetMatches = resolveStructure(discovered.entities, config.target);
    if (sourceMatches.length !== 1 || targetMatches.length !== 1) {
      if (sourceMatches.length !== 1) {
        issues.push({
          severity: "error",
          code:
            sourceMatches.length === 0
              ? "MISSING_CORRESPONDENCE_SOURCE"
              : "AMBIGUOUS_CORRESPONDENCE_SOURCE",
          message: `${config.source.sourceId}:${config.source.name} resolved ${sourceMatches.length} times`,
          correspondenceId: config.id,
        });
      }
      if (targetMatches.length !== 1) {
        issues.push({
          severity: "error",
          code:
            targetMatches.length === 0
              ? "MISSING_CORRESPONDENCE_TARGET"
              : "AMBIGUOUS_CORRESPONDENCE_TARGET",
          message: `${config.target.sourceId}:${config.target.name} resolved ${targetMatches.length} times`,
          correspondenceId: config.id,
        });
      }
      continue;
    }

    const source = sourceMatches[0];
    const target = targetMatches[0];
    configuredStructureIds.add(source.id);
    configuredStructureIds.add(target.id);
    const conceptId = makeUrn(namespace, "concept", config.id);
    entities.push({
      id: conceptId,
      kind: "concept",
      label: config.id,
      attributes: {
        correspondenceId: config.id,
        sourceStructure: source.id,
        targetStructure: target.id,
      },
      provenance,
    });
    mappings.push({
      id: makeUrn(namespace, "mapping", `${config.id}:implementations`),
      relation: "core:implements",
      sources: [conceptId],
      targets: [source.id, target.id],
      cardinality: "one-to-many",
      lossiness: "unknown",
      provenance,
    });
    mappings.push(
      mapping(
        makeUrn(namespace, "mapping", `${config.id}:structure`),
        config.relation ?? "core:derives_from",
        source.id,
        target.id,
        provenance,
        { correspondenceId: config.id },
      ),
    );

    if (config.authority) {
      authorities.push({
        id: makeUrn(namespace, "authority", config.id),
        concept: conceptId,
        source: config.authority.side === "source" ? source.id : target.id,
        facts: config.authority.facts,
        mode: "canonical",
        provenance,
      });
    }

    if (config.source.kind === "enum" && config.target.kind === "enum") {
      processEnum(
        config,
        source,
        target,
        discovered.entities,
        namespace,
        provenance,
        mappings,
        issues,
      );
    }

    if (!config.fields) continue;
    const sourceFields = childrenOf(discovered.entities, source.id);
    const targetFields = childrenOf(discovered.entities, target.id);
    const sourceByName = byName(sourceFields);
    const targetByName = byName(targetFields);
    const mappedSource = new Set<string>();
    const mappedTarget = new Set<string>();

    for (const pair of config.fields.pairs) {
      const sourceField = sourceByName.get(pair.source);
      const targetField = targetByName.get(pair.target);
      if (!sourceField || !targetField) {
        issues.push({
          severity: "error",
          code: "MISSING_MAPPED_FIELD",
          message: `${pair.source} -> ${pair.target} resolves as ${sourceField ? "source" : "missing source"} / ${targetField ? "target" : "missing target"}`,
          correspondenceId: config.id,
          sourceId: sourceField?.id,
          targetId: targetField?.id,
        });
        continue;
      }
      mappedSource.add(pair.source);
      mappedTarget.add(pair.target);
      const compared = pair.compare ?? [
        "type",
        "presence",
        "nullability",
        "cardinality",
      ];
      const allowed = new Set(pair.allowDifferences ?? []);
      for (const fact of compared) {
        if (factMatches(fact, sourceField, targetField)) continue;
        const waived = allowed.has(fact);
        issues.push({
          severity: waived ? "info" : "error",
          code: waived ? "WAIVED_FIELD_DIFFERENCE" : "FIELD_DRIFT",
          message: `${pair.source} -> ${pair.target} differs for ${fact}: ${factDescription(fact, sourceField)} vs ${factDescription(fact, targetField)}${pair.note ? ` (${pair.note})` : ""}`,
          correspondenceId: config.id,
          sourceId: sourceField.id,
          targetId: targetField.id,
          fact,
        });
      }
      mappings.push(
        mapping(
          makeUrn(
            namespace,
            "mapping",
            `${config.id}:field:${pair.source}:${pair.target}`,
          ),
          config.relation ?? "core:derives_from",
          sourceField.id,
          targetField.id,
          provenance,
          {
            correspondenceId: config.id,
            comparedFacts: compared,
            allowedDifferences: pair.allowDifferences ?? [],
            note: pair.note ?? "",
          },
          pair.transform,
        ),
      );
    }

    checkCoverage(
      "source",
      sourceFields,
      mappedSource,
      config.fields.ignoreSource ?? [],
      config.fields.requireSourceCoverage ?? false,
      config.id,
      issues,
    );
    checkCoverage(
      "target",
      targetFields,
      mappedTarget,
      config.fields.ignoreTarget ?? [],
      config.fields.requireTargetCoverage ?? false,
      config.id,
      issues,
    );
  }

  return {
    issues,
    configuredStructureIds,
    document: {
      schemaVersion: METAMAP_SCHEMA_VERSION,
      id: makeUrn(namespace, "metamap-shard", documentId),
      namespace,
      label: "Declared structural correspondences",
      revision: configRevision,
      relationPacks: [
        {
          id: CORE_RELATION_PACK_ID,
          version: CORE_RELATION_PACK_VERSION,
        },
      ],
      entities,
      mappings,
      authorities,
      metadata: {
        source: "metamap-config",
        correspondenceCount: configurations.length,
      },
    },
  };
}
