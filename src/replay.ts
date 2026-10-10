import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { AnySchema } from "ajv";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { MetamapDocument, RelationPack } from "./model.js";
import {
  compilePathTree,
  type PathTreeCompilationResult,
} from "./path-tree.js";
import {
  compileProjection,
  type MetamapProjectionSpec,
  type ProjectionCompilationResult,
} from "./projection.js";
import { RelationRegistry, coreRelationPack } from "./relations.js";
import { contentDigest, valueDigest, valuesEqual } from "./stable.js";
import { compileMetamap } from "./viability.js";
import {
  captureSemanticReplayBundle,
  replaySemanticMetamap,
} from "./semantic-replay.js";
import type { MetamapSemanticPolicy } from "./semantic-model.js";
import type {
  CaptureSemanticReplayOptions,
  CaptureSourceReplayOptions,
  SemanticReplayBundle,
  SemanticReplayResult,
  SourceReplayBundle,
  SourceReplayResult,
} from "./semantic-replay-model.js";
import type {
  CompilationResult,
  EvaluationContext,
  MetamapViabilityPolicy,
} from "./viability-model.js";

export const METAMAP_REPLAY_VERSION = "1.0.0" as const;

export interface ReplayDependencyIdentity {
  name: string;
  version: string;
  digest: string;
}

/** Exact local executable identity, not an authentication or approval claim. */
export interface ReplayCompilerIdentity {
  name: string;
  version: string;
  format: "source" | "distribution";
  digest: string;
  runtime: { node: string; icu: string; locale: string };
  dependencies: ReplayDependencyIdentity[];
}

export interface ReplayInputs {
  graph: MetamapDocument;
  policy: MetamapViabilityPolicy;
  relationPacks: RelationPack[];
  context: EvaluationContext;
  evaluatedAt: string;
  changedSubjects: string[];
  projections: MetamapProjectionSpec[];
}

export interface ReplayProjectionOutput {
  specId: string;
  result: ProjectionCompilationResult;
  pathTree?: PathTreeCompilationResult;
}

export interface ReplayOutputs {
  compilation: CompilationResult;
  projections: ReplayProjectionOutput[];
}

export interface MetamapReplayBundle {
  $schema?: string;
  schemaVersion: typeof METAMAP_REPLAY_VERSION;
  id: string;
  digest: string;
  compiler: ReplayCompilerIdentity;
  constraintExecutor: "builtin";
  inputs: ReplayInputs;
  expected: ReplayOutputs;
}

export interface ReplayIssue {
  code: string;
  message: string;
  path?: string;
}

export interface ReplayValidationResult {
  valid: boolean;
  issues: ReplayIssue[];
}

export type ReplayResult =
  | {
      status: "verified";
      bundle: string;
      admitted: boolean;
      outputs: ReplayOutputs;
    }
  | {
      status: "rejected";
      bundle?: string;
      issues: ReplayIssue[];
      actual?: ReplayOutputs;
    };

export interface CaptureReplayOptions {
  /** Required: replay must never acquire a new evaluation time. */
  evaluatedAt: string;
  context?: EvaluationContext;
  changedSubjects?: readonly string[];
  projections?: readonly MetamapProjectionSpec[];
  relationRegistry?: RelationRegistry;
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = dirname(moduleDirectory);
const Ajv2020 = Ajv2020Module.default;
const addFormats = addFormatsModule.default;
const replaySchema = JSON.parse(
  readFileSync(
    new URL("../schemas/metamap-replay.schema.json", import.meta.url),
    "utf8",
  ),
) as AnySchema;
const ajv = addFormats(new Ajv2020({ allErrors: true, strict: true }));
for (const name of [
  "metamap-graph",
  "metamap-viability",
  "metamap-generation",
  "metamap-projection-spec",
  "metamap-projection",
  "metamap-path-tree",
  "relation-pack",
]) {
  ajv.addSchema(
    JSON.parse(
      readFileSync(
        new URL(`../schemas/${name}.schema.json`, import.meta.url),
        "utf8",
      ),
    ) as AnySchema,
  );
}
const validateBundleShape = ajv.compile(replaySchema);

function fileIdentities(
  root: string,
  suffixes: readonly string[],
): Array<{ path: string; digest: string }> {
  const files: Array<{ path: string; digest: string }> = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (
        entry.name === "node_modules" ||
        entry.name === "__tests__" ||
        entry.name.startsWith(".")
      )
        continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (
        entry.isFile() &&
        suffixes.some((suffix) => entry.name.endsWith(suffix)) &&
        !entry.name.endsWith(".d.ts")
      ) {
        files.push({
          path: relative(root, path).split("\\").join("/"),
          digest: contentDigest(readFileSync(path)),
        });
      }
    }
  };
  walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** Includes runtime dependency contents and their transitive dependency closure. */
