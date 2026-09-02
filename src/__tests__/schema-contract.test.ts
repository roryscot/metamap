import { readFileSync } from "node:fs";
import type { AnySchema } from "ajv";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { describe, expect, it } from "vitest";

function readJson(path: string): unknown {
  return JSON.parse(
    readFileSync(new URL(path, import.meta.url), "utf8"),
  ) as unknown;
}

function readSchema(path: string): AnySchema {
  return JSON.parse(
    readFileSync(new URL(path, import.meta.url), "utf8"),
  ) as AnySchema;
}

describe("portable JSON contracts", () => {
  it("strictly validates the repository config, example graph, and relation pack", () => {
    const Ajv2020 = Ajv2020Module.default;
    const addFormats = addFormatsModule.default;
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const cases = [
      {
        schema: "../../schemas/metamap-config.schema.json",
        document: "../../examples/workspace/metamap.config.json",
      },
      {
        schema: "../../schemas/metamap-graph.schema.json",
        document: "../../examples/example-authority-graph.json",
      },
      {
        schema: "../../schemas/relation-pack.schema.json",
        document: "../../relation-packs/core.json",
      },
    ];

    for (const entry of cases) {
      const validate = ajv.compile(readSchema(entry.schema));
      const valid = validate(readJson(entry.document));
      expect(validate.errors, `${entry.document} schema errors`).toBeNull();
      expect(valid).toBe(true);
    }
  });
});
