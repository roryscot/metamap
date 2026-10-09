import { readFileSync } from "node:fs";
import type { AnySchemaObject, ValidateFunction } from "ajv";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import {
  canonicalDigest,
  canonicalJson,
  legacyReferenceValue,
  parseStrictJson,
} from "./canonical.js";
import { validateCorrespondenceDerivations } from "./derivation.js";
import { UNCERTAINTY_DIMENSIONS } from "./derivation-model.js";
import type { MetamapDocument } from "./model.js";
import { relationPackDigest } from "./relation-pack.js";
import { RelationRegistry } from "./relations.js";
import {
  admittedMappingDependencies,
  derivationAdmissionIssues,
  validateSemanticGeneration,
} from "./semantic.js";
import type { SemanticGeneration } from "./semantic-model.js";
import type {
  SemanticProjection,
  SemanticProjectionResult,
  SemanticProjectionSpec,
} from "./semantic-projection-model.js";
import { valueDigest } from "./stable.js";
import type {
  MetamapProjectionSpec,
  ProjectionCompilationResult,
  ProjectionCompileOptions,
  ProjectionIssue,
} from "./projection.js";
import type { ViableGeneration } from "./viability-model.js";

const Ajv2020 = Ajv2020Module.default;
const addFormats = addFormatsModule.default;
const ajv = addFormats(new Ajv2020({ allErrors: true, strict: true }));
const schema = (name: string): AnySchemaObject =>
  JSON.parse(
    readFileSync(
      new URL(`../schemas/${name}.schema.json`, import.meta.url),
      "utf8",
    ),
  ) as AnySchemaObject;
for (const name of [
  "metamap-graph",
  "metamap-viability",
  "metamap-generation",
  "relation-pack",
  "relation-pack-v2",
  "metamap-derivation",
  "metamap-viability-v2",
  "metamap-generation-v2",
  "metamap-projection-spec",
  "metamap-projection",
  "metamap-projection-spec-v2",
  "metamap-projection-v2",
])
  ajv.addSchema(schema(name));
