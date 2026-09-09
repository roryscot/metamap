import { describe, expect, it } from "vitest";
import { parseMetamapConfig } from "../config.js";

function minimalConfig(): Record<string, unknown> {
  return {
    schemaVersion: "1.0.0",
    id: "urn:test:config",
    namespace: "test",
    repository: "fixture",
    repositoryRoot: ".",
    sources: [{ id: "db", adapter: "prisma", path: "schema.prisma" }],
    correspondences: [],
    outputs: {
      graph: "generated/graph.json",
      snapshot: "generated/snapshot.json",
      report: "generated/report.md",
      documentation: "generated/graph.md",
    },
  };
}

describe("workspace configuration", () => {
  it("enforces the complete portable schema at runtime", () => {
    const config = minimalConfig();
    config.outputs = {
      ...(config.outputs as Record<string, unknown>),
      unexpected: true,
    };

    expect(() => parseMetamapConfig(config)).toThrow(
      /does not match the portable schema/,
    );

    const builtInTypo = minimalConfig();
    builtInTypo.sources = [
      {
        id: "db",
        adapter: "prisma",
        path: "schema.prisma",
        unexpected: true,
      },
    ];
    expect(() => parseMetamapConfig(builtInTypo)).toThrow(
      /does not match the portable schema/,
    );
  });

  it("enforces semantic uniqueness and source references", () => {
    const duplicate = minimalConfig();
    duplicate.sources = [
      { id: "db", adapter: "prisma", path: "one.prisma" },
      { id: "db", adapter: "prisma", path: "two.prisma" },
    ];
    expect(() => parseMetamapConfig(duplicate)).toThrow(
      /Duplicate source id db/,
    );

    const unknownSource = minimalConfig();
    unknownSource.correspondences = [
      {
        id: "missing-source",
        source: { sourceId: "schemas", kind: "schema", name: "itemSchema" },
        target: { sourceId: "db", kind: "model", name: "Item" },
      },
    ];
    expect(() => parseMetamapConfig(unknownSource)).toThrow(
      /references unknown source schemas/,
    );
  });

  it("accepts exact reviewed Next.js topology exclusions", () => {
    const config = minimalConfig();
    config.sources = [
      {
        id: "web",
        adapter: "nextjs-app-router",
        root: "src/app",
        extensions: ["ts", "tsx"],
        exclusions: [
          {
            path: "src/app/legacy/page.tsx",
            reason: "Migration tracked separately",
            assertedBy: "team:web",
            relations: ["topology:implemented_by"],
          },
        ],
      },
    ];
    expect(parseMetamapConfig(config).sources[0]).toEqual(
      (config.sources as unknown[])[0],
    );

    const invalid = structuredClone(config);
    (invalid.sources as Array<Record<string, unknown>>)[0].exclusions = [
      { path: "src/app/legacy/page.tsx", reason: "Missing owner" },
    ];
    expect(() => parseMetamapConfig(invalid)).toThrow(
      /does not match the portable schema/,
    );
  });
});
