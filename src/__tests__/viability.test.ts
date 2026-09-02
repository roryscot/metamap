import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateContextExpression } from "../context.js";
import type { MetamapDocument } from "../model.js";
import {
  MetamapActivator,
  compileMetamap,
  validateViableGeneration,
} from "../viability.js";
import type { MetamapViabilityPolicy } from "../viability-model.js";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
}

function document(): MetamapDocument {
  return readJson<MetamapDocument>(
    "../../examples/example-authority-graph.json",
  );
}

function policy(): MetamapViabilityPolicy {
  return readJson<MetamapViabilityPolicy>(
    "../../examples/example-viability-policy.json",
  );
}

const evaluatedAt = "2026-09-02T00:00:00.000Z";
const production = { environment: "production", maintenance: false } as const;

describe("context expressions", () => {
  it("supports composition, set membership, and explicit absence", () => {
    expect(
      evaluateContextExpression(
        {
          all: [
            { key: "environment", operator: "in", values: ["production"] },
            { not: { key: "maintenance", operator: "equals", value: true } },
            { key: "region", operator: "exists", value: false },
          ],
        },
        production,
      ),
    ).toBe(true);
  });
});

describe("viability compiler", () => {
  it("compiles a complete policy into a deterministic immutable generation", () => {
    const first = compileMetamap(document(), policy(), {
      context: production,
      evaluatedAt,
    });
    const second = compileMetamap(document(), policy(), {
      context: production,
      evaluatedAt,
    });

    expect(first.status).toBe("viable");
    expect(second.status).toBe("viable");
    if (first.status !== "viable" || second.status !== "viable") return;
    expect(first.generation).toEqual(second.generation);
    expect(first.generation.activeMappings).toHaveLength(4);
    expect(Object.isFrozen(first.generation)).toBe(true);
    expect(Object.isFrozen(first.generation.activeMappings)).toBe(true);
    expect(validateViableGeneration(first.generation).valid).toBe(true);
  });

  it("detects mutation of a persisted generation", () => {
    const result = compileMetamap(document(), policy(), {
      context: production,
      evaluatedAt,
    });
    expect(result.status).toBe("viable");
    if (result.status !== "viable") return;
    const tampered = structuredClone(result.generation);
    tampered.context.environment = "staging";

    expect(validateViableGeneration(tampered)).toEqual(
      expect.objectContaining({
        valid: false,
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "GENERATION_DIGEST_MISMATCH" }),
        ]),
      }),
    );
  });

  it("expresses and inhibits mappings without mutating the graph", () => {
    const result = compileMetamap(document(), policy(), {
      context: { environment: "production", maintenance: true },
      evaluatedAt,
    });

    expect(result.status).toBe("viable");
    if (result.status !== "viable") return;
    expect(result.generation.inactiveMappings).toContainEqual({
      id: "urn:example:mapping:zod-email-derived-from-prisma",
      reason: "inhibited",
    });
    expect(result.generation.activeMappings).toHaveLength(3);
  });

  it("rejects missing context instead of silently deactivating mappings", () => {
    const result = compileMetamap(document(), policy(), { evaluatedAt });
    expect(result.status).toBe("rejected");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CONTEXT_KEY_MISSING" }),
      ]),
    );
  });

  it("requires a full date-time for deterministic waiver evaluation", () => {
    const result = compileMetamap(document(), policy(), {
      context: production,
      evaluatedAt: "2026-09-02",
    });
    expect(result.status).toBe("rejected");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "INVALID_EVALUATION_TIME" }),
      ]),
    );
  });

  it("rejects missing declarations and unknown lossiness", () => {
    const incomplete = policy();
    incomplete.mappings.pop();
    const missing = compileMetamap(document(), incomplete, {
      context: production,
      evaluatedAt,
    });
    expect(missing.status).toBe("rejected");
    expect(missing.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MAPPING_POLICY_MISSING" }),
      ]),
    );

    const ambiguous = document();
    ambiguous.mappings[0].lossiness = "unknown";
    const undeclared = compileMetamap(ambiguous, policy(), {
      context: production,
      evaluatedAt,
    });
    expect(undeclared.status).toBe("rejected");
    expect(undeclared.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNDECLARED_LOSSINESS" }),
      ]),
    );
  });

  it("allows only explicit, scoped, unexpired waivers", () => {
    const ambiguous = document();
    const mappingId = ambiguous.mappings[0].id;
    ambiguous.mappings[0].lossiness = "unknown";
    const waivedPolicy = policy();
    waivedPolicy.waivers = [
      {
        id: "urn:example:waiver:temporary-lossiness",
        codes: ["UNDECLARED_LOSSINESS"],
        subjects: [mappingId],
        reason: "Legacy adapter migration",
        expiresAt: "2026-09-03T00:00:00.000Z",
        assertedBy: "team:architecture",
      },
    ];

    const waived = compileMetamap(ambiguous, waivedPolicy, {
      context: production,
      evaluatedAt,
    });
    expect(waived.status).toBe("viable");
    expect(waived.issues).toContainEqual(
      expect.objectContaining({
        code: "UNDECLARED_LOSSINESS",
        severity: "warning",
        waivedBy: "urn:example:waiver:temporary-lossiness",
      }),
    );

    const expired = compileMetamap(ambiguous, waivedPolicy, {
      context: production,
      evaluatedAt: "2026-09-04T00:00:00.000Z",
    });
    expect(expired.status).toBe("rejected");
    expect(expired.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "EXPIRED_WAIVER" }),
      ]),
    );
  });

  it("rejects contradictory evidence only when its mapping is expressed", () => {
    const contradicted = policy();
    contradicted.evidence.push({
      id: "urn:example:evidence:email-regression",
      subjects: ["urn:example:mapping:zod-email-derived-from-prisma"],
      kind: "conformance-test",
      result: "contradicts",
      producer: "test:regression",
      confidence: 1,
    });

    expect(
      compileMetamap(document(), contradicted, {
        context: production,
        evaluatedAt,
      }).status,
    ).toBe("rejected");
    expect(
      compileMetamap(document(), contradicted, {
        context: { environment: "production", maintenance: true },
        evaluatedAt,
      }).status,
    ).toBe("viable");
  });

  it("calculates causal impact using relation-specific propagation", () => {
    const result = compileMetamap(document(), policy(), {
      context: production,
      evaluatedAt,
      changedSubjects: ["urn:example:element:prisma.User.email"],
    });
    const path = result.impact.paths.find(
      (entry) => entry.subjectId === "urn:example:element:zod.UserSchema.email",
    );

    expect(path?.path).toContain(
      "urn:example:mapping:zod-email-derived-from-prisma",
    );
  });

  it("retains the last viable generation after a rejected activation", () => {
    const activator = new MetamapActivator();
    const accepted = activator.activate(document(), policy(), {
      context: production,
      evaluatedAt,
    });
    expect(accepted.activated).toBe(true);

    const broken = policy();
    broken.mappings = [];
    const rejected = activator.activate(document(), broken, {
      context: production,
      evaluatedAt,
    });
    expect(rejected.activated).toBe(false);
    expect(rejected.current).toBe(accepted.current);
  });

  it("rejects constraint kinds without a registered evaluator", () => {
    const custom = policy();
    custom.constraints.push({
      id: "urn:example:constraint:custom",
      kind: "example:custom",
      subjects: ["urn:example:concept:user.email"],
    });
    const result = compileMetamap(document(), custom, {
      context: production,
      evaluatedAt,
    });
    expect(result.status).toBe("rejected");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNKNOWN_CONSTRAINT_KIND" }),
      ]),
    );
  });
});
