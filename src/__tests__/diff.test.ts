import { describe, expect, it } from "vitest";
import { diffMetamapDocuments } from "../diff.js";
import { METAMAP_SCHEMA_VERSION, type MetamapDocument } from "../model.js";

function document(): MetamapDocument {
  return {
    schemaVersion: METAMAP_SCHEMA_VERSION,
    id: "urn:test:graph:one",
    namespace: "test",
    entities: [{ id: "urn:test:entity:one", kind: "test", label: "one" }],
    mappings: [],
    authorities: [],
  };
}

describe("graph diff", () => {
  it("detects added, removed, and changed records by stable identity", () => {
    const before = document();
    const after = structuredClone(before);
    after.entities[0].label = "changed";
    after.entities.push({ id: "urn:test:entity:two", kind: "test" });
    before.mappings.push({
      id: "urn:test:mapping:removed",
      relation: "core:references",
      sources: ["urn:test:entity:one"],
      targets: ["urn:test:entity:one"],
      cardinality: "one-to-one",
      lossiness: "unknown",
      provenance: { status: "declared", assertedBy: "test" },
    });

    const diff = diffMetamapDocuments(before, after);
    expect(diff.counts).toEqual({ added: 1, removed: 1, changed: 1 });
    expect(diff.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          change: "changed",
          changedProperties: ["label"],
        }),
      ]),
    );
  });
});
