import { diffMetamapDocuments, type GraphDiff } from "./diff.js";
import { readFileSync } from "node:fs";
import type { AnySchema } from "ajv";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type {
  ProjectedEntry,
  ProjectedSlot,
  ProjectionIssue,
} from "./projection.js";
import { RelationRegistry } from "./relations.js";
import {
  replayMetamap,
  type MetamapReplayBundle,
  type ReplayIssue,
  type ReplayInputs,
  type ReplayOutputs,
} from "./replay.js";
import { valueDigest, valuesEqual } from "./stable.js";
import { compileMetamap } from "./viability.js";
import type { ImpactReport, ViabilityIssue } from "./viability-model.js";

export const METAMAP_COUNTERFACTUAL_VERSION = "1.0.0" as const;

export interface CounterfactualInputChange {
  input: keyof MetamapReplayBundle["inputs"];
  beforeDigest: string;
  afterDigest: string;
}

export interface CounterfactualIssue {
  stage: "compilation" | "projection" | "path-tree";
  specId?: string;
  issue: ViabilityIssue | ProjectionIssue;
}

export interface CounterfactualRecordChanges {
  added: string[];
  removed: string[];
  changed: string[];
}

export interface CounterfactualSlotChange {
  name: string;
  before?: ProjectedSlot;
  after?: ProjectedSlot;
}

export interface CounterfactualEntryChange {
  subjectId: string;
  change: "added" | "removed" | "changed";
  subjectChanged: boolean;
  slots: CounterfactualSlotChange[];
}

export type CounterfactualProjectionState =
  "projected" | "rejected" | "generation-rejected" | "not-requested";

export interface CounterfactualProjectionChange {
  specId: string;
  before: CounterfactualProjectionState;
  after: CounterfactualProjectionState;
  bindingsChanged: boolean;
  entries: CounterfactualEntryChange[];
  pathTreeChanged: boolean;
}

export interface CounterfactualReport {
  schemaVersion: typeof METAMAP_COUNTERFACTUAL_VERSION;
  id: string;
  digest: string;
  before: { bundle: string; digest: string; admitted: boolean };
  after: { bundle: string; digest: string; admitted: boolean };
  inputChanges: CounterfactualInputChange[];
  graph: GraphDiff;
  issues: {
    introduced: CounterfactualIssue[];
    resolved: CounterfactualIssue[];
  };
  mappingStates: {
    beforeKnown: boolean;
    afterKnown: boolean;
    activated: string[];
    deactivated: string[];
  };
  evidence: CounterfactualRecordChanges & {
    recordedSupportLost: string[];
    recordedSupportGained: string[];
  };
  projections: CounterfactualProjectionChange[];
  impact: {
    interpretation: "declared-dependency-propagation";
    before: ImpactReport;
    after: ImpactReport;
  };
}

export type CounterfactualResult =
  | { status: "compared"; report: CounterfactualReport }
  | {
      status: "rejected";
      issues: Array<ReplayIssue & { side: "before" | "after" }>;
    };

