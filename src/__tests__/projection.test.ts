import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MetamapDocument, RelationPack } from "../model.js";
import {
  compileProjection,
  emitTypeScriptProjection,
  type MetamapProjectionSpec,
  validateProjection,
  validateProjectionSpec,
} from "../projection.js";
import { RelationRegistry } from "../relations.js";
import { compileMetamap } from "../viability.js";
import type { MetamapViabilityPolicy } from "../viability-model.js";

const evaluatedAt = "2026-09-02T00:00:00.000Z";

function registry(): RelationRegistry {
  const routing = JSON.parse(
    readFileSync(
      new URL("../../relation-packs/routing.json", import.meta.url),
      "utf8",
    ),
  ) as RelationPack;
  const result = new RelationRegistry();
  result.registerPack(routing);
  return result;
}

function provenance() {
  return { status: "declared" as const, assertedBy: "test:projection" };
}

function document(): MetamapDocument {
  return {
    schemaVersion: "2.0.0",
    id: "urn:test:graph:routing",
    namespace: "test",
    revision: "test-1",
    relationPacks: [
      {
        id: "urn:metamap:relation-pack:core",
        version: "1.0.0",
      },
      {
        id: "urn:metamap:relation-pack:routing",
        version: "1.0.0",
      },
    ],
    entities: [
      {
        id: "urn:test:command:create-user",
        kind: "routing:command",
        label: "Create user",
      },
      {
        id: "urn:test:handler:create-user",
        kind: "routing:handler",
        locators: [{ uri: "typescript:src/handlers.ts#handleCreateUser" }],
      },
      {
        id: "urn:test:schema:create-user",
        kind: "routing:schema",
        locators: [{ uri: "json-schema:schemas/create-user.json" }],
      },
      {
        id: "urn:test:policy:administrators",
        kind: "routing:policy",
      },
    ],
    mappings: [
      {
        id: "urn:test:mapping:create-user-handler",
        relation: "routing:handled_by",
        sources: ["urn:test:command:create-user"],
        targets: ["urn:test:handler:create-user"],
        cardinality: "one-to-one",
        lossiness: "lossless",
        provenance: provenance(),
      },
      {
        id: "urn:test:mapping:create-user-input",
        relation: "routing:accepts",
        sources: ["urn:test:command:create-user"],
        targets: ["urn:test:schema:create-user"],
        cardinality: "one-to-one",
        lossiness: "lossless",
        provenance: provenance(),
      },
      {
        id: "urn:test:mapping:create-user-policy",
        relation: "routing:authorized_by",
        sources: ["urn:test:command:create-user"],
        targets: ["urn:test:policy:administrators"],
        cardinality: "one-to-one",
        lossiness: "lossless",
        provenance: provenance(),
      },
    ],
    authorities: [],
  };
}

function policy(graph: MetamapDocument): MetamapViabilityPolicy {
  return {
    schemaVersion: "1.0.0",
    id: "urn:test:policy:routing",
    graph: { id: graph.id, revision: graph.revision },
    mappings: graph.mappings.map((mapping) => ({
      mapping: mapping.id,
      coverage: "total",
      determinism: "deterministic",
      reversibility: "irreversible",
    })),
    constraints: [],
    evidence: [],
  };
}

function spec(): MetamapProjectionSpec {
  return {
    schemaVersion: "1.0.0",
    id: "urn:test:projection:commands",
    select: { kinds: ["routing:command"] },
    slots: [
      {
        name: "handler",
        relation: "routing:handled_by",
        direction: "outgoing",
        cardinality: "exactly-one",
        targetKinds: ["routing:handler"],
      },
      {
        name: "input",
        relation: "routing:accepts",
        direction: "outgoing",
        cardinality: "exactly-one",
        targetKinds: ["routing:schema"],
      },
      {
        name: "policy",
        relation: "routing:authorized_by",
        direction: "outgoing",
        cardinality: "exactly-one",
        targetKinds: ["routing:policy"],
      },
    ],
  };
}

function viableGeneration(graph: MetamapDocument) {
  const compilation = compileMetamap(graph, policy(graph), {
    evaluatedAt,
    relationRegistry: registry(),
  });
  expect(compilation.status, JSON.stringify(compilation, null, 2)).toBe(
    "viable",
  );
  if (compilation.status !== "viable") throw new Error("fixture is invalid");
  return compilation.generation;
}