function dependencyIdentities(): ReplayDependencyIdentity[] {
  const seen = new Set<string>();
  const identities: ReplayDependencyIdentity[] = [];
  const visit = (name: string, from: string): void => {
    const path = createRequire(from).resolve(`${name}/package.json`);
    if (seen.has(path)) return;
    seen.add(path);
    const pkg = JSON.parse(readFileSync(path, "utf8")) as {
      name: string;
      version: string;
      dependencies?: Record<string, string>;
    };
    identities.push({
      name: pkg.name,
      version: pkg.version,
      digest: valueDigest(
        fileIdentities(dirname(path), [".js", ".cjs", ".mjs", ".json"]),
      ),
    });
    for (const dependency of Object.keys(pkg.dependencies ?? {}).sort())
      visit(dependency, path);
  };
  const packagePath = join(packageDirectory, "package.json");
  const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  for (const name of Object.keys(pkg.dependencies ?? {}).sort())
    visit(name, packagePath);
  return identities.sort((a, b) =>
    `${a.name}@${a.version}:${a.digest}`.localeCompare(
      `${b.name}@${b.version}:${b.digest}`,
    ),
  );
}

/** Source and packaged JavaScript are distinct executors; neither is substituted. */
export function replayCompilerIdentity(): ReplayCompilerIdentity {
  const pkg = JSON.parse(
    readFileSync(join(packageDirectory, "package.json"), "utf8"),
  ) as { name: string; version: string };
  const format = import.meta.url.endsWith(".ts") ? "source" : "distribution";
  const dependencies = dependencyIdentities();
  const runtime = {
    node: process.versions.node,
    icu: process.versions.icu ?? "none",
    locale: new Intl.Collator().resolvedOptions().locale,
  };
  const content = {
    name: pkg.name,
    version: pkg.version,
    format,
    runtime,
    dependencies,
    files: fileIdentities(moduleDirectory, [
      format === "source" ? ".ts" : ".js",
    ]),
    schemas: fileIdentities(join(packageDirectory, "schemas"), [".json"]),
    relationPacks: fileIdentities(join(packageDirectory, "relation-packs"), [
      ".json",
    ]),
  };
  return {
    name: pkg.name,
    version: pkg.version,
    format,
    runtime,
    dependencies,
    digest: valueDigest(content),
  };
}

function freeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function evaluate(inputs: ReplayInputs): ReplayOutputs {
  const relationRegistry = new RelationRegistry(inputs.relationPacks);
  const compilation = compileMetamap(inputs.graph, inputs.policy, {
    context: inputs.context,
    evaluatedAt: inputs.evaluatedAt,
    changedSubjects: inputs.changedSubjects,
    relationRegistry,
  });
  const projections: ReplayProjectionOutput[] = [];
  if (compilation.status === "viable") {
    for (const spec of inputs.projections) {
      const result = compileProjection(
        inputs.graph,
        compilation.generation,
        spec,
        { relationRegistry },
      );
      projections.push({
        specId: spec.id,
        result,
        ...(result.status === "projected" && spec.pathTree
          ? { pathTree: compilePathTree(result.projection, spec) }
          : {}),
      });
    }
  }
  return { compilation, projections };
}

