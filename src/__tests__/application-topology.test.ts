import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MetamapDocument, RelationPack } from "../model.js";
import { coreRelationPack, RelationRegistry } from "../relations.js";
import { compileMetamap } from "../viability.js";
import type { MetamapViabilityPolicy } from "../viability-model.js";

const evaluatedAt = "2026-09-08T00:00:00.000Z";

function pack(name: string): RelationPack {
  return JSON.parse(
    readFileSync(
      new URL(`../../relation-packs/${name}.json`, import.meta.url),
      "utf8",
    ),
  ) as RelationPack;
}

function registry(): RelationRegistry {
  return new RelationRegistry([
    coreRelationPack,
    pack("routing"),
    pack("application-topology"),
  ]);
}

function provenance(status: "observed" | "declared" = "declared") {
  return { status, assertedBy: "test:application-topology" } as const;
}

function document(): MetamapDocument {
  const entities: MetamapDocument["entities"] = [
    { id: "urn:test:app", kind: "topology:application" },
    { id: "urn:test:segment:root", kind: "topology:segment" },
    { id: "urn:test:container:root", kind: "topology:container" },
    {
      id: "urn:test:page:home",
      kind: "topology:page",
      attributes: { runtime: "client" },
    },
    {
      id: "urn:test:route:home",
      kind: "routing:route",
      attributes: { topologySurface: "semantic-page" },
    },
    { id: "urn:test:content:home", kind: "topology:content" },
    { id: "urn:test:context:web", kind: "topology:context" },
    {
      id: "urn:test:hydration:home",
      kind: "topology:hydration-boundary",
    },
  ];
  const mapping = (
    id: string,
    relation: string,
    source: string,
    target: string,
    status: "observed" | "declared" = "declared",
  ): MetamapDocument["mappings"][number] => ({
    id: `urn:test:mapping:${id}`,
    relation,
    sources: [source],
    targets: [target],
    cardinality: "one-to-one",
    lossiness: "lossless",
    provenance: provenance(status),
  });
  return {
    schemaVersion: "2.0.0",
    id: "urn:test:graph:application-topology",
    namespace: "test",
    revision: "1",
    relationPacks: [
      { id: "urn:metamap:relation-pack:core", version: "1.0.0" },
      { id: "urn:metamap:relation-pack:routing", version: "1.0.0" },
      {
        id: "urn:metamap:relation-pack:application-topology",
        version: "1.0.0",
      },
    ],
    entities,
    mappings: [
      mapping(
        "app-segment",
        "topology:contains",
        "urn:test:app",
        "urn:test:segment:root",
        "observed",
      ),
      mapping(
        "segment-container",
        "topology:contains",
        "urn:test:segment:root",
        "urn:test:container:root",
        "observed",
      ),
      mapping(
        "segment-page",
        "topology:contains",
        "urn:test:segment:root",
        "urn:test:page:home",
        "observed",
      ),
      mapping(
        "segment-hydration",
        "topology:contains",
        "urn:test:segment:root",
        "urn:test:hydration:home",
        "observed",
      ),
      mapping(
        "container-page",
        "topology:wraps",
        "urn:test:container:root",
        "urn:test:page:home",
        "observed",
      ),
      mapping(
        "page-container",
        "topology:rendered_in",
        "urn:test:page:home",
        "urn:test:container:root",
        "observed",
      ),
      mapping(
        "route-page",
        "topology:implemented_by",
        "urn:test:route:home",
        "urn:test:page:home",
      ),
      mapping(
        "route-container",
        "topology:rendered_in",
        "urn:test:route:home",
        "urn:test:container:root",
      ),
      mapping(
        "route-content",
        "topology:resolves_content",
        "urn:test:route:home",
        "urn:test:content:home",
      ),
      mapping(
        "route-context",
        "topology:requires_context",
        "urn:test:route:home",
        "urn:test:context:web",
      ),
      mapping(
        "container-context",
        "topology:provides_context",
        "urn:test:container:root",
        "urn:test:context:web",
      ),
      mapping(
        "hydration-page",
        "topology:hydrates",
        "urn:test:hydration:home",
        "urn:test:page:home",
        "observed",
      ),
    ],
    authorities: [],
  };
}

