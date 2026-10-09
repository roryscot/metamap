import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RelationRegistry } from "../relations.js";
import { compileMetamap } from "../viability.js";
import {
  compileProjection,
  type MetamapProjectionSpec,
} from "../projection.js";
import { compilePathTree } from "../path-tree.js";
import { contentDigest, valueDigest } from "../stable.js";
import type { MetamapDocument, RelationPack } from "../model.js";
import type {
  EvaluationContext,
  MetamapViabilityPolicy,
} from "../viability-model.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => readFileSync(resolve(root, path));
const json = <T>(path: string): T =>
  JSON.parse(read(path).toString("utf8")) as T;
const manifest = json<{
  schemaBytes: Array<{ path: string; digest: string }>;
  cases: Array<{
    id: string;
    graph: string;
    policy: string;
    packs: string[];
    spec?: string;
    context: EvaluationContext;
    evaluatedAt: string;
    inputs: Array<{ path: string; valueDigest: string }>;
    generationDigest: string;
    generationValueDigest: string;
    projectionDigest?: string;
    projectionValueDigest?: string;
    pathTreeDigest?: string;
  }>;
}>("evaluation/legacy-compatibility.json");

describe("published legacy contract compatibility", () => {
  it("preserves every existing schema and relation-pack byte identity", () => {
    for (const pin of manifest.schemaBytes)
      expect(contentDigest(read(pin.path)), pin.path).toBe(pin.digest);
  });

  it.each(manifest.cases)(
    "preserves $id inputs and deterministic compiled identities",
    (fixture) => {
      for (const pin of fixture.inputs)
        expect(valueDigest(json(pin.path)), pin.path).toBe(pin.valueDigest);
      const registry = new RelationRegistry();
      for (const path of fixture.packs)
        registry.registerPack(json<RelationPack>(path));
      const graph = json<MetamapDocument>(fixture.graph);
      const compiled = compileMetamap(
        graph,
        json<MetamapViabilityPolicy>(fixture.policy),
        {
          context: fixture.context,
          evaluatedAt: fixture.evaluatedAt,
          relationRegistry: registry,
        },
      );
      expect(compiled.status).toBe("viable");
      if (compiled.status !== "viable")
        throw new Error(JSON.stringify(compiled.issues));
      expect(compiled.generation.digest).toBe(fixture.generationDigest);
      expect(valueDigest(compiled.generation)).toBe(
        fixture.generationValueDigest,
      );
      if (!fixture.spec) return;
      const spec = json<MetamapProjectionSpec>(fixture.spec);
      const projected = compileProjection(graph, compiled.generation, spec, {
        relationRegistry: registry,
      });
      expect(projected.status).toBe("projected");
      if (projected.status !== "projected")
        throw new Error(JSON.stringify(projected.issues));
      expect(projected.projection.digest).toBe(fixture.projectionDigest);
      expect(valueDigest(projected.projection)).toBe(
        fixture.projectionValueDigest,
      );
      if (fixture.pathTreeDigest) {
        const tree = compilePathTree(projected.projection, spec);
        expect(tree.status).toBe("projected");
        if (tree.status !== "projected")
          throw new Error(JSON.stringify(tree.issues));
        expect(tree.pathTree.digest).toBe(fixture.pathTreeDigest);
      }
    },
  );
});
