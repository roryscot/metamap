import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MetamapGraph } from "../graph.js";
import type { MetamapDocument } from "../model.js";

function document(): MetamapDocument {
  return JSON.parse(
    readFileSync(
      new URL("../../examples/example-authority-graph.json", import.meta.url),
      "utf8",
    ),
  ) as MetamapDocument;
}

function graph(): MetamapGraph {
  return new MetamapGraph(document());
}

describe("MetamapGraph", () => {
  it("traverses typed structural correspondences", () => {
    const visits = graph().trace("urn:example:concept:user.email", {
      direction: "outgoing",
      relations: ["core:implements", "core:derives_from"],
      maxDepth: 2,
    });

    expect(visits.map((visit) => visit.entity.id)).toEqual([
      "urn:example:concept:user.email",
      "urn:example:element:prisma.User.email",
      "urn:example:element:zod.UserSchema.email",
    ]);
  });

  it("resolves authority for an individual fact", () => {
    const resolution = graph().resolveAuthority(
      "urn:example:concept:user.email",
      "type",
    );

    expect(resolution.status).toBe("resolved");
    expect(resolution.canonical?.source).toBe(
      "urn:example:element:prisma.User.email",
    );
    expect(resolution.effective).toBe(resolution.canonical);
  });

  it("does not treat unrelated facts as resolved", () => {
    expect(
      graph().resolveAuthority("urn:example:concept:user.email", "displayLabel")
        .status,
    ).toBe("unresolved");
  });

  it("resolves an explicit delegation chain to its effective owner", () => {
    const delegated = document();
    delegated.authorities.push({
      id: "urn:example:authority:user-email-shared-type",
      concept: "urn:example:concept:user.email",
      source: "urn:example:element:zod.UserSchema.email",
      facts: ["type"],
      mode: "delegated",
      delegatedFrom: "urn:example:authority:user-email-database-shape",
      provenance: { status: "declared", assertedBy: "test" },
    });

    const resolution = new MetamapGraph(delegated).resolveAuthority(
      "urn:example:concept:user.email",
      "type",
    );

    expect(resolution.status).toBe("resolved");
    expect(resolution.canonical?.source).toBe(
      "urn:example:element:prisma.User.email",
    );
    expect(resolution.effective?.source).toBe(
      "urn:example:element:zod.UserSchema.email",
    );
    expect(resolution.delegationChain).toHaveLength(2);
  });
});
