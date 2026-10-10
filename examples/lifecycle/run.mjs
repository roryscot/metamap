import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  MetamapActivator,
  ConstraintRegistry,
  RelationRegistry,
  captureWorkspaceSources,
  captureReplayBundle,
  createGovernedChangeProposal,
  createApprovalPayload,
  attachGovernedApprovalSignature,
  governedApprovalSigningBytes,
  governedActivationBaseline,
  replayMetamap,
  valueDigest,
  composeCorrespondences,
} from "@roryscot/metamap";

// Portable synthetic walkthrough. Linux permission separation is a distinct
// acceptance profile, documented in ACTIVATION.md and exercised by native CI.
const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const fixture = fileURLToPath(new URL("../provenance/", import.meta.url));
const json = async (name) =>
  JSON.parse(await readFile(join(fixture, name), "utf8"));
const sourceCapture = await captureWorkspaceSources(
  join(fixture, "metamap.config.json"),
  { permittedRoots: [packageRoot] },
);
assert.equal(sourceCapture.adapters.length, 2);
const initialGraph = await json("generated/graph.json");
const initialPolicy = await json("generated/policy.json");
const spec = await json("generated/spec.json"),
  context = await json("context.json");
const registry = new RelationRegistry(sourceCapture.relationPacks);
const capture = (graph, policy) =>
  captureReplayBundle(graph, policy, {
    sourceCapture,
    context,
    relationRegistry: registry,
    evaluatedAt: "2026-10-10T00:00:00.000Z",
    projections: [spec],
  });
const initial = capture(initialGraph, initialPolicy);
assert.equal(replayMetamap(initial).admitted, true);
const pairs = new Map(
  ["owner", "agent"].map((id) => [id, generateKeyPairSync("ed25519")]),
);
const actions = [
  "activate",
  "bootstrap",
  "rollback",
  "rebind-implementation",
  "change-graph",
  "change-authority",
  "change-policy",
  "relax-policy",
  "raise-budget",
  "add-waiver",
  "change-law",
  "change-source",
  "change-context",
  "change-projection",
];
const trust = {
  schemaVersion: "1.0.0",
  id: "urn:metamap:lifecycle:synthetic-trust",
  revision: "fixture-r1",
  mode: "governed",
  consumer: spec.consumer,
  environment: "synthetic-memory-walkthrough",
  stateDirectory: "/synthetic-state",
  proposalRoots: ["/synthetic-proposals"],
  principals: ["owner", "agent"].map((id) => ({
    id,
    role: id,
    revoked: false,
  })),
  keys: [...pairs].map(([principal, pair]) => ({
    id: principal + "-key",
    principal,
    algorithm: "Ed25519",
    publicKey: pair.publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64"),
    validFrom: "2026-10-10T00:00:00.000Z",
    validUntil: "2026-10-11T00:00:00.000Z",
    revoked: false,
  })),
  grants: ["owner", "agent"].map((principal) => ({
    id: principal + "-grant",
    principal,
    actions,
    scopes: [{ subject: "*", fact: "*" }],
    validFrom: "2026-10-10T00:00:00.000Z",
    validUntil: "2026-10-11T00:00:00.000Z",
    revoked: false,
  })),
};
const activator = new MetamapActivator(
  new RelationRegistry(),
  new ConstraintRegistry(),
  {
    mode: "governed",
    configuration: () => trust,
    clock: () => "2026-10-10T01:30:00.000Z",
  },
);
const prepare = (candidate, intent = "deploy") =>
  createGovernedChangeProposal(candidate, {
    consumer: trust.consumer,
    environment: trust.environment,
    proposer: "agent",
    baseline: activator.governedCurrent
      ? governedActivationBaseline(activator.governedCurrent)
      : null,
    intent,
    trustedConfiguration: trust,
  });
