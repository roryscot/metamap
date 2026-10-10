import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  RelationRegistry,
  attachGovernedApprovalSignature,
  captureReplayBundle,
  createApprovalPayload,
  createGovernedChangeProposal,
  governedApprovalSigningBytes,
  parseSemanticPolicy,
  parseSourceCaptureJson,
  verifyGovernedApproval,
  verifyGovernedArtifactBytes,
} from "../../dist/index.js";
import { verifyGovernedApproval as subpathVerifier } from "@roryscot/metamap/governance";

assert.equal(subpathVerifier, verifyGovernedApproval);
const json = async (name) =>
  JSON.parse(
    await readFile(new URL("../provenance/" + name, import.meta.url), "utf8"),
  );
const sourceCapture = parseSourceCaptureJson(
  await readFile(
    new URL("../provenance/generated/source-capture.json", import.meta.url),
    "utf8",
  ),
);
const graph = await json("generated/graph.json");
const policy = parseSemanticPolicy(await json("generated/policy.json"));
const spec = await json("generated/spec.json");
const context = await json("context.json");
const candidate = captureReplayBundle(graph, policy, {
  sourceCapture,
  context,
  evaluatedAt: "2026-10-10T00:00:00.000Z",
  relationRegistry: new RelationRegistry(sourceCapture.relationPacks),
  projections: [spec],
});
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
// Synthetic keys remain in memory. No real trust roots, credentials or active state are used.
const pairs = new Map(
  ["owner", "agent"].map((principal) => [
    principal,
    generateKeyPairSync("ed25519"),
  ]),
);
const trust = {
  schemaVersion: "1.0.0",
  id: "urn:metamap:example:synthetic-trust",
  revision: "synthetic-r1",
  mode: "governed",
  consumer: spec.consumer,
  environment: "synthetic-example",
  stateDirectory: "/synthetic-protected-state",
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
    revoked: false,
    validFrom: "2026-10-10T00:00:00.000Z",
    validUntil: "2026-10-11T00:00:00.000Z",
  })),
};
const prepared = createGovernedChangeProposal(candidate, {
  consumer: spec.consumer,
  environment: trust.environment,
  proposer: "agent",
  baseline: null,
  trustedConfiguration: trust,
});
const approve = (principal) => {
  const payload = createApprovalPayload(prepared.proposal, {
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
const verificationContext = {
  trustedConfiguration: trust,
  baseline: null,
  now: "2026-10-10T01:30:00.000Z",
};
assert.equal(
  verifyGovernedApproval(
    prepared.proposal,
    approve("owner"),
    verificationContext,
  ).status,
  "authorized",
);
assert.equal(
  verifyGovernedApproval(
    prepared.proposal,
    approve("agent"),
    verificationContext,
  ).issues[0].code,
  "GOVERNANCE_OWNER_REQUIRED",
);
verifyGovernedArtifactBytes(prepared.proposal, prepared.files);
assert.throws(
  () =>
    verifyGovernedArtifactBytes(prepared.proposal, {
      ...prepared.files,
      "bindings-0.ts":
        prepared.files["bindings-0.ts"] + "// swapped after review\n",
    }),
  /GOVERNANCE_ARTIFACT_BYTES_MISMATCH|bytes/,
);

const directory = await mkdtemp(join(tmpdir(), "metamap-governance-example-"));
try {
  await writeFile(join(directory, "package.json"), '{"type":"module"}\n');
  for (const [path, bytes] of Object.entries(prepared.files))
    await writeFile(join(directory, path), bytes);
  const tsc = fileURLToPath(
    new URL("../../node_modules/typescript/bin/tsc", import.meta.url),
  );
  const check = spawnSync(
    process.execPath,
    [
      tsc,
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--outDir",
      join(directory, "native"),
      join(directory, "bindings-0.ts"),
      join(directory, "path-tree-0.ts"),
    ],
    { encoding: "utf8", timeout: 20000 },
  );
  assert.equal(check.status, 0, check.stderr + check.stdout);
  const bindings = await import(
    pathToFileURL(join(directory, "native/bindings-0.js")).href
  );
  const tree = await import(
    pathToFileURL(join(directory, "native/path-tree-0.js")).href
  );
  assert.deepEqual(
    bindings
      .resolveMetamapProjection("urn:example:consumer")
      .slots.dependencies.map((dependency) => dependency.id),
    ["urn:example:schema", "urn:example:service"],
  );
  assert.equal(
    tree.hydratePathTree({ networkId: "approved" }).network[":networkId"]._,
    "/network/approved",
  );
  console.log(
    JSON.stringify({
      approval: "verified",
      activation: "not-attempted",
      fileCount: prepared.proposal.artifacts.files.length,
      checks: [
        "exact-owner-approval",
        "agent-self-approval-rejected",
        "output-swap-rejected",
        "generated-typescript",
        "native-bindings",
        "native-path-hydration",
        "public-subpath",
      ],
    }),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