const specShape = ajv.getSchema(
  schema("metamap-projection-spec-v2").$id as string,
)!;
const projectionShape = ajv.getSchema(
  schema("metamap-projection-v2").$id as string,
)!;
const problem = (
  code: string,
  message: string,
  subjectId?: string,
): ProjectionIssue => ({
  severity: "error",
  code,
  message,
  ...(subjectId ? { subjectId } : {}),
});
function validateShape(
  value: unknown,
  validator: ValidateFunction,
): ProjectionIssue[] {
  try {
    canonicalJson(value);
    if (validator(value)) return [];
    return (validator.errors ?? []).map((issue) => ({
      severity: "error",
      code: "INVALID_SEMANTIC_PROJECTION",
      message: issue.message ?? "Invalid projection value",
      path: issue.instancePath || "$",
    }));
  } catch (error) {
    return [
      problem(
        "INVALID_SEMANTIC_PROJECTION",
        error instanceof Error ? error.message : "Invalid projection value",
      ),
    ];
  }
}
export function legacyProjectionSpecView(
  spec: SemanticProjectionSpec,
): MetamapProjectionSpec {
  const { consumer: _consumer, budget: _budget, ...common } = spec;
  return { ...common, schemaVersion: "1.0.0" };
}
export function parseSemanticProjectionSpec(
  value: unknown,
): SemanticProjectionSpec {
  const issues = validateShape(value, specShape);
  if (issues.length)
    throw new Error(issues.map((issue) => issue.message).join("; "));
  const spec = value as SemanticProjectionSpec;
  if (new Set(spec.slots.map((slot) => slot.name)).size !== spec.slots.length)
    throw new Error("Duplicate semantic projection slot");
  return spec;
}
export function parseSemanticProjectionSpecJson(
  text: string,
): SemanticProjectionSpec {
  return parseSemanticProjectionSpec(parseStrictJson(text));
}
export function semanticProjectionDigest(
  projection: SemanticProjection,
): string {
  const { id: _id, digest: _digest, ...content } = projection;
  return canonicalDigest(content);
}
export function validateSemanticProjection(value: unknown): {
  valid: boolean;
  issues: ProjectionIssue[];
} {
  const issues = validateShape(value, projectionShape);
  if (issues.length) return { valid: false, issues };
  const projection = value as SemanticProjection;
  const digest = semanticProjectionDigest(projection);
  if (
    projection.digest !== digest ||
    projection.id !== `urn:metamap:projection:${digest.slice(7)}`
  )
    issues.push(
      problem(
        "SEMANTIC_PROJECTION_DIGEST_MISMATCH",
        "Projection identity does not match its content",
        projection.id,
      ),
    );
  const semantic = projection.semantic;
  if (
    semantic.risk.status !== "not-evaluated" ||
    semantic.risk.budget !== null ||
    semantic.risk.totalCost !== null ||
    semantic.risk.classifications.length
  )
    issues.push(
      problem(
        "TYPED_BUDGET_NOT_IMPLEMENTED",
        "Requested typed risk results are not yet executable",
        projection.id,
      ),
    );
  const dependencies = new Map(
    semantic.dependencies.map((dependency) => [dependency.mapping, dependency]),
  );
  if (
    new Set(semantic.usedMappings).size !== semantic.usedMappings.length ||
    dependencies.size !== semantic.dependencies.length ||
    dependencies.size !== semantic.usedMappings.length ||
    semantic.usedMappings.some((id) => !dependencies.has(id))
  )
    issues.push(
      problem(
        "INCOMPLETE_PROJECTION_DEPENDENCIES",
        "Every used mapping requires exactly one dependency record",
        projection.id,
      ),
    );
  for (const dependency of dependencies.values())
    if (dependency.premises.some((id) => !dependencies.has(id)))
      issues.push(
        problem(
          "INCOMPLETE_PROJECTION_DEPENDENCIES",
          "A used premise is absent from the projection dependency closure",
          dependency.mapping,
        ),
      );
  const closure = new Set(
    projection.entries.flatMap((entry) =>
      entry.slots.flatMap((slot) => slot.mappings),
    ),
  );
  const queue = [...closure];
  for (let i = 0; i < queue.length; i++)
    for (const premise of dependencies.get(queue[i])?.premises ?? [])
      if (!closure.has(premise)) {
        closure.add(premise);
        queue.push(premise);
      }
  if (
    closure.size !== dependencies.size ||
    [...closure].some((id) => !dependencies.has(id))
  )
    issues.push(
      problem(
        "INCOMPLETE_PROJECTION_DEPENDENCIES",
        "Dependency records must be exactly the closure of the selected slots",
        projection.id,
      ),
    );
  const proofs = new Map(
    semantic.derivations.map((proof) => [proof.id, proof.digest]),
  );
  const usedProofs = new Set(
    [...dependencies.values()].flatMap((dependency) =>
      dependency.derivation ? [dependency.derivation.id] : [],
    ),
  );
  if (
    proofs.size !== semantic.derivations.length ||
    proofs.size !== usedProofs.size ||
    [...dependencies.values()].some(
      (dependency) =>
        dependency.derivation &&
        proofs.get(dependency.derivation.id) !== dependency.derivation.digest,
    )
  )
    issues.push(
      problem(
        "INCOMPLETE_PROJECTION_PROOFS",
        "Dependency proof bindings must be complete and unique",
        projection.id,
      ),
    );
  const uncertainty = new Map(
    semantic.risk.uncertainty.map((entry) => [entry.mapping, entry.dimensions]),
  );
  if (
    uncertainty.size !== semantic.risk.uncertainty.length ||
    uncertainty.size !== dependencies.size ||
    [...dependencies.keys()].some((id) => !uncertainty.has(id)) ||
    [...uncertainty.values()].some(
      (dimensions) =>
        dimensions.length !== UNCERTAINTY_DIMENSIONS.length ||
        new Set(dimensions.map((dimension) => dimension.dimension)).size !==
          UNCERTAINTY_DIMENSIONS.length,
    )
  )
    issues.push(
      problem(
        "INCOMPLETE_PROJECTION_UNCERTAINTY",
        "Every used mapping requires one summary for each uncertainty dimension",
        projection.id,
      ),
    );
  if (
    [...uncertainty.values()].some((dimensions) =>
      dimensions.some(
        (dimension) =>
          dimension.status !== "unknown" ||
          dimension.evidence.length ||
          dimension.assessments.length ||
          dimension.measurementModels.length ||
          dimension.sourceRevisions.length,
      ),
    )
  )
    issues.push(
      problem(
        "TYPED_UNCERTAINTY_NOT_IMPLEMENTED",
        "Requested typed uncertainty results are not yet executable",
        projection.id,
      ),
    );
  for (const ids of [
    semantic.risk.lossyMappings,
    semantic.risk.inferredMappings,
  ])
    if (
      new Set(ids).size !== ids.length ||
      ids.some((id) => !dependencies.has(id))
    )
      issues.push(
        problem(
          "INVALID_PROJECTION_RISK_SUMMARY",
          "Risk flags must identify unique used mappings",
          projection.id,
        ),
      );
  return { valid: issues.length === 0, issues };
}
export function parseSemanticProjection(value: unknown): SemanticProjection {
  const result = validateSemanticProjection(value);
  if (!result.valid)
    throw new Error(result.issues.map((issue) => issue.message).join("; "));
  return value as SemanticProjection;
}
export function parseSemanticProjectionJson(text: string): SemanticProjection {
  return parseSemanticProjection(parseStrictJson(text));
}
function freeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
type LegacyProjector = (
  graph: MetamapDocument,
  generation: ViableGeneration,
  spec: MetamapProjectionSpec,
  options: ProjectionCompileOptions,
) => ProjectionCompilationResult;