describe("static projection compiler", () => {
  it("compiles an immutable, content-addressed routing table", () => {
    const graph = document();
    const generation = viableGeneration(graph);
    const first = compileProjection(graph, generation, spec(), {
      relationRegistry: registry(),
    });
    const second = compileProjection(graph, generation, spec(), {
      relationRegistry: registry(),
    });

    expect(first.status).toBe("projected");
    expect(second).toEqual(first);
    if (first.status !== "projected") return;
    expect(first.projection.entries[0].slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "handler",
          targets: [
            expect.objectContaining({ id: "urn:test:handler:create-user" }),
          ],
        }),
      ]),
    );
    expect(validateProjection(first.projection).valid).toBe(true);
    expect(Object.isFrozen(first.projection)).toBe(true);
    expect(Object.isFrozen(first.projection.entries)).toBe(true);
  });

  it("emits a typed dependency-free TypeScript lookup", () => {
    const graph = document();
    const result = compileProjection(graph, viableGeneration(graph), spec(), {
      relationRegistry: registry(),
    });
    expect(result.status).toBe("projected");
    if (result.status !== "projected") return;
    const source = emitTypeScriptProjection(result.projection, {
      exportName: "commandRoutes",
    });
    expect(source).toContain("export const commandRoutes");
    expect(source).toContain("export type CommandRoutesId");
    expect(source).toContain('"urn:test:command:create-user"');
    expect(source).toContain("Unknown Metamap identity");
    expect(() =>
      emitTypeScriptProjection(result.projection, { exportName: "class" }),
    ).toThrow("not a valid TypeScript export identifier");
  });

  it("emits enum-like identity unions without relation slots", () => {
    const graph = document();
    const identitySpec = spec();
    identitySpec.slots = [];
    const result = compileProjection(
      graph,
      viableGeneration(graph),
      identitySpec,
      { relationRegistry: registry() },
    );
    expect(result.status).toBe("projected");
    if (result.status !== "projected") return;
    expect(result.projection.entries[0].slots).toEqual([]);
    expect(
      emitTypeScriptProjection(result.projection, {
        exportName: "commandKinds",
      }),
    ).toContain("export type CommandKindsId");
  });

  it("rejects stale generations and ambiguous handler resolution", () => {
    const graph = document();
    const staleGeneration = viableGeneration(graph);
    graph.entities[0].label = "Create an account";
    expect(
      compileProjection(graph, staleGeneration, spec(), {
        relationRegistry: registry(),
      }),
    ).toEqual(
      expect.objectContaining({
        status: "rejected",
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "STALE_PROJECTION_GENERATION" }),
        ]),
      }),
    );

    const ambiguous = document();
    ambiguous.entities.push({
      id: "urn:test:handler:create-user-v2",
      kind: "routing:handler",
    });
    ambiguous.mappings.push({
      id: "urn:test:mapping:create-user-handler-v2",
      relation: "routing:handled_by",
      sources: ["urn:test:command:create-user"],
      targets: ["urn:test:handler:create-user-v2"],
      cardinality: "one-to-one",
      lossiness: "lossless",
      provenance: provenance(),
    });
    expect(
      compileProjection(ambiguous, viableGeneration(ambiguous), spec(), {
        relationRegistry: registry(),
      }),
    ).toEqual(
      expect.objectContaining({
        status: "rejected",
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "AMBIGUOUS_PROJECTION_TARGET" }),
        ]),
      }),
    );
  });

  it("rejects inactive required links, disallowed target kinds, and lossy links", () => {
    const inactiveGraph = document();
    const inactivePolicy = policy(inactiveGraph);
    inactivePolicy.mappings[0].applicability = {
      when: { key: "feature", operator: "equals", value: true },
    };
    const compilation = compileMetamap(inactiveGraph, inactivePolicy, {
      evaluatedAt,
      context: { feature: false },
      relationRegistry: registry(),
    });
    expect(compilation.status).toBe("viable");
    if (compilation.status !== "viable") return;
    expect(
      compileProjection(inactiveGraph, compilation.generation, spec(), {
        relationRegistry: registry(),
      }),
    ).toEqual(
      expect.objectContaining({
        status: "rejected",
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: "REQUIRED_PROJECTION_TARGET_MISSING",
          }),
        ]),
      }),
    );

    const wrongKindSpec = spec();
    wrongKindSpec.slots[0].targetKinds = ["routing:policy"];
    const wrongKindGraph = document();
    expect(
      compileProjection(
        wrongKindGraph,
        viableGeneration(wrongKindGraph),
        wrongKindSpec,
        {
          relationRegistry: registry(),
        },
      ),
    ).toEqual(
      expect.objectContaining({
        status: "rejected",
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "PROJECTION_TARGET_KIND_MISMATCH" }),
        ]),
      }),
    );

    const lossy = document();
    lossy.mappings[0].lossiness = "lossy";
    const lossyResult = compileProjection(
      lossy,
      viableGeneration(lossy),
      spec(),
      {
        relationRegistry: registry(),
      },
    );
    expect(lossyResult).toEqual(
      expect.objectContaining({
        status: "rejected",
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "LOSSY_PROJECTION_LINK" }),
        ]),
      }),
    );
  });

  it("validates duplicate slots before compilation", () => {
    const duplicate = spec();
    duplicate.slots.push({ ...duplicate.slots[0] });
    expect(validateProjectionSpec(duplicate)).toEqual(
      expect.objectContaining({
        valid: false,
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "DUPLICATE_PROJECTION_SLOT" }),
        ]),
      }),
    );
  });
});
