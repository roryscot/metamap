import { readFileSync } from "node:fs";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { AnySchemaObject } from "ajv";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { createDefaultAdapterRegistry } from "./adapters/registry.js";
import type { AdapterResult } from "./adapters/types.js";
import {
  canonicalDigest,
  canonicalJson,
  legacyReferenceValue,
  parseStrictJson,
} from "./canonical.js";
import {
  parseMetamapConfig,
  type LoadedMetamapConfig,
  type MetamapConfig,
  type MetamapSourceConfig,
} from "./config.js";
import { diffMetamapDocuments } from "./diff.js";
import type { MetamapDocument } from "./model.js";
import type {
  CapturedSourceLineage,
  MetamapSourceCapture,
  SourceChange,
  SourceInspection,
  SourceRediscoveryOptions,
} from "./provenance-model.js";
import { parseRelationPack, relationPackDigest } from "./relation-pack.js";
import { coreRelationPack, RelationRegistry } from "./relations.js";
import type { ReplayIssue, ReplayValidationResult } from "./replay.js";
import type { SourceReceipt } from "./semantic-replay-model.js";
import { contentDigest, valueDigest } from "./stable.js";
import {
  assembleWorkspace,
  discoverWorkspace,
  makeWorkspaceSnapshot,
  type ConfiguredRelationPack,
  type WorkspaceDiscovery,
} from "./workspace.js";

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
  "metamap-config",
  "relation-pack",
  "relation-pack-v2",
  "metamap-source-receipt",
  "metamap-snapshot",
  "metamap-source-capture",
  "metamap-source-inspection",
])
  ajv.addSchema(schema(name));
const validateCaptureShape = ajv.getSchema(
  schema("metamap-source-capture").$id as string,
)!;
const validateReceiptShape = ajv.getSchema(
  schema("metamap-source-receipt").$id as string,
)!;
const validateInspectionShape = ajv.getSchema(
  schema("metamap-source-inspection").$id as string,
)!;
const validateGraphShape = ajv.getSchema(
  schema("metamap-graph").$id as string,
)!;

function freeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const message = (error: unknown): string =>
  error instanceof Error ? error.message : "Invalid source capture";
const issue = (code: string, text: string, path?: string): ReplayIssue => ({
  code,
  message: text,
  ...(path ? { path } : {}),
});

