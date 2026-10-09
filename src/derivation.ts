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
import {
  evaluateContextExpression,
  parseEvaluationContext,
  requiredContextKeys,
} from "./context.js";
import {
  DERIVATION_ATTRIBUTE,
  UNCERTAINTY_DIMENSIONS,
  type CorrespondenceCompositionRequest,
  type CorrespondenceCompositionResult,
  type CorrespondenceDerivation,
  type DerivationBounds,
  type DerivationIssue,
  type DerivationPremise,
  type PackContentBinding,
} from "./derivation-model.js";
import type {
  MetamapDocument,
  RelationDefinition,
  StructuralMapping,
} from "./model.js";
import { relationPackDigest } from "./relation-pack.js";
import { RelationRegistry } from "./relations.js";
import { valueDigest } from "./stable.js";
import { validateMetamapDocument } from "./validator.js";
import type { EvaluationContext } from "./viability-model.js";

const DERIVATION_SCHEMA =
  "https://raw.githubusercontent.com/roryscot/metamap/main/schemas/metamap-derivation.schema.json";
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
const graphSchema = schema("metamap-graph");
ajv.addSchema(graphSchema);
const validateGraphShape = ajv.getSchema(graphSchema.$id as string)!;
const proofSchema = schema("metamap-derivation");
ajv.addSchema(proofSchema);
const validateProofShape = ajv.getSchema(proofSchema.$id as string)!;
ajv.addSchema(schema("metamap-viability"));
ajv.addSchema(schema("metamap-viability-v2"));
const validateRequestShape = ajv.compile(schema("metamap-composition-request"));
const validateResultShape = ajv.compile(schema("metamap-composition-result"));

function shape(
  value: unknown,
  validator: ValidateFunction,
  description: string,
): void {
  canonicalJson(value);
  if (!validator(value))
    throw new Error(
      `${description}: ${(validator.errors ?? []).map((issue) => `${issue.instancePath || "$"} ${issue.message ?? "is invalid"}`).join("; ")}`,
    );
}

export function derivationDigest(value: CorrespondenceDerivation): string {
  const { id: _id, digest: _digest, ...content } = value;
  return canonicalDigest(content);
}

export function parseCorrespondenceDerivation(
  value: unknown,
): CorrespondenceDerivation {
  shape(value, validateProofShape, "Invalid correspondence derivation");
  const proof = value as CorrespondenceDerivation;
  const digest = derivationDigest(proof);
  if (
    proof.digest !== digest ||
    proof.id !== `urn:metamap:derivation:${digest.slice(7)}`
  )
    throw new Error("Derivation content binding mismatch");
  return proof;
}

export function parseCompositionRequest(
  value: unknown,
): CorrespondenceCompositionRequest {
  shape(value, validateRequestShape, "Invalid composition request");
  return value as CorrespondenceCompositionRequest;
}

export function parseCompositionResult(
  value: unknown,
): CorrespondenceCompositionResult {
  shape(value, validateResultShape, "Invalid composition result");
  if ((value as CorrespondenceCompositionResult).status === "proposed") {
    const proposed = value as Extract<
      CorrespondenceCompositionResult,
      { status: "proposed" }
    >;
    const proof = parseCorrespondenceDerivation(proposed.derivation);
    if (
      canonicalDigest(proposed.mapping) !==
      canonicalDigest(mappingWithProof(proof))
    )
      throw new Error("Composition result does not match its proof");
  }
  return value as CorrespondenceCompositionResult;
}

export function parseCompositionRequestJson(
  text: string,
): CorrespondenceCompositionRequest {
  return parseCompositionRequest(parseStrictJson(text));
}

