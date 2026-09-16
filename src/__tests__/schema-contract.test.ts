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
      {
        schema: "../../schemas/relation-pack.schema.json",
        document: "../../relation-packs/research.json",
      },
      {
        schema: "../../schemas/relation-pack.schema.json",
        document: "../../relation-packs/routing.json",
      },
      {
        schema: "../../schemas/relation-pack.schema.json",
        document: "../../relation-packs/application-topology.json",
      },
      {
        schema: "../../schemas/metamap-graph.schema.json",
        document: "../../examples/routing/graph.json",
      },
      {
        schema: "../../schemas/metamap-viability.schema.json",
        document: "../../examples/routing/viability-policy.json",
      },
      {
        schema: "../../schemas/metamap-projection-spec.schema.json",
        document: "../../examples/routing/projection.json",
      },
      {
        schema: "../../schemas/metamap-projection-spec.schema.json",
        document: "../../examples/path-tree/projection.json",
      },
      {
        schema: "../../schemas/metamap-graph.schema.json",
        document: "../../examples/path-tree/graph.json",
      },
      {
        schema: "../../schemas/metamap-viability.schema.json",
        document: "../../examples/path-tree/viability-policy.json",
      },
      {
        schema: "../../schemas/metamap-generation.schema.json",
        document: "../../examples/routing/generated/generation.json",
      },
      {
        schema: "../../schemas/metamap-projection.schema.json",
        document: "../../examples/routing/generated/command-router.json",
      },
      {
        schema: "../../schemas/metamap-config.schema.json",
        document: "../../examples/research/metamap.config.json",
      },
      {
        schema: "../../schemas/metamap-graph.schema.json",
        document: "../../examples/research/claim-shard.json",
      },
      {
        schema: "../../schemas/metamap-viability.schema.json",
        document: "../../examples/research/viability-policy.json",
      },
      {
        schema: "../../schemas/metamap-generation.schema.json",
        document: "../../examples/research/generated/generation.json",
      },
      {
        schema: "../../schemas/metamap-viability.schema.json",
        document: "../../examples/example-viability-policy.json",
      },
      {
        schema: "../../schemas/metamap-generation.schema.json",
        document: "../../examples/example-generation.json",
      },
      {
        schema: "../../schemas/metamap-graph.schema.json",
        document: "../../examples/application-topology/graph.json",
      },
      {
        schema: "../../schemas/metamap-viability.schema.json",
        document: "../../examples/application-topology/viability-policy.json",
      },
      {
        schema: "../../schemas/metamap-projection-spec.schema.json",
        document: "../../examples/application-topology/projection.json",
      },
      {
        schema: "../../schemas/metamap-generation.schema.json",
        document:
          "../../examples/application-topology/generated/generation.json",
      },
      {
        schema: "../../schemas/metamap-projection.schema.json",
        document:
          "../../examples/application-topology/generated/application-topology.json",
      },
      {
        schema: "../../schemas/metamap-generation.schema.json",
        document: "../../examples/path-tree/generated/generation.json",
      },
      {
        schema: "../../schemas/metamap-path-tree.schema.json",
        document: "../../examples/path-tree/generated/routes.json",
      },
    ];

    for (const entry of cases) {
      const ajv = new Ajv2020({ allErrors: true, strict: true });
      addFormats(ajv);
      const validate = ajv.compile(readSchema(entry.schema));
      const valid = validate(readJson(entry.document));
      expect(validate.errors, `${entry.document} schema errors`).toBeNull();
      expect(valid).toBe(true);
    }
  });
});
