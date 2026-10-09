import { readFileSync } from "node:fs";
import type { AnySchemaObject } from "ajv";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import {
  canonicalDigest,
  canonicalJson,
  parseStrictJson,
} from "./canonical.js";
import {
  compareReplayEvaluationContent,
  type CounterfactualRecordChanges,
} from "./counterfactual.js";
import {
  replayMetamap,
  type ReplayIssue,
  type ReplayValidationResult,
} from "./replay.js";
import type {
  SemanticCounterfactualReport,
  SemanticCounterfactualResult,
} from "./semantic-counterfactual-model.js";
import type {
  SemanticReplayBundle,
  SemanticReplayInputs,
  SemanticReplayOutputs,
} from "./semantic-replay-model.js";
import { valueDigest } from "./stable.js";

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
  "metamap-projection-spec",
  "metamap-projection",
  "metamap-path-tree",
  "relation-pack",
  "metamap-replay",
  "metamap-counterfactual-v2",
])
  ajv.addSchema(schema(name));
const validateShape = ajv.getSchema(
  schema("metamap-counterfactual-v2").$id as string,
)!;

const equal = (left: unknown, right: unknown): boolean =>
  left === undefined || right === undefined
    ? left === right
    : canonicalDigest(left) === canonicalDigest(right);
function records<T extends { id: string }>(
  before: T[],
  after: T[],
): CounterfactualRecordChanges {
  const a = new Map(before.map((entry) => [entry.id, entry]));
  const b = new Map(after.map((entry) => [entry.id, entry]));
  return {
    added: [...b.keys()].filter((id) => !a.has(id)).sort(),
    removed: [...a.keys()].filter((id) => !b.has(id)).sort(),
    changed: [...a.keys()]
      .filter((id) => b.has(id) && !equal(a.get(id), b.get(id)))
      .sort(),
  };
}
export function semanticCounterfactualDigest(
  report: SemanticCounterfactualReport,
): string {
  const { id: _id, digest: _digest, ...content } = report;
  return canonicalDigest(content);
}
export function validateSemanticCounterfactualReport(
  value: unknown,
): ReplayValidationResult {
  try {
    canonicalJson(value);
    if (!validateShape(value))
      return {
        valid: false,
        issues: (validateShape.errors ?? []).map((issue) => ({
          code: "INVALID_SEMANTIC_COUNTERFACTUAL_REPORT",
          message: issue.message ?? "Invalid comparison",
          path: issue.instancePath || "$",
        })),
      };
    const report = value as SemanticCounterfactualReport;
    const digest = semanticCounterfactualDigest(report);
    const issues: ReplayIssue[] = [];
    if (
      digest !== report.digest ||
      report.id !== `urn:metamap:counterfactual:${digest.slice(7)}`
    )
      issues.push({
        code: "COUNTERFACTUAL_DIGEST_MISMATCH",
        message: "Comparison identity does not match its content",
      });
    for (const projection of report.semantic.projections) {
      const known = projection.beforeKnown && projection.afterKnown;
      if (
        [
          projection.usedMappingsChanged,
          projection.dependenciesChanged,
          projection.riskChanged,
        ].some((change) => (known ? change === null : change !== null))
      )
        issues.push({
          code: "COUNTERFACTUAL_UNKNOWN_STATE_MISMATCH",
          message: "Projection deltas require two known projected results",
        });
    }
    if (
      (!report.mappingStates.beforeKnown || !report.mappingStates.afterKnown) &&
      (report.mappingStates.activated.length ||
        report.mappingStates.deactivated.length)
    )
      issues.push({
        code: "COUNTERFACTUAL_UNKNOWN_STATE_MISMATCH",
        message: "Mapping state changes require two known generations",
      });
    return { valid: issues.length === 0, issues };
  } catch (error) {
    return {
      valid: false,
      issues: [
        {
          code: "INVALID_SEMANTIC_COUNTERFACTUAL_REPORT",
          message:
            error instanceof Error ? error.message : "Invalid comparison",
        },
      ],
    };
  }
}
export function parseSemanticCounterfactualReport(
  value: unknown,
): SemanticCounterfactualReport {
  const validation = validateSemanticCounterfactualReport(value);
  if (!validation.valid)
    throw new Error(
      validation.issues
        .map((issue) => `${issue.code}: ${issue.message}`)
        .join("; "),
    );
  return value as SemanticCounterfactualReport;
}
export function parseSemanticCounterfactualJson(
  text: string,
): SemanticCounterfactualReport {
  return parseSemanticCounterfactualReport(parseStrictJson(text));
}
function projectionSemantic(outputs: SemanticReplayOutputs, specId: string) {
  const result = outputs.projections.find(
    (output) => output.specId === specId,
  )?.result;
  return result?.status === "projected"
    ? result.projection.semantic
    : undefined;
}
function freeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Reproduces both inputs before explaining their differences; never activates. */
export function compareSemanticMetamapBundles(
  beforeValue: unknown,
  afterValue: unknown,
): SemanticCounterfactualResult {
  const version = (value: unknown) =>
    typeof value === "object" && value !== null
      ? Object.getOwnPropertyDescriptor(value, "schemaVersion")?.value
      : undefined;
  if (version(beforeValue) !== "2.0.0" || version(afterValue) !== "2.0.0")
    return {
      status: "rejected",
      issues: [
        {
          side: version(beforeValue) !== "2.0.0" ? "before" : "after",
          code: "COUNTERFACTUAL_VERSION_MISMATCH",
          message:
            "Comparison requires two captures from the same semantic profile",
        },
      ],
    };
  const beforeReplay = replayMetamap(beforeValue as SemanticReplayBundle);
  const afterReplay = replayMetamap(afterValue as SemanticReplayBundle);
  if (beforeReplay.status === "rejected" || afterReplay.status === "rejected")
    return {
      status: "rejected",
      issues: [
        ...(beforeReplay.status === "rejected"
          ? beforeReplay.issues.map((issue) => ({
              ...issue,
              side: "before" as const,
            }))
          : []),
        ...(afterReplay.status === "rejected"
          ? afterReplay.issues.map((issue) => ({
              ...issue,
              side: "after" as const,
            }))
          : []),
      ],
    };
  const before = beforeValue as SemanticReplayBundle,
    after = afterValue as SemanticReplayBundle;
  const common = compareReplayEvaluationContent(
    before,
    after,
    beforeReplay.outputs,
    afterReplay.outputs,
    beforeReplay.admitted,
    afterReplay.admitted,
    equal,
    (input: keyof SemanticReplayInputs, value: unknown) =>
      input === "graph" || input === "sourceSnapshot"
        ? valueDigest(value)
        : canonicalDigest(value),
  );
  const projections = common.projections.map(({ specId }) => {
    const a = projectionSemantic(beforeReplay.outputs, specId),
      b = projectionSemantic(afterReplay.outputs, specId);
    return {
      specId,
      beforeKnown: !!a,
      afterKnown: !!b,
      usedMappingsChanged:
        a && b ? !equal(a.usedMappings, b.usedMappings) : null,
      dependenciesChanged:
        a && b ? !equal(a.dependencies, b.dependencies) : null,
      riskChanged: a && b ? !equal(a.risk, b.risk) : null,
    };
  });
  const content = {
    $schema:
      "https://raw.githubusercontent.com/roryscot/metamap/main/schemas/metamap-counterfactual-v2.schema.json",
    schemaVersion: "2.0.0" as const,
    ...common,
    semantic: {
      derivations: records(
        before.inputs.policy.derivations,
        after.inputs.policy.derivations,
      ),
      assessments: records(
        before.inputs.policy.assessments,
        after.inputs.policy.assessments,
      ),
      uncertaintyRequirements: records(
        before.inputs.policy.uncertaintyRequirements,
        after.inputs.policy.uncertaintyRequirements,
      ),
      riskBudgets: records(
        before.inputs.policy.riskBudgets,
        after.inputs.policy.riskBudgets,
      ),
      sourceReceipts: records(
        before.inputs.sourceReceipts,
        after.inputs.sourceReceipts,
      ),
      projections,
    },
  };
  const digest = canonicalDigest(content);
  const report = JSON.parse(
    canonicalJson({
      ...content,
      id: `urn:metamap:counterfactual:${digest.slice(7)}`,
      digest,
    }),
  ) as SemanticCounterfactualReport;
  parseSemanticCounterfactualReport(report);
  return { status: "compared", report: freeze(report) };
}
