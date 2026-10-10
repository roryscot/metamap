import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
  parseCompositionRequest,
  parseRelationPack,
  parseSemanticPolicy,
  parseSemanticProjectionSpec,
  replayMetamap,
  RelationRegistry,
  valueDigest,
} from "../../dist/index.js";

const read = async (name) =>
  JSON.parse(
    await readFile(new URL(`./${name}.json`, import.meta.url), "utf8"),
  );
const graph = await read("graph");
const pack = parseRelationPack(await read("pack"));
const request = parseCompositionRequest(await read("request"));
const registry = new RelationRegistry();
registry.registerPack(pack);
const proposal = composeCorrespondences(graph, request, registry);
if (proposal.status !== "proposed") throw new Error(JSON.stringify(proposal));

// Explicitly accept the returned proposal into this example's candidate graph.
// The generic law engine performs no mutation or authority grant.
const candidate = { ...graph, mappings: [...graph.mappings, proposal.mapping] };
const policy = parseSemanticPolicy({
  schemaVersion: "2.0.0",
  id: "urn:metamap:example:dependency-policy",
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
  evidence: [],
  derivations: [proposal.derivation],
  derivationLimits: request.bounds,
  assessments: [],
  uncertaintyRequirements: [],
  riskBudgets: [],
});
const compilation = compileMetamap(candidate, policy, {
  relationRegistry: registry,
  context: request.context,
  evaluatedAt: "2026-10-09T00:00:00.000Z",
});
if (compilation.status !== "viable")
  throw new Error(JSON.stringify(compilation));
const spec = parseSemanticProjectionSpec(await read("projection"));
const projection = compileProjection(candidate, compilation.generation, spec, {
  relationRegistry: registry,
});
if (projection.status !== "projected")
  throw new Error(JSON.stringify(projection));
const tree = compilePathTree(projection.projection, spec);
if (tree.status !== "projected") throw new Error(JSON.stringify(tree));
const directory = new URL("./generated/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, value] of Object.entries({
  proposal,
  graph: candidate,
  policy,
  generation: compilation.generation,
  projection: projection.projection,
  "path-tree": tree.pathTree,
})) {
  await writeFile(
    new URL(`${name}.json`, directory),
    `${canonicalJson(value)}\n`,
  );
}
const modules = {
  "dependency-bindings": emitTypeScriptProjection(projection.projection, {
    exportName: "dependencyBindings",
  }),
  "dependency-tree": emitTypeScriptPathTree(tree.pathTree, {
    exportName: "dependencyTree",
  }),
};
const temporary = await mkdtemp(join(tmpdir(), "metamap-relation-consumer-"));
try {
  for (const [name, source] of Object.entries(modules)) {
    await writeFile(new URL(`${name}.ts`, directory), source);
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    });
    await writeFile(join(temporary, `${name}.mjs`), compiled.outputText);
  }
  const native = await import(
    pathToFileURL(join(temporary, "dependency-bindings.mjs")).href
  );
  const binding = native.resolveDependencyBindings("urn:example:consumer");
  assert.deepEqual(
    binding.slots.dependencies.map((target) => target.id).sort(),
    ["urn:example:schema", "urn:example:service"],
  );
  assert.throws(
    () => native.resolveDependencyBindings("urn:example:unknown"),
    /Unknown Metamap identity/,
  );
  const nested = await import(
    pathToFileURL(join(temporary, "dependency-tree.mjs")).href
  );
  const hydrated = nested.hydrateDependencyTree({ networkId: "42" });
  assert.equal(hydrated.network[":networkId"]._, "/network/42");
  assert.equal(
    nested.dependencyTree.network[":networkId"]._,
    "/network/:networkId",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}

const options = {
  relationRegistry: registry,
  context: request.context,
  evaluatedAt: "2026-10-09T00:00:00.000Z",
  projections: [spec],
};
const captured = captureReplayBundle(candidate, policy, options);
assert.equal(replayMetamap(captured).admitted, true);
const changed = structuredClone(candidate);
changed.mappings = changed.mappings.filter(
  (mapping) => mapping.id !== request.premises[1],
);
const rejectedPolicy = structuredClone(policy);
rejectedPolicy.graph.digest = valueDigest(changed);
const rejected = captureReplayBundle(changed, rejectedPolicy, options);
const reproduced = replayMetamap(rejected);
assert.equal(reproduced.status, "verified");
assert.equal(reproduced.admitted, false);
const compared = compareMetamapBundles(captured, rejected);
assert.equal(compared.status, "compared");
assert.equal(compared.report.mappingStates.afterKnown, false);
assert.deepEqual(compared.report.mappingStates.deactivated, []);
assert.deepEqual(
  compared.report.impact.after.paths.find(
    (path) => path.subjectId === proposal.mapping.id,
  )?.path,
  [request.premises[1], proposal.derivation.id, proposal.mapping.id],
);
console.log(
  JSON.stringify({
    status: "admitted",
    generation: compilation.generation.id,
    proof: proposal.derivation.id,
    projection: projection.projection.id,
    usedMappings: projection.projection.semantic.usedMappings,
    nativeConsumer: "executed",
    replay: "verified",
    rejectedCounterfactual: "reproduced-and-compared",
    authorization: "not-evaluated",
    directory: fileURLToPath(directory),
  }),
);
