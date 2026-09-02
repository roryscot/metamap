import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MetamapDocument } from "../model.js";
import { validateMetamapDocument } from "../validator.js";

function readExample(): MetamapDocument {
  return JSON.parse(
    readFileSync(
      new URL("../../examples/example-authority-graph.json", import.meta.url),
      "utf8",
    ),
  ) as MetamapDocument;
}

function clone(document: MetamapDocument): MetamapDocument {
  return structuredClone(document);
}

describe("metamap validation", () => {
  it("accepts the language-neutral example graph", () => {
    const result = validateMetamapDocument(readExample());
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejects mappings with unresolved endpoints", () => {
    const document = clone(readExample());
    document.mappings[0].targets = ["urn:example:element:missing"];

    const result = validateMetamapDocument(document);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNRESOLVED_ENDPOINT" }),
      ]),
    );
  });

  it("rejects overlapping canonical authority", () => {
    const document = clone(readExample());
    document.authorities.push({
      ...document.authorities[0],
      id: "urn:example:authority:conflicting-email-type",
      source: "urn:example:element:zod.UserSchema.email",
      facts: ["type"],
    });

    const result = validateMetamapDocument(document);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "AUTHORITY_CONFLICT" }),
      ]),
    );
  });

  it("rejects cycles for acyclic relation types", () => {
    const document = clone(readExample());
    document.mappings.push({
      id: "urn:example:mapping:reverse-derivation",
      relation: "core:derives_from",
      sources: ["urn:example:element:prisma.User.email"],
      targets: ["urn:example:element:zod.UserSchema.email"],
      cardinality: "one-to-one",
      lossiness: "unknown",
      provenance: {
        status: "declared",
        assertedBy: "test",
      },
    });

    const result = validateMetamapDocument(document);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "FORBIDDEN_RELATION_CYCLE" }),
      ]),
    );
  });

  it("rejects delegation that widens its parent's fact scope", () => {
    const document = clone(readExample());
    document.authorities.push({
      id: "urn:example:authority:widened-delegation",
      concept: "urn:example:concept:user.email",
      source: "urn:example:element:zod.UserSchema.email",
      facts: ["type", "displayLabel"],
      mode: "delegated",
      delegatedFrom: "urn:example:authority:user-email-database-shape",
      provenance: { status: "declared", assertedBy: "test" },
    });

    const result = validateMetamapDocument(document);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "DELEGATION_FACT_WIDENING" }),
      ]),
    );
  });

  it("rejects overlapping sibling delegations", () => {
    const document = clone(readExample());
    document.authorities.push(
      {
        id: "urn:example:authority:delegated-type-a",
        concept: "urn:example:concept:user.email",
        source: "urn:example:element:zod.UserSchema.email",
        facts: ["type"],
        mode: "delegated",
        delegatedFrom: "urn:example:authority:user-email-database-shape",
        provenance: { status: "declared", assertedBy: "test" },
      },
      {
        id: "urn:example:authority:delegated-type-b",
        concept: "urn:example:concept:user.email",
        source: "urn:example:structure:shared-domain-schema",
        facts: ["type"],
        mode: "delegated",
        delegatedFrom: "urn:example:authority:user-email-database-shape",
        provenance: { status: "declared", assertedBy: "test" },
      },
    );

    const result = validateMetamapDocument(document);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "DELEGATION_BRANCH_CONFLICT" }),
      ]),
    );
  });

  it("reports malformed relation-pack references without throwing", () => {
    const document: Record<string, unknown> = {
      ...clone(readExample()),
      relationPacks: [null],
    };

    expect(() => validateMetamapDocument(document)).not.toThrow();
    expect(validateMetamapDocument(document).valid).toBe(false);
  });
});