const Ajv2020 = Ajv2020Module.default;
const addFormats = addFormatsModule.default;
const ajv = addFormats(new Ajv2020({ allErrors: true, strict: true }));
for (const name of [
  "metamap-graph",
  "metamap-viability",
  "metamap-generation",
  "metamap-projection-spec",
  "metamap-projection",
  "metamap-path-tree",
  "relation-pack",
  "metamap-replay",
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
const validateReportShape = ajv.compile(
  JSON.parse(
    readFileSync(
      new URL("../schemas/metamap-counterfactual.schema.json", import.meta.url),
      "utf8",
    ),
  ) as AnySchema,
);

export function validateCounterfactualReport(value: unknown): {
  valid: boolean;
  issues: ReplayIssue[];
} {
  if (!validateReportShape(value))
    return {
      valid: false,
      issues: (validateReportShape.errors ?? []).map((error) => ({
        code: "INVALID_COUNTERFACTUAL_REPORT",
        message: error.message ?? "Counterfactual report is invalid",
        path: error.instancePath || "$",
      })),
    };
  const report = value as CounterfactualReport;
  const { id, digest, ...content } = report;
  const expectedDigest = valueDigest(content);
  const issues: ReplayIssue[] = [];
  if (digest !== expectedDigest)
    issues.push({
      code: "COUNTERFACTUAL_DIGEST_MISMATCH",
      message: "Counterfactual content does not match its digest",
    });
  if (
    id !==
    `urn:metamap:counterfactual:${expectedDigest.replace(/^sha256:/, "")}`
  )
    issues.push({
      code: "COUNTERFACTUAL_ID_MISMATCH",
      message: "Counterfactual content does not match its identity",
    });
  return { valid: issues.length === 0, issues };
}

function recordsChanged<T extends { id: string }>(
  before: readonly T[],
  after: readonly T[],
): CounterfactualRecordChanges {
  const left = new Map(before.map((entry) => [entry.id, entry]));
  const right = new Map(after.map((entry) => [entry.id, entry]));
  return {
    added: [...right.keys()].filter((id) => !left.has(id)).sort(),
    removed: [...left.keys()].filter((id) => !right.has(id)).sort(),
    changed: [...left.keys()]
      .filter(
        (id) => right.has(id) && !valuesEqual(left.get(id), right.get(id)),
      )
      .sort(),
  };
}

function difference(
  before: readonly string[],
  after: readonly string[],
): string[] {
  const right = new Set(after);
  return [...new Set(before)].filter((id) => !right.has(id)).sort();
}

function issuesFor(outputs: ReplayOutputs): CounterfactualIssue[] {
  const entries: CounterfactualIssue[] = outputs.compilation.issues.map(
    (issue) => ({ stage: "compilation", issue }),
  );
  for (const output of outputs.projections) {
    entries.push(
      ...output.result.issues.map((issue): CounterfactualIssue => ({
        stage: "projection",
        specId: output.specId,
        issue,
      })),
    );
    entries.push(
      ...(output.pathTree?.issues ?? []).map((issue): CounterfactualIssue => ({
        stage: "path-tree",
        specId: output.specId,
        issue,
      })),
    );
  }
  return entries;
}

/** Causal paths are explanations, not a different violation of the same rule. */
function issueKey(entry: CounterfactualIssue): string {
  const { causalPath: _path, ...issue } = entry.issue as ViabilityIssue;
  return valueDigest({ stage: entry.stage, specId: entry.specId, issue });
}

function projectionState(
  bundle: MetamapReplayBundle,
  outputs: ReplayOutputs,
  specId: string,
): CounterfactualProjectionState {
  if (!bundle.inputs.projections.some((spec) => spec.id === specId))
    return "not-requested";
  if (outputs.compilation.status === "rejected") return "generation-rejected";
  return (
    outputs.projections.find((output) => output.specId === specId)?.result
      .status ?? "rejected"
  );
}

function entriesChanged(
  before: readonly ProjectedEntry[],
  after: readonly ProjectedEntry[],
): CounterfactualEntryChange[] {
  const left = new Map(before.map((entry) => [entry.subject.id, entry]));
  const right = new Map(after.map((entry) => [entry.subject.id, entry]));
  const changes: CounterfactualEntryChange[] = [];
  for (const id of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    const a = left.get(id);
    const b = right.get(id);
    if (valuesEqual(a, b)) continue;
    const aSlots = new Map((a?.slots ?? []).map((slot) => [slot.name, slot]));
    const bSlots = new Map((b?.slots ?? []).map((slot) => [slot.name, slot]));
    const slots: CounterfactualSlotChange[] = [];
    for (const name of [
      ...new Set([...aSlots.keys(), ...bSlots.keys()]),
    ].sort()) {
      const beforeSlot = aSlots.get(name);
      const afterSlot = bSlots.get(name);
      if (!valuesEqual(beforeSlot, afterSlot))
        slots.push({
          name,
          ...(beforeSlot ? { before: beforeSlot } : {}),
          ...(afterSlot ? { after: afterSlot } : {}),
        });
    }
    changes.push({
      subjectId: id,
      change: !a ? "added" : !b ? "removed" : "changed",
      subjectChanged: !valuesEqual(a?.subject, b?.subject),
      slots,
    });
  }
  return changes;
}

function projectionChanges(
  before: MetamapReplayBundle,
  after: MetamapReplayBundle,
  left: ReplayOutputs,
  right: ReplayOutputs,
): CounterfactualProjectionChange[] {
  const ids = [
    ...new Set(
      [...before.inputs.projections, ...after.inputs.projections].map(
        (spec) => spec.id,
      ),
    ),
  ].sort();
  return ids.map((specId) => {
    const a = left.projections.find((entry) => entry.specId === specId);
    const b = right.projections.find((entry) => entry.specId === specId);
    const aProjection =
      a?.result.status === "projected" ? a.result.projection : undefined;
    const bProjection =
      b?.result.status === "projected" ? b.result.projection : undefined;
    const aTree =
      a?.pathTree?.status === "projected"
        ? a.pathTree.pathTree.tree
        : undefined;
    const bTree =
      b?.pathTree?.status === "projected"
        ? b.pathTree.pathTree.tree
        : undefined;
    return {
      specId,
      before: projectionState(before, left, specId),
      after: projectionState(after, right, specId),
      bindingsChanged: !valuesEqual(
        aProjection
          ? {
              generation: aProjection.generation,
              graph: aProjection.graph,
              spec: aProjection.spec,
            }
          : undefined,
        bProjection
          ? {
              generation: bProjection.generation,
              graph: bProjection.graph,
              spec: bProjection.spec,
            }
          : undefined,
      ),
      entries:
        aProjection && bProjection
          ? entriesChanged(aProjection.entries, bProjection.entries)
          : [],
      pathTreeChanged:
        !valuesEqual(aTree, bTree) ||
        !valuesEqual(a?.pathTree?.status, b?.pathTree?.status),
    };
  });
}

function activeMappings(outputs: ReplayOutputs): string[] | undefined {
  return outputs.compilation.status === "viable"
    ? outputs.compilation.generation.activeMappings
    : undefined;
}

function supportSubjects(bundle: MetamapReplayBundle): string[] {
  return [
    ...new Set(
      bundle.inputs.policy.evidence
        .filter((entry) => entry.result === "supports")
        .flatMap((entry) => entry.subjects),
    ),
  ].sort();
}

function changeSeeds(
  before: MetamapReplayBundle,
  after: MetamapReplayBundle,
  graph: GraphDiff,
  left: ReplayOutputs,
  right: ReplayOutputs,
): string[] {
  const seeds = new Set(graph.changes.map((entry) => entry.id));
  if (
    !valuesEqual(before.inputs.changedSubjects, after.inputs.changedSubjects)
  ) {
    for (const id of [
      ...before.inputs.changedSubjects,
      ...after.inputs.changedSubjects,
    ])
      seeds.add(id);
  }
  const a = before.inputs.policy;
  const b = after.inputs.policy;
  for (const kind of ["constraints", "evidence", "waivers"] as const) {
    const changes = recordsChanged<{ id: string }>(
      a[kind] ?? [],
      b[kind] ?? [],
    );
    for (const id of [
      ...changes.added,
      ...changes.removed,
      ...changes.changed,
    ]) {
      seeds.add(id);
      for (const entry of [...(a[kind] ?? []), ...(b[kind] ?? [])])
        if (entry.id === id)
          entry.subjects.forEach((subject) => seeds.add(subject));
    }
  }
  if (
    !valuesEqual(a.mappings, b.mappings) ||
    !valuesEqual(before.inputs.context, after.inputs.context) ||
    !valuesEqual(before.inputs.evaluatedAt, after.inputs.evaluatedAt) ||
    !valuesEqual(before.inputs.relationPacks, after.inputs.relationPacks)
  ) {
    // Conservative: applicability or declared propagation can change an entire family.
    for (const mapping of [
      ...before.inputs.graph.mappings,
      ...after.inputs.graph.mappings,
    ])
      seeds.add(mapping.id);
  }
  if (!valuesEqual(before.inputs, after.inputs)) {
    for (const outputs of [left, right]) {
      for (const entry of issuesFor(outputs))
        if (entry.issue.subjectId) seeds.add(entry.issue.subjectId);
    }
  }
  if (!valuesEqual(before.inputs.projections, after.inputs.projections)) {
    for (const outputs of [left, right]) {
      for (const output of outputs.projections) {
        if (output.result.status === "projected") {
          for (const entry of output.result.projection.entries)
            seeds.add(entry.subject.id);
        }
      }
    }
  }
  return [...seeds].sort();
}

function impactFor(bundle: MetamapReplayBundle, seeds: string[]): ImpactReport {
  const known = new Set(
    [
      ...bundle.inputs.graph.entities,
      ...bundle.inputs.graph.mappings,
      ...bundle.inputs.graph.authorities,
      ...bundle.inputs.policy.constraints,
      ...bundle.inputs.policy.evidence,
      ...(bundle.inputs.policy.waivers ?? []),
    ].map((entry) => entry.id),
  );
  const changedSubjects = seeds.filter((id) => known.has(id));
  if (changedSubjects.length === 0)
    return { changedSubjects: [], affectedSubjects: [], paths: [] };
  const inputs = structuredClone(bundle.inputs);
  // Reuse the compiler's contextual impact analysis, including rejected candidates.
  return compileMetamap(inputs.graph, inputs.policy, {
    context: inputs.context,
    evaluatedAt: inputs.evaluatedAt,
    changedSubjects,
    relationRegistry: new RelationRegistry(inputs.relationPacks),
  }).impact;
}

function freeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Compare two independently reproduced candidates. Never repairs, rebinds, or activates. */
export function compareMetamapBundles(
  beforeValue: unknown,
  afterValue: unknown,
): CounterfactualResult {
  const beforeReplay = replayMetamap(beforeValue);
  const afterReplay = replayMetamap(afterValue);
  if (beforeReplay.status === "rejected" || afterReplay.status === "rejected") {
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
  }
  const before = beforeValue as MetamapReplayBundle;
  const after = afterValue as MetamapReplayBundle;
  const left = beforeReplay.outputs;
  const right = afterReplay.outputs;
  const graph = diffMetamapDocuments(before.inputs.graph, after.inputs.graph);
  const aIssues = new Map(
    issuesFor(left).map((entry) => [issueKey(entry), entry]),
  );
  const bIssues = new Map(
    issuesFor(right).map((entry) => [issueKey(entry), entry]),
  );
  const evidence = recordsChanged(
    before.inputs.policy.evidence,
    after.inputs.policy.evidence,
  );
  const aActive = activeMappings(left);
  const bActive = activeMappings(right);
  const seeds = changeSeeds(before, after, graph, left, right);
  const inputChanges: CounterfactualInputChange[] = [];
  for (const input of Object.keys(before.inputs).sort() as Array<
    keyof ReplayInputs
  >) {
    if (!valuesEqual(before.inputs[input], after.inputs[input]))
      inputChanges.push({
        input,
        beforeDigest: valueDigest(before.inputs[input]),
        afterDigest: valueDigest(after.inputs[input]),
      });
  }
  const content = structuredClone({
    schemaVersion: METAMAP_COUNTERFACTUAL_VERSION,
    before: {
      bundle: before.id,
      digest: before.digest,
      admitted: beforeReplay.admitted,
    },
    after: {
      bundle: after.id,
      digest: after.digest,
      admitted: afterReplay.admitted,
    },
    inputChanges,
    graph,
    issues: {
      introduced: [...bIssues]
        .filter(([key]) => !aIssues.has(key))
        .map(([, entry]) => entry),
      resolved: [...aIssues]
        .filter(([key]) => !bIssues.has(key))
        .map(([, entry]) => entry),
    },
    mappingStates: {
      beforeKnown: aActive !== undefined,
      afterKnown: bActive !== undefined,
      activated: aActive && bActive ? difference(bActive, aActive) : [],
      deactivated: aActive && bActive ? difference(aActive, bActive) : [],
    },
    evidence: {
      ...evidence,
      recordedSupportLost: difference(
        supportSubjects(before),
        supportSubjects(after),
      ),
      recordedSupportGained: difference(
        supportSubjects(after),
        supportSubjects(before),
      ),
    },
    projections: projectionChanges(before, after, left, right),
    impact: {
      interpretation: "declared-dependency-propagation" as const,
      before: impactFor(before, seeds),
      after: impactFor(after, seeds),
    },
  });
  const digest = valueDigest(content);
  return {
    status: "compared",
    report: freeze({
      ...content,
      digest,
      id: `urn:metamap:counterfactual:${digest.replace(/^sha256:/, "")}`,
    }),
  };
}
