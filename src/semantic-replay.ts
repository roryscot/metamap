import { readFileSync } from "node:fs";
import type { AnySchemaObject } from "ajv";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import {
  canonicalDigest,
  canonicalJson,
  legacyReferenceValue,
  parseStrictJson,
} from "./canonical.js";
import type { MetamapDocument } from "./model.js";
import { compilePathTree } from "./path-tree.js";
import { compileProjection } from "./projection.js";
import {
  inspectSourceCapture,
  sourceCaptureLineage,
  sourceLineageIssues,
} from "./provenance.js";
import { parseRelationPack, relationPackDigest } from "./relation-pack.js";
import { coreRelationPack, RelationRegistry } from "./relations.js";
import type {
  ReplayCompilerIdentity,
  ReplayIssue,
  ReplayValidationResult,
} from "./replay.js";
import type { MetamapSemanticPolicy } from "./semantic-model.js";
import type {
  CaptureSemanticReplayOptions,
  CaptureSourceReplayOptions,
  SemanticReplayBundle,
  SemanticReplayInputs,
  SemanticReplayOutputs,
  SemanticReplayResult,
  SourceReplayBundle,
  SourceReplayInputs,
  SourceReplayOutputs,
  SourceReplayResult,
} from "./semantic-replay-model.js";
import { valueDigest } from "./stable.js";
import { compileMetamap } from "./viability.js";

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
  "metamap-path-tree",
  "metamap-projection-spec-v2",
  "metamap-projection-v2",
  "metamap-path-tree-v2",
  "metamap-source-receipt",
  "metamap-snapshot",
  "metamap-replay-v2",
  "metamap-config",
  "metamap-source-capture",
  "metamap-source-inspection",
  "metamap-replay-v3",
])
  ajv.addSchema(schema(name));
