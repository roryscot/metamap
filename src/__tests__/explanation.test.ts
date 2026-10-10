import { describe, expect, it } from "vitest";
import { canonicalJson } from "../canonical.js";
import {
  createMetamapExplanationRequest,
  explainMetamap,
  metamapExplanationDigest,
  parseMetamapExplanationRequest,
  parseMetamapExplanationRequestJson,
  parseMetamapExplanationReport,
  parseMetamapExplanationReportJson,
} from "../explanation.js";
import type {
  MetamapExplanationReport,
  MetamapExplanationRequest,
} from "../explanation-model.js";
import { captureReplayBundle } from "../replay.js";
import { searchMetamapRepairs } from "../repair.js";
import { sourceFixture, rehashSourceReplay } from "./helpers/source-fixture.js";
import { repairFixture } from "./helpers/repair-fixture.js";

function fixture() {
  const f = sourceFixture();
  f.policy.derivations = structuredClone(f.policy.derivations);
  const capture = () => {
    f.rebind();
    return captureReplayBundle(f.graph, f.policy, {
      ...f.options,
      projections: [f.spec],
      sourceCapture: f.sourceCapture,
    });
  };
  const request = (
    options: Partial<
      Omit<
        MetamapExplanationRequest,
        "id" | "digest" | "schemaVersion" | "capture"
      >
    > = {},
  ) =>
    createMetamapExplanationRequest(capture(), {
      consumer: f.spec.consumer,
      selection: {
        kind: "entity",
        id: f.graph.entities[0].id,
        projection: f.spec.id,
      },
      ...options,
    });
  return { ...f, capture, request };
}
function report(request: MetamapExplanationRequest): MetamapExplanationReport {
  const result = explainMetamap(request);
  if (result.status !== "explained")
    throw new Error(JSON.stringify(result.issues));
  return result.report;
}
function rehash<T extends { id: string; digest: string }>(
  value: T,
  kind = "explanation",
): T {
  value.digest = metamapExplanationDigest(value);
  value.id = "urn:metamap:" + kind + ":" + value.digest.slice(7);
  return value;
}
describe("shared captured explanations", () => {
  it("navigates the generated operation, actual schema slot and checked proof premises", () => {
    const f = fixture(),
      r = report(f.request());
    expect(r.selection).toEqual({ state: "known", occurrences: 1 });
    expect(r.projections[0].entries[0].slots[0].targets[0].id).toBe(
      f.graph.entities[2].id,
    );
    const derived = r.mappings.find(
      (mapping) =>
        mapping.id ===
        f.request().capture.inputs.policy.derivations[0].result.id,
    )!;
    expect(derived).toMatchObject({
      interpretation: "derived",
      activity: "active",
      uncertainty: { validation: "checked" },
      proofs: [{ validation: "checked", rules: [{ operation: "chain" }] }],
    });
    expect(derived.proofs[0].record.premises).toHaveLength(2);
    expect(r.navigation.mappingIds).toContain(
      derived.proofs[0].record.premises[1].mapping,
    );
    expect(r.sources.map((source) => source.source).sort()).toEqual([
      "network",
      "schema",
    ]);
    expect(r.sourceInspection.lineage.rawInputs).toBe("not-captured");
    expect(r.sourceInspection.authentication).toBe("not-evaluated");
  });
  it("retains the missing premise origin and original compiler issue subjects", () => {
    const f = fixture(),
      before = f.capture(),
      removed = f.graph.mappings.shift()!;
    const r = report(f.request({ before }));
    expect(r.admission).toBe("rejected");
    expect(r.projections[0].status).toBe("generation-rejected");
    expect(r.comparison.report?.graph.changes).toContainEqual({
      kind: "mapping",
      id: removed.id,
      change: "removed",
    });
    expect(
      r.mappings.find((mapping) => mapping.id === removed.id),
    ).toMatchObject({ state: "missing", current: [], before: [removed] });
    expect(
      r.issues
        .filter((entry) => entry.stage === "compilation")
        .map((entry) => entry.issue),
    ).toEqual(r.request.capture.expected.compilation.issues);
    expect(
      r.comparison.report?.impact.before.paths.some((path) =>
        path.path.includes(removed.id),
      ),
    ).toBe(true);
    expect(r.causality.uniqueCause).toBe("not-established");
    expect(
      r.causality.limitations.some((text) => text.includes("one path")),
    ).toBe(true);
    expect(
      r.mappings
        .flatMap((mapping) => mapping.proofs)
        .every((proof) => proof.validation === "recorded"),
    ).toBe(true);
  });
  it("keeps a failed consumer slot subject separate from its actual removed input", () => {
    const f = fixture(),
      before = f.capture(),
      removed = f.graph.mappings.pop()!;
    f.policy.derivations = [];
    const r = report(f.request({ before }));
    expect(r.projections[0].status).toBe("rejected");
    expect(
      r.issues.some(
        (entry) =>
          entry.stage === "projection" &&
          entry.issue.subjectId === f.graph.entities[0].id,
      ),
    ).toBe(true);
    expect(r.comparison.report?.graph.changes).toContainEqual({
      kind: "mapping",
      id: removed.id,
      change: "removed",
    });
    expect(
      r.issues.every((entry) => entry.issue.subjectId !== removed.id),
    ).toBe(true);
    expect(r.approval.status).toBe("unavailable");
  });
  it("shows scoped owner and delegation declarations without treating them as grants", () => {
    const f = fixture(),
      provenance = {
        status: "declared" as const,
        assertedBy: "supplied-owner",
      };
    const root = {
      id: "urn:owner:root",
      mode: "canonical" as const,
      concept: f.graph.entities[0].id,
      source: f.graph.entities[1].id,
      facts: ["configuration", "labels"],
      provenance,
    };
    const delegated = {
      id: "urn:owner:delegated",
      mode: "delegated" as const,
      concept: root.concept,
      source: f.graph.entities[2].id,
      facts: ["configuration"],
      delegatedFrom: root.id,
      provenance,
    };
    f.graph.authorities.push(root, delegated);
    const r = report(f.request());
    expect(r.ownership.declarations).toEqual([root, delegated]);
    expect(r.ownership.authentication).toBe("not-evaluated");
    expect(r.approval).toMatchObject({
      status: "unavailable",
      currentAuthority: "not-evaluated",
      active: "not-evaluated",
    });
  });
  it("retains a bad recorded rule without inventing a checked rule match", () => {
    const f = fixture();
    f.policy.derivations[0].rule.id = "urn:missing:law";
    const r = report(f.request());
    expect(r.admission).toBe("rejected");
    expect(r.mappings.flatMap((mapping) => mapping.proofs)).toMatchObject([
      { validation: "recorded", rules: [] },
    ]);
    expect(
      r.issues.some((entry) => entry.issue.code.includes("DERIVATION")),
    ).toBe(true);
  });
  it("requires the exact pack digest before exposing a recorded law match", () => {
    const f = fixture();
    f.policy.derivations[0].rule.pack.digest = "sha256:" + "0".repeat(64);
    expect(
      report(f.request()).mappings.flatMap((mapping) => mapping.proofs),
    ).toMatchObject([{ validation: "recorded", rules: [] }]);
  });
  it("retains contradictory evidence and recorded measurement model in a rejected capture", () => {
    const f = fixture();
    f.assess(f.graph.mappings[0].id, "identity", "supported", {
      result: "contradicts",
      model: "urn:measurement:recorded",
    });
    const r = report(f.request());
    expect(r.admission).toBe("rejected");
    expect(r.mappings.flatMap((mapping) => mapping.assessments)).toMatchObject([
      { measurementModel: "urn:measurement:recorded" },
    ]);
    expect(r.mappings.flatMap((mapping) => mapping.evidence)).toMatchObject([
      { result: "contradicts" },
    ]);
    expect(r.mappings[0].uncertainty.validation).toBe("unavailable");
  });
  it("shows actual whole-projection risk charges, including premise charges", () => {
    const f = fixture();
    f.budget();
    const r = report(f.request());
    expect(r.projections[0]).toMatchObject({
      riskScope: "whole-projection",
      risk: { totalCost: 5 },
    });
    expect(
      r.mappings
        .flatMap((mapping) => mapping.riskCharges)
        .map((charge) => charge.cost)
        .sort(),
    ).toEqual([0, 2, 3]);
  });
  it("retains the risk-budget rejection with unavailable runtime bindings", () => {
    const f = fixture();
    f.budget(4);
    const r = report(f.request());
    expect(r.projections[0]).toMatchObject({
      status: "rejected",
      entries: [],
      risk: null,
    });
    expect(
      r.issues.some(
        (entry) =>
          entry.stage === "projection" && entry.issue.code.includes("RISK"),
      ),
    ).toBe(true);
  });
  it("shows a missing slot and a path-tree failure using their original issue stages", () => {
    const f = fixture();
    f.policy.derivations = [];
    f.graph.mappings.pop();
    const r = report(f.request());
    expect(r.admission).toBe("viable");
    expect(r.projections[0].status).toBe("rejected");
    expect(r.issues.some((entry) => entry.stage === "projection")).toBe(true);
    const g = fixture();
    g.graph.entities[0].attributes = {};
    const path = report(g.request());
    expect(path.projections[0].status).toBe("projected");
    expect(path.projections[0].pathTree?.status).toBe("rejected");
    expect(path.issues.some((entry) => entry.stage === "path-tree")).toBe(true);
  });
  it("makes missing subjects and empty selected entries explicit", () => {
    const f = fixture();
    const r = report(
      f.request({
        selection: {
          kind: "entity",
          id: "urn:missing:entity",
          projection: null,
        },
      }),
    );
    expect(r.selection.state).toBe("missing");
    expect(r.subjects).toEqual([
      { id: "urn:missing:entity", state: "missing", current: [], before: [] },
    ]);
    expect(r.projections[0].entries).toEqual([]);
    expect(r.mappings).toEqual([]);
  });
  it("preserves duplicate mapping occurrences and declines an ambiguous comparison", () => {
    const f = fixture(),
      before = f.capture(),
      mapping = f.graph.mappings[0];
    f.graph.mappings.push(structuredClone(mapping));
    const r = report(
      f.request({
        before,
        selection: { kind: "mapping", id: mapping.id, projection: null },
      }),
    );
    expect(r.selection).toEqual({ state: "ambiguous", occurrences: 2 });
    expect(r.mappings[0].current).toHaveLength(2);
    expect(r.mappings[0].activity).toBe("unavailable");
    expect(r.comparison).toMatchObject({ status: "unavailable", report: null });
    expect(r.approval.requirements).toEqual([]);
    expect(
      r.sources[0].records.some((record) => record.state === "ambiguous"),
    ).toBe(true);
  });
  it("preserves duplicate entity records without silently selecting a kind or label", () => {
    const f = fixture();
    f.graph.entities.push({
      ...f.graph.entities[0],
      label: "conflicting duplicate",
    });
    const r = report(f.request());
    expect(r.selection.state).toBe("ambiguous");
    expect(
      r.subjects.find((subject) => subject.id === f.graph.entities[0].id)
        ?.current,
    ).toHaveLength(2);
  });
  it("discloses focus truncation while keeping the explicitly selected record", () => {
    const f = fixture(),
      selected = f.graph.mappings.at(-1)!.id;
    const r = report(
      f.request({
        selection: { kind: "mapping", id: selected, projection: null },
        limits: { maximumSubjects: 1, maximumMappings: 1 },
      }),
    );
    expect(r.navigation).toMatchObject({
      status: "truncated",
      mappingIds: [selected],
      omittedMappings: 2,
    });
    expect(r.mappings[0].id).toBe(selected);
    expect(r.navigation.omittedSubjects).toBeGreaterThan(0);
  });
  it("retains multiple observed change origins and no uniquely proven cause", () => {
    const f = fixture(),
      before = f.capture();
    f.graph.entities[0].label = "first change";
    f.graph.entities[2].locators = [{ uri: "json-schema:changed.json" }];
    const r = report(f.request({ before }));
    expect(r.comparison.report?.graph.changes).toHaveLength(2);
    expect(r.causality.uniqueCause).toBe("not-established");
    expect(r.approval).toMatchObject({
      status: "approval-required",
      currentAuthority: "not-evaluated",
    });
    expect(
      r.approval.requirements.some(
        (requirement) => requirement.action === "rebind-implementation",
      ),
    ).toBe(true);
  });
  it("compares identical verified captures without fabricating input changes", () => {
    const f = fixture(),
      before = f.capture(),
      r = report(f.request({ before }));
    expect(r.comparison.report?.graph.changes).toEqual([]);
    expect(r.comparison.report?.inputChanges).toEqual([]);
  });
  it("exposes supplied legal, blocked and rejected alternatives without applying them", async () => {
    const f = repairFixture(),
      wrong = structuredClone(f.restore);
    if (wrong.kind !== "restore-mapping")
      throw new Error("Expected mapping restoration");
    wrong.id = "wrong";
    wrong.mapping.targets = [f.inputs.graph.entities[1].id];
    const searched = await searchMetamapRepairs(f.request([f.restore, wrong]));
    if (searched.status !== "searched")
      throw new Error(JSON.stringify(searched));
    const request = createMetamapExplanationRequest(
      searched.report.request.baseline,
      {
        consumer: f.inputs.spec.consumer,
        selection: {
          kind: "entity",
          id: f.inputs.graph.entities[0].id,
          projection: null,
        },
        repairs: searched.report,
      },
    );
    const r = report(request);
    expect(r.alternatives).toMatchObject({
      status: "verified",
      applied: false,
    });
    expect(r.alternatives.attempts).toHaveLength(3);
    expect(
      r.request.repairs?.attempts
        .filter((attempt) => attempt.status === "evaluated")
        .map((attempt) => attempt.viable)
        .sort(),
    ).toEqual([false, true]);
    expect(r.request.repairs?.minimality.global).toBe(false);
  }, 30000);
  it("rejects supplied repairs for a different capture even after request rehashing", async () => {
    const f = repairFixture(),
      searched = await searchMetamapRepairs(f.request());
    if (searched.status !== "searched")
      throw new Error(JSON.stringify(searched));
    const g = fixture();
    expect(() => g.request({ repairs: searched.report })).toThrow(
      /exact selected/,
    );
  }, 30000);
  it("rejects a different graph baseline and unknown consumer or unrelated projection", () => {
    const f = fixture(),
      before = structuredClone(f.capture());
    before.inputs.graph.id = "urn:unrelated:graph";
    rehashSourceReplay(before);
    expect(() => f.request({ before })).toThrow();
    expect(() => f.request({ consumer: "urn:missing:consumer" })).toThrow(
      /Consumer/,
    );
    expect(() =>
      f.request({
        selection: {
          kind: "entity",
          id: f.graph.entities[0].id,
          projection: "urn:missing:projection",
        },
      }),
    ).toThrow(/Selected projection/);
  });
  it("rejects falsified replay output despite updated content hashes", () => {
    const f = fixture(),
      request = structuredClone(f.request());
    request.capture.expected.sourceInspection.authentication =
      "authenticated" as never;
    rehashSourceReplay(request.capture);
    rehash(request, "explanation-request");
    expect(() => parseMetamapExplanationRequest(request)).toThrow();
  });
  it.each([
    "current-authority",
    "issue-origin",
    "checked-proof",
    "risk-charge",
    "focus-record",
    "repair-claim",
  ])("rejects rehashed %s report tampering", (mode) => {
    const f = fixture();
    f.budget();
    const r = structuredClone(report(f.request()));
    if (mode === "current-authority")
      r.approval.currentAuthority = "authenticated" as never;
    if (mode === "issue-origin") r.causality.uniqueCause = "proven" as never;
    if (mode === "checked-proof")
      r.mappings.flatMap((mapping) => mapping.proofs)[0].record.premises = [];
    if (mode === "risk-charge")
      r.mappings.flatMap((mapping) => mapping.riskCharges)[0].cost += 1;
    if (mode === "focus-record") r.subjects[0].current[0].label = "changed";
    if (mode === "repair-claim") r.alternatives.status = "verified";
    rehash(r);
    expect(() => parseMetamapExplanationReport(r)).toThrow();
  });
  it("rejects duplicate keys, unknown fields, future versions and invalid limits", () => {
    const f = fixture(),
      req = f.request();
    expect(() =>
      parseMetamapExplanationRequestJson(
        '{"schemaVersion":"1.0.0","schemaVersion":"1.0.0"}',
      ),
    ).toThrow(/Duplicate/);
    for (const field of [
      { authorize: true },
      { schemaVersion: "99.0.0" },
      { limits: { maximumSubjects: 0, maximumMappings: 1 } },
    ])
      expect(() =>
        parseMetamapExplanationRequest({ ...req, ...field }),
      ).toThrow();
  });
  it("round-trips the same complete report without changing input objects or their evidence", () => {
    const f = fixture(),
      request = f.request(),
      original = canonicalJson(request),
      r = report(request);
    expect(parseMetamapExplanationReportJson(canonicalJson(r))).toEqual(r);
    expect(canonicalJson(request)).toBe(original);
    expect(Object.isFrozen(r.mappings[0].current)).toBe(true);
    expect(r).toEqual(report(request));
  });
});
