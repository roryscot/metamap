import { describe, expect, it } from "vitest";
import type { MetamapDocument } from "../model.js";
import {
  compilePathTree,
  emitTypeScriptPathTree,
  hydratePathTree,
  validatePathTree,
} from "../path-tree.js";
import {
  compileProjection,
  type MetamapProjectionSpec,
} from "../projection.js";
import { RelationRegistry } from "../relations.js";
import { compileMetamap } from "../viability.js";
import type { MetamapViabilityPolicy } from "../viability-model.js";

const evaluatedAt = "2026-09-15T00:00:00.000Z";

function provenance() {
  return { status: "declared" as const, assertedBy: "test:path-tree" };
}

function document(): MetamapDocument {
  return {
    schemaVersion: "2.0.0",
    id: "urn:test:graph:path-tree",
    namespace: "test",
    revision: "test-1",
    relationPacks: [{ id: "urn:metamap:relation-pack:core", version: "1.0.0" }],
    entities: [
      {
        id: "urn:test:route:auth",
        kind: "routing:route",
        label: "Auth",
        attributes: { path: "/auth" },
      },
      {
        id: "urn:test:route:auth-sign-in",
        kind: "routing:route",
        label: "Sign in",
        attributes: { path: "/auth/sign_in" },
      },
      {
        id: "urn:test:route:event",
        kind: "routing:route",
        attributes: { path: "/event/:eventId" },
      },
      {
        id: "urn:test:route:event-cast",
        kind: "routing:route",
        attributes: { path: "/event/:eventId/cast" },
      },
      {
        id: "urn:test:handler:sign-in",
        kind: "routing:handler",
      },
    ],
    mappings: [
      {
        id: "urn:test:mapping:sign-in-handler",
        relation: "core:exposes",
        sources: ["urn:test:route:auth-sign-in"],
        targets: ["urn:test:handler:sign-in"],
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
    id: "urn:test:policy:path-tree",
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
    id: "urn:test:projection:path-tree",
    select: { kinds: ["routing:route"] },
    pathTree: { attribute: "path" },
    slots: [
      {
        name: "handler",
        relation: "core:exposes",
        direction: "outgoing",
        cardinality: "zero-or-one",
      },
    ],
  };
}

function viableGeneration(graph: MetamapDocument) {
  const compilation = compileMetamap(graph, policy(graph), { evaluatedAt });
  expect(compilation.status, JSON.stringify(compilation, null, 2)).toBe(
    "viable",
  );
  if (compilation.status !== "viable") throw new Error("fixture is invalid");
  return compilation.generation;
}

function compiledProjection(graph = document()) {
  const projection = compileProjection(graph, viableGeneration(graph), spec(), {
    relationRegistry: new RelationRegistry(),
  });
  expect(projection.status).toBe("projected");
  if (projection.status !== "projected") throw new Error("projection failed");
  return projection.projection;
}

describe("nested path-tree compiler", () => {
  it("compiles a nested tree with _ paths and $ occupants", () => {
    const first = compilePathTree(compiledProjection(), spec());
    const second = compilePathTree(compiledProjection(), spec());
    expect(first.status).toBe("projected");
    expect(second).toEqual(first);
    if (first.status !== "projected") return;
    expect(validatePathTree(first.pathTree).valid).toBe(true);
    expect(first.pathTree.params).toEqual([":eventId"]);
    expect(first.pathTree.tree._).toBe("/");
    expect(first.pathTree.tree.auth).toEqual(
      expect.objectContaining({
        _: "/auth",
        $: expect.objectContaining({ id: "urn:test:route:auth" }),
        sign_in: expect.objectContaining({
          _: "/auth/sign_in",
          $: expect.objectContaining({
            id: "urn:test:route:auth-sign-in",
            slots: {
              handler: expect.objectContaining({
                id: "urn:test:handler:sign-in",
              }),
            },
          }),
        }),
      }),
    );
    expect(first.pathTree.tree.event).toEqual(
      expect.objectContaining({
        _: "/event",
        ":eventId": expect.objectContaining({
          _: "/event/:eventId",
          cast: expect.objectContaining({
            _: "/event/:eventId/cast",
          }),
        }),
      }),
    );
    expect(Object.isFrozen(first.pathTree)).toBe(true);
  });

  it("hydrates :params without mutating the compiled tree", () => {
    const compiled = compilePathTree(compiledProjection(), spec());
    expect(compiled.status).toBe("projected");
    if (compiled.status !== "projected") return;
    const eventNode = compiled.pathTree.tree.event as {
      [key: string]: { _: string };
    };
    const original = eventNode[":eventId"];
    expect(original._).toBe("/event/:eventId");
    const hydrated = hydratePathTree(compiled.pathTree.tree, {
      eventId: "42",
    });
    expect(hydrated.event).toEqual(
      expect.objectContaining({
        _: "/event",
        ":eventId": expect.objectContaining({
          _: "/event/42",
          cast: expect.objectContaining({ _: "/event/42/cast" }),
        }),
      }),
    );
    expect(original._).toBe("/event/:eventId");
    expect(() => hydratePathTree(compiled.pathTree.tree, {})).toThrow(
      "Missing path parameter :eventId",
    );
    expect(() =>
      hydratePathTree(compiled.pathTree.tree, { eventId: "a/b" }),
    ).toThrow("Unsafe value");
  });

  it("emits a typed hydrate helper", () => {
    const compiled = compilePathTree(compiledProjection(), spec());
    expect(compiled.status).toBe("projected");
    if (compiled.status !== "projected") return;
    const source = emitTypeScriptPathTree(compiled.pathTree, {
      exportName: "routes",
    });
    expect(source).toContain("export const routes");
    expect(source).toContain("export const routesParams");
    expect(source).toContain("export function hydrateRoutes");
    expect(source).toContain('"/auth/sign_in"');
    expect(source).toContain('":eventId"');
  });

  it("hydrates catch-all and optional catch-all parameters", () => {
    const graph = document();
    graph.entities.push(
      {
        id: "urn:test:route:files",
        kind: "routing:route",
        attributes: { path: "/files/*path" },
      },
      {
        id: "urn:test:route:docs",
        kind: "routing:route",
        attributes: { path: "/docs/*slug?" },
      },
    );
    const compiled = compilePathTree(compiledProjection(graph), spec());
    expect(compiled.status).toBe("projected");
    if (compiled.status !== "projected") return;
    expect(compiled.pathTree.params).toEqual(["*path", "*slug?", ":eventId"]);
    const hydrated = hydratePathTree(compiled.pathTree.tree, {
      eventId: "42",
      path: "a/b",
    });
    expect(hydrated.files).toEqual(
      expect.objectContaining({
        "*path": expect.objectContaining({ _: "/files/a/b" }),
      }),
    );
    expect(hydrated.docs).toEqual(
      expect.objectContaining({
        "*slug?": expect.objectContaining({ _: "/docs" }),
      }),
    );
    expect(
      hydratePathTree(compiled.pathTree.tree, {
        eventId: "42",
        path: "a/b",
        slug: "guide/intro",
      }).docs,
    ).toEqual(
      expect.objectContaining({
        "*slug?": expect.objectContaining({ _: "/docs/guide/intro" }),
      }),
    );
    expect(() =>
      hydratePathTree(compiled.pathTree.tree, { eventId: "42" }),
    ).toThrow("Missing path parameter *path");
  });

  it("rejects missing paths, collisions, reserved segments, and undeclared pathTree", () => {
    const missingPath = document();
    delete missingPath.entities[0].attributes;
    const missingProjection = compileProjection(
      missingPath,
      viableGeneration(missingPath),
      spec(),
    );
    expect(missingProjection.status).toBe("projected");
    if (missingProjection.status !== "projected") return;
    expect(compilePathTree(missingProjection.projection, spec())).toEqual(
      expect.objectContaining({
        status: "rejected",
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "PATH_TREE_PATH_MISSING" }),
        ]),
      }),
    );

    const collision = document();
    collision.entities.push({
      id: "urn:test:route:auth-duplicate",
      kind: "routing:route",
      attributes: { path: "/auth" },
    });
    const collisionProjection = compileProjection(
      collision,
      viableGeneration(collision),
      spec(),
    );
    expect(collisionProjection.status).toBe("projected");
    if (collisionProjection.status !== "projected") return;
    expect(compilePathTree(collisionProjection.projection, spec())).toEqual(
      expect.objectContaining({
        status: "rejected",
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "PATH_TREE_COLLISION" }),
        ]),
      }),
    );

    const reserved = document();
    reserved.entities[0].attributes = { path: "/_" };
    const reservedSpec = spec();
    const reservedCompilation = compileMetamap(reserved, policy(reserved), {
      evaluatedAt,
    });
    expect(reservedCompilation.status).toBe("viable");
    if (reservedCompilation.status !== "viable") return;
    const reservedProjection = compileProjection(
      reserved,
      reservedCompilation.generation,
      reservedSpec,
    );
    expect(reservedProjection.status).toBe("projected");
    if (reservedProjection.status !== "projected") return;
    expect(
      compilePathTree(reservedProjection.projection, reservedSpec),
    ).toEqual(
      expect.objectContaining({
        status: "rejected",
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: expect.stringMatching(
              /PATH_TREE_RESERVED_SEGMENT|PATH_TREE_INVALID_PATH/,
            ),
          }),
        ]),
      }),
    );

    const noTree = spec();
    delete noTree.pathTree;
    expect(compilePathTree(compiledProjection(), noTree)).toEqual(
      expect.objectContaining({
        status: "rejected",
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "PATH_TREE_SPEC_MISSING" }),
        ]),
      }),
    );
  });
});