const validateShape = ajv.getSchema(schema("metamap-replay-v2").$id as string)!;
const validateSourceShape = ajv.getSchema(
  schema("metamap-replay-v3").$id as string,
)!;
function freeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export function semanticReplayDigest(
  bundle: SemanticReplayBundle | SourceReplayBundle,
): string {
  const { id: _id, digest: _digest, ...content } = bundle;
  return canonicalDigest(content);
}
function inputIssues(
  inputs: SemanticReplayInputs | SourceReplayInputs,
): ReplayIssue[] {
  const issues: ReplayIssue[] = [];
  if ("sourceCapture" in inputs) {
    issues.push(...sourceLineageIssues(inputs.sourceCapture, inputs));
  } else if (inputs.sourceSnapshot !== null || inputs.sourceReceipts.length)
    issues.push({
      code: "REPLAY_SOURCE_CAPTURE_NOT_IMPLEMENTED",
      message:
        "Replay 2.0 cannot bind complete source records; source provenance requires an explicit replay 3.0 capture",
    });
  const packs = new Map(inputs.relationPacks.map((pack) => [pack.id, pack]));
  if (packs.size !== inputs.relationPacks.length)
    issues.push({
      code: "REPLAY_DUPLICATE_PACK",
      message: "Replay repeats a pack ID",
    });
  const core = packs.get(coreRelationPack.id);
  if (!core || valueDigest(core) !== valueDigest(coreRelationPack))
    issues.push({
      code: "REPLAY_CORE_PACK_MISMATCH",
      message: "Replay requires the exact built-in core pack",
    });
  for (const reference of inputs.graph.relationPacks ?? []) {
    const pack = packs.get(reference.id);
    if (
      !pack ||
      pack.version !== reference.version ||
      (pack.schemaVersion === "2.0.0" && !reference.digest) ||
      (reference.digest && reference.digest !== relationPackDigest(pack))
    )
      issues.push({
        code: "REPLAY_RELATION_PACK_MISMATCH",
        message: `Missing exact referenced pack ${reference.id}`,
      });
  }
  if (
    new Set(inputs.projections.map((spec) => spec.id)).size !==
    inputs.projections.length
  )
    issues.push({
      code: "REPLAY_DUPLICATE_PROJECTION",
      message: "Replay repeats a projection ID",
    });
  try {
    for (const pack of inputs.relationPacks) parseRelationPack(pack);
    new RelationRegistry(inputs.relationPacks);
  } catch (error) {
    issues.push({
      code: "REPLAY_RELATION_REGISTRY_CONFLICT",
      message:
        error instanceof Error ? error.message : "Invalid relation registry",
    });
  }
  return issues;
}
function validateBundle(
  value: unknown,
  source: boolean,
): ReplayValidationResult {
  try {
    canonicalJson(value);
    const shape = source ? validateSourceShape : validateShape;
    if (!shape(value))
      return {
        valid: false,
        issues: (shape.errors ?? []).map((issue) => ({
          code: "INVALID_REPLAY_BUNDLE",
          message: issue.message ?? "Invalid replay capture",
          path: issue.instancePath || "$",
        })),
      };
    const bundle = value as SemanticReplayBundle | SourceReplayBundle;
    const digest = semanticReplayDigest(bundle);
    const issues = inputIssues(bundle.inputs);
    if (
      bundle.digest !== digest ||
      bundle.id !== `urn:metamap:replay:${digest.slice(7)}`
    )
      issues.push({
        code: "REPLAY_DIGEST_MISMATCH",
        message: "Semantic replay content binding mismatch",
      });
    return { valid: issues.length === 0, issues };
  } catch (error) {
    return {
      valid: false,
      issues: [
        {
          code: "INVALID_REPLAY_BUNDLE",
          message:
            error instanceof Error ? error.message : "Invalid replay capture",
        },
      ],
    };
  }
}
export function validateSemanticReplayBundle(
  value: unknown,
): ReplayValidationResult {
  return validateBundle(value, false);
}
export function validateSourceReplayBundle(
  value: unknown,
): ReplayValidationResult {
  return validateBundle(value, true);
}
export function parseSemanticReplayBundle(
  value: unknown,
): SemanticReplayBundle {
  const validation = validateSemanticReplayBundle(value);
  if (!validation.valid)
    throw new Error(
      validation.issues
        .map((issue) => `${issue.code}: ${issue.message}`)
        .join("; "),
    );
  return value as SemanticReplayBundle;
}
export function parseSemanticReplayJson(text: string): SemanticReplayBundle {
  return parseSemanticReplayBundle(parseStrictJson(text));
}
export function parseSourceReplayBundle(value: unknown): SourceReplayBundle {
  const validation = validateSourceReplayBundle(value);
  if (!validation.valid)
    throw new Error(
      validation.issues
        .map((issue) => `${issue.code}: ${issue.message}`)
        .join("; "),
    );
  return value as SourceReplayBundle;
}
export function parseSourceReplayJson(text: string): SourceReplayBundle {
  return parseSourceReplayBundle(parseStrictJson(text));
}
function evaluate(inputs: SourceReplayInputs): SourceReplayOutputs;
function evaluate(inputs: SemanticReplayInputs): SemanticReplayOutputs;
function evaluate(
  inputs: SemanticReplayInputs | SourceReplayInputs,
): SemanticReplayOutputs | SourceReplayOutputs {
  const registry = new RelationRegistry(inputs.relationPacks);
  const compilation = compileMetamap(inputs.graph, inputs.policy, {
    relationRegistry: registry,
    context: inputs.context,
    evaluatedAt: inputs.evaluatedAt,
    changedSubjects: inputs.changedSubjects,
  });
  const projections: SemanticReplayOutputs["projections"] = [];
  if (compilation.status === "viable")
    for (const spec of inputs.projections) {
      const result = compileProjection(
        inputs.graph,
        compilation.generation,
        spec,
        { relationRegistry: registry, semanticPolicy: inputs.policy },
      );
      projections.push({
        specId: spec.id,
        result,
        ...(result.status === "projected" && spec.pathTree
          ? { pathTree: compilePathTree(result.projection, spec) }
          : {}),
      });
    }
  // Only trusted evaluator output uses legacy optional issue fields. New inputs
  // were strict JSON and are never sanitized to conceal unsupported members.
  const outputs = legacyReferenceValue({
    compilation,
    projections,
  }) as unknown as SemanticReplayOutputs;
  return "sourceCapture" in inputs
    ? {
        ...outputs,
        sourceInspection: inspectSourceCapture(
          inputs.sourceCapture,
          inputs.graph,
        ),
      }
    : outputs;
}
export function captureSemanticReplayBundle(
  graph: MetamapDocument,
  policy: MetamapSemanticPolicy,
  options: CaptureSourceReplayOptions,
  compilerIdentity: () => ReplayCompilerIdentity,
): SourceReplayBundle;
export function captureSemanticReplayBundle(
  graph: MetamapDocument,
  policy: MetamapSemanticPolicy,
  options: CaptureSemanticReplayOptions,
  compilerIdentity: () => ReplayCompilerIdentity,
): SemanticReplayBundle;
export function captureSemanticReplayBundle(
  graph: MetamapDocument,
  policy: MetamapSemanticPolicy,
  options: CaptureSemanticReplayOptions | CaptureSourceReplayOptions,
  compilerIdentity: () => ReplayCompilerIdentity,
): SemanticReplayBundle | SourceReplayBundle;
export function captureSemanticReplayBundle(
  graph: MetamapDocument,
  policy: MetamapSemanticPolicy,
  options: CaptureSemanticReplayOptions | CaptureSourceReplayOptions,
  compilerIdentity: () => ReplayCompilerIdentity,
): SemanticReplayBundle | SourceReplayBundle {
  if ("constraintRegistry" in options)
    throw new Error(
      "Semantic replay supports only the installed built-in constraint evaluators",
    );
  const source = "sourceCapture" in options;
  if (source && ("sourceSnapshot" in options || "sourceReceipts" in options))
    throw new Error(
      "Replay 3.0 derives lineage from its complete source capture; separate lineage overrides are unsupported",
    );
  const lineage = source
    ? {
        ...sourceCaptureLineage(options.sourceCapture),
        sourceCapture: options.sourceCapture,
      }
    : {
        sourceSnapshot: options.sourceSnapshot ?? null,
        sourceReceipts: [...(options.sourceReceipts ?? [])],
      };
  const inputs = JSON.parse(
    canonicalJson({
      graph: legacyReferenceValue(graph),
      policy,
      relationPacks: (options.relationRegistry ?? new RelationRegistry())
        .allPacks()
        .map((pack) =>
          pack.schemaVersion === "2.0.0" ? pack : legacyReferenceValue(pack),
        ),
      context: options.context ?? {},
      evaluatedAt: options.evaluatedAt,
      changedSubjects: [...new Set(options.changedSubjects ?? [])].sort(),
      projections: [...(options.projections ?? [])].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      ),
      ...lineage,
    }),
  ) as SemanticReplayInputs | SourceReplayInputs;
  const issues = inputIssues(inputs);
  if (issues.length)
    throw new Error(
      issues.map((issue) => `${issue.code}: ${issue.message}`).join("; "),
    );
  const content = {
    $schema: `https://raw.githubusercontent.com/roryscot/metamap/main/schemas/metamap-replay-v${source ? 3 : 2}.schema.json`,
    schemaVersion: source ? ("3.0.0" as const) : ("2.0.0" as const),
    compiler: compilerIdentity(),
    constraintExecutor: "builtin" as const,
    inputs,
    expected: evaluate(inputs),
  };
  const digest = canonicalDigest(content);
  const bundle = {
    ...content,
    id: `urn:metamap:replay:${digest.slice(7)}`,
    digest,
  } as SemanticReplayBundle | SourceReplayBundle;
  if (source) parseSourceReplayBundle(bundle);
  else parseSemanticReplayBundle(bundle);
  return freeze(bundle);
}
/** No source fetches, named-code loading, graph mutation or activation. */
export function replaySemanticMetamap(
  value: unknown,
  compilerIdentity: () => ReplayCompilerIdentity,
): SemanticReplayResult | SourceReplayResult {
  const source =
    typeof value === "object" &&
    value !== null &&
    Object.getOwnPropertyDescriptor(value, "schemaVersion")?.value === "3.0.0";
  const validation = validateBundle(value, source);
  if (!validation.valid)
    return { status: "rejected", issues: validation.issues };
  const bundle = value as SemanticReplayBundle | SourceReplayBundle;
  if (canonicalDigest(bundle.compiler) !== canonicalDigest(compilerIdentity()))
    return {
      status: "rejected",
      bundle: bundle.id,
      issues: [
        {
          code: "REPLAY_COMPILER_MISMATCH",
          message:
            "Installed executor, dependencies or runtime differ from the capture",
        },
      ],
    };
  const actual = evaluate(
    JSON.parse(canonicalJson(bundle.inputs)) as
      SemanticReplayInputs | SourceReplayInputs,
  );
  if (canonicalDigest(actual) !== canonicalDigest(bundle.expected))
    return {
      status: "rejected",
      bundle: bundle.id,
      actual,
      issues: [
        {
          code: "REPLAY_OUTPUT_MISMATCH",
          message: "Captured semantic evaluation differs from recomputation",
        },
      ],
    };
  return {
    status: "verified",
    bundle: bundle.id,
    admitted:
      actual.compilation.status === "viable" &&
      actual.projections.every(
        (output) =>
          output.result.status === "projected" &&
          (!output.pathTree || output.pathTree.status === "projected"),
      ),
    outputs: actual,
  };
}
