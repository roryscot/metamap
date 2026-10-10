import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../canonical.js";
import {
  compilePathTree,
  emitTypeScriptPathTree,
  hydratePathTree,
} from "../path-tree.js";
import {
  compileProjection,
  emitTypeScriptProjection,
  type MetamapProjectionSpec,
} from "../projection.js";
import { coreRelationPack, RelationRegistry } from "../relations.js";
import { semanticGenerationDigest } from "../semantic.js";
import {
  parseSemanticPathTreeJson,
  semanticPathTreeDigest,
  validateSemanticPathTree,
} from "../semantic-path-tree.js";
import {
  parseSemanticProjectionJson,
  parseSemanticProjectionSpecJson,
  semanticProjectionDigest,
  validateSemanticProjection,
} from "../semantic-projection.js";
import type { SemanticProjection } from "../semantic-projection-model.js";
import type { ViableGeneration } from "../viability-model.js";
import { semanticFixture } from "./helpers/semantic-fixture.js";

function projected() {
  const inputs = semanticFixture();
  const generation = inputs.generation();
  const result = compileProjection(inputs.graph, generation, inputs.spec, {
    relationRegistry: inputs.registry,
  });
  if (result.status !== "projected") throw new Error(JSON.stringify(result));
  return { ...inputs, admitted: generation, projection: result.projection };
}
function rehash(projection: SemanticProjection) {
  projection.digest = semanticProjectionDigest(projection);
  projection.id = `urn:metamap:projection:${projection.digest.slice(7)}`;
}

