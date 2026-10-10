import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../canonical.js";
import { compileProjection } from "../projection.js";
import {
  semanticProjectionDigest,
  validateSemanticProjection,
} from "../semantic-projection.js";
import { compileMetamap } from "../viability.js";
import { valueDigest } from "../stable.js";
import { uncertaintyFixture } from "./helpers/uncertainty-fixture.js";

describe("consumer correspondence budgets", () => {
  it("rejects a typed policy option in a legacy projection rather than ignoring it", () => {
    const graph = {
      schemaVersion: "2.0.0" as const,
      id: "urn:legacy:graph",
      namespace: "legacy",
      entities: [],
      mappings: [],
      authorities: [],
    };
    const compiled = compileMetamap(
      graph,
      {
        schemaVersion: "1.0.0",
        id: "urn:legacy:policy",
        graph: { id: graph.id, digest: valueDigest(graph) },
        mappings: [],
        constraints: [],
        evidence: [],
      },
      { evaluatedAt: "2026-10-09T00:00:00.000Z" },
    );
    if (compiled.status !== "viable") throw new Error(JSON.stringify(compiled));
    expect(
      compileProjection(
        graph,
        compiled.generation,
        {
          schemaVersion: "1.0.0",
          id: "urn:legacy:spec",
          select: { kinds: ["configuration"] },
          slots: [],
        },
        { semanticPolicy: uncertaintyFixture().policy },
      ),
    ).toMatchObject({
      status: "rejected",
      issues: [{ code: "EXECUTABLE_PROJECTION_REQUIRED" }],
    });
  });
  it("meets the frozen below/at/above acceptance with explicit zero cost for the derived edge", () => {
    const corpus = JSON.parse(
      readFileSync(
        new URL("../../evaluation/capability-corpus.json", import.meta.url),
        "utf8",
      ),
    );
    const fixed = corpus.laterMilestones.find(
      (entry: { id: string }) => entry.id === "budget-boundaries",
    );
    const inputs = uncertaintyFixture();
    const budget = inputs.budget();
    const results = fixed.input.limits.map((limit: number) => {
      budget.maximumTotalCost = limit;
      return inputs.project();
    });
    expect(results.map((result: { status: string }) => result.status)).toEqual(
      fixed.expected.statuses,
    );
    expect(results[0].issues[0].code).toBe("CONSUMER_RISK_BUDGET_EXCEEDED");
    for (const result of results.slice(1)) {
      expect(result.projection.semantic.risk.totalCost).toBe(
        fixed.expected.uniqueTotalCost,
      );
      expect(result.projection.semantic.risk.budget).toEqual({
        id: budget.id,
        digest: canonicalDigest({
          ...budget,
          maximumTotalCost: result === results[1] ? 5 : 6,
        }),
      });
      expect(validateSemanticProjection(result.projection).valid).toBe(true);
    }
  });
  it("counts shared dependency paths once while retaining identical recorded uncertainty", () => {
    const inputs = uncertaintyFixture();
    inputs.assess("urn:example:service");
    inputs.recompose();
    inputs.budget();
    const first = inputs.project();
    inputs.spec.slots.push({ ...inputs.spec.slots[0], name: "sameSchema" });
    const repeated = inputs.project();
    if (first.status !== "projected" || repeated.status !== "projected")
      throw new Error(JSON.stringify({ first, repeated }));
    expect(repeated.projection.semantic.risk.totalCost).toBe(5);
    expect(repeated.projection.semantic.usedMappings).toHaveLength(3);
    expect(repeated.projection.semantic.risk).toEqual(
      first.projection.semantic.risk,
    );
    expect(repeated.projection.digest).not.toBe(first.projection.digest);
  });
  it("excludes unused and inactive mappings even when their cost is large or their classification is absent", () => {
    const inputs = uncertaintyFixture();
    inputs.budget();
    inputs.graph.entities.push({
      id: "urn:example:unused",
      kind: "configuration",
    });
    inputs.graph.mappings.push({
      ...structuredClone(inputs.graph.mappings[0]),
      id: "urn:example:unused-link",
      sources: ["urn:example:unused"],
    });
    inputs.graph.mappings.push({
      ...structuredClone(inputs.graph.mappings[1]),
      id: "urn:example:inactive-link",
    });
    inputs.policy.mappings = inputs.graph.mappings.map((mapping) => ({
      mapping: mapping.id,
      coverage: "total",
      determinism: "deterministic",
      reversibility: "reversible",
      ...(mapping.id === "urn:example:inactive-link"
        ? {
            applicability: {
              when: {
                key: "environment",
                operator: "equals" as const,
                value: "inactive",
              },
            },
          }
        : {}),
    }));
    inputs.policy.riskBudgets[0].classifications.push({
      id: "urn:example:class:unused",
      select: { ids: ["urn:example:unused-link"] },
      classification: "expensive-unused",
      cost: Number.MAX_SAFE_INTEGER,
    });
    inputs.rebind();
    const result = inputs.project();
    expect(result.status, JSON.stringify(result)).toBe("projected");
    if (result.status !== "projected") return;
    expect(result.projection.semantic.risk.totalCost).toBe(5);
    expect(result.projection.semantic.usedMappings).not.toContain(
      "urn:example:unused-link",
    );
    expect(result.projection.semantic.usedMappings).not.toContain(
      "urn:example:inactive-link",
    );
  });
  it("rejects missing classifications instead of assigning implicit zero", () => {
    const inputs = uncertaintyFixture(),
      budget = inputs.budget();
    budget.classifications.pop();
    expect(inputs.project()).toMatchObject({
      status: "rejected",
      issues: [
        {
          code: "MISSING_RISK_CLASSIFICATION",
          subjectId: inputs.request.resultId,
        },
      ],
    });
  });
  it("rejects overlapping classes even when they specify the same zero cost", () => {
    const inputs = uncertaintyFixture(),
      budget = inputs.budget();
    budget.classifications.push({
      ...budget.classifications[2],
      id: "urn:example:overlap",
      cost: 0,
    });
    expect(inputs.project()).toMatchObject({
      status: "rejected",
      issues: [{ code: "AMBIGUOUS_RISK_CLASSIFICATION" }],
    });
  });
  it("does not let an unrelated cheaper budget or null bypass the consumer budget", () => {
    const inputs = uncertaintyFixture(),
      budget = inputs.budget();
    inputs.spec.budget = null;
    expect(inputs.project()).toMatchObject({
      status: "rejected",
      issues: [{ code: "CONSUMER_BUDGET_REQUIRED" }],
    });
    budget.consumer = "urn:example:another-consumer";
    inputs.spec.budget = budget.id;
    expect(inputs.project()).toMatchObject({
      status: "rejected",
      issues: [{ code: "CONSUMER_BUDGET_MISMATCH" }],
    });
    inputs.spec.budget = null;
    const unrelated = inputs.project();
    expect(unrelated.status).toBe("projected");
    if (unrelated.status === "projected")
      expect(unrelated.projection.semantic.risk).toMatchObject({
        status: "not-evaluated",
        budget: null,
        totalCost: null,
        classifications: [],
      });
  });
  it("requires matching full policy values for a typed generation", () => {
    const inputs = uncertaintyFixture();
    inputs.budget();
    const generation = inputs.generation();
    expect(
      compileProjection(inputs.graph, generation, inputs.spec),
    ).toMatchObject({
      status: "rejected",
      issues: [{ code: "SEMANTIC_POLICY_REQUIRED" }],
    });
    const changed = structuredClone(inputs.policy);
    changed.riskBudgets[0].maximumTotalCost = 100;
    expect(
      compileProjection(inputs.graph, generation, inputs.spec, {
        semanticPolicy: changed,
      }),
    ).toMatchObject({
      status: "rejected",
      issues: [{ code: "PROJECTION_POLICY_BINDING_MISMATCH" }],
    });
  });
  it("rejects integer overflow before reporting or comparing a rounded total", () => {
    const inputs = uncertaintyFixture(),
      budget = inputs.budget(Number.MAX_SAFE_INTEGER);
    budget.classifications[0].cost = Number.MAX_SAFE_INTEGER;
    expect(inputs.project()).toMatchObject({
      status: "rejected",
      issues: [{ code: "RISK_COST_OVERFLOW" }],
    });
  });
  it("allows the declared inferred limit at equality and rejects above it", () => {
    const inputs = uncertaintyFixture(),
      budget = inputs.budget();
    budget.maximumInferredMappings = 1;
    expect(inputs.project().status).toBe("projected");
    budget.maximumInferredMappings = 0;
    expect(inputs.project()).toMatchObject({
      status: "rejected",
      issues: [{ code: "CONSUMER_INFERRED_LIMIT_EXCEEDED" }],
    });
  });
  it("allows lossiness only with a matching static slot and consumer count limit", () => {
    const inputs = uncertaintyFixture();
    inputs.graph.mappings[0].lossiness = "lossy";
    inputs.policy.mappings[0].reversibility = "irreversible";
    inputs.recompose();
    const budget = inputs.budget();
    budget.maximumLossyMappings = 2;
    expect(inputs.project().status).toBe("rejected"); // Existing static linker requires explicit opt-in.
    inputs.spec.slots[0].allowLossy = true;
    const accepted = inputs.project();
    expect(accepted.status, JSON.stringify(accepted)).toBe("projected");
    if (accepted.status === "projected")
      expect(accepted.projection.semantic.risk.lossyMappings).toEqual(
        [inputs.request.resultId, inputs.graph.mappings[0].id].sort(),
      );
    budget.maximumLossyMappings = 1;
    expect(inputs.project()).toMatchObject({
      status: "rejected",
      issues: [{ code: "CONSUMER_LOSSY_LIMIT_EXCEEDED" }],
    });
  });
  it.each([
    [
      "duplicate rule IDs",
      "DUPLICATE_RISK_CLASSIFICATION",
      (i: ReturnType<typeof uncertaintyFixture>) => {
        i.policy.riskBudgets[0].classifications[1].id =
          i.policy.riskBudgets[0].classifications[0].id;
      },
    ],
    [
      "stale selector",
      "STALE_RISK_CLASSIFICATION",
      (i: ReturnType<typeof uncertaintyFixture>) => {
        i.policy.riskBudgets[0].classifications[0].select = {
          relations: ["example:absent"],
        };
      },
    ],
    [
      "unknown mapping selector",
      "UNKNOWN_RISK_SELECTOR_MAPPING",
      (i: ReturnType<typeof uncertaintyFixture>) => {
        i.policy.riskBudgets[0].classifications[0].select.ids!.push(
          "urn:example:absent",
        );
      },
    ],
  ] as const)("rejects %s at policy compilation", (_label, code, mutate) => {
    const inputs = uncertaintyFixture();
    inputs.budget();
    mutate(inputs);
    expect(
      compileMetamap(inputs.graph, inputs.policy, inputs.options).issues.some(
        (issue) => issue.code === code,
      ),
    ).toBe(true);
  });
  it.each([-1, 0.1, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid policy cost %s",
    (cost) => {
      const inputs = uncertaintyFixture();
      inputs.budget().classifications[0].cost = cost;
      expect(
        compileMetamap(inputs.graph, inputs.policy, inputs.options).status,
      ).toBe("rejected");
    },
  );
  it("binds a changed budget into both generation and projection despite unchanged bindings", () => {
    const inputs = uncertaintyFixture(),
      budget = inputs.budget();
    const firstGeneration = inputs.generation(),
      first = inputs.project();
    budget.maximumTotalCost = 6;
    const nextGeneration = inputs.generation(),
      next = inputs.project();
    if (first.status !== "projected" || next.status !== "projected")
      throw new Error("Expected projections");
    expect(firstGeneration.digest).not.toBe(nextGeneration.digest);
    expect(first.projection.digest).not.toBe(next.projection.digest);
    expect(first.projection.entries).toEqual(next.projection.entries);
    expect(first.projection.semantic.risk.totalCost).toBe(
      next.projection.semantic.risk.totalCost,
    );
    expect(first.projection.semantic.risk.budget).not.toEqual(
      next.projection.semantic.risk.budget,
    );
  });
  it("rejects hash-consistent risk totals, missing classifications and invented zero evaluation", () => {
    const inputs = uncertaintyFixture();
    inputs.budget();
    const result = inputs.project();
    if (result.status !== "projected") throw new Error(JSON.stringify(result));
    for (const mutate of [
      (risk: typeof result.projection.semantic.risk) => {
        risk.totalCost = 0;
      },
      (risk: typeof result.projection.semantic.risk) => {
        risk.classifications.pop();
      },
      (risk: typeof result.projection.semantic.risk) => {
        risk.classifications.push(risk.classifications[0]);
      },
      (risk: typeof result.projection.semantic.risk) => {
        risk.budget = null;
      },
      (risk: typeof result.projection.semantic.risk) => {
        risk.status = "not-evaluated";
      },
    ]) {
      const altered = structuredClone(result.projection);
      mutate(altered.semantic.risk);
      altered.digest = semanticProjectionDigest(altered);
      altered.id = `urn:metamap:projection:${altered.digest.slice(7)}`;
      expect(validateSemanticProjection(altered).valid).toBe(false);
    }
  });
});
