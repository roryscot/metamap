import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RelationRegistry,
  canonicalJson,
  captureReplayBundle,
  createMetamapExplanationRequest,
  createMetamapRepairRequest,
  explainMetamap,
  metamapExplanationDigest,
  parseMetamapExplanationReportJson,
  parseSourceCaptureJson,
  searchMetamapRepairs,
  valueDigest,
} from "../../dist/index.js";
import { explainMetamap as subpathExplain } from "@roryscot/metamap/explanation";

assert.equal(subpathExplain, explainMetamap);
const preserved = new Map();
const json = async (path) => {
  const url = new URL("../provenance/" + path, import.meta.url);
  const bytes = await readFile(url);
  preserved.set(url.href, bytes);
  return JSON.parse(bytes.toString("utf8"));
};
const graph = await json("generated/graph.json"),
  policy = await json("generated/policy.json"),
  spec = await json("generated/spec.json"),
  context = await json("context.json");
const sourceCapture = parseSourceCaptureJson(
  JSON.stringify(await json("generated/source-capture.json")),
);
const capture = () =>
  captureReplayBundle(graph, policy, {
    sourceCapture,
    context,
    evaluatedAt: "2026-10-10T00:00:00.000Z",
    projections: [spec],
    relationRegistry: new RelationRegistry(sourceCapture.relationPacks),
  });
const before = capture();
const removed = graph.mappings.shift();
policy.graph.digest = valueDigest(graph);
const current = capture();
const repairs = await searchMetamapRepairs(
  createMetamapRepairRequest(current, {
    consumer: spec.consumer,
    requiredProjections: [spec.id],
    allowedFacts: [
      { subject: removed.id, fact: "mapping.record" },
      { subject: policy.id, fact: "policy.graph" },
    ],
    protectedFacts: [],
    edits: [
      {
        id: "restore-declared-provider",
        kind: "restore-mapping",
        semanticCost: 1,
        mapping: removed,
      },
    ],
    bounds: {
      maximumCandidates: 8,
      maximumEdits: 2,
      maximumDerivationDepth: 4,
      maximumElapsedMilliseconds: 60000,
    },
  }),
);
assert.equal(repairs.status, "searched");
const request = createMetamapExplanationRequest(current, {
  before,
  repairs: repairs.report,
  consumer: spec.consumer,
  selection: {
    kind: "entity",
    id: "urn:example:consumer",
    projection: spec.id,
  },
});
const savedRequest = canonicalJson(request),
  result = explainMetamap(request);
assert.equal(result.status, "explained");
assert.equal(result.report.admission, "rejected");
assert.equal(result.report.projections[0].status, "generation-rejected");
assert(
  result.report.comparison.report.graph.changes.some(
    (change) => change.id === removed.id && change.change === "removed",
  ),
);
assert(
  result.report.sources.some((source) =>
    source.records.some((record) => record.id === removed.id),
  ),
);
assert(
  result.report.mappings
    .flatMap((mapping) => mapping.proofs)
    .every((proof) => proof.validation === "recorded"),
);
assert.equal(result.report.causality.uniqueCause, "not-established");
assert.equal(result.report.approval.currentAuthority, "not-evaluated");
assert.equal(result.report.alternatives.applied, false);
assert.equal(result.report.request.repairs.proposals.length, 1);
assert.deepEqual(
  parseMetamapExplanationReportJson(canonicalJson(result.report)),
  result.report,
);
const directory = await mkdtemp(join(tmpdir(), "metamap-explanation-example-"));
const cli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
let commandChecks = 0;
const command = (args, code) => {
  const response = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(response.status, code, response.stderr + response.stdout);
  commandChecks++;
  return response;
};
try {
  const input = join(directory, "request.json"),
    output = join(directory, "report.json");
  await writeFile(input, savedRequest);
  assert.deepEqual(JSON.parse(command(["explain", input], 0).stdout), result);
  command(["explain", input, output], 0);
  const written = await readFile(output);
  assert.deepEqual(JSON.parse(written.toString("utf8")), result);
  command(["explain", input, output], 1);
  assert.deepEqual(await readFile(output), written);
  command(["explain"], 2);
  command(["explain", input, "--apply"], 1);
  command(["explain", input, "--trust", input], 1);
  const duplicate = join(directory, "duplicate.json");
  await writeFile(duplicate, '{"id":"first","id":"second"}');
  command(["explain", duplicate, output], 1);
  assert.deepEqual(await readFile(output), written);
  const invalid = join(directory, "invalid.json");
  await writeFile(invalid, Buffer.from([0xc3, 0x28]));
  command(["explain", invalid, output], 1);
  assert.deepEqual(await readFile(output), written);
  const tampered = structuredClone(request);
  tampered.capture.expected.compilation.issues = [];
  await writeFile(invalid, JSON.stringify(tampered));
  const absent = join(directory, "must-not-exist.json");
  command(["explain", invalid, absent], 1);
  await assert.rejects(readFile(absent), { code: "ENOENT" });
  const unknown = structuredClone(request);
  unknown.selection.id = "urn:missing:operation";
  unknown.digest = metamapExplanationDigest(unknown);
  unknown.id = "urn:metamap:explanation-request:" + unknown.digest.slice(7);
  await writeFile(invalid, JSON.stringify(unknown));
  assert.equal(
    JSON.parse(command(["explain", invalid], 0).stdout).report.selection.state,
    "missing",
  );
  assert.equal((await readFile(input)).toString("utf8"), savedRequest);
  assert.equal(canonicalJson(request), savedRequest);
  for (const [url, bytes] of preserved)
    assert.deepEqual(await readFile(new URL(url)), bytes);
  if (process.argv[2])
    await writeFile(
      resolve(process.argv[2]),
      canonicalJson(result.report) + "\n",
      { encoding: "utf8", flag: "wx" },
    );
  console.log(
    JSON.stringify({
      explanation: "verified",
      native: "verified",
      commandChecks,
      admission: result.report.admission,
      changedOrigin: removed.id,
      uniqueCause: "not-established",
      currentAuthority: "not-evaluated",
      applied: false,
    }),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