export function sourceCaptureDigest(capture: MetamapSourceCapture): string {
  const { id: _id, digest: _digest, ...content } = capture;
  return canonicalDigest(content);
}
export function sourceReceiptDigest(receipt: SourceReceipt): string {
  const { id: _id, digest: _digest, ...content } = receipt;
  return canonicalDigest(content);
}
/** Relative portable locators only. They are data and never a filesystem grant. */
function portableLocator(path: string): boolean {
  return (
    !isAbsolute(path) &&
    !path.includes("\\") &&
    !/[:\u0000-\u001f\u007f]/u.test(path) &&
    path
      .split("/")
      .every((part) => part.length > 0 && part !== "." && part !== "..")
  );
}
function inputLocatorIssues(
  inputs: AdapterResult["inputs"],
  source: string,
): ReplayIssue[] {
  const issues: ReplayIssue[] = [];
  const paths = new Set<string>();
  for (const input of inputs) {
    if (!portableLocator(input.path))
      issues.push(
        issue(
          "SOURCE_LOCATOR_INVALID",
          `Source ${source} has a non-portable local locator ${input.path}`,
        ),
      );
    if (paths.has(input.path))
      issues.push(
        issue(
          "SOURCE_INPUT_DUPLICATE",
          `Source ${source} repeats input ${input.path}`,
        ),
      );
    paths.add(input.path);
  }
  return issues;
}
export function validateSourceReceipt(value: unknown): ReplayValidationResult {
  try {
    canonicalJson(value);
    if (!validateReceiptShape(value))
      return {
        valid: false,
        issues: (validateReceiptShape.errors ?? []).map((error) =>
          issue(
            "INVALID_SOURCE_RECEIPT",
            error.message ?? "Invalid receipt",
            error.instancePath || "$",
          ),
        ),
      };
    const receipt = value as SourceReceipt;
    const digest = sourceReceiptDigest(receipt);
    const issues = inputLocatorIssues(receipt.inputs, receipt.source);
    if (
      receipt.digest !== digest ||
      receipt.id !== `urn:metamap:source-receipt:${digest.slice(7)}`
    )
      issues.push(
        issue(
          "SOURCE_RECEIPT_DIGEST_MISMATCH",
          "Source receipt identity does not match its content",
        ),
      );
    return { valid: issues.length === 0, issues };
  } catch (error) {
    return {
      valid: false,
      issues: [issue("INVALID_SOURCE_RECEIPT", message(error))],
    };
  }
}
export function parseSourceReceipt(value: unknown): SourceReceipt {
  const validation = validateSourceReceipt(value);
  if (!validation.valid)
    throw new Error(
      validation.issues
        .map((issue) => `${issue.code}: ${issue.message}`)
        .join("; "),
    );
  return value as SourceReceipt;
}
export function parseSourceReceiptJson(text: string): SourceReceipt {
  return parseSourceReceipt(parseStrictJson(text));
}
export function validateSourceInspection(
  value: unknown,
): ReplayValidationResult {
  try {
    canonicalJson(value);
    if (!validateInspectionShape(value))
      return {
        valid: false,
        issues: (validateInspectionShape.errors ?? []).map((error) =>
          issue(
            "INVALID_SOURCE_INSPECTION",
            error.message ?? "Invalid inspection",
            error.instancePath || "$",
          ),
        ),
      };
    const inspection = value as SourceInspection;
    const issues: ReplayIssue[] = [];
    if (
      (inspection.sourceGraph.digest === inspection.evaluatedGraph.digest) !==
      (inspection.relationship === "identical")
    )
      issues.push(
        issue(
          "SOURCE_RELATIONSHIP_MISMATCH",
          "Source/candidate relationship does not match the graph digests",
        ),
      );
    if (
      inspection.relationship === "identical" &&
      inspection.sourceGraph.id !== inspection.evaluatedGraph.id
    )
      issues.push(
        issue(
          "SOURCE_RELATIONSHIP_MISMATCH",
          "Identical graph bindings must name the same graph",
        ),
      );
    if (
      new Set(inspection.lineage.receipts).size !==
      inspection.lineage.receipts.length
    )
      issues.push(
        issue(
          "SOURCE_RECEIPT_DUPLICATE",
          "Inspection repeats a source receipt",
        ),
      );
    for (const kind of ["added", "removed", "changed"] as const)
      if (
        inspection.graphChanges.counts[kind] !==
        inspection.graphChanges.changes.filter(
          (change) => change.change === kind,
        ).length
      )
        issues.push(
          issue(
            "SOURCE_GRAPH_CHANGE_COUNT_MISMATCH",
            "Inspection counts do not match its reported graph changes",
          ),
        );
    if (
      inspection.relationship === "identical" &&
      inspection.graphChanges.changes.length
    )
      issues.push(
        issue(
          "SOURCE_RELATIONSHIP_MISMATCH",
          "Identical graphs cannot have reported record changes",
        ),
      );
    if (
      inspection.sourceRediscovery.status !== "unavailable" &&
      (inspection.sourceRediscovery.status === "current") !==
        (inspection.sourceRediscovery.changes.length === 0)
    )
      issues.push(
        issue(
          "SOURCE_REDISCOVERY_STATE_MISMATCH",
          "Rediscovery state does not match its reported changes",
        ),
      );
    if (
      inspection.sourceRediscovery.status !== "unavailable" &&
      inspection.sourceRediscovery.changes.some(
        (change) => change.beforeDigest === change.afterDigest,
      )
    )
      issues.push(
        issue(
          "SOURCE_CHANGE_MISMATCH",
          "A reported source change must have different before/after bindings",
        ),
      );
    return { valid: issues.length === 0, issues };
  } catch (error) {
    return {
      valid: false,
      issues: [issue("INVALID_SOURCE_INSPECTION", message(error))],
    };
  }
}
export function parseSourceInspection(value: unknown): SourceInspection {
  const validation = validateSourceInspection(value);
  if (!validation.valid)
    throw new Error(
      validation.issues
        .map((issue) => `${issue.code}: ${issue.message}`)
        .join("; "),
    );
  return value as SourceInspection;
}
export function parseSourceInspectionJson(text: string): SourceInspection {
  return parseSourceInspection(parseStrictJson(text));
}

