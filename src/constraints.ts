import { MetamapGraph } from "./graph.js";
import type { JsonObject, MetamapDocument } from "./model.js";
import { isReferenceIdentifier, isRelationIdentifier } from "./references.js";
import type {
  EvidenceRecord,
  ViabilityConstraint,
  ViabilityIssue,
} from "./viability-model.js";

export interface ConstraintEvaluationContext {
  document: MetamapDocument;
  graph: MetamapGraph;
  activeMappings: ReadonlySet<string>;
  evidence: readonly EvidenceRecord[];
}

export type ConstraintEvaluator = (
  constraint: ViabilityConstraint,
  context: ConstraintEvaluationContext,
) => ViabilityIssue[];

function issue(
  constraint: ViabilityConstraint,
  code: string,
  message: string,
  subjectId?: string,
): ViabilityIssue {
  return {
    severity: "error",
    code,
    message,
    subjectId: subjectId ?? constraint.id,
  };
}

function parameterString(
  parameters: JsonObject | undefined,
  name: string,
): string | undefined {
  const value = parameters?.[name];
  return typeof value === "string" ? value : undefined;
}

function parameterNumber(
  parameters: JsonObject | undefined,
  name: string,
): number | undefined {
  const value = parameters?.[name];
  return typeof value === "number" ? value : undefined;
}

function parameterStrings(
  parameters: JsonObject | undefined,
  name: string,
): string[] | undefined {
  const value = parameters?.[name];
  return Array.isArray(value) &&
    value.every((entry) => typeof entry === "string")
    ? value
    : undefined;
}

function activeMappings(context: ConstraintEvaluationContext) {
  return context.document.mappings.filter((mapping) =>
    context.activeMappings.has(mapping.id),
  );
}

function unexpectedParameters(
  constraint: ViabilityConstraint,
  allowed: readonly string[],
): ViabilityIssue[] {
  const unexpected = Object.keys(constraint.parameters ?? {}).filter(
    (name) => !allowed.includes(name),
  );
  return unexpected.length === 0
    ? []
    : [
        issue(
          constraint,
          "INVALID_CONSTRAINT_PARAMETERS",
          `${constraint.id} has unsupported parameter(s): ${unexpected.join(", ")}`,
        ),
      ];
}

const requiresEvidence: ConstraintEvaluator = (constraint, context) => {
  const unexpected = unexpectedParameters(constraint, [
    "minimumConfidence",
    "kinds",
  ]);
  if (unexpected.length > 0) return unexpected;
  const minimumConfidence =
    parameterNumber(constraint.parameters, "minimumConfidence") ?? 0;
  const kinds = parameterStrings(constraint.parameters, "kinds");
  if (
    (constraint.parameters?.minimumConfidence !== undefined &&
      parameterNumber(constraint.parameters, "minimumConfidence") ===
        undefined) ||
    minimumConfidence < 0 ||
    minimumConfidence > 1 ||
    (constraint.parameters?.kinds !== undefined && kinds === undefined)
  ) {
    return [
      issue(
        constraint,
        "INVALID_CONSTRAINT_PARAMETERS",
        `${constraint.id} minimumConfidence must be between 0 and 1`,
      ),
    ];
  }
  const allowedKinds = kinds ? new Set(kinds) : undefined;
  const mappingIds = new Set(
    context.document.mappings.map((entry) => entry.id),
  );
  return constraint.subjects.flatMap((subject) => {
    if (mappingIds.has(subject) && !context.activeMappings.has(subject))
      return [];
    const supporting = context.evidence.filter(
      (entry) =>
        entry.result === "supports" &&
        entry.subjects.includes(subject) &&
        (!allowedKinds || allowedKinds.has(entry.kind)) &&
        (entry.confidence ?? 0) >= minimumConfidence,
    );
    return supporting.length > 0
      ? []
      : [
          issue(
            constraint,
            "REQUIRED_EVIDENCE_MISSING",
            `${subject} has no supporting evidence meeting ${constraint.id}`,
            subject,
          ),
        ];
  });
};

function matchingMappings(
  constraint: ViabilityConstraint,
  context: ConstraintEvaluationContext,
  subject: string,
) {
  const relation = parameterString(constraint.parameters, "relation");
  const target = parameterString(constraint.parameters, "target");
  const direction =
    parameterString(constraint.parameters, "direction") ?? "source";
  return activeMappings(context).filter((mapping) => {
    const subjectMatches =
      direction === "target"
        ? mapping.targets.includes(subject)
        : direction === "either"
          ? mapping.sources.includes(subject) ||
            mapping.targets.includes(subject)
          : mapping.sources.includes(subject);
    return (
      subjectMatches &&
      (!relation || mapping.relation === relation) &&
      (!target || mapping.targets.includes(target))
    );
  });
}

