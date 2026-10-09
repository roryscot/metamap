import { readFileSync } from "node:fs";
import { composeCorrespondences } from "../../derivation.js";
import type { CorrespondenceCompositionRequest } from "../../derivation-model.js";
import type { ExecutableRelationPack, MetamapDocument } from "../../model.js";
import { relationPackDigest } from "../../relation-pack.js";
import { coreRelationPack, RelationRegistry } from "../../relations.js";
import { captureReplayBundle } from "../../replay.js";
import type { MetamapSemanticPolicy } from "../../semantic-model.js";
import type { SemanticProjectionSpec } from "../../semantic-projection-model.js";
import { valueDigest } from "../../stable.js";
import { compileMetamap } from "../../viability.js";

const read = <T>(name: string): T =>
  JSON.parse(
    readFileSync(
      new URL(`../../../examples/relations/${name}.json`, import.meta.url),
      "utf8",
    ),
  ) as T;
export function semanticFixture() {
  const graph = read<MetamapDocument>("graph");
  graph.entities[0].attributes = { path: "/network/:networkId" };
  graph.entities[2].kind = "schema";
  graph.entities[2].locators = [{ uri: "json-schema:schemas/network.json" }];
  const basePack = read<ExecutableRelationPack>("pack");
  const pack: ExecutableRelationPack = {
    ...basePack,
    relations: [
      ...basePack.relations,
      {
        id: "example:uses_schema",
        cyclePolicy: "forbid",
        impactDirection: "target-to-source",
      },
    ],
    laws: [
      ...basePack.laws,
      {
        id: "urn:example:law:dependency-schema",
        operation: "chain",
        operands: ["example:depends", "example:depends"],
        resultRelation: "example:uses_schema",
        handling: {
          lossiness: "conservative",
          uncertainty: "conservative",
          authority: "none",
        },
      },
    ],
  };
  graph.relationPacks = [coreRelationPack, pack].map((value) => ({
    id: value.id,
    version: value.version,
    digest: relationPackDigest(value),
  }));
  const registry = new RelationRegistry([coreRelationPack, pack]);
  const request = read<CorrespondenceCompositionRequest>("request");
  request.law = "urn:example:law:dependency-schema";
  const proposal = composeCorrespondences(graph, request, registry);
  if (proposal.status !== "proposed") throw new Error(JSON.stringify(proposal));
  graph.mappings.push(proposal.mapping);
  const policy: MetamapSemanticPolicy = {
    schemaVersion: "2.0.0",
    id: "urn:example:policy",
    graph: { id: graph.id, digest: valueDigest(graph) },
    mappings: [
      {
        select: { relations: ["example:depends", "example:uses_schema"] },
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
  const spec: SemanticProjectionSpec = {
    schemaVersion: "2.0.0",
    id: "urn:example:projection",
    consumer: "urn:example:network-consumer",
    budget: null,
    select: { ids: ["urn:example:consumer"] },
    slots: [
      {
        name: "schema",
        relation: "example:uses_schema",
        direction: "outgoing",
        cardinality: "exactly-one",
        targetKinds: ["schema"],
      },
    ],
    pathTree: { attribute: "path" },
  };
  const options = {
    context: request.context,
    evaluatedAt: "2026-10-09T00:00:00.000Z",
    relationRegistry: registry,
  };
  const generation = () => {
    const result = compileMetamap(graph, policy, options);
    if (result.status !== "viable") throw new Error(JSON.stringify(result));
    return result.generation;
  };
  const capture = () =>
    captureReplayBundle(graph, policy, { ...options, projections: [spec] });
  const rebind = () => {
    policy.graph.digest = valueDigest(graph);
  };
  return {
    graph,
    pack,
    registry,
    request,
    proposal,
    policy,
    spec,
    options,
    generation,
    capture,
    rebind,
  };
}