function configuredPacks(
  capture: MetamapSourceCapture,
): ConfiguredRelationPack[] {
  return (capture.config.relationPacks ?? []).map((configuredPath) => {
    const references = (capture.graph.relationPacks ?? []).filter(
      (reference) =>
        reference.uri === `repo:${encodeURIComponent(configuredPath)}`,
    );
    if (references.length !== 1)
      throw new Error(
        `Configured pack ${configuredPath} needs exactly one captured graph reference`,
      );
    const reference = references[0];
    const pack = capture.relationPacks.find(
      (value) => value.id === reference.id,
    );
    if (
      !pack ||
      pack.version !== reference.version ||
      reference.digest !== relationPackDigest(pack)
    )
      throw new Error(
        `Configured pack ${configuredPath} is missing its exact value`,
      );
    return { configuredPath, pack };
  });
}
export function validateSourceCapture(value: unknown): ReplayValidationResult {
  try {
    canonicalJson(value);
    if (!validateCaptureShape(value))
      return {
        valid: false,
        issues: (validateCaptureShape.errors ?? []).map((error) =>
          issue(
            "INVALID_SOURCE_CAPTURE",
            error.message ?? "Invalid capture",
            error.instancePath || "$",
          ),
        ),
      };
    const capture = value as MetamapSourceCapture;
    const issues: ReplayIssue[] = [];
    const digest = sourceCaptureDigest(capture);
    if (
      capture.digest !== digest ||
      capture.id !== `urn:metamap:source-capture:${digest.slice(7)}`
    )
      issues.push(
        issue(
          "SOURCE_CAPTURE_DIGEST_MISMATCH",
          "Source capture identity does not match its content",
        ),
      );
    parseMetamapConfig(capture.config);
    if (
      capture.adapters.length !== capture.config.sources.length ||
      capture.config.sources.some((source, index) => {
        const result = capture.adapters[index];
        return (
          !result ||
          result.sourceId !== source.id ||
          result.adapter !== source.adapter
        );
      })
    )
      issues.push(
        issue(
          "SOURCE_INVENTORY_MISMATCH",
          "Captured adapter records must cover the configured sources exactly once in configuration order",
        ),
      );
    for (const adapter of capture.adapters)
      issues.push(...inputLocatorIssues(adapter.inputs, adapter.sourceId));
    if (
      new Set(capture.relationPacks.map((pack) => pack.id)).size !==
      capture.relationPacks.length
    )
      issues.push(
        issue(
          "SOURCE_PACK_DUPLICATE",
          "Source capture repeats a relation pack",
        ),
      );
    const core = capture.relationPacks.find(
      (pack) => pack.id === coreRelationPack.id,
    );
    if (!core || valueDigest(core) !== valueDigest(coreRelationPack))
      issues.push(
        issue(
          "SOURCE_CORE_PACK_MISMATCH",
          "Source capture requires the exact built-in core pack",
        ),
      );
    for (const pack of capture.relationPacks) parseRelationPack(pack);
    for (const document of [
      capture.graph,
      ...capture.adapters.map((adapter) => adapter.document),
    ])
      for (const reference of document.relationPacks ?? []) {
        const pack = capture.relationPacks.find(
          (value) => value.id === reference.id,
        );
        if (
          !pack ||
          pack.version !== reference.version ||
          (pack.schemaVersion === "2.0.0" && !reference.digest) ||
          (reference.digest && reference.digest !== relationPackDigest(pack))
        )
          issues.push(
            issue(
              "SOURCE_PACK_MISMATCH",
              `Source document ${document.id} lacks exact captured pack ${reference.id}`,
            ),
          );
      }
    if (issues.length) return { valid: false, issues };
    const rebuilt = assembleWorkspace(
      capture.config,
      capture.adapters,
      configuredPacks(capture),
      new RelationRegistry(capture.relationPacks),
      { portablePackUris: true },
    );
    if (valueDigest(rebuilt.graph) !== valueDigest(capture.graph))
      issues.push(
        issue(
          "SOURCE_GRAPH_MISMATCH",
          "Captured graph does not reproduce from the captured configuration and adapter outputs",
        ),
      );
    return { valid: issues.length === 0, issues };
  } catch (error) {
    return {
      valid: false,
      issues: [issue("INVALID_SOURCE_CAPTURE", message(error))],
    };
  }
}
export function parseSourceCapture(value: unknown): MetamapSourceCapture {
  const result = validateSourceCapture(value);
  if (!result.valid)
    throw new Error(
      result.issues
        .map(
          (value) =>
            `${value.code}${value.path ? ` at ${value.path}` : ""}: ${value.message}`,
        )
        .join("; "),
    );
  return value as MetamapSourceCapture;
}
export function parseSourceCaptureJson(text: string): MetamapSourceCapture {
  return parseSourceCapture(parseStrictJson(text));
}
/** Existing discovery supplies the inventory. No source reads or registry substitution here. */
export function createSourceCapture(
  config: MetamapConfig,
  discovery: WorkspaceDiscovery,
  relationRegistry: RelationRegistry = new RelationRegistry(),
): MetamapSourceCapture {
  const content = JSON.parse(
    canonicalJson({
      $schema:
        "https://raw.githubusercontent.com/roryscot/metamap/main/schemas/metamap-source-capture.schema.json",
      schemaVersion: "1.0.0",
      config,
      adapters: legacyReferenceValue(discovery.adapters),
      relationPacks: relationRegistry
        .allPacks()
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((pack) =>
          pack.schemaVersion === "2.0.0" ? pack : legacyReferenceValue(pack),
        ),
      graph: legacyReferenceValue(discovery.graph),
    }),
  ) as Omit<MetamapSourceCapture, "id" | "digest">;
  const digest = canonicalDigest(content);
  return freeze(
    parseSourceCapture({
      ...content,
      id: `urn:metamap:source-capture:${digest.slice(7)}`,
      digest,
    }),
  );
}

