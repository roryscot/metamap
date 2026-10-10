import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  RelationRegistry,
  captureReplayBundle,
  createMetamapRepairRequest,
  emitTypeScriptProjection,
  emitTypeScriptPathTree,
  metamapRepairDigest,
  parseMetamapRepairReportJson,
  parseSourceCaptureJson,
  searchMetamapRepairs,
  valueDigest,
} from "../../dist/index.js";
import { searchMetamapRepairs as subpathSearch } from "@roryscot/metamap/repair";

assert.equal(subpathSearch, searchMetamapRepairs);
const original = new Map();
const json = async (path) => {
  const url = new URL("../provenance/" + path, import.meta.url);
  const bytes = await readFile(url);
  original.set(url.href, bytes);
  return JSON.parse(bytes.toString("utf8"));
};
const graph = await json("generated/graph.json"),
  policy = await json("generated/policy.json"),
  spec = await json("generated/spec.json"),
  context = await json("context.json");
const sourceCapture = parseSourceCaptureJson(
  JSON.stringify(await json("generated/source-capture.json")),
);
const supplied = structuredClone(graph.mappings[0]);
graph.mappings.splice(0, 1);
policy.graph.digest = valueDigest(graph);
const baseline = captureReplayBundle(graph, policy, {
  sourceCapture,
  context,
  evaluatedAt: "2026-10-10T00:00:00.000Z",
  projections: [spec],
  relationRegistry: new RelationRegistry(sourceCapture.relationPacks),
});
assert.equal(baseline.expected.compilation.status, "rejected");
const request = createMetamapRepairRequest(baseline, {
  consumer: spec.consumer,
  requiredProjections: [spec.id],
  allowedFacts: [
    { subject: supplied.id, fact: "mapping.record" },
    { subject: policy.id, fact: "policy.graph" },
  ],
  protectedFacts: [],
  edits: [
    {
      id: "restore-declared-provider",
      kind: "restore-mapping",
      mapping: supplied,
      semanticCost: 1,
    },
  ],
  bounds: {
    maximumCandidates: 8,
    maximumEdits: 2,
    maximumDerivationDepth: 4,
    maximumElapsedMilliseconds: 60000,
  },
});
const unchanged = JSON.stringify(request);
const result = await searchMetamapRepairs(request);
assert.equal(result.status, "searched");
assert.equal(result.report.status, "complete");
assert.equal(result.report.proposals.length, 1);
const proposal = result.report.attempts[0];
assert.equal(proposal.viable, true);
assert.equal(proposal.authorization, "approval-required");
assert.equal(
  proposal.candidate.expected.projections[0].result.projection.semantic.risk
    .totalCost,
  5,
);
assert.deepEqual(
  parseMetamapRepairReportJson(JSON.stringify(result.report)),
  result.report,
);
assert.equal(JSON.stringify(request), unchanged);

const directory = await mkdtemp(join(tmpdir(), "metamap-repair-example-"));
const cli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
const command = (args, expected) => {
  const response = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(response.status, expected, response.stderr + response.stdout);
  return response;
};
let commandChecks = 0;
try {
  await writeFile(join(directory, "package.json"), '{"type":"module"}\n');
  const projection = proposal.candidate.expected.projections[0];
  await writeFile(
    join(directory, "bindings.ts"),
    emitTypeScriptProjection(projection.result.projection),
  );
  await writeFile(
    join(directory, "tree.ts"),
    emitTypeScriptPathTree(projection.pathTree.pathTree),
  );
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
      join(directory, "bindings.ts"),
      join(directory, "tree.ts"),
    ],
    { encoding: "utf8", timeout: 20000 },
  );
  assert.equal(check.status, 0, check.stderr + check.stdout);
  const bindings = await import(
    pathToFileURL(join(directory, "native/bindings.js")).href
  );
  const tree = await import(
    pathToFileURL(join(directory, "native/tree.js")).href
  );
  const providers = {
    "urn:example:service": () => "service-executed",
    "urn:example:schema": () => "schema-executed",
  };
  const dependencies = bindings.resolveMetamapProjection("urn:example:consumer")
    .slots.dependencies;
  assert.deepEqual(
    dependencies.map((dependency) => providers[dependency.id]()).sort(),
    ["schema-executed", "service-executed"],
  );
  assert.equal(
    tree.hydratePathTree({ networkId: "repaired" }).network[":networkId"]._,
    "/network/repaired",
  );
  const input = join(directory, "request.json"),
    output = join(directory, "report.json");
  await writeFile(input, JSON.stringify(request));
  const stdout = command(["repair", input], 0);
  commandChecks++;
  assert.equal(JSON.parse(stdout.stdout).report.proposals.length, 1);
  command(["repair", input, output], 0);
  commandChecks++;
  const saved = await readFile(output);
  command(["repair", input, output], 1);
  commandChecks++;
  assert.deepEqual(await readFile(output), saved);
  for (const flag of ["--apply", "--as-of"]) {
    command(["repair", input, flag, "2026-10-10T00:00:00.000Z"], 1);
    commandChecks++;
  }
  command(["repair"], 2);
  commandChecks++;
  const duplicate = join(directory, "duplicate.json");
  await writeFile(duplicate, '{"edits":[],"edits":[]}');
  command(["repair", duplicate, output], 1);
  commandChecks++;
  assert.deepEqual(await readFile(output), saved);
  const utf8 = join(directory, "utf8.json");
  await writeFile(utf8, Buffer.from([0xc3, 0x28]));
  command(["repair", utf8], 1);
  commandChecks++;
  const limited = structuredClone(request);
  limited.edits.push({
    ...structuredClone(limited.edits[0]),
    id: "other-restoration",
  });
  limited.edits.sort((a, b) => (a.id < b.id ? -1 : 1));
  limited.bounds.maximumCandidates = 1;
  limited.digest = metamapRepairDigest(limited);
  limited.id = "urn:metamap:repair-request:" + limited.digest.slice(7);
  const limitedPath = join(directory, "limited.json");
  await writeFile(limitedPath, JSON.stringify(limited));
  const incomplete = JSON.parse(
    command(["repair", limitedPath], 3).stdout,
  ).report;
  commandChecks++;
  assert.equal(incomplete.status, "incomplete");
  assert.equal(incomplete.minimality.status, "not-established");
  assert.equal(JSON.stringify(request), unchanged);
  const tampered = structuredClone(request);
  tampered.edits[0].semanticCost++;
  const tamperedPath = join(directory, "tampered.json"),
    rejectedOutput = join(directory, "rejected.json");
  await writeFile(tamperedPath, JSON.stringify(tampered));
  command(["repair", tamperedPath, rejectedOutput], 1);
  commandChecks++;
  await assert.rejects(readFile(rejectedOutput), { code: "ENOENT" });
  for (const [url, bytes] of original)
    assert.deepEqual(await readFile(new URL(url)), bytes);
  console.log(
    JSON.stringify({
      repair: "verified",
      applied: false,
      authorization: "approval-required",
      native: "verified",
      commandChecks,
      checks: [
        "supplied-provider-restored",
        "unchanged-proofs-and-risk",
        "native-provider-dispatch",
        "native-path-hydration",
        "bounded-cli",
        "strict-input",
        "no-apply-or-clock-option",
        "existing-output-preserved",
        "source-bytes-preserved",
        "public-subpath",
      ],
    }),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
