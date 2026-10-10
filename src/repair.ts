import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { setImmediate } from "node:timers/promises";
import type { AnySchemaObject } from "ajv";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import {
  canonicalDigest,
  canonicalJson,
  parseStrictJson,
} from "./canonical.js";
import {
  compareMetamapBundles,
  type CounterfactualIssue,
} from "./counterfactual.js";
import { governedChangeRequirements } from "./governance.js";
import type { GovernanceScope } from "./governance-model.js";
import { RelationRegistry } from "./relations.js";
import { captureReplayBundle, replayMetamap } from "./replay.js";
import { parseSourceReplayBundle } from "./semantic-replay.js";
import type { SourceCounterfactualReport } from "./semantic-counterfactual-model.js";
import type { StructuralMapping } from "./model.js";
import { valueDigest } from "./stable.js";
import { selectorMatches } from "./viability.js";
import type {
  MetamapRepairAttempt,
  MetamapRepairEdit,
  MetamapRepairIssue,
  MetamapRepairPatch,
  MetamapRepairReport,
  MetamapRepairRequest,
  MetamapRepairSearchOptions,
  MetamapRepairSearchResult,
  MetamapRepairStopReason,
} from "./repair-model.js";

const Ajv2020 = Ajv2020Module.default;
const addFormats = addFormatsModule.default;
const ajv = addFormats(new Ajv2020({ allErrors: true, strict: true }));
const schema = (name: string): AnySchemaObject =>
  JSON.parse(
    readFileSync(
      new URL("../schemas/" + name + ".schema.json", import.meta.url),
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
  "metamap-replay",
  "metamap-config",
  "metamap-source-capture",
  "metamap-source-inspection",
  "metamap-replay-v3",
  "metamap-counterfactual",
  "metamap-counterfactual-v2",
  "metamap-counterfactual-v3",
  "metamap-governance",
  "metamap-repair",
  "metamap-repair-request",
  "metamap-repair-result",
])
  ajv.addSchema(schema(name));