function receiptFor(
  config: MetamapSourceConfig,
  adapter: AdapterResult,
): SourceReceipt {
  const configDigest = canonicalDigest(config);
  const content = {
    $schema:
      "https://raw.githubusercontent.com/roryscot/metamap/main/schemas/metamap-source-receipt.schema.json",
    schemaVersion: "1.0.0" as const,
    source: config.id,
    sourceRevision:
      adapter.document.revision ??
      canonicalDigest({
        source: config.id,
        adapter: { id: adapter.adapter, version: adapter.adapterVersion },
        configDigest,
        inputs: adapter.inputs,
      }),
    adapter: { id: adapter.adapter, version: adapter.adapterVersion },
    configDigest,
    inputs: adapter.inputs,
    shard: { id: adapter.document.id, digest: valueDigest(adapter.document) },
  };
  const digest = canonicalDigest(content);
  return {
    ...content,
    id: `urn:metamap:source-receipt:${digest.slice(7)}`,
    digest,
  };
}
export function sourceCaptureLineage(
  value: MetamapSourceCapture,
): CapturedSourceLineage {
  const capture = parseSourceCapture(value);
  return freeze(
    JSON.parse(
      canonicalJson({
        sourceSnapshot: makeWorkspaceSnapshot(
          capture.graph,
          capture.adapters,
          valueDigest(capture.config),
        ),
        sourceReceipts: capture.config.sources.map((config, index) =>
          receiptFor(config, capture.adapters[index]),
        ),
      }),
    ) as CapturedSourceLineage,
  );
}
export function sourceLineageIssues(
  capture: MetamapSourceCapture,
  lineage: CapturedSourceLineage,
): ReplayIssue[] {
  const validation = validateSourceCapture(capture);
  if (!validation.valid) return validation.issues;
  const issues = lineage.sourceReceipts.flatMap(
    (receipt) => validateSourceReceipt(receipt).issues,
  );
  const expected = sourceCaptureLineage(capture);
  if (
    canonicalDigest(lineage.sourceSnapshot) !==
    canonicalDigest(expected.sourceSnapshot)
  )
    issues.push(
      issue(
        "SOURCE_SNAPSHOT_MISMATCH",
        "Snapshot does not bind the captured source composition",
      ),
    );
  if (
    canonicalDigest(lineage.sourceReceipts) !==
    canonicalDigest(expected.sourceReceipts)
  )
    issues.push(
      issue(
        "SOURCE_RECEIPT_BINDING_MISMATCH",
        "Receipts do not bind the complete captured source configurations, adapter versions, revisions, inputs and emitted shards",
      ),
    );
  return issues;
}

