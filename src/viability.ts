import { readFileSync } from "node:fs";
import type { AnySchema, ErrorObject } from "ajv";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { ConstraintRegistry } from "./constraints.js";
import { inactiveReason, requiredContextKeys } from "./context.js";
import { MetamapGraph } from "./graph.js";
import { analyzeImpact } from "./impact.js";
import type { MetamapDocument, ValidationIssue } from "./model.js";
import { isReferenceIdentifier, isRelationIdentifier } from "./references.js";
import { RelationRegistry } from "./relations.js";
import { valueDigest } from "./stable.js";
import { validateMetamapDocument } from "./validator.js";
import {
  METAMAP_GENERATION_VERSION,
  METAMAP_VIABILITY_POLICY_VERSION,
  type ActivationResult,
  type CompilationResult,
  type CompileOptions,
  type ImpactReport,
  type MetamapViabilityPolicy,
  type ViabilityIssue,
  type ViabilityValidationResult,
  type ViableGeneration,
} from "./viability-model.js";

const Ajv2020 = Ajv2020Module.default;
const addFormats = addFormatsModule.default;
const policySchema = JSON.parse(
  readFileSync(
    new URL("../schemas/metamap-viability.schema.json", import.meta.url),
    "utf8",
  ),
) as AnySchema;
const generationSchema = JSON.parse(
  readFileSync(
    new URL("../schemas/metamap-generation.schema.json", import.meta.url),
    "utf8",
  ),
) as AnySchema;
const policySchemaValidator = addFormats(
  new Ajv2020({ allErrors: true, strict: true }),
).compile(policySchema);
const generationSchemaValidator = addFormats(
  new Ajv2020({ allErrors: true, strict: true }),
).compile(generationSchema);

export interface CompilationRuntimeOptions extends CompileOptions {
  relationRegistry?: RelationRegistry;
  constraintRegistry?: ConstraintRegistry;
}

function issue(
  code: string,
  message: string,
  subjectId?: string,
  path?: string,
): ViabilityIssue {
  return { severity: "error", code, message, subjectId, path };
}

function fromValidationIssue(entry: ValidationIssue): ViabilityIssue {
  return {
    severity: entry.severity,
    code: entry.code,
    message: entry.message,
    path: entry.path,
    subjectId: entry.subjectId,
  };
}