/** Preserve the existing selection algorithm; validate and bind new semantics. */
export function compileSemanticProjection(
  graph: MetamapDocument,
  generation: SemanticGeneration,
  spec: SemanticProjectionSpec,
  options: ProjectionCompileOptions,
  legacy: LegacyProjector,
): SemanticProjectionResult {
  try {
    parseSemanticProjectionSpec(spec);
    const validation = validateSemanticGeneration(generation);
    if (!validation.valid)
      return {
        status: "rejected",
        issues: validation.issues.map((issue) =>
          problem(issue.code, issue.message, issue.subjectId),
        ),
      };
    if (spec.budget !== null)
      return {
        status: "rejected",
        issues: [
          problem(
            "TYPED_BUDGET_NOT_IMPLEMENTED",
            "Requested consumer budgets are not yet executable",
            spec.id,
          ),
        ],
      };
    graph = legacyReferenceValue(graph) as unknown as MetamapDocument;
    const registry = new RelationRegistry(
      generation.semantic.packs.map((pack) => pack.value),
    );
    if (options.relationRegistry) {
      const actual = options.relationRegistry
        .allPacks()
        .map((pack) => ({
          id: pack.id,
          version: pack.version,
          digest: relationPackDigest(pack),
        }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const captured = generation.semantic.packs
        .map((pack) => pack.binding)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      if (canonicalDigest(actual) !== canonicalDigest(captured))
        return {
          status: "rejected",
          issues: [
            problem(
              "PROJECTION_PACK_BINDING_MISMATCH",
              "Supplied registry does not match the captured pack profile",
              generation.id,
            ),
          ],
        };
    }
    const checked = validateCorrespondenceDerivations(
      graph,
      generation.semantic.derivations,
      generation.context,
      generation.semantic.derivationLimits,
      registry,
    );
    if (checked.status !== "valid")
      return {
        status: "rejected",
        issues: checked.issues.map((issue) =>
          problem(issue.code, issue.message, issue.subjectId),
        ),
      };
    const active = new Set(generation.activeMappings);
    const declarationIds = new Set(
      generation.semantic.declarations.map((entry) => entry.mapping),
    );
    if (
      declarationIds.size !== generation.semantic.declarations.length ||
      declarationIds.size !== graph.mappings.length ||
      graph.mappings.some((mapping) => !declarationIds.has(mapping.id))
    )
      return {
        status: "rejected",
        issues: [
          problem(
            "GENERATION_DECLARATIONS_MISMATCH",
            "Captured declarations must cover each graph mapping exactly once",
            generation.id,
          ),
        ],
      };
    const dependencies = admittedMappingDependencies(
      graph,
      active,
      checked.checked,
    );
    if (
      canonicalDigest(dependencies) !==
      canonicalDigest(generation.semantic.dependencies)
    )
      return {
        status: "rejected",
        issues: [
          problem(
            "GENERATION_DEPENDENCIES_MISMATCH",
            "Captured dependency records do not match checked graph premises",
            generation.id,
          ),
        ],
      };
    const declarationIssues = derivationAdmissionIssues(
      checked.checked,
      active,
      new Map(
        generation.semantic.declarations.map((entry) => [
          entry.mapping,
          [entry.declaration],
        ]),
      ),
      registry,
    );
    if (declarationIssues.length)
      return {
        status: "rejected",
        issues: declarationIssues.map((issue) =>
          problem(issue.code, issue.message, issue.subjectId),
        ),
      };
    const {
      $schema: _schema,
      schemaVersion: _version,
      id: _id,
      digest: _digest,
      semantic: _semantic,
      ...common
    } = generation;
    const legacyContent = { ...common, schemaVersion: "1.0.0" as const };
    const legacyDigest = valueDigest(legacyContent);
    const result = legacy(
      graph,
      {
        ...legacyContent,
        id: `urn:metamap:generation:${legacyDigest.slice(7)}`,
        digest: legacyDigest,
      },
      legacyProjectionSpecView(spec),
      { relationRegistry: registry },
    );
    if (result.status !== "projected") return result;
    const byMapping = new Map(
      dependencies.map((dependency) => [dependency.mapping, dependency]),
    );
    const used = new Set(
      result.projection.entries.flatMap((entry) =>
        entry.slots.flatMap((slot) => slot.mappings),
      ),
    );
    const queue = [...used];
    for (let index = 0; index < queue.length; index++) {
      const dependency = byMapping.get(queue[index]);
      if (!dependency)
        return {
          status: "rejected",
          issues: [
            problem(
              "INCOMPLETE_PROJECTION_DEPENDENCIES",
              "Selected mapping has no admitted dependency record",
              queue[index],
            ),
          ],
        };
      for (const premise of dependency.premises)
        if (!used.has(premise)) {
          used.add(premise);
          queue.push(premise);
        }
    }
    const usedMappings = [...used].sort();
    const usedDependencies = usedMappings.map((id) => byMapping.get(id)!);
    const derivations = usedDependencies
      .flatMap((dependency) =>
        dependency.derivation ? [dependency.derivation] : [],
      )
      .filter(
        (proof, index, all) =>
          all.findIndex((other) => other.id === proof.id) === index,
      )
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const mappings = new Map(
      graph.mappings.map((mapping) => [mapping.id, mapping]),
    );
    const uncertainty = new Map(
      generation.semantic.uncertainty.map((entry) => [entry.mapping, entry]),
    );
    if (usedMappings.some((id) => !uncertainty.has(id)))
      return {
        status: "rejected",
        issues: [
          problem(
            "INCOMPLETE_PROJECTION_UNCERTAINTY",
            "Selected dependency has no captured uncertainty summary",
            spec.id,
          ),
        ],
      };
    const content = {
      $schema:
        "https://raw.githubusercontent.com/roryscot/metamap/main/schemas/metamap-projection-v2.schema.json",
      schemaVersion: "2.0.0" as const,
      generation: { id: generation.id, digest: generation.digest },
      graph: { id: graph.id, digest: valueDigest(graph) },
      spec: { id: spec.id, digest: canonicalDigest(spec) },
      entries: result.projection.entries,
      semantic: {
        consumer: spec.consumer,
        usedMappings,
        dependencies: usedDependencies,
        derivations,
        risk: {
          status: "not-evaluated" as const,
          budget: null,
          classifications: [],
          totalCost: null,
          lossyMappings: usedMappings.filter(
            (id) => mappings.get(id)?.lossiness === "lossy",
          ),
          inferredMappings: usedMappings.filter(
            (id) => mappings.get(id)?.provenance.status === "inferred",
          ),
          uncertainty: usedMappings.map((id) => uncertainty.get(id)!),
        },
      },
    };
    const digest = canonicalDigest(content);
    const projection = freeze(
      JSON.parse(
        canonicalJson({
          ...content,
          id: `urn:metamap:projection:${digest.slice(7)}`,
          digest,
        }),
      ) as SemanticProjection,
    );
    parseSemanticProjection(projection);
    return { status: "projected", projection, issues: [] };
  } catch (error) {
    return {
      status: "rejected",
      issues: [
        problem(
          "INVALID_SEMANTIC_PROJECTION",
          error instanceof Error ? error.message : "Invalid projection input",
        ),
      ],
    };
  }
}