/** Verify recorded bindings, not authentication, current truth or raw-source reconstruction. */
export function inspectSourceCapture(
  value: MetamapSourceCapture,
  evaluatedGraph?: MetamapDocument,
): SourceInspection {
  const capture = parseSourceCapture(value);
  const graph = evaluatedGraph
    ? (JSON.parse(
        canonicalJson(legacyReferenceValue(evaluatedGraph)),
      ) as MetamapDocument)
    : capture.graph;
  if (!validateGraphShape(graph))
    throw new Error(
      "INVALID_EVALUATED_GRAPH: Inspection requires a portable evaluated graph",
    );
  const lineage = sourceCaptureLineage(capture);
  const sourceGraph = {
    id: capture.graph.id,
    digest: valueDigest(capture.graph),
  };
  const evaluated = { id: graph.id, digest: valueDigest(graph) };
  return freeze({
    schemaVersion: "1.0.0",
    capture: { id: capture.id, digest: capture.digest },
    sourceGraph,
    evaluatedGraph: evaluated,
    relationship:
      sourceGraph.digest === evaluated.digest
        ? "identical"
        : "candidate-differs",
    graphChanges: diffMetamapDocuments(capture.graph, graph),
    lineage: {
      status: "verified-record-bindings",
      receipts: lineage.sourceReceipts.map((receipt) => receipt.id),
      recordedInputDigests: lineage.sourceReceipts.reduce(
        (total, receipt) => total + receipt.inputs.length,
        0,
      ),
      rawInputs: "not-captured",
    },
    sourceRediscovery: {
      status: "unavailable",
      reason:
        "Raw source inputs are not embedded; current rediscovery requires a separately authorized local workspace",
    },
    authentication: "not-evaluated",
    authorizationNow: "not-evaluated",
    active: "not-evaluated",
  });
}

export function compareSourceCaptures(
  beforeValue: MetamapSourceCapture,
  afterValue: MetamapSourceCapture,
): SourceChange[] {
  const before = parseSourceCapture(beforeValue),
    after = parseSourceCapture(afterValue);
  const changes: SourceChange[] = [];
  const add = (
    scope: SourceChange["scope"],
    subject: string,
    component: SourceChange["component"],
    a: unknown,
    b: unknown,
    digest = canonicalDigest,
  ) => {
    const left = a === undefined ? null : digest(a),
      right = b === undefined ? null : digest(b);
    if (left !== right)
      changes.push({
        scope,
        subject,
        component,
        beforeDigest: left,
        afterDigest: right,
      });
  };
  add(
    "workspace",
    before.config.id,
    "configuration",
    before.config,
    after.config,
  );
  add(
    "workspace",
    before.graph.id,
    "graph",
    before.graph,
    after.graph,
    valueDigest,
  );
  add(
    "workspace",
    before.graph.id,
    "relation-packs",
    before.relationPacks,
    after.relationPacks,
  );
  const a = new Map(
    before.adapters.map((adapter) => [adapter.sourceId, adapter]),
  );
  const b = new Map(
    after.adapters.map((adapter) => [adapter.sourceId, adapter]),
  );
  for (const source of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const left = a.get(source),
      right = b.get(source);
    if (!left || !right) {
      add("source", source, "source", left, right);
      continue;
    }
    add(
      "source",
      source,
      "configuration",
      before.config.sources.find((config) => config.id === source),
      after.config.sources.find((config) => config.id === source),
    );
    add(
      "source",
      source,
      "adapter",
      {
        id: left.adapter,
        version: left.adapterVersion,
        diagnostics: left.diagnostics,
      },
      {
        id: right.adapter,
        version: right.adapterVersion,
        diagnostics: right.diagnostics,
      },
    );
    add(
      "source",
      source,
      "revision",
      receiptFor(
        before.config.sources.find((config) => config.id === source)!,
        left,
      ).sourceRevision,
      receiptFor(
        after.config.sources.find((config) => config.id === source)!,
        right,
      ).sourceRevision,
    );
    add("source", source, "inputs", left.inputs, right.inputs);
    add("source", source, "shard", left.document, right.document, valueDigest);
  }
  return changes;
}