function inputIssues(inputs: ReplayInputs): ReplayIssue[] {
  const issues: ReplayIssue[] = [];
  const packs = new Map<string, RelationPack>();
  for (const pack of inputs.relationPacks) {
    if (packs.has(pack.id))
      issues.push({
        code: "REPLAY_DUPLICATE_PACK",
        message: `Replay repeats relation pack ${pack.id}`,
      });
    packs.set(pack.id, pack);
  }
  const core = packs.get(coreRelationPack.id);
  if (!core || !valuesEqual(core, coreRelationPack)) {
    issues.push({
      code: "REPLAY_CORE_PACK_MISMATCH",
      message: "Replay requires the exact built-in core relation pack",
    });
  }
  for (const reference of inputs.graph.relationPacks ?? []) {
    const pack = packs.get(reference.id);
    if (
      !pack ||
      pack.version !== reference.version ||
      (reference.digest && reference.digest !== valueDigest(pack))
    ) {
      issues.push({
        code: "REPLAY_RELATION_PACK_MISMATCH",
        message: `Replay is missing the exact referenced pack ${reference.id}@${reference.version}`,
      });
    }
  }
  const specIds = new Set<string>();
  for (const spec of inputs.projections) {
    if (specIds.has(spec.id))
      issues.push({
        code: "REPLAY_DUPLICATE_PROJECTION",
        message: `Replay repeats projection specification ${spec.id}`,
      });
    specIds.add(spec.id);
  }
  try {
    new RelationRegistry(inputs.relationPacks);
  } catch (error) {
    issues.push({
      code: "REPLAY_RELATION_REGISTRY_CONFLICT",
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return issues;
}

/** Validate shape, captured dependency completeness, and content addresses. */
export function validateReplayBundle(value: unknown): ReplayValidationResult {
  if (!validateBundleShape(value)) {
    return {
      valid: false,
      issues: (validateBundleShape.errors ?? []).map((error) => ({
        code: "INVALID_REPLAY_BUNDLE",
        message: error.message ?? "Replay bundle is invalid",
        path: error.instancePath || "$",
      })),
    };
  }
  const bundle = value as MetamapReplayBundle;
  const { $schema: _schema, id, digest, ...content } = bundle;
  const expectedDigest = valueDigest(content);
  const issues = inputIssues(bundle.inputs);
  if (digest !== expectedDigest)
    issues.push({
      code: "REPLAY_DIGEST_MISMATCH",
      message: `Replay digest ${digest} does not match ${expectedDigest}`,
    });
  if (id !== `urn:metamap:replay:${expectedDigest.replace(/^sha256:/, "")}`)
    issues.push({
      code: "REPLAY_ID_MISMATCH",
      message: "Replay identity does not match its contents",
    });
  return { valid: issues.length === 0, issues };
}

export function parseReplayBundle(value: unknown): MetamapReplayBundle {
  const validation = validateReplayBundle(value);
  if (!validation.valid)
    throw new Error(
      `Invalid Metamap replay bundle: ${validation.issues.map((entry) => `${entry.code}: ${entry.message}`).join("; ")}`,
    );
  return value as MetamapReplayBundle;
}

/** Capture compiler evaluation only. Sources, evidence producers, and activation stay outside this operation. */
export function captureReplayBundle(
  graph: MetamapDocument,
  policy: MetamapSemanticPolicy,
  options: CaptureSourceReplayOptions,
): SourceReplayBundle;
export function captureReplayBundle(
  graph: MetamapDocument,
  policy: MetamapSemanticPolicy,
  options: CaptureSemanticReplayOptions,
): SemanticReplayBundle;
export function captureReplayBundle(
  graph: MetamapDocument,
  policy: MetamapViabilityPolicy,
  options: CaptureReplayOptions,
): MetamapReplayBundle;
export function captureReplayBundle(
  graph: MetamapDocument,
  policy: MetamapViabilityPolicy | MetamapSemanticPolicy,
  options:
    | CaptureReplayOptions
    | CaptureSemanticReplayOptions
    | CaptureSourceReplayOptions,
): MetamapReplayBundle | SemanticReplayBundle | SourceReplayBundle;
export function captureReplayBundle(
  graph: MetamapDocument,
  policy: MetamapViabilityPolicy | MetamapSemanticPolicy,
  options:
    | CaptureReplayOptions
    | CaptureSemanticReplayOptions
    | CaptureSourceReplayOptions,
): MetamapReplayBundle | SemanticReplayBundle | SourceReplayBundle {
  if (policy.schemaVersion === "2.0.0")
    return captureSemanticReplayBundle(
      graph,
      policy,
      options as CaptureSemanticReplayOptions | CaptureSourceReplayOptions,
      replayCompilerIdentity,
    );
  if (
    "sourceCapture" in options ||
    "sourceReceipts" in options ||
    "sourceSnapshot" in options
  )
    throw new Error(
      "Source capture requires semantic policy 2.0 and replay 3.0",
    );
  return captureLegacyReplayBundle(
    graph,
    policy,
    options as CaptureReplayOptions,
  );
}

function captureLegacyReplayBundle(
  graph: MetamapDocument,
  policy: MetamapViabilityPolicy,
  options: CaptureReplayOptions,
): MetamapReplayBundle {
  if ("constraintRegistry" in options)
    throw new Error("Replay v1 supports only built-in constraint evaluators");
  const inputs: ReplayInputs = structuredClone({
    graph,
    policy,
    relationPacks: (options.relationRegistry ?? new RelationRegistry())
      .allPacks()
      .sort((a, b) => a.id.localeCompare(b.id)),
    context: options.context ?? {},
    evaluatedAt: options.evaluatedAt,
    changedSubjects: [...new Set(options.changedSubjects ?? [])].sort(),
    projections: [...(options.projections ?? [])].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
  });
  const dependencies = inputIssues(inputs);
  if (dependencies.length > 0)
    throw new Error(
      dependencies.map((entry) => `${entry.code}: ${entry.message}`).join("; "),
    );
  const content = {
    schemaVersion: METAMAP_REPLAY_VERSION,
    compiler: replayCompilerIdentity(),
    constraintExecutor: "builtin" as const,
    inputs,
    expected: evaluate(inputs),
  };
  const digest = valueDigest(content);
  const bundle: MetamapReplayBundle = {
    $schema:
      "https://raw.githubusercontent.com/roryscot/metamap/main/schemas/metamap-replay.schema.json",
    ...content,
    id: `urn:metamap:replay:${digest.replace(/^sha256:/, "")}`,
    digest,
  };
  parseReplayBundle(bundle);
  return freeze(bundle);
}

/** Recompute with an exact installed executor. A verified rejection is still not admitted. */
export function replayMetamap(value: SourceReplayBundle): SourceReplayResult;
export function replayMetamap(
  value: SemanticReplayBundle,
): SemanticReplayResult;
export function replayMetamap(value: MetamapReplayBundle): ReplayResult;
export function replayMetamap(
  value: unknown,
): ReplayResult | SemanticReplayResult | SourceReplayResult;
export function replayMetamap(
  value: unknown,
): ReplayResult | SemanticReplayResult | SourceReplayResult {
  if (
    typeof value === "object" &&
    value !== null &&
    ["2.0.0", "3.0.0"].includes(
      Object.getOwnPropertyDescriptor(value, "schemaVersion")?.value,
    )
  )
    return replaySemanticMetamap(value, replayCompilerIdentity);
  return replayLegacyMetamap(value);
}

function replayLegacyMetamap(value: unknown): ReplayResult {
  const validation = validateReplayBundle(value);
  if (!validation.valid)
    return { status: "rejected", issues: validation.issues };
  const bundle = value as MetamapReplayBundle;
  const compiler = replayCompilerIdentity();
  if (!valuesEqual(bundle.compiler, compiler))
    return {
      status: "rejected",
      bundle: bundle.id,
      issues: [
        {
          code: "REPLAY_COMPILER_MISMATCH",
          message:
            "The installed compiler, dependencies, or runtime do not match the captured executor",
        },
      ],
    };
  const actual = evaluate(structuredClone(bundle.inputs));
  if (!valuesEqual(actual, bundle.expected))
    return {
      status: "rejected",
      bundle: bundle.id,
      actual,
      issues: [
        {
          code: "REPLAY_OUTPUT_MISMATCH",
          message:
            "Recomputed compilation or projections differ from the captured results",
        },
      ],
    };
  return {
    status: "verified",
    bundle: bundle.id,
    admitted:
      actual.compilation.status === "viable" &&
      actual.projections.every(
        (entry) =>
          entry.result.status === "projected" &&
          (!entry.pathTree || entry.pathTree.status === "projected"),
      ),
    outputs: actual,
  };
}
