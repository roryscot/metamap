import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { promoteMetamapGeneration } from "../activation.js";
import { canonicalDigest } from "../canonical.js";
import { composeCorrespondences } from "../derivation.js";
import type { CorrespondenceCompositionRequest } from "../derivation-model.js";
import type { ExecutableRelationPack, MetamapDocument } from "../model.js";
import { relationPackDigest } from "../relation-pack.js";
import { coreRelationPack, RelationRegistry } from "../relations.js";
import {
  parseSemanticGeneration,
  parseSemanticPolicy,
  semanticGenerationDigest,
  validateSemanticGeneration,
  validateSemanticPolicy,
} from "../semantic.js";
import type { MetamapSemanticPolicy } from "../semantic-model.js";
import { stableJson, valueDigest } from "../stable.js";
import { compileMetamap, MetamapActivator } from "../viability.js";
import type {
  MetamapViabilityPolicy,
  ViableGeneration,
} from "../viability-model.js";

function read(name: string): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`../../examples/relations/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
}
function fixture() {
  const graph = read("graph") as MetamapDocument;
  const pack = read("pack") as ExecutableRelationPack;
  const registry = new RelationRegistry([coreRelationPack, pack]);
  const request = read("request") as CorrespondenceCompositionRequest;
  const proposal = composeCorrespondences(graph, request, registry);
  if (proposal.status !== "proposed") throw new Error(JSON.stringify(proposal));
  graph.mappings.push(proposal.mapping);
  const policy: MetamapSemanticPolicy = {
    schemaVersion: "2.0.0",
    id: "urn:example:policy",
    graph: { id: graph.id, digest: valueDigest(graph) },
    mappings: [
      {
        select: { relations: ["example:depends"] },
        coverage: "total",
        determinism: "deterministic",
        reversibility: "reversible",
      },
    ],
    constraints: [],
    evidence: [],
    derivations: [proposal.derivation],
    derivationLimits: request.bounds,
    assessments: [],
    uncertaintyRequirements: [],
    riskBudgets: [],
  };
  const options = {
    context: request.context,
    evaluatedAt: "2026-10-09T00:00:00.000Z",
    relationRegistry: registry,
  };
  return { graph, pack, registry, request, proposal, policy, options };
}
function rebind(policy: MetamapSemanticPolicy, graph: MetamapDocument): void {
  policy.graph.digest = valueDigest(graph);
}

describe("explicit version 2 proof admission", () => {
  it("preserves legacy programmatic optional fields and evaluates the canonical numeric context", () => {
    const { graph, policy, options } = fixture();
    graph.label = undefined;
    rebind(policy, graph);
    const result = compileMetamap(graph, policy, options);
    expect(result.status, JSON.stringify(result)).toBe("viable");
    if (result.status === "viable")
      expect(result.generation.graph.digest).toBe(valueDigest(graph));
    graph.mappings.pop();
    policy.derivations = [];
    rebind(policy, graph);
    policy.mappings[0].applicability = {
      when: { key: "numeric", operator: "equals", value: 0 },
    };
    const numeric = compileMetamap(graph, policy, {
      ...options,
      context: { numeric: -0 },
    });
    expect(numeric.status).toBe("viable");
    if (numeric.status === "viable")
      expect(numeric.generation.activeMappings).toHaveLength(2);
  });
  it("admits a checked explicit claim and binds exact packs, proof dependencies and original policy", () => {
    const { graph, policy, options, pack, proposal } = fixture();
    const result = compileMetamap(graph, policy, options);
    expect(result.status, JSON.stringify(result)).toBe("viable");
    if (result.status !== "viable") return;
    expect(result.generation.schemaVersion).toBe("2.0.0");
    expect(result.generation.policy.digest).toBe(canonicalDigest(policy));
    expect(result.generation.graph.digest).toBe(valueDigest(graph));
    expect(
      result.generation.semantic.packs.find(
        (entry) => entry.binding.id === pack.id,
      )?.binding.digest,
    ).toBe(relationPackDigest(pack));
    expect(
      result.generation.semantic.dependencies.find(
        (entry) => entry.mapping === proposal.mapping.id,
      )?.premises,
    ).toEqual(["urn:example:consumer-service", "urn:example:service-schema"]);
    expect(result.generation.semantic.riskEvaluation).toBe("not-evaluated");
    expect(
      parseSemanticGeneration(JSON.parse(JSON.stringify(result.generation))),
    ).toEqual(result.generation);
    expect(Object.isFrozen(result.generation.semantic.derivations)).toBe(true);
    expect(Object.isFrozen(policy)).toBe(false);
  });
  it("does not require a materialized transitive edge in an otherwise valid graph", () => {
    const { graph, policy, options } = fixture();
    graph.mappings.pop();
    policy.derivations = [];
    rebind(policy, graph);
    expect(compileMetamap(graph, policy, options).status).toBe("viable");
  });
  it("rejects missing and stale proof records before admission", () => {
    const { graph, policy, options } = fixture();
    policy.derivations = [];
    expect(
      compileMetamap(graph, policy, options).issues.some(
        (issue) => issue.code === "MISSING_DERIVATION",
      ),
    ).toBe(true);
    const next = fixture();
    next.graph.mappings[0].provenance.sourceRevision = "changed";
    rebind(next.policy, next.graph);
    expect(
      compileMetamap(next.graph, next.policy, next.options).issues.some(
        (issue) => issue.code === "DERIVATION_PREMISE_OR_RULE_MISMATCH",
      ),
    ).toBe(true);
  });
  it("rejects an active claim supported by an inactive premise", () => {
    const { graph, policy, options } = fixture();
    policy.mappings = graph.mappings.map((mapping, index) => ({
      mapping: mapping.id,
      coverage: "total",
      determinism: "deterministic",
      reversibility: "reversible",
      ...(index === 0
        ? {
            applicability: {
              when: {
                key: "environment",
                operator: "equals",
                value: "inactive",
              } as const,
            },
          }
        : {}),
    }));
    const result = compileMetamap(graph, policy, options);
    expect(result.status).toBe("rejected");
    expect(
      result.issues.some(
        (issue) => issue.code === "INACTIVE_DERIVATION_PREMISE",
      ),
    ).toBe(true);
  });
  it.each(["coverage", "determinism", "reversibility"] as const)(
    "cannot strengthen premise %s",
    (property) => {
      const { graph, policy, options } = fixture();
      policy.mappings = graph.mappings.map((mapping) => ({
        mapping: mapping.id,
        coverage: "total",
        determinism: "deterministic",
        reversibility: "reversible",
      }));
      if (property === "coverage") policy.mappings[0].coverage = "partial";
      if (property === "determinism")
        policy.mappings[0].determinism = "nondeterministic";
      if (property === "reversibility")
        policy.mappings[0].reversibility = "irreversible";
      expect(
        compileMetamap(graph, policy, options).issues.some(
          (issue) => issue.code === "DERIVATION_SEMANTICS_STRENGTHENED",
        ),
      ).toBe(true);
    },
  );
  it("binds requested context and exact graph pack references", () => {
    const { graph, policy, options, pack } = fixture();
    expect(
      compileMetamap(graph, policy, {
        ...options,
        context: { environment: "other" },
      }).status,
    ).toBe("rejected");
    graph.relationPacks = [{ id: pack.id, version: pack.version }];
    rebind(policy, graph);
    expect(
      compileMetamap(graph, policy, options).issues.some(
        (issue) => issue.code === "EXECUTABLE_PACK_BINDING_MISMATCH",
      ),
    ).toBe(true);
    graph.relationPacks[0].digest = relationPackDigest(pack);
    rebind(policy, graph);
    expect(compileMetamap(graph, policy, options).status).toBe("viable");
  });
  it("follows the proof dependency after a premise is removed and does not invent an admitted generation", () => {
    const { graph, policy, options, proposal } = fixture();
    const removed = graph.mappings.shift()!;
    rebind(policy, graph);
    const result = compileMetamap(graph, policy, {
      ...options,
      changedSubjects: [removed.id],
    });
    expect(result.status).toBe("rejected");
    expect(
      result.impact.paths.find((path) => path.subjectId === proposal.mapping.id)
        ?.path,
    ).toEqual([removed.id, proposal.derivation.id, proposal.mapping.id]);
    expect("generation" in result).toBe(false);
  });
  it("rejects a required unknown dimension with its specific consumer requirement", () => {
    const { graph, policy, options } = fixture();
    policy.uncertaintyRequirements = [
      {
        id: "urn:requirement:identity",
        select: { relations: ["example:depends"] },
        dimension: "identity",
        allowedStates: ["supported"],
        requireEvidence: true,
      },
    ];
    expect(validateSemanticPolicy(policy).valid).toBe(true);
    const result = compileMetamap(graph, policy, options);
    expect(result.status).toBe("rejected");
    expect(
      result.issues.some(
        (issue) =>
          issue.code === "UNCERTAINTY_STATE_NOT_ALLOWED" &&
          issue.message.includes("identity"),
      ),
    ).toBe(true);
  });
  it("rejects proof claims and executable packs in the legacy profile", () => {
    const { graph, policy, options } = fixture();
    const {
      derivations: _proofs,
      derivationLimits: _limits,
      assessments: _assessments,
      uncertaintyRequirements: _requirements,
      riskBudgets: _budgets,
      ...common
    } = policy;
    const legacy: MetamapViabilityPolicy = {
      ...common,
      schemaVersion: "1.0.0",
    };
    expect(compileMetamap(graph, legacy, options).issues[0].code).toBe(
      "EXECUTABLE_POLICY_REQUIRED",
    );
    expect(compileMetamap(graph, legacy).status).toBe("rejected");
  });
  it("rejects unknown fields, unknown versions and missing mandatory members", () => {
    const { policy } = fixture();
    expect(() =>
      parseSemanticPolicy({ ...policy, futureRequiredFeature: true }),
    ).toThrow();
    expect(
      validateSemanticPolicy({ ...policy, schemaVersion: "3.0.0" }).valid,
    ).toBe(false);
    const { derivations: _proofs, ...incomplete } = policy;
    expect(validateSemanticPolicy(incomplete).valid).toBe(false);
  });
  it("rejects a malformed or content-tampered captured generation", () => {
    const { graph, policy, options } = fixture();
    const result = compileMetamap(graph, policy, options);
    if (result.status !== "viable") throw new Error(JSON.stringify(result));
    const altered = JSON.parse(
      JSON.stringify(result.generation),
    ) as typeof result.generation;
    altered.semantic.packs[1].value.description = "tampered";
    expect(validateSemanticGeneration(altered).valid).toBe(false);
    altered.digest = semanticGenerationDigest(altered);
    altered.id = `urn:metamap:generation:${altered.digest.slice(7)}`;
    expect(validateSemanticGeneration(altered).issues[0].code).toBe(
      "SEMANTIC_PACK_BINDING_MISMATCH",
    );
  });
  it("preserves an in-memory legacy generation when passed a version 2 candidate", () => {
    const { graph, policy, options } = fixture();
    const legacyGraph: MetamapDocument = {
      schemaVersion: "2.0.0",
      id: "urn:legacy:graph",
      namespace: "legacy",
      entities: [],
      mappings: [],
      authorities: [],
    };
    const legacyPolicy: MetamapViabilityPolicy = {
      schemaVersion: "1.0.0",
      id: "urn:legacy:policy",
      graph: { id: legacyGraph.id, digest: valueDigest(legacyGraph) },
      mappings: [],
      constraints: [],
      evidence: [],
    };
    const activator = new MetamapActivator();
    expect(
      activator.activate(legacyGraph, legacyPolicy, {
        evaluatedAt: options.evaluatedAt,
      }).activated,
    ).toBe(true);
    const digest = activator.current!.digest;
    const result = activator.activate(
      graph,
      policy as unknown as MetamapViabilityPolicy,
      options,
    );
    expect(result.activated).toBe(false);
    expect(result.compilation.issues[0].code).toBe(
      "PROTECTED_ACTIVATION_REQUIRED",
    );
    expect(activator.current!.digest).toBe(digest);
  });
  it("preserves persistent bytes when version 2 is passed to the legacy promoter", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "metamap-semantic-promotion-"),
    );
    try {
      const { graph, policy, options } = fixture();
      const currentPath = join(directory, "current.json");
      const emptyGraph: MetamapDocument = {
        schemaVersion: "2.0.0",
        id: "urn:empty:graph",
        namespace: "empty",
        entities: [],
        mappings: [],
        authorities: [],
      };
      const base = compileMetamap(
        emptyGraph,
        {
          schemaVersion: "1.0.0",
          id: "urn:empty:policy",
          graph: { id: emptyGraph.id, digest: valueDigest(emptyGraph) },
          mappings: [],
          evidence: [],
          constraints: [],
        },
        { evaluatedAt: options.evaluatedAt },
      );
      if (base.status !== "viable") throw new Error("Expected legacy baseline");
      const previous = stableJson(base.generation, true);
      await writeFile(currentPath, previous);
      const result = await promoteMetamapGeneration(
        graph,
        policy as unknown as MetamapViabilityPolicy,
        currentPath,
        options,
      );
      expect(result.activated).toBe(false);
      expect(result.previousDigest).toBe(
        (base.generation as ViableGeneration).digest,
      );
      expect(await readFile(currentPath, "utf8")).toBe(previous);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