function within(path: string, root: string): boolean {
  const suffix = relative(root, path);
  return (
    suffix === "" ||
    (suffix !== ".." && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix))
  );
}
async function permittedRoots(
  options: SourceRediscoveryOptions,
): Promise<Array<{ path: string; resolved: string }>> {
  if (!options.permittedRoots.length)
    throw new Error(
      "SOURCE_ROOT_REQUIRED: Current source reads require explicit permitted roots",
    );
  return Promise.all(
    options.permittedRoots.map(async (path) => ({
      path: resolve(path),
      resolved: await realpath(resolve(path)),
    })),
  );
}
async function checkLocalPath(
  path: string,
  roots: Array<{ path: string; resolved: string }>,
  recursive = false,
  seen = new Set<string>(),
): Promise<void> {
  const absolute = resolve(path);
  if (!roots.some((root) => within(absolute, root.path)))
    throw new Error(
      `SOURCE_LOCATOR_DENIED: ${absolute} is outside permitted local roots`,
    );
  const resolved = await realpath(absolute);
  if (!roots.some((root) => within(resolved, root.resolved)))
    throw new Error(
      `SOURCE_LOCATOR_DENIED: ${absolute} resolves outside permitted local roots`,
    );
  if (!recursive || seen.has(resolved)) return;
  seen.add(resolved);
  if ((await stat(absolute)).isDirectory())
    for (const child of await readdir(absolute))
      await checkLocalPath(resolve(absolute, child), roots, true, seen);
}
/** Strict config read with caller authority checked before reading any config bytes. */
export async function loadPermittedWorkspace(
  configPath: string,
  options: SourceRediscoveryOptions,
): Promise<LoadedMetamapConfig> {
  const roots = await permittedRoots(options);
  const path = resolve(configPath);
  await checkLocalPath(path, roots);
  const config = parseMetamapConfig(
    parseStrictJson(await readFile(path, "utf8")),
  );
  const configDirectory = dirname(path);
  const repositoryRoot = resolve(configDirectory, config.repositoryRoot);
  await checkLocalPath(repositoryRoot, roots);
  return { config, configPath: path, configDirectory, repositoryRoot };
}
async function discoverPermittedWorkspace(
  loaded: LoadedMetamapConfig,
  options: SourceRediscoveryOptions,
) {
  canonicalJson(loaded.config);
  parseMetamapConfig(loaded.config);
  const roots = await permittedRoots(options);
  await checkLocalPath(loaded.configPath, roots);
  await checkLocalPath(loaded.repositoryRoot, roots);
  const adapters = createDefaultAdapterRegistry();
  for (const source of loaded.config.sources) {
    if (!adapters.get(source.adapter))
      throw new Error(
        `SOURCE_ADAPTER_UNAVAILABLE: ${source.adapter} is not an installed built-in adapter`,
      );
    const paths =
      source.adapter === "typescript-zod"
        ? (source.roots as string[])
        : [
            source.adapter === "nextjs-app-router"
              ? (source.root as string)
              : (source.path as string),
          ];
    for (const path of paths)
      await checkLocalPath(resolve(loaded.repositoryRoot, path), roots, true);
  }
  for (const path of loaded.config.relationPacks ?? [])
    await checkLocalPath(resolve(loaded.repositoryRoot, path), roots);
  const registry = new RelationRegistry();
  const discovery = await discoverWorkspace(loaded, {
    adapterRegistry: adapters,
    relationRegistry: registry,
    useCache: false,
    writeCache: false,
    portablePackUris: true,
  });
  for (const adapter of discovery.adapters)
    for (const input of adapter.inputs) {
      if (!portableLocator(input.path))
        throw new Error(`SOURCE_LOCATOR_INVALID: ${input.path}`);
      const path = resolve(loaded.repositoryRoot, input.path);
      await checkLocalPath(path, roots);
      if (contentDigest(await readFile(path)) !== input.digest)
        throw new Error(
          `SOURCE_INPUT_CHANGED: ${input.path} does not match its discovered raw-byte digest`,
        );
    }
  return { discovery, registry };
}
/** Explicit local discovery; no cache, graph, documentation or activation writes. */
export async function captureWorkspaceSources(
  configPath: string,
  options: SourceRediscoveryOptions,
): Promise<MetamapSourceCapture> {
  const loaded = await loadPermittedWorkspace(configPath, options);
  const { discovery, registry } = await discoverPermittedWorkspace(
    loaded,
    options,
  );
  return createSourceCapture(loaded.config, discovery, registry);
}
/** Uses only the separately selected current workspace, never the capture's locators. */
export async function inspectCurrentSources(
  capture: MetamapSourceCapture,
  configPath: string,
  options: SourceRediscoveryOptions,
  evaluatedGraph?: MetamapDocument,
): Promise<SourceInspection> {
  const inspection = inspectSourceCapture(capture, evaluatedGraph);
  try {
    const current = await captureWorkspaceSources(configPath, options);
    const changes = compareSourceCaptures(capture, current);
    return freeze({
      ...inspection,
      sourceRediscovery: {
        status: changes.length ? "changed" : "current",
        currentCapture: { id: current.id, digest: current.digest },
        changes,
      },
    });
  } catch (error) {
    return freeze({
      ...inspection,
      sourceRediscovery: { status: "unavailable", reason: message(error) },
    });
  }
}