function policy(graph: MetamapDocument): MetamapViabilityPolicy {
  return {
    schemaVersion: "1.0.0",
    id: "urn:test:policy:application-topology",
    graph: { id: graph.id, revision: graph.revision },
    mappings: [
      {
        select: { provenanceStatuses: ["observed", "declared"] },
        coverage: "total",
        determinism: "deterministic",
        reversibility: "irreversible",
      },
    ],
    constraints: [
      {
        id: "urn:test:constraint:page-coverage",
        kind: "topology:relation-totality",
        subjects: [graph.id],
        parameters: {
          subjectKinds: ["topology:page"],
          relation: "topology:implemented_by",
          direction: "target",
          cardinality: "exactly-one",
          counterpartKinds: ["routing:route"],
          allowExcluded: true,
        },
      },
      {
        id: "urn:test:constraint:client-hydration",
        kind: "topology:relation-totality",
        subjects: [graph.id],
        parameters: {
          subjectKinds: ["topology:page"],
          subjectAttributes: { runtime: "client" },
          relation: "topology:hydrates",
          direction: "target",
          cardinality: "exactly-one",
          counterpartKinds: ["topology:hydration-boundary"],
        },
      },
      {
        id: "urn:test:constraint:observed-reachability",
        kind: "topology:reachable",
        subjects: [graph.id],
        parameters: {
          root: "urn:test:app",
          relation: "topology:contains",
          subjectKinds: [
            "topology:segment",
            "topology:container",
            "topology:page",
            "topology:hydration-boundary",
          ],
        },
      },
      {
        id: "urn:test:constraint:context",
        kind: "topology:context-satisfied",
        subjects: [graph.id],
        parameters: {
          subjectKinds: ["routing:route"],
          subjectAttributes: { topologySurface: "semantic-page" },
          requiresRelation: "topology:requires_context",
          providesRelation: "topology:provides_context",
          renderedInRelation: "topology:rendered_in",
          parentRelation: "topology:wraps",
          hostsProviderRelation: "topology:hosts_provider",
        },
      },
    ],
    evidence: [],
  };
}

describe("application-topology constraints", () => {
  it("validates total coverage, reachability, hydration, and context dominance", () => {
    const graph = document();
    const result = compileMetamap(graph, policy(graph), {
      evaluatedAt,
      relationRegistry: registry(),
    });
    expect(result.status, JSON.stringify(result, null, 2)).toBe("viable");
  });

  it("fails closed when a discovered page loses its semantic mapping", () => {
    const graph = document();
    graph.mappings = graph.mappings.filter(
      (entry) => entry.id !== "urn:test:mapping:route-page",
    );
    const result = compileMetamap(graph, policy(graph), {
      evaluatedAt,
      relationRegistry: registry(),
    });
    expect(result.status).toBe("rejected");
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "TOPOLOGY_REQUIRED_RELATION_MISSING" }),
    );
  });

  it("fails closed when a required context has no dominating provider", () => {
    const graph = document();
    graph.mappings = graph.mappings.filter(
      (entry) => entry.id !== "urn:test:mapping:container-context",
    );
    const result = compileMetamap(graph, policy(graph), {
      evaluatedAt,
      relationRegistry: registry(),
    });
    expect(result.status).toBe("rejected");
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "TOPOLOGY_CONTEXT_PROVIDER_MISSING" }),
    );
  });

  it("rejects exclusions unless the exact totality constraint permits them", () => {
    const graph = document();
    const page = graph.entities.find(
      (entry) => entry.id === "urn:test:page:home",
    );
    if (!page) throw new Error("fixture page missing");
    page.attributes = {
      ...page.attributes,
      topologyDisposition: "excluded",
      exclusionReason: "Reviewed exception",
      exclusionOwner: "team:test",
    };
    graph.mappings = graph.mappings.filter(
      (entry) => entry.id !== "urn:test:mapping:route-page",
    );
    const result = compileMetamap(graph, policy(graph), {
      evaluatedAt,
      relationRegistry: registry(),
    });
    expect(result.status).toBe("rejected");
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "TOPOLOGY_EXCLUSION_NOT_ALLOWED" }),
    );

    const scoped = document();
    const scopedPage = scoped.entities.find(
      (entry) => entry.id === "urn:test:page:home",
    );
    if (!scopedPage) throw new Error("fixture page missing");
    scopedPage.attributes = {
      ...scopedPage.attributes,
      topologyDisposition: "excluded",
      exclusionReason: "Reviewed semantic mapping exception",
      exclusionOwner: "team:test",
      exclusionRelations: ["topology:implemented_by"],
    };
    scoped.mappings = scoped.mappings.filter(
      (entry) => entry.id !== "urn:test:mapping:route-page",
    );
    const scopedResult = compileMetamap(scoped, policy(scoped), {
      evaluatedAt,
      relationRegistry: registry(),
    });
    expect(scopedResult.status, JSON.stringify(scopedResult, null, 2)).toBe(
      "viable",
    );
  });

  it("rejects overlapping and stale mapping selectors", () => {
    const graph = document();
    const overlapping = policy(graph);
    overlapping.mappings.push({
      mapping: graph.mappings[0].id,
      coverage: "total",
      determinism: "deterministic",
      reversibility: "irreversible",
    });
    const duplicate = compileMetamap(graph, overlapping, {
      evaluatedAt,
      relationRegistry: registry(),
    });
    expect(duplicate.status).toBe("rejected");
    expect(duplicate.issues).toContainEqual(
      expect.objectContaining({ code: "DUPLICATE_MAPPING_POLICY" }),
    );

    const stale = policy(graph);
    stale.mappings = [
      {
        select: { relations: ["routing:emits"] },
        coverage: "total",
        determinism: "deterministic",
        reversibility: "irreversible",
      },
    ];
    const staleResult = compileMetamap(graph, stale, {
      evaluatedAt,
      relationRegistry: registry(),
    });
    expect(staleResult.status).toBe("rejected");
    expect(staleResult.issues).toContainEqual(
      expect.objectContaining({ code: "EMPTY_MAPPING_SELECTOR" }),
    );
  });
});