describe("proof-carrying static expressions", () => {
  it("binds the actual semantic generation, consumer and spec with a complete proof closure", () => {
    const inputs = semanticFixture();
    const saved = structuredClone({ graph: inputs.graph, spec: inputs.spec });
    const generation = inputs.generation();
    const result = compileProjection(inputs.graph, generation, inputs.spec);
    expect(result.status, JSON.stringify(result)).toBe("projected");
    if (result.status !== "projected") return;
    const projection = result.projection;
    expect(projection.generation).toEqual({
      id: generation.id,
      digest: generation.digest,
    });
    expect(projection.spec.digest).toBe(canonicalDigest(inputs.spec));
    expect(projection.semantic.consumer).toBe(inputs.spec.consumer);
    expect(projection.entries[0].slots[0].mappings).toEqual([
      inputs.proposal.mapping.id,
    ]);
    expect(projection.semantic.usedMappings).toEqual([
      "urn:example:consumer-schema",
      "urn:example:consumer-service",
      "urn:example:service-schema",
    ]);
    expect(projection.semantic.derivations).toEqual([
      {
        id: inputs.proposal.derivation.id,
        digest: inputs.proposal.derivation.digest,
      },
    ]);
    expect(projection.semantic.risk).toMatchObject({
      status: "not-evaluated",
      budget: null,
      totalCost: null,
      classifications: [],
      inferredMappings: [inputs.proposal.mapping.id],
    });
    expect(projection.semantic.risk.uncertainty).toHaveLength(3);
    expect(validateSemanticProjection(projection)).toEqual({
      valid: true,
      issues: [],
    });
    expect(parseSemanticProjectionJson(JSON.stringify(projection))).toEqual(
      projection,
    );
    expect(Object.isFrozen(projection.semantic.dependencies)).toBe(true);
    expect({ graph: inputs.graph, spec: inputs.spec }).toEqual(saved);
  });
  it("counts a shared mapping closure once across slots and excludes unused or inactive mappings", () => {
    const inputs = semanticFixture();
    inputs.graph.entities.push({
      id: "urn:example:unused",
      kind: "configuration",
    });
    inputs.graph.mappings.push({
      id: "urn:example:unused-link",
      relation: "example:depends",
      sources: ["urn:example:unused"],
      targets: ["urn:example:schema"],
      cardinality: "one-to-one",
      lossiness: "lossless",
      provenance: { status: "declared", assertedBy: "source-owner" },
    });
    inputs.graph.mappings.push({
      ...structuredClone(inputs.graph.mappings[3]),
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
    inputs.spec.slots.push({ ...inputs.spec.slots[0], name: "sameSchema" });
    inputs.rebind();
    const result = compileProjection(
      inputs.graph,
      inputs.generation(),
      inputs.spec,
    );
    expect(result.status, JSON.stringify(result)).toBe("projected");
    if (result.status !== "projected") return;
    expect(result.projection.semantic.usedMappings).toHaveLength(3);
    expect(result.projection.semantic.usedMappings).not.toContain(
      "urn:example:unused-link",
    );
    expect(result.projection.semantic.usedMappings).not.toContain(
      "urn:example:inactive-link",
    );
  });
  it("rejects a stale graph and a substituted relation pack", () => {
    const inputs = semanticFixture(),
      generation = inputs.generation();
    inputs.graph.mappings[0].provenance.sourceRevision = "changed";
    expect(
      compileProjection(inputs.graph, generation, inputs.spec).status,
    ).toBe("rejected");
    const next = semanticFixture();
    const pack = structuredClone(next.pack);
    pack.description = "new semantics profile";
    expect(
      compileProjection(next.graph, next.generation(), next.spec, {
        relationRegistry: new RelationRegistry([coreRelationPack, pack]),
      }),
    ).toMatchObject({
      status: "rejected",
      issues: [{ code: "PROJECTION_PACK_BINDING_MISMATCH" }],
    });
  });
  it("rejects a rehashed generation with missing proof, changed context or incomplete dependencies", () => {
    const inputs = semanticFixture();
    for (const mutate of [
      (generation: ReturnType<typeof inputs.generation>) => {
        generation.semantic.derivations = [];
      },
      (generation: ReturnType<typeof inputs.generation>) => {
        generation.context.environment = "different";
      },
      (generation: ReturnType<typeof inputs.generation>) => {
        generation.semantic.dependencies.pop();
      },
      (generation: ReturnType<typeof inputs.generation>) => {
        generation.semantic.declarations = [];
      },
      (generation: ReturnType<typeof inputs.generation>) => {
        generation.semantic.declarations.push(
          generation.semantic.declarations[0],
        );
      },
    ]) {
      const generation = structuredClone(inputs.generation());
      mutate(generation);
      generation.digest = semanticGenerationDigest(generation);
      generation.id = `urn:metamap:generation:${generation.digest.slice(7)}`;
      expect(
        compileProjection(inputs.graph, generation, inputs.spec).status,
      ).toBe("rejected");
    }
  });
  it("rejects self-consistent projection hashes that conceal dependencies, proofs, or uncertainty", () => {
    const { projection } = projected();
    for (const mutate of [
      (value: SemanticProjection) => {
        value.semantic.dependencies.pop();
      },
      (value: SemanticProjection) => {
        value.semantic.derivations = [];
      },
      (value: SemanticProjection) => {
        value.semantic.risk.uncertainty.pop();
      },
      (value: SemanticProjection) => {
        value.semantic.risk.uncertainty[0].dimensions[0].status = "supported";
      },
      (value: SemanticProjection) => {
        value.semantic.risk.inferredMappings.push("urn:example:unused");
      },
    ]) {
      const value = structuredClone(projection);
      mutate(value);
      rehash(value);
      expect(validateSemanticProjection(value).valid).toBe(false);
    }
  });
  it("requires an explicit budget decision and rejects a requested missing budget", () => {
    const inputs = semanticFixture();
    expect(() =>
      parseSemanticProjectionSpecJson(
        JSON.stringify({ ...inputs.spec, budget: undefined }),
      ),
    ).toThrow();
    inputs.spec.budget = "urn:example:risk-budget";
    expect(
      compileProjection(inputs.graph, inputs.generation(), inputs.spec),
    ).toMatchObject({
      status: "rejected",
      issues: [{ code: "MISSING_CONSUMER_BUDGET" }],
    });
  });
  it("rejects mixed contract versions instead of interpreting a proof through the legacy profile", () => {
    const inputs = semanticFixture(),
      generation = inputs.generation();
    expect(
      compileProjection(inputs.graph, generation, {
        ...inputs.spec,
        schemaVersion: "1.0.0",
      } as unknown as MetamapProjectionSpec),
    ).toMatchObject({
      status: "rejected",
      issues: [{ code: "PROJECTION_VERSION_MISMATCH" }],
    });
    expect(
      compileProjection(
        inputs.graph,
        generation as unknown as ViableGeneration,
        inputs.spec,
      ).status,
    ).toBe("projected");
  });
  it("binds nested path trees to the actual projection and preserves parameter hydration", () => {
    const { projection, spec } = projected();
    const result = compilePathTree(projection, spec);
    expect(result.status, JSON.stringify(result)).toBe("projected");
    if (result.status !== "projected") return;
    expect(result.pathTree.projection).toEqual({
      id: projection.id,
      digest: projection.digest,
    });
    expect(result.pathTree.spec.digest).toBe(canonicalDigest(spec));
    expect(validateSemanticPathTree(result.pathTree)).toEqual({
      valid: true,
      issues: [],
    });
    expect(parseSemanticPathTreeJson(JSON.stringify(result.pathTree))).toEqual(
      result.pathTree,
    );
    expect(
      hydratePathTree(result.pathTree.tree, { networkId: "42" }).network,
    ).toMatchObject({
      ":networkId": { _: "/network/42", $: { id: "urn:example:consumer" } },
    });
    expect(result.pathTree.tree.network).toMatchObject({
      ":networkId": { _: "/network/:networkId" },
    });
    expect(emitTypeScriptPathTree(result.pathTree)).toContain(
      result.pathTree.id,
    );
    expect(emitTypeScriptProjection(projection)).toContain(projection.id);
    const tampered = structuredClone(result.pathTree);
    tampered.projection.digest = `sha256:${"0".repeat(64)}`;
    expect(validateSemanticPathTree(tampered).valid).toBe(false);
    tampered.digest = semanticPathTreeDigest(tampered);
    tampered.id = `urn:metamap:path-tree:${tampered.digest.slice(7)}`;
    // Shape/hash validation records a new value; it does not authenticate it.
    expect(validateSemanticPathTree(tampered).valid).toBe(true);
  });
  it("rejects a changed tree specification and mixed tree versions", () => {
    const { projection, spec } = projected();
    expect(
      compilePathTree(projection, {
        ...spec,
        consumer: "urn:example:other-consumer",
      }),
    ).toMatchObject({
      status: "rejected",
      issues: [{ code: "PATH_TREE_SPEC_DIGEST_MISMATCH" }],
    });
    expect(
      compilePathTree(projection, {
        ...spec,
        schemaVersion: "1.0.0",
      } as unknown as MetamapProjectionSpec),
    ).toMatchObject({
      status: "rejected",
      issues: [{ code: "PATH_TREE_VERSION_MISMATCH" }],
    });
  });
  it("rejects duplicate decoded keys in new projection and tree readers", () => {
    const { projection, spec } = projected();
    expect(() =>
      parseSemanticProjectionSpecJson(
        JSON.stringify(spec).replace(
          '"budget":null',
          '"budget":null,"budg\\u0065t":null',
        ),
      ),
    ).toThrow(/Duplicate/);
    expect(() =>
      parseSemanticProjectionJson(
        JSON.stringify(projection).replace(
          '"schemaVersion":"2.0.0"',
          '"schemaVersion":"2.0.0","schemaVersion":"2.0.0"',
        ),
      ),
    ).toThrow(/Duplicate/);
    const tree = compilePathTree(projection, spec);
    if (tree.status !== "projected") throw new Error(JSON.stringify(tree));
    expect(() =>
      parseSemanticPathTreeJson(
        JSON.stringify(tree.pathTree).replace(
          '"schemaVersion":"2.0.0"',
          '"schemaVersion":"2.0.0","schemaVersion":"2.0.0"',
        ),
      ),
    ).toThrow(/Duplicate/);
  });
});
