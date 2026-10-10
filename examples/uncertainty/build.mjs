import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import {
  canonicalJson,
  captureReplayBundle,
  compileMetamap,
  compilePathTree,
  compileProjection,
  compareMetamapBundles,
  composeCorrespondences,
  emitTypeScriptPathTree,
  emitTypeScriptProjection,
  parseSemanticPolicy,
  parseSemanticProjectionSpec,
  relationPackDigest,
  replayMetamap,
  RelationRegistry,
  valueDigest,
} from "../../dist/index.js";

const read = async (name) =>
  JSON.parse(
    await readFile(
      new URL(`../relations/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
const graph = await read("graph"),
  pack = await read("pack"),
  baseRequest = await read("request");
const registry = new RelationRegistry();
registry.registerPack(pack);
graph.relationPacks = registry.allPacks().map((value) => ({
  id: value.id,
  version: value.version,
  digest: relationPackDigest(value),
}));
const evidence = graph.mappings.map((mapping, index) => ({
  id: `urn:uncertainty:evidence:${index}`,
  subjects: [mapping.id],
  kind: "uncertainty:identity",
  result: "supports",
  producer: mapping.provenance.assertedBy,
  confidence: 0.2,
}));
const assessments = graph.mappings.map((mapping, index) => ({
  id: `urn:uncertainty:assessment:${index}`,
  subject: mapping.id,
  dimension: "identity",
  status: "supported",
  evidence: [evidence[index].id],
  assessor: mapping.provenance.assertedBy,
  sourceRevision: graph.revision,
}));
const request = { ...baseRequest, assessments, evidence };
const proposal = composeCorrespondences(graph, request, registry);
if (proposal.status !== "proposed") throw new Error(JSON.stringify(proposal));
// This example explicitly accepts a read-only proposal into a candidate. It
// neither approves nor activates that candidate.
const candidate = { ...graph, mappings: [...graph.mappings, proposal.mapping] };
const spec = parseSemanticProjectionSpec({
  ...(await read("projection")),
  budget: "urn:uncertainty:budget",
});
const policy = parseSemanticPolicy({
  schemaVersion: "2.0.0",
  id: "urn:uncertainty:policy:tolerant",
  graph: { id: candidate.id, digest: valueDigest(candidate) },
  mappings: [
    {
      select: { relations: ["example:depends"] },
      coverage: "total",
      determinism: "deterministic",
      reversibility: "reversible",
    },
  ],
  constraints: [],
  evidence,
  assessments,
  derivations: [proposal.derivation],
  derivationLimits: request.bounds,
  uncertaintyRequirements: [
    {
      id: "urn:uncertainty:requirement:identity",
      select: { ids: [proposal.mapping.id] },
      dimension: "identity",
      allowedStates: ["supported"],
      requireEvidence: true,
    },
  ],
  riskBudgets: [
    {
      id: spec.budget,
      consumer: spec.consumer,
      classifications: candidate.mappings.map((mapping, index) => ({
        id: `urn:uncertainty:classification:${index}`,
        select: { ids: [mapping.id] },
        classification: index < 2 ? "declared-directional" : "derived",
        cost: [2, 3, 0][index],
      })),
      maximumTotalCost: 5,
      maximumInferredMappings: 1,
      maximumLossyMappings: 0,
      requireCompleteClassification: true,
      requireCompleteDependencies: true,
    },
  ],
});
const options = {
  relationRegistry: registry,
  context: request.context,
  evaluatedAt: "2026-10-09T00:00:00.000Z",
};
const compilation = compileMetamap(candidate, policy, options);
if (compilation.status !== "viable")
  throw new Error(JSON.stringify(compilation));
const projected = compileProjection(candidate, compilation.generation, spec, {
  relationRegistry: registry,
  semanticPolicy: policy,
});
if (projected.status !== "projected")
  throw new Error(JSON.stringify(projected));
assert.equal(projected.projection.semantic.risk.totalCost, 5);
const tree = compilePathTree(projected.projection, spec);
if (tree.status !== "projected") throw new Error(JSON.stringify(tree));

const strict = structuredClone(policy);
strict.id = "urn:uncertainty:policy:strict";
strict.uncertaintyRequirements.push({
  id: "urn:uncertainty:requirement:completeness",
  select: { ids: [proposal.mapping.id] },
  dimension: "completeness",
  allowedStates: ["supported"],
  requireEvidence: true,
});
const strictResult = compileMetamap(candidate, strict, options);
assert.equal(strictResult.status, "rejected");
assert(
  strictResult.issues.some(
    (issue) =>
      issue.code === "UNCERTAINTY_STATE_NOT_ALLOWED" &&
      issue.message.includes("completeness"),
  ),
);
const limits = [4, 5, 6],
  expected = ["rejected", "projected", "projected"];
const boundaries = limits.map((limit, index) => {
  const boundedPolicy = structuredClone(policy);
  boundedPolicy.riskBudgets[0].maximumTotalCost = limit;
  const admitted = compileMetamap(candidate, boundedPolicy, options);
  assert.equal(admitted.status, "viable");
  const result = compileProjection(candidate, admitted.generation, spec, {
    relationRegistry: registry,
    semanticPolicy: boundedPolicy,
  });
  assert.equal(result.status, expected[index]);
  return {
    limit,
    status: result.status,
    ...(result.status === "projected"
      ? { totalCost: result.projection.semantic.risk.totalCost }
      : { codes: result.issues.map((issue) => issue.code) }),
  };
});
const repeatedSpec = {
  ...spec,
  slots: [...spec.slots, { ...spec.slots[0], name: "sameDependencies" }],
};
const repeated = compileProjection(
  candidate,
  compilation.generation,
  repeatedSpec,
  { relationRegistry: registry, semanticPolicy: policy },
);
assert.equal(repeated.status, "projected");
assert.deepEqual(
  repeated.projection.semantic.risk,
  projected.projection.semantic.risk,
);

const captured = captureReplayBundle(candidate, policy, {
  ...options,
  projections: [spec],
});
assert.equal(replayMetamap(captured).admitted, true);
const stricterCapture = captureReplayBundle(candidate, strict, {
  ...options,
  projections: [spec],
});
assert.equal(replayMetamap(stricterCapture).status, "verified");
assert.equal(replayMetamap(stricterCapture).admitted, false);
const compared = compareMetamapBundles(captured, stricterCapture);
assert.equal(compared.status, "compared");
assert.equal(compared.report.semantic.projections[0].riskChanged, null);

const modules = {
  "network-bindings": emitTypeScriptProjection(projected.projection, {
    exportName: "networkBindings",
  }),
  "network-tree": emitTypeScriptPathTree(tree.pathTree, {
    exportName: "networkTree",
  }),
};
const temporary = await mkdtemp(join(tmpdir(), "metamap-uncertainty-native-"));
try {
  for (const [name, source] of Object.entries(modules))
    await writeFile(
      join(temporary, `${name}.mjs`),
      ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ES2022,
        },
      }).outputText,
    );
  const native = await import(
    pathToFileURL(join(temporary, "network-bindings.mjs")).href
  );
  assert.deepEqual(
    native
      .resolveNetworkBindings("urn:example:consumer")
      .slots.dependencies.map((target) => target.id)
      .sort(),
    ["urn:example:schema", "urn:example:service"],
  );
  assert.throws(
    () => native.resolveNetworkBindings("urn:example:unknown"),
    /Unknown Metamap identity/,
  );
  const nested = await import(
    pathToFileURL(join(temporary, "network-tree.mjs")).href
  );
  assert.equal(
    nested.hydrateNetworkTree({ networkId: "42" }).network[":networkId"]._,
    "/network/42",
  );
  assert.equal(
    nested.networkTree.network[":networkId"]._,
    "/network/:networkId",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}

const verification = {
  sameGraph: candidate.id,
  tolerant: "projected",
  strict: "rejected",
  strictDimension: "completeness",
  boundaries,
  repeatedDependencyCost: 5,
  confidenceImproved: false,
  nativeConsumer: "executed",
  replay: "verified",
  rejectedCounterfactual: "reproduced-and-compared",
  authorization: "not-evaluated",
};
const directory = new URL("./generated/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, value] of Object.entries({
  graph: candidate,
  request,
  proposal,
  policy,
  "strict-policy": strict,
  spec,
  generation: compilation.generation,
  projection: projected.projection,
  "path-tree": tree.pathTree,
  "strict-result": strictResult,
  verification,
}))
  await writeFile(
    new URL(`${name}.json`, directory),
    `${canonicalJson(value)}\n`,
  );
for (const [name, source] of Object.entries(modules))
  await writeFile(new URL(`${name}.ts`, directory), source);
console.log(JSON.stringify(verification));
