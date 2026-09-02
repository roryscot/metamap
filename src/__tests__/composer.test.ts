import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  composeMetamapDocuments,
  MetamapCompositionError,
} from "../composer.js";
import { MetamapGraph } from "../graph.js";
import type { MetamapDocument } from "../model.js";

function readExample(): MetamapDocument {
  return JSON.parse(
    readFileSync(
      new URL("../../examples/example-authority-graph.json", import.meta.url),
      "utf8",
    ),
  ) as MetamapDocument;
}

describe("metamap composition", () => {
  it("composes shards before resolving cross-shard references", () => {
    const example = readExample();
    const left: MetamapDocument = {
      ...example,
      id: "urn:example:metamap:prisma-shard",
      entities: example.entities.slice(0, 4),
      mappings: example.mappings.slice(0, 1),
      authorities: example.authorities,
    };
    const right: MetamapDocument = {
      ...example,
      id: "urn:example:metamap:typescript-shard",
      entities: [example.entities[4]],
      mappings: example.mappings.slice(1),
      authorities: [],
    };

    const composed = composeMetamapDocuments([left, right], {
      id: "urn:example:metamap:composed",
      namespace: "example",
    });
    const graph = new MetamapGraph(composed);

    expect(
      graph.getEntity("urn:example:element:zod.UserSchema.email"),
    ).toBeDefined();
    expect(composed.metadata?.composedFrom).toEqual([left.id, right.id]);
  });

  it("rejects conflicting definitions for the same semantic identity", () => {
    const example = readExample();
    const conflict = structuredClone(example);
    conflict.id = "urn:example:metamap:conflicting-shard";
    conflict.entities[0].label = "A conflicting label";

    expect(() =>
      composeMetamapDocuments([example, conflict], {
        id: "urn:example:metamap:composed",
        namespace: "example",
      }),
    ).toThrow(MetamapCompositionError);
  });
});
