import { describe, expect, it } from "vitest";
import { canonicalDigest, canonicalJson } from "../canonical.js";
import { compareMetamapBundles } from "../counterfactual.js";
import {
  parseSemanticCounterfactualJson,
  semanticCounterfactualDigest,
  validateSemanticCounterfactualReport,
} from "../semantic-counterfactual.js";
import type { SemanticReplayBundle } from "../semantic-replay-model.js";
import { semanticFixture } from "./helpers/semantic-fixture.js";

function compare(before: SemanticReplayBundle, after: SemanticReplayBundle) {
  const result = compareMetamapBundles(before, after);
  if (result.status !== "compared") throw new Error(JSON.stringify(result));
  expect(validateSemanticCounterfactualReport(result.report)).toEqual({
    valid: true,
    issues: [],
  });
  return result.report;
}
describe("semantic counterfactual comparisons", () => {
  it("reports no changed semantics for an identical reproduced evaluation", () => {
    const bundle = semanticFixture().capture(),
      report = compare(bundle, bundle);
    expect(report.inputChanges).toEqual([]);
    expect(report.graph.changes).toEqual([]);
    expect(report.semantic.derivations).toEqual({
      added: [],
      removed: [],
      changed: [],
    });
    expect(report.semantic.projections).toEqual([
      {
        specId: bundle.inputs.projections[0].id,
        beforeKnown: true,
        afterKnown: true,
        usedMappingsChanged: false,
        dependenciesChanged: false,
        riskChanged: false,
      },
    ]);
    expect(report.impact.before.changedSubjects).toEqual([]);
    expect(parseSemanticCounterfactualJson(canonicalJson(report))).toEqual(
      report,
    );
    expect(Object.isFrozen(report.semantic)).toBe(true);
  });
  it("explains a removed premise through the captured proof without inventing deactivations", () => {
    const inputs = semanticFixture(),
      before = inputs.capture();
    const removed = inputs.graph.mappings.splice(1, 1)[0];
    inputs.rebind();
    const after = inputs.capture(),
      saved = structuredClone({ before, after }),
      report = compare(before, after);
    expect(report.after.admitted).toBe(false);
    expect(report.mappingStates).toEqual({
      beforeKnown: true,
      afterKnown: false,
      activated: [],
      deactivated: [],
    });
    expect(report.semantic.projections[0]).toMatchObject({
      beforeKnown: true,
      afterKnown: false,
      usedMappingsChanged: null,
      dependenciesChanged: null,
      riskChanged: null,
    });
    expect(report.impact.after.paths).toContainEqual({
      subjectId: inputs.proposal.mapping.id,
      path: [
        removed.id,
        inputs.proposal.derivation.id,
        inputs.proposal.mapping.id,
      ],
    });
    expect(report.impact.after.changedSubjects).not.toContain(
      "urn:example:consumer",
    );
    expect({ before, after }).toEqual(saved);
  });
  it("compares lost proofs separately from graph changes", () => {
    const inputs = semanticFixture(),
      before = inputs.capture();
    inputs.policy.derivations = [];
    const report = compare(before, inputs.capture());
    expect(report.graph.changes).toEqual([]);
    expect(report.semantic.derivations.removed).toEqual([
      inputs.proposal.derivation.id,
    ]);
    expect(report.issues.introduced).toContainEqual(
      expect.objectContaining({
        stage: "compilation",
        issue: expect.objectContaining({ code: "MISSING_DERIVATION" }),
      }),
    );
    expect(
      report.inputChanges.find((change) => change.input === "policy")
        ?.beforeDigest,
    ).toBe(canonicalDigest(before.inputs.policy));
  });
  it("reports explicit projection changes without inferring a cost or extra confidence", () => {
    const inputs = semanticFixture(),
      before = inputs.capture();
    inputs.spec.slots.push({
      ...inputs.spec.slots[0],
      name: "secondReference",
    });
    const report = compare(before, inputs.capture());
    expect(report.projections[0].entries[0].slots).toEqual([
      expect.objectContaining({ name: "secondReference" }),
    ]);
    expect(report.semantic.projections[0]).toMatchObject({
      beforeKnown: true,
      afterKnown: true,
      usedMappingsChanged: false,
      dependenciesChanged: false,
      riskChanged: false,
    });
  });
  it("captures a requested future budget as rejection and reports its actual input change", () => {
    const inputs = semanticFixture(),
      before = inputs.capture();
    inputs.policy.riskBudgets = [
      {
        id: "urn:example:budget",
        consumer: inputs.spec.consumer,
        classifications: [
          {
            id: "urn:example:classification",
            select: { relations: ["example:depends"] },
            classification: "directional",
            cost: 1,
          },
        ],
        maximumTotalCost: 3,
        requireCompleteClassification: true,
        requireCompleteDependencies: true,
      },
    ];
    inputs.spec.budget = inputs.policy.riskBudgets[0].id;
    const report = compare(before, inputs.capture());
    expect(report.semantic.riskBudgets.added).toEqual(["urn:example:budget"]);
    expect(report.after.admitted).toBe(false);
    expect(report.semantic.projections[0].riskChanged).toBeNull();
  });
  it("refuses mixed profiles and unverified captures", () => {
    const bundle = semanticFixture().capture();
    expect(
      compareMetamapBundles(bundle, { ...bundle, schemaVersion: "1.0.0" }),
    ).toMatchObject({
      status: "rejected",
      issues: [{ code: "COUNTERFACTUAL_VERSION_MISMATCH", side: "after" }],
    });
    const changed = structuredClone(bundle);
    changed.inputs.context.environment = "changed";
    expect(compareMetamapBundles(bundle, changed)).toMatchObject({
      status: "rejected",
      issues: expect.arrayContaining([
        expect.objectContaining({
          side: "after",
          code: "REPLAY_DIGEST_MISMATCH",
        }),
      ]),
    });
  });
  it("rejects hash-consistent reports that pretend an unavailable projection has a measured delta", () => {
    const inputs = semanticFixture(),
      before = inputs.capture();
    inputs.policy.derivations = [];
    const report = structuredClone(compare(before, inputs.capture()));
    report.semantic.projections[0].riskChanged = false;
    report.digest = semanticCounterfactualDigest(report);
    report.id = `urn:metamap:counterfactual:${report.digest.slice(7)}`;
    expect(validateSemanticCounterfactualReport(report).valid).toBe(false);
  });
  it("rejects duplicate decoded keys in report JSON", () => {
    const bundle = semanticFixture().capture(),
      report = compare(bundle, bundle);
    expect(() =>
      parseSemanticCounterfactualJson(
        JSON.stringify(report).replace(
          '"schemaVersion":"2.0.0"',
          '"schemaVersion":"2.0.0","schemaVersion":"2.0.0"',
        ),
      ),
    ).toThrow(/Duplicate/);
  });
});