type FailureStatus = "rejected" | "unsupported" | "unknown" | "incomplete";
class DerivationFailure extends Error {
  constructor(
    readonly status: FailureStatus,
    readonly issue: DerivationIssue,
  ) {
    super(issue.message);
  }
}
function fail(
  status: FailureStatus,
  code: string,
  message: string,
  subjectId?: string,
): never {
  throw new DerivationFailure(status, {
    code,
    message,
    ...(subjectId ? { subjectId } : {}),
  });
}
function failure(
  error: unknown,
): Exclude<CorrespondenceCompositionResult, { status: "proposed" }> {
  return {
    schemaVersion: "1.0.0",
    status: error instanceof DerivationFailure ? error.status : "rejected",
    issues: [
      error instanceof DerivationFailure
        ? error.issue
        : {
            code: "INVALID_DERIVATION_INPUT",
            message:
              error instanceof Error
                ? error.message
                : "Invalid derivation input",
          },
    ],
  };
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function mappingWithProof(proof: CorrespondenceDerivation): StructuralMapping {
  return {
    ...proof.result,
    attributes: {
      ...proof.result.attributes,
      [DERIVATION_ATTRIBUTE]: proof.id,
    },
  };
}

interface CheckedProof {
  proof: CorrespondenceDerivation;
  closure: Set<string>;
}
class DerivationEngine {
  private readonly mappings: Map<string, StructuralMapping>;
  private readonly kinds: Map<string, string>;
  private readonly proofs = new Map<string, CorrespondenceDerivation>();
  private readonly checked = new Map<string, CheckedProof>();
  private readonly visiting = new Set<string>();
  private readonly work = new Set<string>();

  constructor(
    private readonly graph: MetamapDocument,
    private readonly registry: RelationRegistry,
    private readonly context: EvaluationContext,
    private readonly bounds: DerivationBounds,
    proofs: readonly CorrespondenceDerivation[],
  ) {
    shape(
      legacyReferenceValue(graph),
      validateGraphShape,
      "Invalid derivation graph",
    );
    canonicalJson(context);
    parseEvaluationContext(context);
    this.context = JSON.parse(canonicalJson(context)) as EvaluationContext;
    const graphValidation = validateMetamapDocument(graph, registry);
    if (!graphValidation.valid)
      fail(
        "rejected",
        "INVALID_DERIVATION_GRAPH",
        graphValidation.issues
          .filter((issue) => issue.severity === "error")
          .map((issue) => issue.message)
          .join("; "),
      );
    if (
      !Number.isSafeInteger(bounds.maxDepth) ||
      bounds.maxDepth < 0 ||
      bounds.maxDepth > 128 ||
      !Number.isSafeInteger(bounds.maxDerivations) ||
      bounds.maxDerivations < 0 ||
      bounds.maxDerivations > 10000
    )
      fail(
        "rejected",
        "INVALID_DERIVATION_BOUNDS",
        "Depth must be 0–128 and derivation count 0–10000",
      );
    this.mappings = new Map(
      graph.mappings.map((mapping) => [mapping.id, mapping]),
    );
    this.kinds = new Map(
      graph.entities.map((entity) => [entity.id, entity.kind]),
    );
    for (const proof of proofs) {
      parseCorrespondenceDerivation(proof);
      if (this.proofs.has(proof.id))
        fail(
          "rejected",
          "DUPLICATE_DERIVATION",
          "Duplicate derivation record",
          proof.id,
        );
      this.proofs.set(proof.id, proof);
    }
  }

  check(id: string): CheckedProof {
    if (this.visiting.has(id))
      fail(
        "rejected",
        "DERIVATION_CYCLE",
        "Proof dependencies contain a cycle",
        id,
      );
    const cached = this.checked.get(id);
    if (cached) return cached;
    const proof = this.proofs.get(id);
    if (!proof)
      fail(
        "unknown",
        "MISSING_DERIVATION",
        "Required proof record is unavailable",
        id,
      );
    this.work.add(id);
    if (
      this.work.size > this.bounds.maxDerivations ||
      this.visiting.size + 1 > this.bounds.maxDepth
    )
      fail(
        "incomplete",
        "DERIVATION_LIMIT",
        "Proof validation exceeds the declared limits",
        id,
      );
    this.visiting.add(id);
    try {
      if (
        proof.contextDigest !== canonicalDigest(this.context) ||
        canonicalDigest(proof.context) !== canonicalDigest(this.context)
      )
        fail(
          "rejected",
          "DERIVATION_CONTEXT_MISMATCH",
          "Proof was captured for a different context",
          id,
        );
      const current = this.mappings.get(proof.result.id);
      if (
        !current ||
        valueDigest(current) !== valueDigest(mappingWithProof(proof))
      )
        fail(
          "rejected",
          "DERIVATION_RESULT_MISMATCH",
          "Explicit graph mapping does not match the captured result",
          proof.result.id,
        );
      const expected = this.build(
        proof.rule.id,
        proof.premises.map((premise) => premise.mapping),
        proof.result.id,
        proof.$schema,
      );
      if (canonicalDigest(expected.proof) !== canonicalDigest(proof))
        fail(
          "rejected",
          "DERIVATION_PREMISE_OR_RULE_MISMATCH",
          "Premises, rule, dependencies, or propagated values changed",
          id,
        );
      this.checked.set(id, expected);
      return expected;
    } finally {
      this.visiting.delete(id);
    }
  }

  build(
    lawId: string,
    premiseIds: readonly string[],
    resultId?: string,
    schemaId: string | undefined = DERIVATION_SCHEMA,
  ): CheckedProof {
    const rule = this.registry.getLaw(lawId);
    if (!rule)
      fail(
        "unsupported",
        "UNSUPPORTED_RELATION_LAW",
        "No executable law is registered for this request",
        lawId,
      );
    const { law, pack } = rule;
    if (premiseIds.length !== law.operands.length)
      fail(
        "rejected",
        "LAW_ARITY_MISMATCH",
        "Ordered premises do not match the law's operands",
        law.id,
      );
    const mappings = premiseIds.map((id, index) => {
      const mapping = this.mappings.get(id);
      if (!mapping)
        fail(
          "unknown",
          "MISSING_DERIVATION_PREMISE",
          "Required premise mapping is unavailable",
          id,
        );
      if (mapping.relation !== law.operands[index])
        fail(
          "rejected",
          "LAW_OPERAND_MISMATCH",
          "Premise relation does not match its ordered operand",
          id,
        );
      if (
        mapping.sources.length !== 1 ||
        mapping.targets.length !== 1 ||
        mapping.cardinality !== "one-to-one"
      )
        fail(
          "unsupported",
          "UNSUPPORTED_NARY_DERIVATION",
          "The law engine requires binary one-to-one assertions; it cannot flatten a hyperedge",
          id,
        );
      if (mapping.transform || (mapping.invariants?.length ?? 0) > 0)
        fail(
          "unsupported",
          "UNSUPPORTED_DERIVATION_SEMANTICS",
          "Transform or invariant composition needs an explicit supported contract",
          id,
        );
      return mapping;
    });
    const expression = law.conditions?.context;
    if (expression) {
      const missing = [...requiredContextKeys(expression)].filter(
        (key) => !Object.hasOwn(this.context, key),
      );
      if (missing.length > 0)
        fail(
          "unknown",
          "MISSING_LAW_CONTEXT",
          `Required context keys are absent: ${missing.join(", ")}`,
          law.id,
        );
      if (!evaluateContextExpression(expression, this.context))
        fail(
          "rejected",
          "LAW_CONTEXT_NOT_SATISFIED",
          "The context does not satisfy this law",
          law.id,
        );
    }
    const source =
      law.operation === "reverse"
        ? mappings[0].targets[0]
        : mappings[0].sources[0];
    const target =
      law.operation === "reverse"
        ? mappings[0].sources[0]
        : mappings[1].targets[0];
    if (
      law.operation === "chain" &&
      mappings[0].targets[0] !== mappings[1].sources[0]
    )
      fail(
        "rejected",
        "LAW_MIDDLE_IDENTITY_MISMATCH",
        "The ordered chain does not share the same stable middle identity",
        law.id,
      );
    const checkKind = (
      entity: string,
      permitted: readonly string[] | undefined,
    ): void => {
      if (permitted && !permitted.includes(this.kinds.get(entity)!))
        fail(
          "rejected",
          "LAW_KIND_MISMATCH",
          "Endpoint kind does not satisfy the law or result relation",
          entity,
        );
    };
    const resultDefinition = this.registry.get(law.resultRelation)!;
    checkKind(source, law.conditions?.sourceKinds);
    checkKind(source, resultDefinition.sourceKinds);
    checkKind(target, law.conditions?.targetKinds);
    checkKind(target, resultDefinition.targetKinds);
    if (law.operation === "chain")
      checkKind(mappings[0].targets[0], law.conditions?.middleKinds);
    if (
      resultDefinition.cardinalities &&
      !resultDefinition.cardinalities.includes("one-to-one")
    )
      fail(
        "unsupported",
        "UNSUPPORTED_RESULT_CARDINALITY",
        "The result relation does not permit a binary result",
        law.id,
      );
    const premises: DerivationPremise[] = [];
    const dependencies = new Map<string, string>();
    const closure = new Set<string>();
    let depth = 1;
    for (const mapping of mappings) {
      const digest = valueDigest(mapping);
      const premise: DerivationPremise = { mapping: mapping.id, digest };
      dependencies.set(mapping.id, digest);
      const reference = mapping.attributes?.[DERIVATION_ATTRIBUTE];
      if (reference !== undefined) {
        if (typeof reference !== "string")
          fail(
            "rejected",
            "INVALID_DERIVATION_REFERENCE",
            "Proof reference must be a proof ID",
            mapping.id,
          );
        const child = this.check(reference);
        premise.derivation = { id: child.proof.id, digest: child.proof.digest };
        dependencies.set(child.proof.id, child.proof.digest);
        for (const dependency of child.proof.dependencies)
          dependencies.set(dependency.id, dependency.digest);
        for (const id of child.closure) closure.add(id);
        depth = Math.max(depth, child.proof.depth + 1);
      }
      premises.push(premise);
    }
    if (
      depth > this.bounds.maxDepth ||
      closure.size + 1 > this.bounds.maxDerivations
    )
      fail(
        "incomplete",
        "DERIVATION_LIMIT",
        "The proposed proof exceeds the declared depth or unique derivation count",
        law.id,
      );
    const packBinding: PackContentBinding = {
      id: pack.id,
      version: pack.version,
      digest: relationPackDigest(pack),
    };
    const id =
      resultId ??
      `urn:metamap:mapping:derived:${canonicalDigest({ law: law.id, pack: packBinding, premises, context: this.context }).slice(7)}`;
    if (premiseIds.includes(id))
      fail(
        "rejected",
        "DERIVATION_SELF_REFERENCE",
        "A result cannot be one of its premises",
        id,
      );
    const result: StructuralMapping = {
      id,
      relation: law.resultRelation,
      sources: [source],
      targets: [target],
      cardinality: "one-to-one",
      lossiness: mappings.some((mapping) => mapping.lossiness === "lossy")
        ? "lossy"
        : mappings.some((mapping) => mapping.lossiness === "unknown")
          ? "unknown"
          : "lossless",
      provenance: { status: "inferred", assertedBy: law.id },
    };
    const context = JSON.parse(
      canonicalJson(this.context),
    ) as EvaluationContext;
    const content = {
      ...(schemaId ? { $schema: schemaId } : {}),
      schemaVersion: "1.0.0" as const,
      interpretation: "declared-law-application" as const,
      rule: {
        id: law.id,
        pack: packBinding,
        imports: [...(pack.imports ?? [])]
          .map((reference) => ({ ...reference }))
          .sort((left, right) =>
            left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
          ),
      },
      premises,
      result,
      context,
      contextDigest: canonicalDigest(context),
      dependencies: [...dependencies]
        .map(([id, digest]) => ({ id, digest }))
        .sort((left, right) =>
          left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
        ),
      depth,
      derivationCount: closure.size + 1,
      uncertainty: UNCERTAINTY_DIMENSIONS.map((dimension) => ({
        dimension,
        status: "unknown" as const,
        evidence: [],
        assessments: [],
        measurementModels: [],
        sourceRevisions: [],
      })),
    };
    const digest = canonicalDigest(content);
    const proof: CorrespondenceDerivation = {
      ...content,
      id: `urn:metamap:derivation:${digest.slice(7)}`,
      digest,
    };
    closure.add(proof.id);
    return { proof, closure };
  }
}

/** Read-only proposal. It grants no authority and does not mutate the graph. */
export function composeCorrespondences(
  graph: MetamapDocument,
  request: CorrespondenceCompositionRequest,
  registry = new RelationRegistry(),
): CorrespondenceCompositionResult {
  try {
    parseCompositionRequest(request);
    if (request.assessments.length > 0 || request.evidence.length > 0)
      fail(
        "unsupported",
        "TYPED_UNCERTAINTY_NOT_IMPLEMENTED",
        "Assessment propagation is not yet implemented; these inputs cannot be ignored",
      );
    const engine = new DerivationEngine(
      graph,
      registry,
      request.context,
      request.bounds,
      request.derivations,
    );
    const { proof } = engine.build(
      request.law,
      request.premises,
      request.resultId,
    );
    const existing = graph.mappings.find(
      (mapping) => mapping.id === proof.result.id,
    );
    if (
      existing &&
      valueDigest(existing) !== valueDigest(mappingWithProof(proof))
    )
      fail(
        "rejected",
        "DERIVATION_RESULT_ID_CONFLICT",
        "The proposed stable mapping ID is already bound to another value",
        existing.id,
      );
    return freeze({
      schemaVersion: "1.0.0",
      status: "proposed",
      mapping: mappingWithProof(proof),
      derivation: proof,
      issues: [],
    });
  } catch (error) {
    return freeze(failure(error));
  }
}

export interface DerivationValidationResult {
  status: "valid" | FailureStatus;
  issues: DerivationIssue[];
  checked: CorrespondenceDerivation[];
}

/** Check every supplied claim and every graph proof reference, without admission. */
export function validateCorrespondenceDerivations(
  graph: MetamapDocument,
  derivations: readonly CorrespondenceDerivation[],
  context: EvaluationContext,
  bounds: DerivationBounds,
  registry = new RelationRegistry(),
): DerivationValidationResult {
  try {
    const engine = new DerivationEngine(
      graph,
      registry,
      context,
      bounds,
      derivations,
    );
    const checked = new Map<string, CorrespondenceDerivation>();
    const ids = new Set(derivations.map((proof) => proof.id));
    for (const mapping of graph.mappings) {
      const reference = mapping.attributes?.[DERIVATION_ATTRIBUTE];
      if (reference === undefined) continue;
      if (typeof reference !== "string")
        fail(
          "rejected",
          "INVALID_DERIVATION_REFERENCE",
          "Proof reference must be a proof ID",
          mapping.id,
        );
      ids.add(reference);
    }
    for (const id of [...ids].sort()) checked.set(id, engine.check(id).proof);
    return freeze({
      status: "valid",
      issues: [],
      checked: [...checked.values()],
    });
  } catch (error) {
    const result = failure(error);
    return freeze({
      status: result.status,
      issues: result.issues,
      checked: [],
    });
  }
}

/** Profile conflicts apply to active facts, not to the graph's possibilities. */
export function executableRelationConflictIssues(
  graph: MetamapDocument,
  active: ReadonlySet<string>,
  registry: RelationRegistry,
): DerivationIssue[] {
  const issues: DerivationIssue[] = [];
  const definitions = new Map(
    registry
      .executablePacks()
      .flatMap((pack) =>
        pack.relations.map(
          (definition) => [definition.id, definition] as const,
        ),
      ),
  );
  const activeMappings = graph.mappings.filter((mapping) =>
    active.has(mapping.id),
  );
  for (const mapping of activeMappings) {
    const definition = definitions.get(mapping.relation);
    if (!definition?.disjointWith?.length) continue;
    if (mapping.sources.length !== 1 || mapping.targets.length !== 1) {
      issues.push({
        code: "UNSUPPORTED_NARY_DISJOINTNESS",
        message: "Disjointness checks require binary assertions",
        subjectId: mapping.id,
      });
      continue;
    }
    for (const other of activeMappings) {
      if (!definition.disjointWith.includes(other.relation)) continue;
      const otherDefinition: RelationDefinition | undefined = registry.get(
        other.relation,
      );
      if (other.sources.length !== 1 || other.targets.length !== 1) {
        issues.push({
          code: "UNSUPPORTED_NARY_DISJOINTNESS",
          message: "Disjointness checks require binary assertions",
          subjectId: other.id,
        });
        continue;
      }
      const same =
        mapping.sources[0] === other.sources[0] &&
        mapping.targets[0] === other.targets[0];
      const symmetric =
        (definition.symmetric || otherDefinition?.symmetric) &&
        mapping.sources[0] === other.targets[0] &&
        mapping.targets[0] === other.sources[0];
      if (same || symmetric)
        issues.push({
          code: "DISJOINT_RELATION_CONFLICT",
          message: `${mapping.relation} and ${other.relation} are disjoint in the selected profile`,
          subjectId: mapping.id,
        });
    }
  }
  return issues;
}