function validateMappingParameters(
  constraint: ViabilityConstraint,
): ViabilityIssue[] {
  const unexpected = unexpectedParameters(constraint, [
    "relation",
    "target",
    "direction",
  ]);
  if (unexpected.length > 0) return unexpected;
  const direction = parameterString(constraint.parameters, "direction");
  const relation = parameterString(constraint.parameters, "relation");
  const target = parameterString(constraint.parameters, "target");
  const invalidTypedParameter =
    (constraint.parameters?.direction !== undefined && !direction) ||
    (constraint.parameters?.relation !== undefined && !relation) ||
    (constraint.parameters?.target !== undefined && !target);
  if (
    invalidTypedParameter ||
    (direction && !["source", "target", "either"].includes(direction)) ||
    (relation && !isRelationIdentifier(relation)) ||
    (target && !isReferenceIdentifier(target))
  ) {
    return [
      issue(
        constraint,
        "INVALID_CONSTRAINT_PARAMETERS",
        `${constraint.id} has an invalid relation, target, or direction parameter`,
      ),
    ];
  }
  return [];
}

const requiresMapping: ConstraintEvaluator = (constraint, context) => {
  const invalid = validateMappingParameters(constraint);
  if (invalid.length > 0) return invalid;
  return constraint.subjects.flatMap((subject) =>
    matchingMappings(constraint, context, subject).length > 0
      ? []
      : [
          issue(
            constraint,
            "REQUIRED_MAPPING_MISSING",
            `${subject} has no active mapping meeting ${constraint.id}`,
            subject,
          ),
        ],
  );
};

const forbidsMapping: ConstraintEvaluator = (constraint, context) => {
  const invalid = validateMappingParameters(constraint);
  if (invalid.length > 0) return invalid;
  return constraint.subjects.flatMap((subject) => {
    const matches = matchingMappings(constraint, context, subject);
    return matches.length === 0
      ? []
      : [
          issue(
            constraint,
            "FORBIDDEN_MAPPING_ACTIVE",
            `${subject} has forbidden active mapping(s): ${matches.map((entry) => entry.id).join(", ")}`,
            subject,
          ),
        ];
  });
};

const uniqueTarget: ConstraintEvaluator = (constraint, context) => {
  const invalid = validateMappingParameters(constraint);
  if (invalid.length > 0) return invalid;
  return constraint.subjects.flatMap((subject) => {
    const direction =
      parameterString(constraint.parameters, "direction") ?? "source";
    const targets = new Set(
      matchingMappings(constraint, context, subject).flatMap((mapping) => {
        if (direction === "target") return mapping.sources;
        if (direction === "either") {
          return mapping.sources.includes(subject)
            ? mapping.targets
            : mapping.sources;
        }
        return mapping.targets;
      }),
    );
    return targets.size <= 1
      ? []
      : [
          issue(
            constraint,
            "NON_UNIQUE_MAPPING_TARGET",
            `${subject} resolves to ${targets.size} active targets under ${constraint.id}`,
            subject,
          ),
        ];
  });
};

const requiresAuthority: ConstraintEvaluator = (constraint, context) => {
  const unexpected = unexpectedParameters(constraint, ["fact"]);
  if (unexpected.length > 0) return unexpected;
  const fact = parameterString(constraint.parameters, "fact");
  if (!fact) {
    return [
      issue(
        constraint,
        "INVALID_CONSTRAINT_PARAMETERS",
        `${constraint.id} requires a string fact parameter`,
      ),
    ];
  }
  return constraint.subjects.flatMap((subject) => {
    const resolution = context.graph.resolveAuthority(subject, fact);
    return resolution.status === "resolved"
      ? []
      : [
          issue(
            constraint,
            "REQUIRED_AUTHORITY_UNRESOLVED",
            `${subject} has ${resolution.status} authority for ${fact}`,
            subject,
          ),
        ];
  });
};

export class ConstraintRegistry {
  private readonly evaluators = new Map<string, ConstraintEvaluator>();

  constructor() {
    this.register("core:requires-evidence", requiresEvidence);
    this.register("core:requires-mapping", requiresMapping);
    this.register("core:forbids-mapping", forbidsMapping);
    this.register("core:unique-target", uniqueTarget);
    this.register("core:requires-authority", requiresAuthority);
  }

  register(kind: string, evaluator: ConstraintEvaluator): void {
    if (this.evaluators.has(kind)) {
      throw new Error(`Constraint evaluator ${kind} is already registered`);
    }
    this.evaluators.set(kind, evaluator);
  }

  get(kind: string): ConstraintEvaluator | undefined {
    return this.evaluators.get(kind);
  }
}