function schemaIssues(
  errors: ErrorObject[] | null | undefined,
): ViabilityIssue[] {
  return (errors ?? []).map((error) => ({
    severity: "error",
    code: "INVALID_VIABILITY_POLICY",
    message: error.message ?? "Viability policy is invalid",
    path: error.instancePath || "$",
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Strict runtime validation for policies received from JSON or other tools. */
export function validateViabilityPolicy(
  value: unknown,
): ViabilityValidationResult {
  if (!policySchemaValidator(value)) {
    const issues = schemaIssues(policySchemaValidator.errors);
    return { valid: false, issues };
  }
  const policy = value as MetamapViabilityPolicy;
  const issues: ViabilityIssue[] = [];
  const identifiers = new Map<string, string>();
  const register = (id: string, path: string): void => {
    const previous = identifiers.get(id);
    if (previous) {
      issues.push(
        issue(
          "DUPLICATE_POLICY_ID",
          `${id} is already declared at ${previous}`,
          id,
          path,
        ),
      );
    } else {
      identifiers.set(id, path);
    }
  };
  register(policy.id, "$.id");
  policy.constraints.forEach((entry, index) =>
    register(entry.id, `$.constraints[${index}].id`),
  );
  policy.evidence.forEach((entry, index) =>
    register(entry.id, `$.evidence[${index}].id`),
  );
  (policy.waivers ?? []).forEach((entry, index) =>
    register(entry.id, `$.waivers[${index}].id`),
  );
  return {
    valid: issues.length === 0,
    issues,
  };
}

/** Validate both the portable generation shape and its content address. */
export function validateViableGeneration(
  value: unknown,
): ViabilityValidationResult {
  if (!generationSchemaValidator(value)) {
    return {
      valid: false,
      issues: (generationSchemaValidator.errors ?? []).map((error) => ({
        severity: "error",
        code: "INVALID_VIABLE_GENERATION",
        message: error.message ?? "Viable generation is invalid",
        path: error.instancePath || "$",
      })),
    };
  }
  const generation = value as ViableGeneration;
  const { $schema: _schema, id, digest, ...generationContent } = generation;
  const expectedDigest = valueDigest(generationContent);
  const expectedId = `urn:metamap:generation:${expectedDigest.replace(/^sha256:/, "")}`;
  const issues: ViabilityIssue[] = [];
  if (digest !== expectedDigest) {
    issues.push(
      issue(
        "GENERATION_DIGEST_MISMATCH",
        `Generation digest ${digest} does not match ${expectedDigest}`,
        id,
      ),
    );
  }
  if (id !== expectedId) {
    issues.push(
      issue(
        "GENERATION_ID_MISMATCH",
        `Generation id ${id} does not match its content address`,
        id,
      ),
    );
  }
  return { valid: issues.length === 0, issues };
}

function validateTimestamp(value: string, subjectId: string): ViabilityIssue[] {
  const parsed = Date.parse(value);
  const dateTime =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    );
  return Number.isFinite(parsed) && dateTime
    ? []
    : [
        issue(
          "INVALID_EVALUATION_TIME",
          `${value} is not a valid timestamp`,
          subjectId,
        ),
      ];
}

function knownGraphSubjects(document: MetamapDocument): Set<string> {
  return new Set([
    document.id,
    ...document.entities.map((entry) => entry.id),
    ...document.mappings.map((entry) => entry.id),
    ...document.authorities.map((entry) => entry.id),
  ]);
}

function validatePolicyBindings(
  document: MetamapDocument,
  policy: MetamapViabilityPolicy,
): ViabilityIssue[] {
  const issues: ViabilityIssue[] = [];
  const graphDigest = valueDigest(document);
  if (policy.graph.id !== document.id) {
    issues.push(
      issue(
        "GRAPH_BINDING_MISMATCH",
        `Policy expects ${policy.graph.id}, received ${document.id}`,
        policy.id,
      ),
    );
  }
  if (
    policy.graph.revision !== undefined &&
    policy.graph.revision !== document.revision
  ) {
    issues.push(
      issue(
        "GRAPH_REVISION_MISMATCH",
        `Policy expects graph revision ${policy.graph.revision}, received ${document.revision ?? "unversioned"}`,
        policy.id,
      ),
    );
  }
  if (
    policy.graph.digest !== undefined &&
    policy.graph.digest !== graphDigest
  ) {
    issues.push(
      issue(
        "GRAPH_DIGEST_MISMATCH",
        `Policy graph digest does not match ${document.id}`,
        policy.id,
      ),
    );
  }

  const mappings = new Set(document.mappings.map((entry) => entry.id));
  const declarations = new Map<string, number>();
  for (const declaration of policy.mappings) {
    declarations.set(
      declaration.mapping,
      (declarations.get(declaration.mapping) ?? 0) + 1,
    );
    if (!mappings.has(declaration.mapping)) {
      issues.push(
        issue(
          "UNKNOWN_MAPPING_DECLARATION",
          `Policy declares missing mapping ${declaration.mapping}`,
          declaration.mapping,
        ),
      );
    }
  }
  for (const mapping of document.mappings) {
    const count = declarations.get(mapping.id) ?? 0;
    if (count === 0) {
      issues.push(
        issue(
          "MAPPING_POLICY_MISSING",
          `${mapping.id} has no viability declaration`,
          mapping.id,
        ),
      );
    } else if (count > 1) {
      issues.push(
        issue(
          "DUPLICATE_MAPPING_POLICY",
          `${mapping.id} has ${count} viability declarations`,
          mapping.id,
        ),
      );
    }
  }

  const known = knownGraphSubjects(document);
  for (const entry of [...policy.constraints, ...policy.evidence]) {
    for (const subject of entry.subjects) {
      if (!known.has(subject)) {
        issues.push(
          issue(
            "UNKNOWN_POLICY_SUBJECT",
            `${entry.id} references unknown graph subject ${subject}`,
            entry.id,
          ),
        );
      }
    }
  }
  const waiverSubjects = new Set([
    ...known,
    ...policy.constraints.map((entry) => entry.id),
    ...policy.evidence.map((entry) => entry.id),
  ]);
  for (const waiver of policy.waivers ?? []) {
    for (const subject of waiver.subjects) {
      if (!waiverSubjects.has(subject)) {
        issues.push(
          issue(
            "UNKNOWN_WAIVER_SUBJECT",
            `${waiver.id} references unknown subject ${subject}`,
            waiver.id,
          ),
        );
      }
    }
  }
  return issues;
}

function validateApplicabilityContext(
  policy: MetamapViabilityPolicy,
  context: NonNullable<CompileOptions["context"]>,
): ViabilityIssue[] {
  const issues: ViabilityIssue[] = [];
  for (const declaration of policy.mappings) {
    const required = new Set<string>();
    if (declaration.applicability?.when) {
      for (const key of requiredContextKeys(declaration.applicability.when)) {
        required.add(key);
      }
    }
    if (declaration.applicability?.unless) {
      for (const key of requiredContextKeys(declaration.applicability.unless)) {
        required.add(key);
      }
    }
    for (const key of required) {
      if (!Object.hasOwn(context, key)) {
        issues.push(
          issue(
            "CONTEXT_KEY_MISSING",
            `${declaration.mapping} requires context key ${key}`,
            declaration.mapping,
          ),
        );
      }
    }
  }
  return issues;
}

function validateDeclaredSemantics(
  document: MetamapDocument,
  policy: MetamapViabilityPolicy,
  relationRegistry: RelationRegistry,
): ViabilityIssue[] {
  const issues: ViabilityIssue[] = [];
  const mappings = new Map(document.mappings.map((entry) => [entry.id, entry]));
  for (const declaration of policy.mappings) {
    const mapping = mappings.get(declaration.mapping);
    if (!mapping) continue;
    if (!relationRegistry.get(mapping.relation)?.impactDirection) {
      issues.push(
        issue(
          "UNDECLARED_IMPACT_DIRECTION",
          `${mapping.relation} must declare impactDirection before ${mapping.id} can activate`,
          mapping.id,
        ),
      );
    }
    if (mapping.lossiness === "unknown") {
      issues.push(
        issue(
          "UNDECLARED_LOSSINESS",
          `${mapping.id} must declare lossless or lossy before activation`,
          mapping.id,
        ),
      );
    }
    if (
      declaration.determinism === "deterministic" &&
      mapping.transform &&
      mapping.transform.deterministic !== true
    ) {
      issues.push(
        issue(
          "UNVERIFIED_DETERMINISM",
          `${mapping.id} claims deterministic execution but its transform does not`,
          mapping.id,
        ),
      );
    }
    if (
      declaration.reversibility === "reversible" &&
      mapping.lossiness !== "lossless"
    ) {
      issues.push(
        issue(
          "REVERSIBLE_MAPPING_IS_LOSSY",
          `${mapping.id} cannot be reversible with ${mapping.lossiness} lossiness`,
          mapping.id,
        ),
      );
    }
    if (
      declaration.reversibility === "reversible" &&
      mapping.transform &&
      mapping.transform.reversible !== true
    ) {
      issues.push(
        issue(
          "UNVERIFIED_REVERSIBILITY",
          `${mapping.id} claims reversibility but its transform does not`,
          mapping.id,
        ),
      );
    }
  }
  return issues;
}

function activeMappingState(
  policy: MetamapViabilityPolicy,
  context: NonNullable<CompileOptions["context"]>,
): {
  active: Set<string>;
  inactive: Array<{ id: string; reason: "when-not-satisfied" | "inhibited" }>;
} {
  const active = new Set<string>();
  const inactive: Array<{
    id: string;
    reason: "when-not-satisfied" | "inhibited";
  }> = [];
  for (const declaration of policy.mappings) {
    const reason = inactiveReason(declaration.applicability, context);
    if (reason) inactive.push({ id: declaration.mapping, reason });
    else active.add(declaration.mapping);
  }
  inactive.sort((left, right) => left.id.localeCompare(right.id));
  return { active, inactive };
}

function contradictionIssues(
  document: MetamapDocument,
  policy: MetamapViabilityPolicy,
  activeMappings: ReadonlySet<string>,
): ViabilityIssue[] {
  const mappingIds = new Set(document.mappings.map((entry) => entry.id));
  return policy.evidence.flatMap((entry) => {
    if (entry.result !== "contradicts") return [];
    const activeSubjects = entry.subjects.filter(
      (subject) => !mappingIds.has(subject) || activeMappings.has(subject),
    );
    return activeSubjects.map((subject) =>
      issue(
        "CONTRADICTING_EVIDENCE",
        `${entry.id} contradicts active subject ${subject}`,
        subject,
      ),
    );
  });
}

function evaluateConstraints(
  document: MetamapDocument,
  policy: MetamapViabilityPolicy,
  activeMappings: ReadonlySet<string>,
  relationRegistry: RelationRegistry,
  constraintRegistry: ConstraintRegistry,
): ViabilityIssue[] {
  const graph = new MetamapGraph(document, { registry: relationRegistry });
  return policy.constraints.flatMap((constraint) => {
    if (!isRelationIdentifier(constraint.kind)) {
      return [
        issue(
          "INVALID_CONSTRAINT_KIND",
          `${constraint.kind} must use namespace:name form`,
          constraint.id,
        ),
      ];
    }
    const evaluator = constraintRegistry.get(constraint.kind);
    if (!evaluator) {
      return [
        issue(
          "UNKNOWN_CONSTRAINT_KIND",
          `No evaluator is registered for ${constraint.kind}`,
          constraint.id,
        ),
      ];
    }
    return evaluator(constraint, {
      document,
      graph,
      activeMappings,
      evidence: policy.evidence,
    });
  });
}

const WAIVABLE_CODES = new Set([
  "CONTRADICTING_EVIDENCE",
  "FORBIDDEN_MAPPING_ACTIVE",
  "NON_UNIQUE_MAPPING_TARGET",
  "REQUIRED_AUTHORITY_UNRESOLVED",
  "REQUIRED_EVIDENCE_MISSING",
  "REQUIRED_MAPPING_MISSING",
  "UNDECLARED_LOSSINESS",
  "UNDECLARED_IMPACT_DIRECTION",
  "UNVERIFIED_DETERMINISM",
  "UNVERIFIED_REVERSIBILITY",
]);

function applyWaivers(
  input: readonly ViabilityIssue[],
  policy: MetamapViabilityPolicy,
  evaluatedAt: string,
): { issues: ViabilityIssue[]; applied: string[] } {
  const now = Date.parse(evaluatedAt);
  const issues = [...input];
  const applied = new Set<string>();
  for (const waiver of policy.waivers ?? []) {
    const expiry = Date.parse(waiver.expiresAt);
    if (!Number.isFinite(expiry)) {
      issues.push(
        issue(
          "INVALID_WAIVER_EXPIRY",
          `${waiver.id} has invalid expiry ${waiver.expiresAt}`,
          waiver.id,
        ),
      );
      continue;
    }
    if (expiry <= now) {
      issues.push(
        issue(
          "EXPIRED_WAIVER",
          `${waiver.id} expired at ${waiver.expiresAt}`,
          waiver.id,
        ),
      );
      continue;
    }
    let matched = false;
    for (const entry of issues) {
      if (
        entry.severity === "error" &&
        WAIVABLE_CODES.has(entry.code) &&
        waiver.codes.includes(entry.code) &&
        entry.subjectId !== undefined &&
        waiver.subjects.includes(entry.subjectId)
      ) {
        entry.severity = "warning";
        entry.waivedBy = waiver.id;
        applied.add(waiver.id);
        matched = true;
      }
    }
    if (!matched) {
      issues.push({
        severity: "warning",
        code: "STALE_WAIVER",
        message: `${waiver.id} does not match an active, waivable issue`,
        subjectId: waiver.id,
      });
    }
  }
  return { issues, applied: [...applied].sort() };
}

function attachCausalPaths(
  issues: ViabilityIssue[],
  impact: ImpactReport,
): void {
  const paths = new Map(
    impact.paths.map((entry) => [entry.subjectId, entry.path]),
  );
  for (const entry of issues) {
    if (entry.subjectId) entry.causalPath = paths.get(entry.subjectId);
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

/**
 * Compile a graph and contextual policy into an immutable viable generation.
 * No generation is returned if any unwaived error remains.
 */
export function compileMetamap(
  document: MetamapDocument,
  policy: MetamapViabilityPolicy,
  options: CompilationRuntimeOptions = {},
): CompilationResult {
  const relationRegistry = options.relationRegistry ?? new RelationRegistry();
  const constraintRegistry =
    options.constraintRegistry ?? new ConstraintRegistry();
  const context = options.context ?? {};
  const evaluatedAt = options.evaluatedAt ?? new Date().toISOString();
  const graphValidation = validateMetamapDocument(document, relationRegistry);
  const policyValidation = validateViabilityPolicy(policy);
  let issues: ViabilityIssue[] = [
    ...graphValidation.issues.map(fromValidationIssue),
    ...policyValidation.issues,
    ...validateTimestamp(evaluatedAt, policy.id),
  ];

  if (!graphValidation.valid || !policyValidation.valid) {
    const impact = analyzeImpact(document, {
      changedSubjects: options.changedSubjects ?? [],
      policy,
      registry: relationRegistry,
    });
    attachCausalPaths(issues, impact);
    return {
      status: "rejected",
      issues,
      impact,
      quarantinedSubjects: impact.affectedSubjects,
    };
  }

  issues.push(
    ...validatePolicyBindings(document, policy),
    ...validateDeclaredSemantics(document, policy, relationRegistry),
    ...validateApplicabilityContext(policy, context),
  );
  const state = activeMappingState(policy, context);
  issues.push(
    ...contradictionIssues(document, policy, state.active),
    ...evaluateConstraints(
      document,
      policy,
      state.active,
      relationRegistry,
      constraintRegistry,
    ),
  );

  const waived = applyWaivers(issues, policy, evaluatedAt);
  issues = waived.issues;
  const failureSeeds = issues
    .filter((entry) => entry.severity === "error")
    .map((entry) => entry.subjectId)
    .filter((entry): entry is string => entry !== undefined);
  const impact = analyzeImpact(document, {
    changedSubjects:
      options.changedSubjects && options.changedSubjects.length > 0
        ? options.changedSubjects
        : failureSeeds,
    activeMappings: state.active,
    policy,
    registry: relationRegistry,
  });
  attachCausalPaths(issues, impact);
  if (issues.some((entry) => entry.severity === "error")) {
    return {
      status: "rejected",
      issues,
      impact,
      quarantinedSubjects: impact.affectedSubjects,
    };
  }

  const graphDigest = valueDigest(document);
  const policyDigest = valueDigest(policy);
  const generationContent = {
    schemaVersion: METAMAP_GENERATION_VERSION,
    evaluatedAt,
    graph: {
      id: document.id,
      revision: document.revision,
      digest: graphDigest,
    },
    policy: { id: policy.id, digest: policyDigest },
    context,
    activeMappings: [...state.active].sort(),
    inactiveMappings: state.inactive,
    evidence: policy.evidence
      .filter(
        (entry) =>
          entry.result === "supports" &&
          entry.subjects.some(
            (subject) =>
              !document.mappings.some((mapping) => mapping.id === subject) ||
              state.active.has(subject),
          ),
      )
      .map((entry) => entry.id)
      .sort(),
    waiversApplied: waived.applied,
  };
  const digest = valueDigest(generationContent);
  const generation: ViableGeneration = deepFreeze({
    $schema:
      "https://raw.githubusercontent.com/roryscot/metamap/v0.2.0/schemas/metamap-generation.schema.json",
    ...generationContent,
    id: `urn:metamap:generation:${digest.replace(/^sha256:/, "")}`,
    digest,
  });
  return { status: "viable", generation, issues, impact };
}

/**
 * Atomic in-memory activation. Rejected candidates leave the last viable
 * generation untouched and report the quarantined blast radius.
 */
export class MetamapActivator {
  private generation?: ViableGeneration;

  constructor(
    private readonly relationRegistry = new RelationRegistry(),
    private readonly constraintRegistry = new ConstraintRegistry(),
  ) {}

  get current(): ViableGeneration | undefined {
    return this.generation;
  }

  activate(
    document: MetamapDocument,
    policy: MetamapViabilityPolicy,
    options: CompileOptions = {},
  ): ActivationResult {
    const compilation = compileMetamap(document, policy, {
      ...options,
      relationRegistry: this.relationRegistry,
      constraintRegistry: this.constraintRegistry,
    });
    if (compilation.status === "rejected") {
      return {
        activated: false,
        current: this.generation,
        compilation,
      };
    }
    this.generation = compilation.generation;
    return { activated: true, current: this.generation, compilation };
  }
}

/** Runtime assertion useful to callers accepting unknown JSON values. */
export function parseViabilityPolicy(value: unknown): MetamapViabilityPolicy {
  const result = validateViabilityPolicy(value);
  if (!result.valid || !isRecord(value)) {
    throw new Error(
      `Invalid Metamap viability policy: ${result.issues.map((entry) => `${entry.path ?? "$"} ${entry.message}`).join("; ")}`,
    );
  }
  if (
    value.schemaVersion !== METAMAP_VIABILITY_POLICY_VERSION ||
    !isReferenceIdentifier(value.id)
  ) {
    throw new Error("Invalid Metamap viability policy identity");
  }
  return value as unknown as MetamapViabilityPolicy;
}

/** Runtime assertion for persisted or externally received generations. */
export function parseViableGeneration(value: unknown): ViableGeneration {
  const result = validateViableGeneration(value);
  if (!result.valid || !isRecord(value)) {
    throw new Error(
      `Invalid Metamap generation: ${result.issues.map((entry) => `${entry.path ?? "$"} ${entry.message}`).join("; ")}`,
    );
  }
  return value as unknown as ViableGeneration;
}
