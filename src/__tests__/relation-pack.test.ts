import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RelationPack } from "../model.js";
import { coreRelationPack } from "../relations.js";

describe("core relation pack", () => {
  it("keeps the portable JSON pack aligned with the TypeScript registry", () => {
    const portable = JSON.parse(
      readFileSync(
        new URL("../../relation-packs/core.json", import.meta.url),
        "utf8",
      ),
    ) as RelationPack;

    const semantics = (pack: RelationPack) =>
      pack.relations.map((relation) => ({
        id: relation.id,
        cardinalities: relation.cardinalities,
        cyclePolicy: relation.cyclePolicy,
        transitive: relation.transitive,
        symmetric: relation.symmetric,
        impactDirection: relation.impactDirection,
      }));

    expect(portable.id).toBe(coreRelationPack.id);
    expect(portable.version).toBe(coreRelationPack.version);
    expect(semantics(portable)).toEqual(semantics(coreRelationPack));
  });
});
