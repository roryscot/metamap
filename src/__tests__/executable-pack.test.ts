import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExecutableRelationPack, LegacyRelationPack } from "../model.js";
import {
  loadRelationPack,
  parseRelationPack,
  relationPackDigest,
} from "../relation-pack.js";
import { coreRelationPack, RelationRegistry } from "../relations.js";
import { valueDigest } from "../stable.js";

function pack(): ExecutableRelationPack {
  return {
    schemaVersion: "2.0.0",
    id: "urn:pack:executable",
    version: "1",
    imports: [
      {
        id: coreRelationPack.id,
        version: coreRelationPack.version,
        digest: valueDigest(coreRelationPack),
      },
    ],
    relations: [],
    laws: [
      {
        id: "urn:law:contains",
        operation: "chain",
        operands: ["core:contains", "core:contains"],
        resultRelation: "core:contains",
        handling: {
          authority: "none",
          lossiness: "conservative",
          uncertainty: "conservative",
        },
      },
    ],
  };
}
describe("explicit executable pack profile", () => {
  it("requires the exact declared imports and freezes a copied executable definition", () => {
    const source = pack();
    const registry = new RelationRegistry([coreRelationPack, source]);
    expect(registry.getLaw("urn:law:contains")!.pack).not.toBe(source);
    const digest = relationPackDigest(source);
    source.description = "caller mutated";
    expect(relationPackDigest(registry.getLaw("urn:law:contains")!.pack)).toBe(
      digest,
    );
    expect(Object.isFrozen(registry.getLaw("urn:law:contains")!.law)).toBe(
      true,
    );
    expect(() => new RelationRegistry([source])).toThrow(/Missing exact/);
  });
  it("retains the original legacy pack digest convention", () => {
    expect(relationPackDigest(coreRelationPack)).toBe(
      valueDigest(coreRelationPack),
    );
  });
  it.each([
    (value: ExecutableRelationPack) => {
      value.laws[0].operands = ["core:contains"] as unknown as [string, string];
    },
    (value: ExecutableRelationPack) => {
      (value.laws[0] as unknown as { operation: string }).operation =
        "run-script";
    },
    (value: ExecutableRelationPack) => {
      (value.laws[0].handling as unknown as { authority: string }).authority =
        "transfer";
    },
    (value: ExecutableRelationPack) => {
      (
        value as unknown as { newMandatoryFeature: boolean }
      ).newMandatoryFeature = true;
    },
  ])("rejects unsupported law shape %s", (edit) => {
    const value = pack();
    edit(value);
    expect(() => parseRelationPack(value)).toThrow(/portable schema/);
  });
  it("rejects law references outside explicitly imported definitions", () => {
    const value = pack();
    value.imports = [];
    expect(() => new RelationRegistry([coreRelationPack, value])).toThrow(
      /outside/,
    );
  });
  it("rejects missing, changed, repeated and self imports", () => {
    const value = pack();
    value.imports = [
      { ...value.imports![0], digest: `sha256:${"0".repeat(64)}` },
    ];
    expect(() => new RelationRegistry([coreRelationPack, value])).toThrow(
      /Missing exact/,
    );
    value.imports = [pack().imports![0], pack().imports![0]];
    expect(() => new RelationRegistry([coreRelationPack, value])).toThrow();
    value.imports = [
      {
        id: value.id,
        version: value.version,
        digest: relationPackDigest(value),
      },
    ];
    expect(() => new RelationRegistry([coreRelationPack, value])).toThrow(
      /self-imported/,
    );
  });
  it("detects a legacy dependency object drifting after executable registration", () => {
    const legacy = JSON.parse(
      JSON.stringify(coreRelationPack),
    ) as LegacyRelationPack;
    const value = pack();
    value.imports = [
      {
        id: legacy.id,
        version: legacy.version,
        digest: relationPackDigest(legacy),
      },
    ];
    const registry = new RelationRegistry([legacy, value]);
    legacy.description = "drifted";
    expect(() => registry.getLaw("urn:law:contains")).toThrow(/Missing exact/);
  });
  it("checks a nested executable dependency's exact legacy import", () => {
    const legacy = JSON.parse(
      JSON.stringify(coreRelationPack),
    ) as LegacyRelationPack;
    const inner = pack();
    inner.imports = [
      {
        id: legacy.id,
        version: legacy.version,
        digest: relationPackDigest(legacy),
      },
    ];
    const outer: ExecutableRelationPack = {
      schemaVersion: "2.0.0",
      id: "urn:pack:outer",
      version: "1",
      imports: [
        {
          id: inner.id,
          version: inner.version,
          digest: relationPackDigest(inner),
        },
      ],
      relations: [],
      laws: [],
    };
    const registry = new RelationRegistry([legacy, inner, outer]);
    legacy.description = "changed at depth two";
    // Validating all executable profile laws also validates the dependency closure.
    expect(() => registry.getLaw("urn:law:contains")).toThrow(/Missing exact/);
    const value = JSON.parse(JSON.stringify(outer)) as ExecutableRelationPack;
    expect(() => registry.registerPack(value)).toThrow(/Missing exact/);
  });
  it("requires unconditional executable laws for a new transitive/symmetric/inverse claim", () => {
    for (const property of ["transitive", "symmetric"] as const) {
      const value = pack();
      value.relations = [
        { id: "example:r", cyclePolicy: "allow", [property]: true },
      ];
      expect(() => new RelationRegistry([coreRelationPack, value])).toThrow(
        /needs an executable/,
      );
    }
    const value = pack();
    value.relations = [
      { id: "example:r", cyclePolicy: "allow", inverse: "core:contains" },
    ];
    expect(() => new RelationRegistry([coreRelationPack, value])).toThrow(
      /needs a referenced inverse/,
    );
    value.relations = [
      {
        id: "example:r",
        cyclePolicy: "allow",
        composesWith: ["core:contains"],
      },
    ];
    expect(() => new RelationRegistry([coreRelationPack, value])).toThrow(
      /needs an executable chain/,
    );
    value.relations = [
      { id: "example:r", cyclePolicy: "allow", transitive: true },
    ];
    value.laws = [
      {
        ...pack().laws[0],
        operation: "chain",
        operands: ["example:r", "example:r"],
        resultRelation: "example:r",
        conditions: { context: { key: "special", operator: "exists" } },
      },
    ];
    expect(() => new RelationRegistry([coreRelationPack, value])).toThrow(
      /needs an executable chain/,
    );
  });
  it("rejects transitivity contradicted by the relation and impossible endpoint kinds", () => {
    const value = pack();
    value.relations = [
      { id: "example:r", cyclePolicy: "allow", transitive: false },
    ];
    value.laws = [
      {
        ...pack().laws[0],
        operation: "chain",
        operands: ["example:r", "example:r"],
        resultRelation: "example:r",
      },
    ];
    expect(() => new RelationRegistry([coreRelationPack, value])).toThrow(
      /non-transitivity/,
    );
    value.relations = [
      {
        id: "example:r",
        cyclePolicy: "allow",
        sourceKinds: ["left"],
        targetKinds: ["right"],
      },
    ];
    expect(() => new RelationRegistry([coreRelationPack, value])).toThrow(
      /incompatible chain/,
    );
  });
  it("rejects duplicate law IDs and does not partially register a rejected pack", () => {
    const value = pack();
    value.laws = [value.laws[0], value.laws[0]];
    const registry = new RelationRegistry();
    expect(() => registry.registerPack(value)).toThrow(/Duplicate law/);
    expect(registry.hasPack(value.id)).toBe(false);
    expect(registry.getLaw("urn:law:contains")).toBeUndefined();
    const duplicate: LegacyRelationPack = {
      schemaVersion: "1.0.0",
      id: "urn:duplicate",
      version: "1",
      relations: [
        { id: "example:new", cyclePolicy: "allow" },
        { id: "core:contains", cyclePolicy: "allow" },
      ],
    };
    expect(() => registry.registerPack(duplicate)).toThrow(
      /already registered/,
    );
    expect(registry.get("example:new")).toBeUndefined();
  });
  it("rejects duplicate decoded JSON properties when loading an executable pack", async () => {
    const directory = await mkdtemp(join(tmpdir(), "metamap-pack-test-"));
    try {
      const file = join(directory, "pack.json");
      await writeFile(
        file,
        JSON.stringify(pack()).replace(
          '"version":"1"',
          '"version":"1","versio\\u006e":"2"',
        ),
      );
      await expect(loadRelationPack(file)).rejects.toThrow(/Duplicate JSON/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
