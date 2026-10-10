import { describe, expect, it } from "vitest";
import { compareMetamapBundles } from "../counterfactual.js";
import { compileProjection } from "../projection.js";
import { replayMetamap } from "../replay.js";
import { semanticGenerationDigest } from "../semantic.js";
import { semanticReplayDigest } from "../semantic-replay.js";
import type { SemanticReplayBundle } from "../semantic-replay-model.js";
import { compileMetamap } from "../viability.js";
import { uncertaintyFixture } from "./helpers/uncertainty-fixture.js";

function captured() {
  const inputs = uncertaintyFixture();
  inputs.supported();
  inputs.recompose();
  inputs.requireIdentity();
  inputs.budget();
  return inputs;
}
function rehash(bundle: SemanticReplayBundle) {
  bundle.digest = semanticReplayDigest(bundle);
  bundle.id = `urn:metamap:replay:${bundle.digest.slice(7)}`;
  return bundle;
}
describe("typed inputs through generated bindings and exact replay", () => {
  it("reproduces full assessment/evidence and budget inputs, evaluated projections and hydrated-tree bindings", () => {
    const inputs = captured(),
      saved = structuredClone({
        graph: inputs.graph,
        policy: inputs.policy,
        spec: inputs.spec,
      });
    const bundle = inputs.capture();
    expect(bundle.inputs.policy.evidence).toEqual(inputs.policy.evidence);
    expect(bundle.expected.compilation.status).toBe("viable");
    const result = bundle.expected.projections[0].result;
    if (result.status !== "projected") throw new Error(JSON.stringify(result));
    expect(result.projection.semantic.risk).toMatchObject({
      status: "evaluated",
      totalCost: 5,
    });
    expect(
      result.projection.semantic.risk.uncertainty.every(
        (entry) =>
          entry.dimensions.find(
            (dimension) => dimension.dimension === "identity",
          )?.status === "supported",
      ),
    ).toBe(true);
    expect(bundle.expected.projections[0].pathTree?.status).toBe("projected");
    expect(replayMetamap(bundle)).toEqual({
      status: "verified",
      bundle: bundle.id,
      admitted: true,
      outputs: bundle.expected,
    });
    expect({
      graph: inputs.graph,
      policy: inputs.policy,
      spec: inputs.spec,
    }).toEqual(saved);
  });
  it("requires full evidence and rejects a substituted or rehashed generation summary", () => {
    const inputs = captured(),
      generation = inputs.generation();
    expect(
      compileProjection(inputs.graph, generation, inputs.spec),
    ).toMatchObject({
      status: "rejected",
      issues: [{ code: "SEMANTIC_POLICY_REQUIRED" }],
    });
    const changed = structuredClone(inputs.policy);
    changed.evidence[0].producer = "substituted";
    expect(
      compileProjection(inputs.graph, generation, inputs.spec, {
        semanticPolicy: changed,
      }),
    ).toMatchObject({
      status: "rejected",
      issues: [{ code: "PROJECTION_POLICY_BINDING_MISMATCH" }],
    });
    for (const mutate of [
      (value: typeof generation) => {
        value.semantic.uncertainty[0].dimensions[0].status = "unknown";
      },
      (value: typeof generation) => {
        value.semantic.riskBudgets[0].maximumTotalCost = 100;
      },
      (value: typeof generation) => {
        value.semantic.uncertaintyRequirements[0].requireEvidence = false;
      },
    ]) {
      const forged = structuredClone(generation);
      mutate(forged);
      forged.digest = semanticGenerationDigest(forged);
      forged.id = `urn:metamap:generation:${forged.digest.slice(7)}`;
      expect(
        compileProjection(inputs.graph, forged, inputs.spec, {
          semanticPolicy: inputs.policy,
        }),
      ).toMatchObject({
        status: "rejected",
        issues: [{ code: "PROJECTION_GENERATION_RECHECK_FAILED" }],
      });
    }
  });
  it.each(["assessment", "evidence", "requirement", "budget"] as const)(
    "recomputes changed %s despite a consistent outer replay hash",
    (kind) => {
      const bundle = structuredClone(captured().capture());
      if (kind === "assessment")
        bundle.inputs.policy.assessments[0].status = "unknown";
      if (kind === "evidence")
        bundle.inputs.policy.evidence[0].result = "inconclusive";
      if (kind === "requirement")
        bundle.inputs.policy.uncertaintyRequirements[0].requireEvidence = false;
      if (kind === "budget")
        bundle.inputs.policy.riskBudgets[0].maximumTotalCost = 4;
      expect(replayMetamap(rehash(bundle))).toMatchObject({
        status: "rejected",
        issues: [{ code: "REPLAY_OUTPUT_MISMATCH" }],
      });
    },
  );
  it("replays a genuine cost rejection and reports unavailable risk deltas without invented zero", () => {
    const inputs = captured(),
      before = inputs.capture();
    inputs.policy.riskBudgets[0].maximumTotalCost = 4;
    const after = inputs.capture();
    expect(after.expected.compilation.status).toBe("viable");
    expect(after.expected.projections[0].result).toMatchObject({
      status: "rejected",
      issues: [{ code: "CONSUMER_RISK_BUDGET_EXCEEDED" }],
    });
    expect(replayMetamap(after)).toMatchObject({
      status: "verified",
      admitted: false,
    });
    const compared = compareMetamapBundles(before, after);
    if (compared.status !== "compared")
      throw new Error(JSON.stringify(compared));
    expect(compared.report.semantic.riskBudgets.changed).toEqual([
      inputs.policy.riskBudgets[0].id,
    ]);
    expect(compared.report.semantic.projections[0]).toMatchObject({
      beforeKnown: true,
      afterKnown: false,
      riskChanged: null,
    });
  });
  it("reports assessment/proof and risk changes while preserving consumer entries", () => {
    const inputs = captured(),
      before = inputs.capture();
    inputs.policy.assessments[0].assessor = "second-recorded-reviewer";
    inputs.recompose();
    const after = inputs.capture(),
      compared = compareMetamapBundles(before, after);
    if (compared.status !== "compared")
      throw new Error(JSON.stringify(compared));
    expect(compared.report.after.admitted).toBe(true);
    expect(compared.report.semantic.assessments.changed).toEqual([
      inputs.policy.assessments[0].id,
    ]);
    expect(compared.report.semantic.derivations.removed).toHaveLength(1);
    expect(compared.report.semantic.derivations.added).toHaveLength(1);
    expect(compared.report.semantic.projections[0]).toMatchObject({
      dependenciesChanged: true,
      riskChanged: false,
    });
    const first = before.expected.projections[0].result,
      next = after.expected.projections[0].result;
    if (first.status === "projected" && next.status === "projected")
      expect(first.projection.entries).toEqual(next.projection.entries);
    // Assessor attribution changed the bound proof/policy, not the qualitative summary.
    inputs.policy.assessments[0].status = "unknown";
    inputs.recompose();
    const rejected = inputs.capture();
    expect(rejected.expected.compilation).toMatchObject({
      status: "rejected",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "UNCERTAINTY_STATE_NOT_ALLOWED" }),
      ]),
    });
    const delta = compareMetamapBundles(after, rejected);
    if (delta.status !== "compared") throw new Error(JSON.stringify(delta));
    expect(delta.report.semantic.projections[0].riskChanged).toBeNull();
  });
  it("checks requirements and budgets without assessments and retains explicit unknown state", () => {
    const inputs = uncertaintyFixture();
    inputs.requireIdentity(["unknown"], false);
    inputs.budget();
    const bundle = inputs.capture(),
      replay = replayMetamap(bundle);
    expect(replay).toMatchObject({ status: "verified", admitted: true });
    inputs.policy.uncertaintyRequirements[0].allowedStates = ["supported"];
    const result = compileMetamap(inputs.graph, inputs.policy, inputs.options);
    expect(result.status).toBe("rejected");
  });
});
