import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adaptLegacySourcesOfTruth,
  isLegacySourceOfTruthDocument,
} from "../adapters/source-of-truth.js";
import { MetamapGraph } from "../graph.js";
import { makeUrn } from "../references.js";
import { validateMetamapDocument } from "../validator.js";

function readLegacy(): unknown {
  return JSON.parse(
    readFileSync(
      new URL("./fixtures/sources-of-truth.json", import.meta.url),
      "utf8",
    ),
  ) as unknown;
}

describe("legacy sources-of-truth adapter", () => {
  it("imports the current catalog without inventing ambiguous authority", () => {
    const legacy = readLegacy();
    expect(isLegacySourceOfTruthDocument(legacy)).toBe(true);
    if (!isLegacySourceOfTruthDocument(legacy)) return;

    const result = adaptLegacySourcesOfTruth(legacy);
    const validation = validateMetamapDocument(result.document);

    expect(validation.valid).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "LEGACY_MULTIPLE_SOURCES",
          entryId: "web_routes",
        }),
        expect.objectContaining({
          code: "LEGACY_AMBIGUOUS_PATH",
          entryId: "creation_workflow",
        }),
      ]),
    );

    const graph = new MetamapGraph(result.document);
    expect(
      graph.resolveAuthority(
        makeUrn("metamap", "concept", "database_schema"),
        "*",
      ).status,
    ).toBe("resolved");
    expect(
      graph.resolveAuthority(makeUrn("metamap", "concept", "web_routes"), "*")
        .status,
    ).toBe("ambiguous");
  });
});
