import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import {
  canonicalJson,
  captureReplayBundle,
  captureWorkspaceSources,
  compareMetamapBundles,
  composeCorrespondences,
  emitTypeScriptPathTree,
  emitTypeScriptProjection,
  inspectCurrentSources,
  inspectSourceCapture,
  parseSemanticPolicy,
  parseSemanticProjectionSpec,
  RelationRegistry,
  replayMetamap,
  semanticReplayDigest,
  sourceCaptureLineage,
  sourceReceiptDigest,
  valueDigest,
} from "../../dist/index.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = fileURLToPath(new URL("./", import.meta.url));
const configPath = join(directory, "metamap.config.json");
const read = async (name) =>
  JSON.parse(
    await readFile(
      new URL(`../relations/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
const beforeFiles = await readdir(directory);
const capture = await captureWorkspaceSources(configPath, {
  permittedRoots: [root],
});
assert.deepEqual(await readdir(directory), beforeFiles);
const registry = new RelationRegistry(capture.relationPacks);
const evidence = capture.graph.mappings.map((mapping, index) => ({
  id: `urn:provenance:evidence:${index}`,
  subjects: [mapping.id],
  kind: "uncertainty:identity",
  result: "supports",
  producer: mapping.provenance.assertedBy,
}));
const assessments = capture.graph.mappings.map((mapping, index) => ({
  id: `urn:provenance:assessment:${index}`,
  subject: mapping.id,
  dimension: "identity",
  status: "supported",
  evidence: [evidence[index].id],
  assessor: mapping.provenance.assertedBy,
  sourceRevision: capture.graph.revision,
}));
const request = { ...(await read("request")), assessments, evidence };
const proposal = composeCorrespondences(capture.graph, request, registry);
if (proposal.status !== "proposed") throw new Error(JSON.stringify(proposal));
// Explicitly form a candidate; source attribution remains bound to the source graph.
const graph = {
  ...capture.graph,
  mappings: [...capture.graph.mappings, proposal.mapping],
};
const spec = parseSemanticProjectionSpec({
  ...(await read("projection")),
  id: "urn:provenance:projection",
  budget: "urn:provenance:budget",
});
const policy = parseSemanticPolicy({
  schemaVersion: "2.0.0",
  id: "urn:provenance:policy",
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
  evidence,
  assessments,
  derivations: [proposal.derivation],
  derivationLimits: request.bounds,
  uncertaintyRequirements: [
    {
      id: "urn:provenance:identity",
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
      classifications: graph.mappings.map((mapping, index) => ({
        id: `urn:provenance:classification:${index}`,
        select: { ids: [mapping.id] },
        classification: index < 2 ? "declared-directional" : "derived",
        cost: [2, 3, 0][index],
      })),
      maximumTotalCost: 5,
      requireCompleteClassification: true,
      requireCompleteDependencies: true,
    },
  ],
});
const options = {
  relationRegistry: registry,
  context: request.context,
  evaluatedAt: "2026-10-10T00:00:00.000Z",
  sourceCapture: capture,
  projections: [spec],
};
const bundle = captureReplayBundle(graph, policy, options);
const replayed = replayMetamap(bundle);
assert.equal(bundle.schemaVersion, "3.0.0");
assert.equal(replayed.status, "verified");
assert.equal(replayed.admitted, true);
assert.equal(bundle.expected.compilation.status, "viable");
const projected = bundle.expected.projections[0].result;
const tree = bundle.expected.projections[0].pathTree;
assert.equal(projected.status, "projected");
assert.equal(tree.status, "projected");
assert.equal(projected.projection.semantic.risk.totalCost, 5);
const strict = structuredClone(policy);
strict.id = "urn:provenance:policy:strict";
strict.uncertaintyRequirements.push({
  id: "urn:provenance:completeness",
  select: { ids: [proposal.mapping.id] },
  dimension: "completeness",
  allowedStates: ["supported"],
  requireEvidence: true,
});
const rejected = captureReplayBundle(graph, strict, options);
assert.equal(replayMetamap(rejected).status, "verified");
assert.equal(replayMetamap(rejected).admitted, false);
const compared = compareMetamapBundles(bundle, rejected);
assert.equal(compared.status, "compared");
assert.equal(compared.report.schemaVersion, "3.0.0");
assert.equal(compared.report.semantic.projections[0].riskChanged, null);
const inspection = inspectSourceCapture(capture, graph);
assert.equal(inspection.relationship, "candidate-differs");
assert.deepEqual(inspection.graphChanges.changes, [
  { change: "added", kind: "mapping", id: proposal.mapping.id },
]);
assert.equal(inspection.sourceRediscovery.status, "unavailable");
assert.equal(inspection.authentication, "not-evaluated");
assert.equal(inspection.authorizationNow, "not-evaluated");
assert.equal(inspection.active, "not-evaluated");
const current = await inspectCurrentSources(
  capture,
  configPath,
  { permittedRoots: [root] },
  graph,
);
assert.equal(current.sourceRediscovery.status, "current");
assert.deepEqual(await readdir(directory), beforeFiles);
const invalid = structuredClone(bundle),
  receipt = invalid.inputs.sourceReceipts[0];
receipt.configDigest = `sha256:${"0".repeat(64)}`;
receipt.digest = sourceReceiptDigest(receipt);
receipt.id = `urn:metamap:source-receipt:${receipt.digest.slice(7)}`;
invalid.digest = semanticReplayDigest(invalid);
invalid.id = `urn:metamap:replay:${invalid.digest.slice(7)}`;
const tampered = replayMetamap(invalid);
assert.equal(tampered.status, "rejected");
assert(
  tampered.issues.some(
    (issue) => issue.code === "SOURCE_RECEIPT_BINDING_MISMATCH",
  ),
);

const modules = {
  "network-bindings": emitTypeScriptProjection(projected.projection, {
    exportName: "networkBindings",
  }),
  "network-tree": emitTypeScriptPathTree(tree.pathTree, {
    exportName: "networkTree",
  }),
};
const temporary = await mkdtemp(join(tmpdir(), "metamap-provenance-native-"));
try {
  for (const [name, source] of Object.entries(modules)) {
    const path = join(temporary, `${name}.mjs`);
    await writeFile(
      path,
      ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ES2022,
        },
      }).outputText,
    );
  }
  const native = await import(
    pathToFileURL(join(temporary, "network-bindings.mjs")).href
  );
  assert.deepEqual(
    native
      .resolveNetworkBindings("urn:example:consumer")
      .slots.dependencies.map((value) => value.id)
      .sort(),
    ["urn:example:schema", "urn:example:service"],
  );
  const nested = await import(
    pathToFileURL(join(temporary, "network-tree.mjs")).href
  );
  assert.equal(
    nested.hydrateNetworkTree({ networkId: "88" }).network[":networkId"]._,
    "/network/88",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}

const lineage = sourceCaptureLineage(capture);
const outputs = {
  "source-capture": capture,
  snapshot: lineage.sourceSnapshot,
  receipts: lineage.sourceReceipts,
  graph,
  request,
  proposal,
  policy,
  "strict-policy": strict,
  spec,
  generation: bundle.expected.compilation.generation,
  projection: projected.projection,
  "path-tree": tree.pathTree,
  "source-inspection": inspection,
  "strict-result": rejected.expected.compilation,
  verification: {
    replayProfile: "3.0.0",
    sourceCaptureProfile: "1.0.0",
    policyProfile: "2.0.0",
    sources: lineage.sourceReceipts.map((value) => value.source),
    graphReplayVerified: true,
    rejectedReplayVerified: true,
    rawInputsEmbedded: false,
    offlineRediscovery: "unavailable",
    explicitLocalRediscovery: "current",
    receiptTamperingDetected: true,
    comparisonKeepsRejectedRiskUnknown: true,
    nativeModulesExecuted: true,
    totalCost: 5,
    authentication: "not-evaluated",
    authorizationNow: "not-evaluated",
    active: "not-evaluated",
  },
};
const generated = join(directory, "generated");
await mkdir(generated, { recursive: true });
for (const [name, value] of Object.entries(outputs))
  await writeFile(join(generated, `${name}.json`), `${canonicalJson(value)}\n`);
for (const [name, source] of Object.entries(modules))
  await writeFile(join(generated, `${name}.ts`), source);
console.log(
  "Source receipts, exact accepted/rejected replay, read-only inspection and native bindings verified",
);