export class MetamapRepairError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MetamapRepairError";
  }
}
function fail(code: string, message: string): never {
  throw new MetamapRepairError(code, message);
}
function equal(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}
function clone<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}
function freeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function checked<T>(value: unknown, name: string): T {
  canonicalJson(value);
  const validate = ajv.getSchema(schema(name).$id as string)!;
  if (!validate(value))
    fail(
      "REPAIR_INVALID_SHAPE",
      name +
        ": " +
        (validate.errors ?? [])
          .map((item) => (item.instancePath || "$") + " " + item.message)
          .join("; "),
    );
  return clone(value) as T;
}
/** All new repair content except its own id/digest participates in its address. */
export function metamapRepairDigest(value: unknown): string {
  canonicalJson(value);
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail("REPAIR_INVALID_SHAPE", "Expected a repair object");
  return canonicalDigest(
    Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "id" && key !== "digest"),
    ),
  );
}
function addressed<T extends object>(
  content: T,
  kind: string,
): T & { id: string; digest: string } {
  const digest = canonicalDigest(content);
  return {
    ...content,
    id: "urn:metamap:" + kind + ":" + digest.slice(7),
    digest,
  };
}
function checkAddress(
  value: { id: string; digest: string },
  kind: string,
): void {
  const digest = metamapRepairDigest(value);
  if (
    value.digest !== digest ||
    value.id !== "urn:metamap:" + kind + ":" + digest.slice(7)
  )
    fail(
      "REPAIR_CONTENT_MISMATCH",
      "Repair identity/digest does not bind its complete content",
    );
}
const compareText = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;
function sortedUnique(values: readonly string[], label: string): void {
  if (!equal(values, [...new Set(values)].sort(compareText)))
    fail(
      "REPAIR_INVALID_ORDER",
      label + " must be unique and sorted by code-unit order",
    );
}
function failures(
  bundle: MetamapRepairRequest["baseline"],
  required: readonly string[],
): CounterfactualIssue[] {
  const result: CounterfactualIssue[] = bundle.expected.compilation.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => ({ stage: "compilation", issue }));
  for (const specId of required) {
    const output = bundle.expected.projections.find(
      (entry) => entry.specId === specId,
    );
    if (!output) continue;
    for (const issue of output.result.issues)
      if (issue.severity === "error")
        result.push({ stage: "projection", specId, issue });
    for (const issue of output.pathTree?.issues ?? [])
      if (issue.severity === "error")
        result.push({ stage: "path-tree", specId, issue });
  }
  return result;
}
function viable(
  bundle: MetamapRepairRequest["baseline"],
  required: readonly string[],
): boolean {
  return (
    bundle.expected.compilation.status === "viable" &&
    required.every((id) => {
      const output = bundle.expected.projections.find(
        (entry) => entry.specId === id,
      );
      const spec = bundle.inputs.projections.find((entry) => entry.id === id)!;
      return (
        output?.result.status === "projected" &&
        (!spec.pathTree || output.pathTree?.status === "projected")
      );
    })
  );
}
/** Parses data, verifies the original evaluation, and never rediscoveries sources. */
export function parseMetamapRepairRequest(
  value: unknown,
): MetamapRepairRequest {
  const request = checked<MetamapRepairRequest>(
    value,
    "metamap-repair-request",
  );
  checkAddress(request, "repair-request");
  parseSourceReplayBundle(request.baseline);
  sortedUnique(
    request.edits.map((edit) => edit.id),
    "Edit IDs",
  );
  sortedUnique(request.requiredProjections, "Required projection IDs");
  sortedUnique(request.allowedFacts.map(canonicalJson), "Allowed facts");
  sortedUnique(request.protectedFacts.map(canonicalJson), "Protected facts");
  if (
    request.baseline.inputs.policy.derivationLimits.maxDepth >
    request.bounds.maximumDerivationDepth
  )
    fail(
      "REPAIR_DERIVATION_BOUND_MISMATCH",
      "The captured policy depth limit exceeds the request bound; no policy limit is silently changed",
    );
  const specs = request.baseline.inputs.projections;
  for (const id of request.requiredProjections)
    if (
      !specs.some(
        (spec) => spec.id === id && spec.consumer === request.consumer,
      )
    )
      fail(
        "REPAIR_UNKNOWN_PROJECTION",
        "Required projection does not exist for the selected consumer: " + id,
      );
  const replay = replayMetamap(request.baseline);
  if (replay.status !== "verified")
    fail(
      "REPAIR_BASELINE_NOT_VERIFIED",
      replay.issues
        .map((issue) => issue.code + ": " + issue.message)
        .join("; "),
    );
  if (viable(request.baseline, request.requiredProjections))
    fail(
      "REPAIR_BASELINE_ALREADY_VIABLE",
      "Repair requires a failed admission or required consumer projection",
    );
  return freeze(request);
}
export function parseMetamapRepairRequestJson(
  text: string,
): MetamapRepairRequest {
  return parseMetamapRepairRequest(parseStrictJson(text));
}
export function createMetamapRepairRequest(
  baseline: MetamapRepairRequest["baseline"],
  options: Pick<
    MetamapRepairRequest,
    | "consumer"
    | "requiredProjections"
    | "allowedFacts"
    | "protectedFacts"
    | "edits"
    | "bounds"
  >,
): MetamapRepairRequest {
  const scopes = (values: GovernanceScope[]) =>
    clone(values).sort((a, b) =>
      compareText(canonicalJson(a), canonicalJson(b)),
    );
  return parseMetamapRepairRequest(
    addressed(
      {
        $schema: schema("metamap-repair-request").$id as string,
        schemaVersion: "1.0.0" as const,
        baseline: clone(baseline),
        ...clone(options),
        requiredProjections: [...options.requiredProjections].sort(compareText),
        allowedFacts: scopes(options.allowedFacts),
        protectedFacts: scopes(options.protectedFacts),
        edits: clone(options.edits).sort((a, b) => compareText(a.id, b.id)),
        ranking: ["edited-records", "semantic-cost", "proposal-id"],
      },
      "repair-request",
    ),
  );
}
function scopeMatches(
  scope: GovernanceScope,
  fact: GovernanceScope,
  protection = false,
): boolean {
  if (scope.subject !== "*" && scope.subject !== fact.subject) return false;
  if (scope.fact === "*" || scope.fact === fact.fact) return true;
  if (scope.fact === "mapping.record" && fact.fact.startsWith("mapping."))
    return true;
  return (
    protection &&
    fact.fact === "mapping.record" &&
    scope.fact.startsWith("mapping.")
  );
}
interface PlannedRepair {
  patch: MetamapRepairPatch;
  semanticCost: number;
  editedRecords: number;
}
function plan(
  request: MetamapRepairRequest,
  edits: readonly MetamapRepairEdit[],
): PlannedRepair | MetamapRepairIssue[] {
  const inputs = request.baseline.inputs,
    original = inputs.graph;
  const entityKinds = new Map(
    original.entities.map((entity) => [entity.id, entity.kind]),
  );
  const issues: MetamapRepairIssue[] = [];
  const add = (edit: MetamapRepairEdit, code: string, message: string) =>
    issues.push({ code, message, edit: edit.id });
  const occupied = new Set<string>(),
    removed = new Set<number>(),
    selected = new Map<number, string>();
  const keepers: Array<{ index: number; edit: MetamapRepairEdit }> = [];
  const restored: StructuralMapping[] = [],
    declarations: Extract<
      MetamapRepairEdit,
      { kind: "supply-declaration" }
    >["declaration"][] = [];
  let cost = 0n;
  const claim = (key: string, edit: MetamapRepairEdit) => {
    if (occupied.has(key))
      add(
        edit,
        "REPAIR_CONFLICTING_EDITS",
        "Two supplied edits change the same record: " + key,
      );
    occupied.add(key);
  };
  const permit = (facts: GovernanceScope[], edit: MetamapRepairEdit) => {
    for (const fact of facts) {
      if (
        request.protectedFacts.some((scope) => scopeMatches(scope, fact, true))
      )
        add(
          edit,
          "REPAIR_PROTECTED_FACT",
          "Edit touches a protected fact: " + canonicalJson(fact),
        );
      if (!request.allowedFacts.some((scope) => scopeMatches(scope, fact)))
        add(
          edit,
          "REPAIR_SCOPE_DENIED",
          "Edit is outside the supplied proposal boundary: " +
            canonicalJson(fact),
        );
    }
  };
  for (const edit of edits) {
    cost += BigInt(edit.semanticCost);
    if (edit.kind === "supply-declaration") {
      const supplied = edits.find(
        (
          candidate,
        ): candidate is Extract<
          MetamapRepairEdit,
          { kind: "restore-mapping" }
        > =>
          candidate.kind === "restore-mapping" &&
          candidate.mapping.id === edit.declaration.mapping,
      );
      const mapping =
        original.mappings.find(
          (mapping) => mapping.id === edit.declaration.mapping,
        ) ?? supplied?.mapping;
      if (!mapping)
        add(
          edit,
          "REPAIR_UNKNOWN_MAPPING",
          "A declaration can only be supplied for an existing mapping",
        );
      else if (
        inputs.policy.mappings.some(
          (entry) =>
            entry.mapping === mapping.id ||
            (entry.select &&
              selectorMatches(mapping, entry.select, entityKinds)),
        )
      )
        add(
          edit,
          "REPAIR_DECLARATION_EXISTS",
          "An effective declaration already exists; replacement or weakening is forbidden",
        );
      claim("declaration:" + edit.declaration.mapping, edit);
      permit([{ subject: inputs.policy.id, fact: "policy.mappings" }], edit);
      declarations.push(clone(edit.declaration));
      continue;
    }
    permit([{ subject: inputs.policy.id, fact: "policy.graph" }], edit);
    if (edit.kind === "restore-mapping") {
      if (original.mappings.some((mapping) => mapping.id === edit.mapping.id))
        add(
          edit,
          "REPAIR_MAPPING_EXISTS",
          "Restoration only adds an explicitly supplied absent mapping",
        );
      claim("restored:" + edit.mapping.id, edit);
      permit([{ subject: edit.mapping.id, fact: "mapping.record" }], edit);
      restored.push(clone(edit.mapping));
      continue;
    }
    const mapping = original.mappings[edit.mappingIndex];
    if (!mapping || valueDigest(mapping) !== edit.expectedDigest) {
      add(
        edit,
        "REPAIR_STALE_MAPPING",
        "Index/digest does not identify the exact captured mapping",
      );
      continue;
    }
    claim("mapping:" + edit.mappingIndex, edit);
    if (edit.kind === "select-target") {
      permit([{ subject: mapping.id, fact: "mapping.targets" }], edit);
      if (mapping.sources.length !== 1 || mapping.targets.length !== 1)
        add(
          edit,
          "REPAIR_UNSUPPORTED_ARITY",
          "Target selection supports an existing binary mapping only",
        );
      if (!original.entities.some((entity) => entity.id === edit.target))
        add(
          edit,
          "REPAIR_UNKNOWN_TARGET",
          "A target must be an explicitly captured entity",
        );
      if (mapping.targets[0] === edit.target)
        add(
          edit,
          "REPAIR_NO_CHANGE",
          "The supplied target is already selected",
        );
      selected.set(edit.mappingIndex, edit.target);
    } else {
      permit([{ subject: mapping.id, fact: "mapping.record" }], edit);
      const keeper = original.mappings[edit.keepIndex];
      const withoutId = ({ id: _id, ...value }: StructuralMapping) => value;
      if (
        !keeper ||
        edit.keepIndex === edit.mappingIndex ||
        valueDigest(keeper) !== edit.keepDigest ||
        !equal(withoutId(mapping), withoutId(keeper))
      )
        add(
          edit,
          "REPAIR_NOT_DUPLICATE",
          "Removal requires an exact equivalent captured record apart from its identity",
        );
      removed.add(edit.mappingIndex);
      keepers.push({ index: edit.keepIndex, edit });
    }
  }
  for (const keeper of keepers)
    if (occupied.has("mapping:" + keeper.index))
      add(
        keeper.edit,
        "REPAIR_KEEPER_CHANGED",
        "The retained duplicate cannot be edited or removed in the same subset",
      );
  if (cost > BigInt(Number.MAX_SAFE_INTEGER))
    issues.push({
      code: "REPAIR_COST_OVERFLOW",
      message: "Summed ordinal semantic cost exceeds the safe integer contract",
    });
  if (issues.length) return issues;
  const graph = clone(original),
    policy = clone(inputs.policy);
  graph.mappings = original.mappings
    .flatMap((mapping, index) =>
      removed.has(index)
        ? []
        : [
            {
              ...clone(mapping),
              ...(selected.has(index)
                ? { targets: [selected.get(index)!] }
                : {}),
            },
          ],
    )
    .concat(restored);
  policy.mappings.push(...declarations);
  const beforeDigest = valueDigest(original),
    afterDigest = valueDigest(graph);
  const beforeBinding = clone(policy.graph);
  if (beforeDigest !== afterDigest) policy.graph.digest = afterDigest;
  const patch: MetamapRepairPatch = {
    graph: { beforeDigest, afterDigest, value: graph },
    policy: {
      beforeDigest: canonicalDigest(inputs.policy),
      afterDigest: canonicalDigest(policy),
      value: policy,
    },
    bindingUpdates: equal(beforeBinding, policy.graph)
      ? []
      : [
          {
            subject: policy.id,
            fact: "policy.graph",
            before: beforeBinding,
            after: clone(policy.graph),
          },
        ],
  };
  return { patch, semanticCost: Number(cost), editedRecords: occupied.size };
}
function attempt(
  request: MetamapRepairRequest,
  edits: readonly MetamapRepairEdit[],
): MetamapRepairAttempt {
  const common = {
    request: { id: request.id, digest: request.digest },
    edits: edits.map((edit) => edit.id),
  };
  const planned = plan(request, edits);
  if (Array.isArray(planned))
    return freeze(
      addressed(
        { ...common, status: "blocked" as const, issues: planned },
        "repair-proposal",
      ),
    );
  const inputs = request.baseline.inputs;
  const candidate = captureReplayBundle(
    planned.patch.graph.value,
    planned.patch.policy.value,
    {
      evaluatedAt: inputs.evaluatedAt,
      context: inputs.context,
      changedSubjects: inputs.changedSubjects,
      projections: inputs.projections,
      sourceCapture: inputs.sourceCapture,
      relationRegistry: new RelationRegistry(inputs.relationPacks),
    },
  );
  const comparison = compareMetamapBundles(request.baseline, candidate);
  if (comparison.status !== "compared")
    fail(
      "REPAIR_COMPARISON_FAILED",
      comparison.issues.map((issue) => issue.code).join("; "),
    );
  const isViable = viable(candidate, request.requiredProjections);
  return freeze(
    addressed(
      {
        ...common,
        status: "evaluated" as const,
        patch: planned.patch,
        candidate,
        comparison: comparison.report as SourceCounterfactualReport,
        admitted: candidate.expected.compilation.status === "viable",
        viable: isViable,
        authorization: isViable
          ? ("approval-required" as const)
          : ("unavailable" as const),
        requirements: governedChangeRequirements(
          request.baseline,
          candidate,
          request.consumer,
        ),
        rank: {
          editedRecords: planned.editedRecords,
          semanticCost: planned.semanticCost,
        },
        remainingFailures: failures(candidate, request.requiredProjections),
      },
      "repair-proposal",
    ),
  );
}
function* subsets(
  edits: readonly MetamapRepairEdit[],
  limit: number,
): Generator<MetamapRepairEdit[]> {
  function* size(
    from: number,
    remaining: number,
    selected: MetamapRepairEdit[],
  ): Generator<MetamapRepairEdit[]> {
    if (remaining === 0) {
      yield selected;
      return;
    }
    for (let index = from; index <= edits.length - remaining; index++)
      yield* size(index + 1, remaining - 1, [...selected, edits[index]]);
  }
  for (let count = 1; count <= Math.min(limit, edits.length); count++)
    yield* size(0, count, []);
}
function spaceCounts(request: MetamapRepairRequest) {
  const count = request.edits.length;
  const total = (1n << BigInt(count)) - 1n;
  let permitted = 0n,
    choose = 1n;
  for (
    let size = 1;
    size <= Math.min(count, request.bounds.maximumEdits);
    size++
  ) {
    choose = (choose * BigInt(count - size + 1)) / BigInt(size);
    permitted += choose;
  }
  return { total, excluded: total - permitted };
}
function ranked(attempts: readonly MetamapRepairAttempt[]): string[] {
  return attempts
    .filter(
      (item): item is Extract<MetamapRepairAttempt, { status: "evaluated" }> =>
        item.status === "evaluated" && item.viable,
    )
    .sort(
      (a, b) =>
        a.rank.editedRecords - b.rank.editedRecords ||
        a.rank.semanticCost - b.rank.semanticCost ||
        compareText(a.id, b.id),
    )
    .map((item) => item.id);
}
function minimality(
  complete: boolean,
  proposals: string[],
): MetamapRepairReport["minimality"] {
  return complete && proposals.length
    ? { status: "within-finite-space", proposal: proposals[0], global: false }
    : { status: "not-established", proposal: null, global: false };
}
/** Cooperative bounded search over supplied data. No source, file or active-state writes. */
export async function searchMetamapRepairs(
  value: unknown,
  options: MetamapRepairSearchOptions = {},
): Promise<MetamapRepairSearchResult> {
  const started = performance.now();
  try {
    const request = parseMetamapRepairRequest(value);
    const counts = spaceCounts(request),
      attempts: MetamapRepairAttempt[] = [],
      reasons: MetamapRepairStopReason[] = [];
    if (counts.excluded > 0n) reasons.push("edit-limit");
    for (const edits of subsets(request.edits, request.bounds.maximumEdits)) {
      await setImmediate();
      if (options.signal?.aborted) {
        reasons.push("cancelled");
        break;
      }
      if (
        performance.now() - started >=
        request.bounds.maximumElapsedMilliseconds
      ) {
        reasons.push("elapsed-limit");
        break;
      }
      if (attempts.length >= request.bounds.maximumCandidates) {
        reasons.push("candidate-limit");
        break;
      }
      attempts.push(attempt(request, edits));
    }
    const unexamined = counts.total - BigInt(attempts.length),
      complete = unexamined === 0n,
      proposals = ranked(attempts);
    const report = addressed(
      {
        $schema: schema("metamap-repair-result").$id as string,
        schemaVersion: "1.0.0" as const,
        request,
        status: complete ? ("complete" as const) : ("incomplete" as const),
        applied: false as const,
        space: "nonempty-subsets-of-supplied-edits" as const,
        attempts,
        proposals,
        coverage: {
          totalCombinations: String(counts.total),
          attempted: attempts.length,
          unexamined: String(unexamined),
          excludedByEditLimit: String(counts.excluded),
          elapsedMilliseconds: Math.ceil(performance.now() - started),
          stopReasons: complete ? [] : reasons,
        },
        minimality: minimality(complete, proposals),
      },
      "repair-result",
    );
    checked(report, "metamap-repair-result");
    return freeze({ status: "searched", report });
  } catch (error) {
    return {
      status: "rejected",
      issues: [
        {
          code:
            error instanceof MetamapRepairError
              ? error.code
              : "REPAIR_INVALID_INPUT",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}
/** Recomputes attempts, patches, outcomes, requirements, ordering and coverage. */
export function parseMetamapRepairReport(value: unknown): MetamapRepairReport {
  const report = checked<MetamapRepairReport>(value, "metamap-repair-result");
  checkAddress(report, "repair-result");
  const request = parseMetamapRepairRequest(report.request),
    counts = spaceCounts(request);
  if (report.attempts.length > request.bounds.maximumCandidates)
    fail(
      "REPAIR_COVERAGE_MISMATCH",
      "Attempt count exceeds the supplied bound",
    );
  const iterator = subsets(request.edits, request.bounds.maximumEdits);
  for (const recorded of report.attempts) {
    const next = iterator.next();
    if (next.done || !equal(recorded, attempt(request, next.value)))
      fail(
        "REPAIR_ATTEMPT_MISMATCH",
        "Attempt differs from the next exact supplied candidate and recomputed evaluation",
      );
  }
  const complete = BigInt(report.attempts.length) === counts.total,
    coverage = report.coverage;
  if (
    coverage.totalCombinations !== String(counts.total) ||
    coverage.attempted !== report.attempts.length ||
    coverage.unexamined !==
      String(counts.total - BigInt(report.attempts.length)) ||
    coverage.excludedByEditLimit !== String(counts.excluded) ||
    report.status !== (complete ? "complete" : "incomplete")
  )
    fail(
      "REPAIR_COVERAGE_MISMATCH",
      "Coverage/completeness does not match the finite candidate space",
    );
  const reasons = coverage.stopReasons;
  if (complete ? reasons.length !== 0 : reasons.length === 0)
    fail(
      "REPAIR_COVERAGE_MISMATCH",
      "Incomplete coverage needs an explicit stop reason",
    );
  if (
    reasons.includes("edit-limit") !== counts.excluded > 0n ||
    (reasons.includes("candidate-limit") &&
      report.attempts.length !== request.bounds.maximumCandidates) ||
    (reasons.includes("elapsed-limit") &&
      coverage.elapsedMilliseconds < request.bounds.maximumElapsedMilliseconds)
  )
    fail(
      "REPAIR_COVERAGE_MISMATCH",
      "Stop reason contradicts its declared bound",
    );
  const proposals = ranked(report.attempts);
  if (
    !equal(report.proposals, proposals) ||
    !equal(report.minimality, minimality(complete, proposals))
  )
    fail(
      "REPAIR_RANK_MISMATCH",
      "Rank or minimum claim differs from verified finite-space coverage",
    );
  return freeze(report);
}
export function parseMetamapRepairReportJson(
  text: string,
): MetamapRepairReport {
  return parseMetamapRepairReport(parseStrictJson(text));
}
