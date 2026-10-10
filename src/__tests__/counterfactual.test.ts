import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compareMetamapBundles,
  validateCounterfactualReport,
  type CounterfactualReport,
} from "../counterfactual.js";
import type { MetamapDocument, RelationPack } from "../model.js";
import type { MetamapProjectionSpec } from "../projection.js";
import { RelationRegistry } from "../relations.js";
import { captureReplayBundle, type MetamapReplayBundle } from "../replay.js";
import type { MetamapViabilityPolicy } from "../viability-model.js";

function fixture<T>(path: string): T {
  return JSON.parse(
    readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"),
  ) as T;
}

const evaluatedAt = "2026-09-15T00:00:00.000Z";

function routing(example = "routing") {
  const graph = fixture<MetamapDocument>(`examples/${example}/graph.json`);
  const policy = fixture<MetamapViabilityPolicy>(
    `examples/${example}/viability-policy.json`,
  );
  const spec = fixture<MetamapProjectionSpec>(
    `examples/${example}/projection.json`,
  );
  const registry = new RelationRegistry();
  registry.registerPack(fixture<RelationPack>("relation-packs/routing.json"));
  const capture = () =>
    captureReplayBundle(graph, policy, {
      evaluatedAt,
      projections: [spec],
      relationRegistry: registry,
    });
  return { graph, policy, spec, registry, capture };
}

function compare(
  before: MetamapReplayBundle,
  after: MetamapReplayBundle,
): CounterfactualReport {
  const result = compareMetamapBundles(before, after);
  if (result.status !== "compared") throw new Error(JSON.stringify(result));
  expect(validateCounterfactualReport(result.report)).toEqual({
    valid: true,
    issues: [],
  });
  return result.report;
}

