import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../canonical.js";
import {
  composeCorrespondences,
  derivationDigest,
  executableRelationConflictIssues,
  parseCompositionRequestJson,
  parseCompositionResult,
  validateCorrespondenceDerivations,
} from "../derivation.js";
import {
  DERIVATION_ATTRIBUTE,
  type CorrespondenceCompositionRequest,
  type CorrespondenceDerivation,
} from "../derivation-model.js";
import type {
  ExecutableRelationPack,
  MetamapDocument,
  StructuralMapping,
} from "../model.js";
import { relationPackDigest } from "../relation-pack.js";
import { RelationRegistry, coreRelationPack } from "../relations.js";
import { valueDigest } from "../stable.js";

export const handling = {
  lossiness: "conservative",
  uncertainty: "conservative",
  authority: "none",
} as const;
export function lawFixture() {
  const pack: ExecutableRelationPack = {
    schemaVersion: "2.0.0",
    id: "urn:example:pack",
    version: "1.0.0",
    relations: [
      {
        id: "example:r",
        cyclePolicy: "allow",
        sourceKinds: ["concept"],
        targetKinds: ["concept"],
      },
      { id: "example:s", cyclePolicy: "allow" },
      {
        id: "example:t",
        cyclePolicy: "allow",
        disjointWith: ["example:excluded"],
      },
      { id: "example:excluded", cyclePolicy: "allow" },
      {
        id: "example:exact",
        cyclePolicy: "allow",
        transitive: true,
        symmetric: true,
      },
      {
        id: "example:close",
        cyclePolicy: "allow",
        transitive: false,
        symmetric: true,
      },
    ],
    laws: [
      {
        id: "urn:example:law:chain",
        operation: "chain",
        operands: ["example:r", "example:s"],
        resultRelation: "example:t",
        handling,
      },
      {
        id: "urn:example:law:reverse",
        operation: "reverse",
        operands: ["example:r"],
        resultRelation: "example:s",
        handling,
      },
      {
        id: "urn:example:law:exact-chain",
        operation: "chain",
        operands: ["example:exact", "example:exact"],
        resultRelation: "example:exact",
        handling,
      },
      {
        id: "urn:example:law:exact-reverse",
        operation: "reverse",
        operands: ["example:exact"],
        resultRelation: "example:exact",
        handling,
      },
      {
        id: "urn:example:law:close-reverse",
        operation: "reverse",
        operands: ["example:close"],
        resultRelation: "example:close",
        handling,
      },
    ],
  };
  const graph: MetamapDocument = {
    schemaVersion: "2.0.0",
    id: "urn:example:graph",
    namespace: "example",
    entities: ["a", "b", "c", "d"].map((name) => ({
      id: `urn:${name}`,
      kind: "concept",
    })),
    mappings: [
      mapping("urn:m:ab", "example:r", "urn:a", "urn:b"),
      mapping("urn:m:bc", "example:s", "urn:b", "urn:c"),
    ],
    authorities: [],
  };
  return { pack, graph, registry: new RelationRegistry([pack]) };
}
function mapping(
  id: string,
  relation: string,
  source: string,
  target: string,
): StructuralMapping {
  return {
    id,
    relation,
    sources: [source],
    targets: [target],
    cardinality: "one-to-one",
    lossiness: "lossless",
    provenance: {
      status: "declared",
      assertedBy: "source-owner",
      confidence: 0.9,
    },
  };
}
export function request(
  overrides: Partial<CorrespondenceCompositionRequest> = {},
): CorrespondenceCompositionRequest {
  return {
    schemaVersion: "1.0.0",
    law: "urn:example:law:chain",
    premises: ["urn:m:ab", "urn:m:bc"],
    context: { environment: "test" },
    bounds: { maxDepth: 8, maxDerivations: 32 },
    derivations: [],
    assessments: [],
    evidence: [],
    ...overrides,
  };
}
function propose(
  graph: MetamapDocument,
  registry: RelationRegistry,
  input = request(),
) {
  const result = composeCorrespondences(graph, input, registry);
  expect(result.status, JSON.stringify(result)).toBe("proposed");
  if (result.status !== "proposed") throw new Error("Expected a proposal");
  return result;
}

