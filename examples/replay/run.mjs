import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const cli = join(root, "dist/cli.js");
const directory = await mkdtemp(join(tmpdir(), "metamap-replay-"));
const run = (args, status = 0) => {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    status,
    `${args[0]}: ${result.stderr}\n${result.stdout}`,
  );
  return result;
};
const captureArgs = (graph, output) => [
  "capture",
  graph,
  "examples/routing/viability-policy.json",
  output,
  "--as-of",
  "2026-09-15T00:00:00.000Z",
  "--relation-pack",
  "relation-packs/routing.json",
  "--projection",
  "examples/routing/projection.json",
];

try {
  const bundlePath = join(directory, "routing.replay.json");
  run(captureArgs("examples/routing/graph.json", bundlePath));
  const original = await readFile(bundlePath, "utf8");
  const replayed = JSON.parse(run(["replay", bundlePath]).stdout);
  assert.equal(replayed.status, "verified");
  assert.equal(replayed.admitted, true);
  const unchanged = JSON.parse(run(["compare", bundlePath, bundlePath]).stdout);
  assert.equal(unchanged.status, "compared");
  assert.deepEqual(unchanged.report.inputChanges, []);
  run(captureArgs("examples/routing/graph.json", bundlePath), 1);
  assert.equal(await readFile(bundlePath, "utf8"), original);
  run(
    [
      "capture",
      "examples/routing/graph.json",
      "examples/routing/viability-policy.json",
    ],
    2,
  );

  const tampered = JSON.parse(original);
  tampered.inputs.context.environment = "changed";
  const tamperedPath = join(directory, "tampered.json");
  await writeFile(tamperedPath, JSON.stringify(tampered));
  const rejected = JSON.parse(run(["replay", tamperedPath], 1).stdout);
  assert.equal(rejected.status, "rejected");
  assert(
    rejected.issues.some((issue) => issue.code === "REPLAY_DIGEST_MISMATCH"),
  );
  const failedComparison = JSON.parse(
    run(["compare", bundlePath, tamperedPath], 1).stdout,
  );
  assert.equal(failedComparison.status, "rejected");
  assert(failedComparison.issues.some((issue) => issue.side === "after"));

  const graph = JSON.parse(
    await readFile(join(root, "examples/routing/graph.json"), "utf8"),
  );
  graph.mappings[0].lossiness = "unknown";
  const graphPath = join(directory, "rejected-graph.json");
  await writeFile(graphPath, JSON.stringify(graph));
  const rejectedBundle = join(directory, "rejected.replay.json");
  run(captureArgs(graphPath, rejectedBundle), 1);
  const reproducedRejection = JSON.parse(
    run(["replay", rejectedBundle], 1).stdout,
  );
  assert.equal(reproducedRejection.status, "verified");
  assert.equal(reproducedRejection.admitted, false);
  assert.equal(reproducedRejection.outputs.compilation.status, "rejected");
  const rejectedComparison = JSON.parse(
    run(["compare", bundlePath, rejectedBundle], 1).stdout,
  );
  assert.equal(rejectedComparison.status, "compared");
  assert.equal(rejectedComparison.report.after.admitted, false);
  assert(rejectedComparison.report.issues.introduced.length > 0);
  const reportPath = join(directory, "comparison.json");
  run(["compare", bundlePath, bundlePath, reportPath]);
  const reportText = await readFile(reportPath, "utf8");
  run(["compare", bundlePath, bundlePath, reportPath], 1);
  assert.equal(await readFile(reportPath, "utf8"), reportText);
  console.log(
    "PASS: CLI replay/comparison, corruption rejection, reproduced rejection, and overwrite protection",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