const approve = (proposal, principal = "owner") => {
  const payload = createApprovalPayload(proposal, {
    principal,
    key: principal + "-key",
    grants: [principal + "-grant"],
    issuedAt: "2026-10-10T01:00:00.000Z",
    expiresAt: "2026-10-10T02:00:00.000Z",
  });
  return attachGovernedApprovalSignature(
    payload,
    sign(
      null,
      governedApprovalSigningBytes(payload),
      pairs.get(principal).privateKey,
    ),
  );
};
const request = (prepared, principal = "owner") => ({
  schemaVersion: "1.0.0",
  ...prepared,
  approval: approve(prepared.proposal, principal),
});
const rejected = (candidate, code) => {
  const before = activator.governedCurrent;
  const result = activator.activate(candidate);
  assert.equal(result.status, "rejected");
  if (code)
    assert(
      result.issues.some((issue) => issue.code === code),
      JSON.stringify(result.issues),
    );
  assert.equal(activator.governedCurrent, before);
};
const root = await mkdtemp(join(tmpdir(), "metamap-lifecycle-native-"));
let nativeRuns = 0;
async function execute(current) {
  const path = join(root, `bindings-${nativeRuns++}.mjs`);
  const typescriptPath = path.replace(/\.mjs$/, ".ts");
  await writeFile(typescriptPath, current.files["bindings-0.ts"], {
    flag: "wx",
  });
  await promisify(execFile)(
    process.execPath,
    [
      fileURLToPath(import.meta.resolve("typescript/bin/tsc")),
      "--noEmit",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      typescriptPath,
    ],
    { timeout: 30000, maxBuffer: 4 * 1024 * 1024 },
  );
  await writeFile(
    path,
    ts.transpileModule(current.files["bindings-0.ts"], {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { flag: "wx" },
  );
  const module = await import(pathToFileURL(path).href);
  const result = module.resolveMetamapProjection("urn:example:consumer");
  assert.deepEqual(
    result.slots.dependencies.map((target) => target.id).sort(),
    ["urn:example:schema", "urn:example:service"],
  );
  return result;
}
try {
  const first = prepare(initial);
  rejected(request(first, "agent"), "GOVERNANCE_OWNER_REQUIRED");
  assert.equal(activator.activate(request(first)).status, "activated");
  const original = activator.governedCurrent;
  await execute(original);
  const moved = structuredClone(initialGraph);
  moved.entities.find((entity) => entity.id === "urn:example:schema").locators =
    [{ uri: "json-schema:schemas/moved.json" }];
  const movedPolicy = {
    ...initialPolicy,
    graph: { id: moved.id, digest: valueDigest(moved) },
  };
  const movedBundle = capture(moved, movedPolicy);
  assert.equal(replayMetamap(movedBundle).admitted, true);
  assert.deepEqual(
    moved.entities.map((entity) => entity.id),
    initialGraph.entities.map((entity) => entity.id),
  );
  const next = prepare(movedBundle);
  rejected({ ...request(next), approval: approve(first.proposal) });
  const tampered = structuredClone(request(next));
  tampered.files["bindings-0.ts"] += "\n";
  rejected(tampered);
  assert.equal(activator.activate(request(next)).status, "activated");
  const movedActive = activator.governedCurrent;
  const native = await execute(movedActive);
  assert.equal(
    native.slots.dependencies.find(
      (target) => target.id === "urn:example:schema",
    ).locators[0].uri,
    "json-schema:schemas/moved.json",
  );
  rejected(request(first), "GOVERNANCE_STALE_BASELINE");

  const expanded = structuredClone(moved);
  expanded.authorities.push({
    id: "urn:metamap:lifecycle:proposed-self-owner",
    concept: expanded.entities[0].id,
    source: expanded.entities[0].id,
    mode: "canonical",
    facts: ["schema"],
    provenance: { status: "declared", assertedBy: "agent" },
  });
  const expandedBundle = capture(expanded, {
    ...movedPolicy,
    graph: { id: expanded.id, digest: valueDigest(expanded) },
  });
  assert.equal(replayMetamap(expandedBundle).admitted, true);
  const expansion = prepare(expandedBundle);
  assert(
    expansion.proposal.requirements.some(
      (requirement) => requirement.action === "change-authority",
    ),
  );
  rejected(request(expansion, "agent"), "GOVERNANCE_OWNER_REQUIRED");

  const missing = structuredClone(moved);
  missing.mappings = missing.mappings.filter(
    (mapping) => mapping.id !== "urn:example:service-schema",
  );
  const missingBundle = capture(missing, {
    ...movedPolicy,
    graph: { id: missing.id, digest: valueDigest(missing) },
  });
  assert.equal(replayMetamap(missingBundle).admitted, false);
  assert.throws(() => prepare(missingBundle));
  assert.equal(activator.governedCurrent, movedActive);

  const ambiguityGraph = structuredClone(moved);
  ambiguityGraph.entities.push({
    id: "urn:example:other-schema",
    kind: "configuration",
  });
  ambiguityGraph.mappings.push({
    id: "urn:example:service-other-schema",
    relation: "example:depends",
    sources: ["urn:example:service"],
    targets: ["urn:example:other-schema"],
    cardinality: "one-to-one",
    lossiness: "lossless",
    provenance: { status: "declared", assertedBy: "service-owner" },
  });
  const ambiguityPolicy = {
    ...movedPolicy,
    graph: { id: ambiguityGraph.id, digest: valueDigest(ambiguityGraph) },
  };
  const singleTarget = {
    ...spec,
    id: "urn:metamap:lifecycle:single-schema",
    budget: null,
    select: { ids: ["urn:example:service"] },
    slots: [
      {
        name: "schema",
        relation: "example:depends",
        direction: "outgoing",
        cardinality: "exactly-one",
      },
    ],
  };
  const ambiguousBundle = captureReplayBundle(ambiguityGraph, ambiguityPolicy, {
    sourceCapture,
    context,
    relationRegistry: registry,
    evaluatedAt: "2026-10-10T00:00:00.000Z",
    projections: [singleTarget],
  });
  assert.equal(ambiguousBundle.expected.compilation.status, "viable");
  assert.equal(
    ambiguousBundle.expected.projections[0].result.status,
    "rejected",
  );
  assert.equal(replayMetamap(ambiguousBundle).admitted, false);
  assert.throws(() => prepare(ambiguousBundle));
  assert.equal(activator.governedCurrent, movedActive);

  const lowerBudget = structuredClone(movedPolicy);
  lowerBudget.riskBudgets[0].maximumTotalCost = 4;
  const budgetBundle = capture(moved, lowerBudget);
  assert.equal(replayMetamap(budgetBundle).admitted, false);
  assert.throws(() => prepare(budgetBundle));
  assert.equal(activator.governedCurrent, movedActive);

  const forbidden = composeCorrespondences(
    sourceCapture.graph,
    {
      schemaVersion: "1.0.0",
      law: "urn:metamap:lifecycle:undeclared-identity-inference",
      premises: sourceCapture.graph.mappings.map((mapping) => mapping.id),
      context,
      bounds: { maxDepth: 8, maxDerivations: 32 },
      derivations: [],
      assessments: [],
      evidence: [],
    },
    registry,
  );
  assert.equal(forbidden.status, "unsupported");
  assert(!Object.hasOwn(forbidden, "mapping"));
  assert.equal(activator.governedCurrent, movedActive);

  const strict = structuredClone(movedPolicy);
  strict.uncertaintyRequirements.push({
    id: "urn:metamap:lifecycle:completeness",
    select: { ids: ["urn:example:consumer-schema"] },
    dimension: "completeness",
    allowedStates: ["supported"],
    requireEvidence: true,
  });
  const strictBundle = capture(moved, strict);
  assert.equal(replayMetamap(strictBundle).admitted, false);
  assert.throws(() => prepare(strictBundle));
  assert.equal(activator.governedCurrent, movedActive);

  const rollback = prepare(initial, "rollback");
  rejected(request(rollback, "agent"), "GOVERNANCE_OWNER_REQUIRED");
  assert.equal(activator.activate(request(rollback)).status, "activated");
  assert.deepEqual(activator.governedCurrent.files, original.files);
  assert.notEqual(
    activator.governedCurrent.manifest.digest,
    original.manifest.digest,
  );
  await execute(activator.governedCurrent);
  console.log(
    JSON.stringify({
      lifecycle: "verified",
      sourceShards: 2,
      checkedDerivations: initialPolicy.derivations.length,
      ordinalCost:
        initial.expected.projections[0].result.projection.semantic.risk
          .totalCost,
      nativeRuns,
      physicalMove: "stable-identities-new-bindings",
      staleApproval: "rejected",
      tamperedOutput: "rejected",
      authorityExpansion: "viable-owner-approval-required",
      missingBinding: "rejected-preserved-active",
      ambiguousBinding: "rejected-preserved-active",
      lowerBudget: "rejected-preserved-active",
      undeclaredInference: "unsupported-no-binding",
      strictEvidence: "rejected-preserved-active",
      rollback: "fresh-owner-approval-verified",
      activationProfile: "synthetic-in-memory",
      permissionBoundary: "separate-Linux-native-acceptance",
      productionActive: false,
      privateKeysRetained: false,
    }),
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