describe("bounded, explicit correspondence derivation", () => {
  it("satisfies the fixed allowed-chain expectation without graph writes or authority transfer", () => {
    const corpus = JSON.parse(
      readFileSync(
        new URL("../../evaluation/capability-corpus.json", import.meta.url),
        "utf8",
      ),
    );
    const vector = corpus.laterMilestones.find(
      (entry: { id: string }) => entry.id === "allowed-binary-chain",
    );
    // The corpus uses mathematical labels R/S/T. Graph 2 uses lower-case IDs.
    const { graph, registry, pack } = lawFixture();
    const before = valueDigest(graph);
    const result = propose(graph, registry);
    expect(result.mapping.relation).toBe(
      vector.expected.relation.toLowerCase(),
    );
    expect(result.mapping.sources).toEqual(vector.expected.sources);
    expect(result.mapping.targets).toEqual(vector.expected.targets);
    expect(result.derivation.premises).toEqual(
      graph.mappings.map((mapping) => ({
        mapping: mapping.id,
        digest: valueDigest(mapping),
      })),
    );
    expect(result.derivation.rule.pack.digest).toBe(relationPackDigest(pack));
    expect(result.derivation.depth).toBe(1);
    expect(result.derivation.derivationCount).toBe(1);
    expect(
      result.derivation.uncertainty.every(
        (entry) => entry.status === "unknown",
      ),
    ).toBe(true);
    expect(result.mapping.provenance).toEqual({
      status: "inferred",
      assertedBy: "urn:example:law:chain",
    });
    expect(valueDigest(graph)).toBe(before);
    expect(parseCompositionResult(JSON.parse(JSON.stringify(result)))).toEqual(
      result,
    );
    expect(Object.isFrozen(result.derivation.result)).toBe(true);
  });

  it("checks an explicitly included proposal and rejects its absence", () => {
    const { graph, registry } = lawFixture();
    const proposal = propose(graph, registry);
    expect(
      validateCorrespondenceDerivations(
        graph,
        [proposal.derivation],
        request().context,
        request().bounds,
        registry,
      ).status,
    ).toBe("rejected");
    graph.mappings.push(proposal.mapping);
    expect(
      validateCorrespondenceDerivations(
        graph,
        [proposal.derivation],
        request().context,
        request().bounds,
        registry,
      ).status,
    ).toBe("valid");
    expect(
      validateCorrespondenceDerivations(
        graph,
        [],
        request().context,
        request().bounds,
        registry,
      ).status,
    ).toBe("unknown");
  });

  it("rejects changed premise bytes even when endpoints and relation remain unchanged", () => {
    const { graph, registry } = lawFixture();
    const proposal = propose(graph, registry);
    graph.mappings.push(proposal.mapping);
    graph.mappings[0].provenance.sourceRevision = "changed";
    const result = validateCorrespondenceDerivations(
      graph,
      [proposal.derivation],
      request().context,
      request().bounds,
      registry,
    );
    expect(result.status).toBe("rejected");
    expect(result.issues[0].code).toBe("DERIVATION_PREMISE_OR_RULE_MISMATCH");
  });

  it("rejects a changed full context and a changed exact pack", () => {
    const { graph, registry, pack } = lawFixture();
    const proposal = propose(graph, registry);
    graph.mappings.push(proposal.mapping);
    expect(
      validateCorrespondenceDerivations(
        graph,
        [proposal.derivation],
        { environment: "production" },
        request().bounds,
        registry,
      ).issues[0].code,
    ).toBe("DERIVATION_CONTEXT_MISMATCH");
    pack.description = "changed rule source";
    expect(
      validateCorrespondenceDerivations(
        graph,
        [proposal.derivation],
        request().context,
        request().bounds,
        new RelationRegistry([pack]),
      ).status,
    ).toBe("rejected");
  });

  it("does not authorize an unregistered close-match chain or strengthen it to identity", () => {
    const { graph, registry } = lawFixture();
    for (const mapping of graph.mappings) mapping.relation = "example:close";
    const result = composeCorrespondences(
      graph,
      request({ law: "urn:example:law:close-chain" }),
      registry,
    );
    expect(result.status).toBe("unsupported");
    expect("mapping" in result).toBe(false);
  });

  it("requires a registered law even when legacy transitive metadata is present", () => {
    const { graph } = lawFixture();
    graph.mappings.forEach((mapping) => {
      mapping.relation = "core:contains";
    });
    expect(
      composeCorrespondences(
        graph,
        request({ law: "urn:metamap:law:contains" }),
        new RelationRegistry(),
      ).status,
    ).toBe("unsupported");
    expect(
      coreRelationPack.relations.find(
        (relation) => relation.id === "core:contains",
      )!.transitive,
    ).toBe(true);
  });

  it("checks reverse operands without deriving equivalence or copying scalar confidence", () => {
    const { graph, registry } = lawFixture();
    const result = propose(
      graph,
      registry,
      request({ law: "urn:example:law:reverse", premises: ["urn:m:ab"] }),
    );
    expect(result.mapping.sources).toEqual(["urn:b"]);
    expect(result.mapping.targets).toEqual(["urn:a"]);
    expect(result.mapping.relation).toBe("example:s");
    expect(result.mapping.provenance.confidence).toBeUndefined();
    expect(result.mapping.provenance.assertedBy).not.toBe("source-owner");
  });

  it.each(["lossy", "unknown"] as const)(
    "preserves %s lossiness",
    (lossiness) => {
      const { graph, registry } = lawFixture();
      graph.mappings[0].lossiness = lossiness;
      expect(propose(graph, registry).mapping.lossiness).toBe(lossiness);
    },
  );

  it("requires ordered operands and the exact middle identity", () => {
    const { graph, registry } = lawFixture();
    expect(
      composeCorrespondences(
        graph,
        request({ premises: ["urn:m:bc", "urn:m:ab"] }),
        registry,
      ).issues[0].code,
    ).toBe("LAW_OPERAND_MISMATCH");
    graph.mappings[1].sources = ["urn:d"];
    expect(
      composeCorrespondences(graph, request(), registry).issues[0].code,
    ).toBe("LAW_MIDDLE_IDENTITY_MISMATCH");
  });

  it("reports absent premises, unsupported n-ary operands, and transform composition", () => {
    const { graph, registry } = lawFixture();
    expect(
      composeCorrespondences(
        graph,
        request({ premises: ["urn:missing", "urn:m:bc"] }),
        registry,
      ).status,
    ).toBe("unknown");
    graph.mappings[0].sources.push("urn:d");
    graph.mappings[0].cardinality = "many-to-one";
    expect(composeCorrespondences(graph, request(), registry).status).toBe(
      "unsupported",
    );
    graph.mappings[0].sources.pop();
    graph.mappings[0].cardinality = "one-to-one";
    graph.mappings[0].transform = { adapter: "custom", version: "1" };
    expect(
      composeCorrespondences(graph, request(), registry).issues[0].code,
    ).toBe("UNSUPPORTED_DERIVATION_SEMANTICS");
  });

  it("reports missing context as unknown and a false condition as rejected", () => {
    const { graph, pack } = lawFixture();
    const mutablePack = JSON.parse(
      JSON.stringify(pack),
    ) as ExecutableRelationPack;
    mutablePack.laws[0].conditions = {
      context: { key: "scope", operator: "equals", value: "shared" },
    };
    const registry = new RelationRegistry([mutablePack]);
    expect(composeCorrespondences(graph, request(), registry).status).toBe(
      "unknown",
    );
    expect(
      composeCorrespondences(
        graph,
        request({ context: { scope: "private" } }),
        registry,
      ).status,
    ).toBe("rejected");
    expect(
      composeCorrespondences(
        graph,
        request({ context: { scope: "shared" } }),
        registry,
      ).status,
    ).toBe("proposed");
  });

  it("checks kind guards on actual endpoints", () => {
    const { graph, pack } = lawFixture();
    const mutablePack = JSON.parse(
      JSON.stringify(pack),
    ) as ExecutableRelationPack;
    mutablePack.laws[0].conditions = { targetKinds: ["other"] };
    expect(
      composeCorrespondences(
        graph,
        request(),
        new RelationRegistry([mutablePack]),
      ).issues[0].code,
    ).toBe("LAW_KIND_MISMATCH");
  });

  it.each([
    { maxDepth: 0, maxDerivations: 5 },
    { maxDepth: 5, maxDerivations: 0 },
  ])("reports explicit incomplete bounds %j", (bounds) => {
    const { graph, registry } = lawFixture();
    expect(
      composeCorrespondences(graph, request({ bounds }), registry).status,
    ).toBe("incomplete");
  });

  it("captures nested proof dependencies, enforces depth and counts shared proofs once", () => {
    const { graph, registry } = lawFixture();
    graph.mappings.forEach((mapping) => {
      mapping.relation = "example:exact";
    });
    const first = propose(
      graph,
      registry,
      request({ law: "urn:example:law:exact-chain" }),
    );
    graph.mappings.push(
      first.mapping,
      mapping("urn:m:cd", "example:exact", "urn:c", "urn:d"),
    );
    const input = request({
      law: "urn:example:law:exact-chain",
      premises: [first.mapping.id, "urn:m:cd"],
      derivations: [first.derivation],
    });
    const second = propose(graph, registry, input);
    expect(second.derivation.depth).toBe(2);
    expect(second.derivation.derivationCount).toBe(2);
    expect(
      second.derivation.dependencies.map((dependency) => dependency.id),
    ).toEqual(
      expect.arrayContaining([
        first.derivation.id,
        "urn:m:ab",
        "urn:m:bc",
        "urn:m:cd",
      ]),
    );
    expect(
      composeCorrespondences(
        graph,
        { ...input, bounds: { maxDepth: 1, maxDerivations: 9 } },
        registry,
      ).status,
    ).toBe("incomplete");
    graph.mappings.push(second.mapping);
    expect(
      validateCorrespondenceDerivations(
        graph,
        [first.derivation, second.derivation],
        input.context,
        input.bounds,
        registry,
      ).status,
    ).toBe("valid");
    const symmetricLoop = propose(
      graph,
      registry,
      request({
        law: "urn:example:law:exact-reverse",
        premises: [first.mapping.id],
        derivations: [first.derivation],
      }),
    );
    graph.mappings.push(symmetricLoop.mapping);
    const shared = propose(
      graph,
      registry,
      request({
        law: "urn:example:law:exact-chain",
        premises: [first.mapping.id, symmetricLoop.mapping.id],
        derivations: [first.derivation, symmetricLoop.derivation],
      }),
    );
    expect(shared.derivation.derivationCount).toBe(3);
  });

  it("rejects tampering, stale results, missing proof records, and conflicting stable IDs", () => {
    const { graph, registry } = lawFixture();
    const proposal = propose(graph, registry);
    const tampered = JSON.parse(
      JSON.stringify(proposal.derivation),
    ) as CorrespondenceDerivation;
    tampered.depth = 9;
    expect(
      validateCorrespondenceDerivations(
        graph,
        [tampered],
        request().context,
        request().bounds,
        registry,
      ).status,
    ).toBe("rejected");
    graph.mappings.push(proposal.mapping);
    const altered = JSON.parse(
      JSON.stringify(proposal.mapping),
    ) as StructuralMapping;
    altered.targets = ["urn:d"];
    graph.mappings[2] = altered;
    expect(
      validateCorrespondenceDerivations(
        graph,
        [proposal.derivation],
        request().context,
        request().bounds,
        registry,
      ).issues[0].code,
    ).toBe("DERIVATION_RESULT_MISMATCH");
    expect(
      composeCorrespondences(
        graph,
        request({ resultId: proposal.mapping.id }),
        registry,
      ).issues[0].code,
    ).toBe("DERIVATION_RESULT_ID_CONFLICT");
  });

  it("rejects recomputed proof claims that erase loss or dependency limits", () => {
    const { graph, registry } = lawFixture();
    graph.mappings[0].lossiness = "lossy";
    const proposal = propose(graph, registry);
    const forged = JSON.parse(
      JSON.stringify(proposal.derivation),
    ) as CorrespondenceDerivation;
    forged.result.lossiness = "lossless";
    forged.digest = derivationDigest(forged);
    forged.id = `urn:metamap:derivation:${forged.digest.slice(7)}`;
    graph.mappings.push({
      ...forged.result,
      attributes: { [DERIVATION_ATTRIBUTE]: forged.id },
    });
    expect(
      validateCorrespondenceDerivations(
        graph,
        [forged],
        request().context,
        request().bounds,
        registry,
      ).issues[0].code,
    ).toBe("DERIVATION_PREMISE_OR_RULE_MISMATCH");
  });

  it("rejects duplicate untrusted JSON keys before interpreting a request", () => {
    expect(() =>
      parseCompositionRequestJson(
        '{"schemaVersion":"1.0.0","law":"urn:a","law":"urn:b"}',
      ),
    ).toThrow(/Duplicate JSON/);
    const { graph, registry } = lawFixture();
    expect(
      composeCorrespondences(
        graph,
        { ...request(), unknown: true } as CorrespondenceCompositionRequest,
        registry,
      ).status,
    ).toBe("rejected");
  });

  it("binds the optional schema field and uses stable content-addressed IDs", () => {
    const { graph, registry } = lawFixture();
    const first = propose(graph, registry);
    expect(propose(graph, registry).derivation.id).toBe(first.derivation.id);
    expect(derivationDigest(first.derivation)).toBe(first.derivation.digest);
    expect(canonicalDigest(first.derivation.context)).toBe(
      first.derivation.contextDigest,
    );
  });

  it("checks disjointness only among active facts and keeps alternatives possible", () => {
    const { graph, registry } = lawFixture();
    const proposal = propose(graph, registry);
    graph.mappings.push(
      proposal.mapping,
      mapping("urn:m:excluded", "example:excluded", "urn:a", "urn:c"),
    );
    expect(
      executableRelationConflictIssues(
        graph,
        new Set([proposal.mapping.id]),
        registry,
      ),
    ).toEqual([]);
    expect(
      executableRelationConflictIssues(
        graph,
        new Set([proposal.mapping.id, "urn:m:excluded"]),
        registry,
      )[0].code,
    ).toBe("DISJOINT_RELATION_CONFLICT");
  });
});