describe("read-only counterfactual comparison", () => {
  it("reports no semantic changes for an identical evaluation", () => {
    const bundle = routing().capture();
    const report = compare(bundle, bundle);
    expect(report.inputChanges).toEqual([]);
    expect(report.graph.changes).toEqual([]);
    expect(report.issues).toEqual({ introduced: [], resolved: [] });
    expect(report.projections[0]).toEqual(
      expect.objectContaining({
        before: "projected",
        after: "projected",
        entries: [],
        bindingsChanged: false,
        pathTreeChanged: false,
      }),
    );
    expect(report.impact.before.affectedSubjects).toEqual([]);
    expect(compare(bundle, bundle)).toEqual(report);
  });

  it("detects a removed handler and reports rejection without inventing activated removals", () => {
    const input = routing();
    const before = input.capture();
    const handler = input.graph.mappings.find(
      (mapping) => mapping.relation === "routing:handled_by",
    )!;
    input.graph.mappings = input.graph.mappings.filter(
      (mapping) => mapping.id !== handler.id,
    );
    input.policy.mappings = input.policy.mappings.filter(
      (entry) => entry.mapping !== handler.id,
    );
    const after = input.capture();
    const preserved = structuredClone({ before, after });
    const report = compare(before, after);
    expect(report.after.admitted).toBe(false);
    expect(report.graph.changes).toContainEqual(
      expect.objectContaining({ change: "removed", id: handler.id }),
    );
    expect(report.issues.introduced).toContainEqual(
      expect.objectContaining({
        stage: "compilation",
        issue: expect.objectContaining({
          subjectId: "urn:example:command:create-user",
        }),
      }),
    );
    expect(report.mappingStates.afterKnown).toBe(false);
    expect(report.mappingStates.deactivated).toEqual([]);
    expect(report.projections[0]).toEqual(
      expect.objectContaining({ after: "generation-rejected", entries: [] }),
    );
    expect(report.impact.before.paths).toContainEqual(
      expect.objectContaining({ subjectId: "urn:example:command:create-user" }),
    );
    expect({ before, after }).toEqual(preserved);
  });

  it("detects a second handler through the existing uniqueness rule", () => {
    const input = routing();
    const before = input.capture();
    const original = input.graph.mappings[0];
    input.graph.entities.push({
      id: "urn:test:handler:second",
      kind: "routing:handler",
    });
    input.graph.mappings.push({
      ...structuredClone(original),
      id: "urn:test:mapping:second-handler",
      targets: ["urn:test:handler:second"],
    });
    input.policy.mappings.push({
      mapping: "urn:test:mapping:second-handler",
      coverage: "total",
      determinism: "deterministic",
      reversibility: "irreversible",
    });
    const report = compare(before, input.capture());
    expect(report.after.admitted).toBe(false);
    expect(report.issues.introduced.length).toBeGreaterThan(0);
    expect(report.impact.after.affectedSubjects).toContain(
      "urn:test:handler:second",
    );
  });

  it("reports a changed authorization target even when the declared policy admits both candidates", () => {
    const input = routing();
    const before = input.capture();
    const mapping = input.graph.mappings.find(
      (entry) => entry.relation === "routing:authorized_by",
    )!;
    const oldTarget = mapping.targets[0];
    input.graph.entities.push({
      id: "urn:test:policy:broader",
      kind: "routing:policy",
    });
    mapping.targets = ["urn:test:policy:broader"];
    const report = compare(before, input.capture());
    expect(report.before.admitted).toBe(true);
    expect(report.after.admitted).toBe(true);
    const slot = report.projections[0].entries[0].slots.find(
      (entry) => entry.name === "authorization",
    )!;
    expect(slot.before?.targets.map((target) => target.id)).toEqual([
      oldTarget,
    ]);
    expect(slot.after?.targets.map((target) => target.id)).toEqual([
      "urn:test:policy:broader",
    ]);
    expect(report.issues.introduced).toEqual([]);
  });

  it("reports lost supporting records separately from the evidence requirement violation", () => {
    const graph = fixture<MetamapDocument>(
      "examples/example-authority-graph.json",
    );
    const policy = fixture<MetamapViabilityPolicy>(
      "examples/example-viability-policy.json",
    );
    const options = {
      evaluatedAt,
      context: { environment: "production", maintenance: false },
    };
    const before = captureReplayBundle(graph, policy, options);
    const subject = policy.evidence[0].subjects[0];
    policy.evidence = [];
    const after = captureReplayBundle(graph, policy, options);
    const report = compare(before, after);
    expect(report.evidence.recordedSupportLost).toEqual([subject]);
    expect(report.after.admitted).toBe(false);
    expect(report.issues.introduced).toContainEqual(
      expect.objectContaining({
        issue: expect.objectContaining({
          code: "REQUIRED_EVIDENCE_MISSING",
          subjectId: subject,
        }),
      }),
    );
    const recovered = compare(after, before);
    expect(recovered.after.admitted).toBe(true);
    expect(recovered.evidence.recordedSupportGained).toEqual([subject]);
    expect(recovered.issues.resolved).toContainEqual(
      expect.objectContaining({
        issue: expect.objectContaining({ code: "REQUIRED_EVIDENCE_MISSING" }),
      }),
    );
  });

  it("accepts stable locator moves and distinguishes metadata binding changes from runtime entry changes", () => {
    const input = routing();
    const before = input.capture();
    const handler = input.graph.entities.find(
      (entry) => entry.kind === "routing:handler",
    )!;
    handler.locators = [{ uri: "file:///moved/create-user.ts" }];
    const moved = compare(before, input.capture());
    expect(moved.after.admitted).toBe(true);
    expect(moved.graph.counts.added).toBe(0);
    expect(moved.graph.counts.removed).toBe(0);
    expect(moved.graph.changes).toContainEqual(
      expect.objectContaining({
        id: handler.id,
        changedProperties: expect.arrayContaining(["locators"]),
      }),
    );
    const baseline = input.capture();
    input.graph.metadata = {
      ...(input.graph.metadata ?? {}),
      administrativeNote: "reviewed",
    };
    const metadata = compare(baseline, input.capture());
    expect(metadata.after.admitted).toBe(true);
    expect(metadata.projections[0].bindingsChanged).toBe(true);
    expect(metadata.projections[0].entries).toEqual([]);
  });

  it("detects missing declaration, lossy linkage, and lost authority without confusing their failure stages", () => {
    const declaration = routing();
    const declarationBefore = declaration.capture();
    declaration.policy.mappings.shift();
    expect(
      compare(declarationBefore, declaration.capture()).after.admitted,
    ).toBe(false);
    const lossy = routing();
    const lossyBefore = lossy.capture();
    lossy.graph.mappings[0].lossiness = "lossy";
    const lossyReport = compare(lossyBefore, lossy.capture());
    expect(lossyReport.after.admitted).toBe(false);
    expect(lossyReport.mappingStates.afterKnown).toBe(true);
    expect(lossyReport.projections[0].after).toBe("rejected");
    expect(lossyReport.issues.introduced).toContainEqual(
      expect.objectContaining({ stage: "projection" }),
    );
    const authority = routing();
    const authorityBefore = authority.capture();
    authority.graph.authorities = [];
    const authorityReport = compare(authorityBefore, authority.capture());
    expect(authorityReport.after.admitted).toBe(false);
    expect(authorityReport.issues.introduced).toContainEqual(
      expect.objectContaining({ stage: "compilation" }),
    );
  });

  it("reports context inhibition without graph changes or evidence loss", () => {
    const graph = fixture<MetamapDocument>(
      "examples/example-authority-graph.json",
    );
    const policy = fixture<MetamapViabilityPolicy>(
      "examples/example-viability-policy.json",
    );
    const before = captureReplayBundle(graph, policy, {
      evaluatedAt,
      context: { environment: "production", maintenance: false },
    });
    const after = captureReplayBundle(graph, policy, {
      evaluatedAt,
      context: { environment: "production", maintenance: true },
    });
    const report = compare(before, after);
    expect(report.after.admitted).toBe(true);
    expect(report.graph.changes).toEqual([]);
    expect(report.mappingStates.deactivated).toEqual([
      "urn:example:mapping:zod-email-derived-from-prisma",
    ]);
    expect(report.evidence.recordedSupportLost).toEqual([]);
    expect(report.inputChanges.map((entry) => entry.input)).toEqual([
      "context",
    ]);
  });

  it("includes projection-only obligations in changed inputs and impact", () => {
    const input = routing();
    const before = input.capture();
    input.spec.slots[0].targetKinds = ["routing:incorrect-handler"];
    const report = compare(before, input.capture());
    expect(report.after.admitted).toBe(false);
    expect(report.graph.changes).toEqual([]);
    expect(report.mappingStates.afterKnown).toBe(true);
    expect(report.inputChanges.map((entry) => entry.input)).toEqual([
      "projections",
    ]);
    expect(report.impact.before.affectedSubjects).toContain(
      "urn:example:command:create-user",
    );
  });

  it("keeps a removed context mapping as the origin of its failed consumers", () => {
    const input = routing("application-topology");
    input.registry.registerPack(
      fixture<RelationPack>("relation-packs/application-topology.json"),
    );
    const before = input.capture();
    const provider = input.graph.mappings.find(
      (entry) => entry.relation === "topology:provides_context",
    )!;
    input.graph.mappings = input.graph.mappings.filter(
      (entry) => entry.id !== provider.id,
    );
    const after = input.capture();
    const report = compare(before, after);
    expect(report.before.admitted).toBe(true);
    expect(report.after.admitted).toBe(false);
    expect(report.impact.before.changedSubjects).toEqual([provider.id]);
    const failedSubject = "urn:example:route:account";
    const path = report.impact.before.paths.find(
      (entry) => entry.subjectId === failedSubject,
    )!.path;
    expect(path[0]).toBe(provider.id);
    expect(path).toContain(provider.sources[0]);
    expect(path.at(-1)).toBe(failedSubject);
    expect(report.issues.introduced[0].issue).toEqual(
      after.expected.compilation.issues[0],
    );
    expect(report.issues.introduced[0].issue.subjectId).toBe(failedSubject);
  });

  it("does not turn unchanged failures into change origins for administrative metadata", () => {
    const input = routing("application-topology");
    input.registry.registerPack(
      fixture<RelationPack>("relation-packs/application-topology.json"),
    );
    input.graph.mappings = input.graph.mappings.filter(
      (entry) => entry.relation !== "topology:provides_context",
    );
    const before = input.capture();
    input.graph.metadata = {
      administrativeNote: "inspected unchanged failure",
    };
    const report = compare(before, input.capture());
    expect(report.before.admitted).toBe(false);
    expect(report.after.admitted).toBe(false);
    expect(report.issues).toEqual({ introduced: [], resolved: [] });
    expect(report.impact.before).toEqual({
      changedSubjects: [],
      affectedSubjects: [],
      paths: [],
    });
    expect(report.impact.after).toEqual(report.impact.before);
  });

  it("retains explicitly changed diagnostic seeds without claiming runtime changes", () => {
    const input = routing();
    const before = input.capture();
    const after = captureReplayBundle(input.graph, input.policy, {
      evaluatedAt,
      relationRegistry: input.registry,
      projections: [input.spec],
      changedSubjects: ["urn:example:command:create-user"],
    });
    const report = compare(before, after);
    expect(report.inputChanges.map((entry) => entry.input)).toEqual([
      "changedSubjects",
    ]);
    expect(report.after.admitted).toBe(true);
    expect(report.projections[0].entries).toEqual([]);
    expect(report.impact.after.changedSubjects).toContain(
      "urn:example:command:create-user",
    );
    expect(report.impact.after.affectedSubjects).toContain(
      "urn:example:handler:create-user",
    );
  });

  it("does not traverse inhibited mappings when explaining a rejected candidate", () => {
    const input = routing();
    const handler = input.graph.mappings.find(
      (entry) => entry.relation === "routing:handled_by",
    )!;
    input.policy.mappings.find(
      (entry) => entry.mapping === handler.id,
    )!.applicability = {
      when: { key: "handlerEnabled", operator: "equals", value: true },
    };
    const capture = () =>
      captureReplayBundle(input.graph, input.policy, {
        evaluatedAt,
        context: { handlerEnabled: false },
        relationRegistry: input.registry,
        projections: [input.spec],
      });
    const before = capture();
    input.graph.entities.find(
      (entry) => entry.id === handler.sources[0],
    )!.label = "Updated command with inactive handler";
    const report = compare(before, capture());
    expect(report.after.admitted).toBe(false);
    expect(report.impact.after.affectedSubjects).toContain(handler.sources[0]);
    expect(report.impact.after.affectedSubjects).not.toContain(
      handler.targets[0],
    );
    expect(
      report.impact.after.paths.some((entry) =>
        entry.path.includes(handler.id),
      ),
    ).toBe(false);
  });

  it("reports path collisions without claiming the graph itself was rejected", () => {
    const input = routing("path-tree");
    const before = input.capture();
    const routes = input.graph.entities.filter(
      (entry) => entry.kind === "routing:route",
    );
    routes[1].attributes = {
      ...routes[1].attributes,
      path: routes[0].attributes!.path,
    };
    const report = compare(before, input.capture());
    expect(report.after.admitted).toBe(false);
    expect(report.mappingStates.afterKnown).toBe(true);
    expect(report.projections[0].after).toBe("projected");
    expect(report.projections[0].pathTreeChanged).toBe(true);
    expect(report.issues.introduced).toContainEqual(
      expect.objectContaining({ stage: "path-tree" }),
    );
  });

  it("rejects unverifiable inputs on either side and detects report corruption", () => {
    const bundle = routing().capture();
    const corrupt = structuredClone(bundle);
    corrupt.inputs.context.environment = "altered";
    const result = compareMetamapBundles(corrupt, corrupt);
    expect(result).toEqual(
      expect.objectContaining({
        status: "rejected",
        issues: expect.arrayContaining([
          expect.objectContaining({
            side: "before",
            code: "REPLAY_DIGEST_MISMATCH",
          }),
          expect.objectContaining({
            side: "after",
            code: "REPLAY_DIGEST_MISMATCH",
          }),
        ]),
      }),
    );
    const report = structuredClone(compare(bundle, bundle));
    report.after.admitted = false;
    expect(validateCounterfactualReport(report).valid).toBe(false);
  });
});
