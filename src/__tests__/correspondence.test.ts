import { describe, expect, it } from "vitest";
import type { CorrespondenceConfig } from "../config.js";
import { materializeCorrespondences } from "../correspondence.js";
import {
  METAMAP_SCHEMA_VERSION,
  type MetamapDocument,
  type MetamapEntity,
} from "../model.js";

function entity(
  id: string,
  kind: string,
  attributes: MetamapEntity["attributes"],
): MetamapEntity {
  return { id, kind, attributes };
}

function discovered(): MetamapDocument {
  return {
    schemaVersion: METAMAP_SCHEMA_VERSION,
    id: "urn:test:graph:discovered",
    namespace: "test",
    entities: [
      entity("urn:test:zod:User", "zod-schema", {
        sourceId: "schemas",
        structureKind: "schema",
        name: "userSchema",
      }),
      entity("urn:test:zod:User.id", "zod-field", {
        structureId: "urn:test:zod:User",
        name: "id",
        dataType: "string",
        presenceRequired: true,
        nullable: false,
        cardinality: "one",
        relation: false,
      }),
      entity("urn:test:prisma:User", "prisma-model", {
        sourceId: "database",
        structureKind: "model",
        name: "User",
      }),
      entity("urn:test:prisma:User.id", "prisma-field", {
        structureId: "urn:test:prisma:User",
        name: "id",
        dataType: "string",
        presenceRequired: true,
        nullable: false,
        cardinality: "one",
        relation: false,
      }),
    ],
    mappings: [],
    authorities: [],
  };
}

function configuration(): CorrespondenceConfig {
  return {
    id: "user-domain",
    source: { sourceId: "schemas", kind: "schema", name: "userSchema" },
    target: { sourceId: "database", kind: "model", name: "User" },
    fields: {
      pairs: [{ source: "id", target: "id" }],
      requireSourceCoverage: true,
      requireTargetCoverage: true,
    },
    authority: { side: "target", facts: ["storage", "type"] },
  };
}

describe("declared correspondences", () => {
  it("materializes structure, field, concept, and authority references", () => {
    const result = materializeCorrespondences(
      "test",
      "declared",
      discovered(),
      [configuration()],
      "sha256:config",
    );

    expect(result.issues).toEqual([]);
    expect(result.document.entities).toHaveLength(1);
    expect(result.document.mappings).toHaveLength(3);
    expect(result.document.authorities[0]).toMatchObject({
      source: "urn:test:prisma:User",
      facts: ["storage", "type"],
    });
  });

  it("reports an unwaived fact mismatch", () => {
    const document = discovered();
    const field = document.entities.find(
      (entry) => entry.id === "urn:test:zod:User.id",
    );
    if (field?.attributes) field.attributes.dataType = "integer";

    const result = materializeCorrespondences(
      "test",
      "declared",
      document,
      [configuration()],
      "sha256:config",
    );
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: "error", code: "FIELD_DRIFT" }),
      ]),
    );
  });
});
