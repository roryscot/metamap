import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalJson } from "../canonical.js";
import { sourceReceiptDigest } from "../provenance.js";
import { parseSourceReplayJson } from "../semantic-replay.js";
import { parseSourceCounterfactualJson } from "../semantic-counterfactual.js";
import {
  rehashSourceReplay,
  writeSourceWorkspace,
} from "./helpers/source-fixture.js";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
function run(...args: string[]) {
  const result = spawnSync(process.execPath, ["dist/cli.js", ...args], {
    encoding: "utf8",
    timeout: 20000,
  });
  if (result.error) throw result.error;
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "metamap-source-cli-"));
  roots.push(root);
  const inputs = await writeSourceWorkspace(root);
  const paths = {
    capture: join(root, "capture.json"),
    graph: join(root, "candidate.json"),
    policy: join(root, "policy.json"),
    spec: join(root, "spec.json"),
    context: join(root, "context.json"),
    bundle: join(root, "replay.json"),
  };
  await Promise.all([
    writeFile(paths.graph, JSON.stringify(inputs.graph)),
    writeFile(paths.policy, JSON.stringify(inputs.policy)),
    writeFile(paths.spec, JSON.stringify(inputs.spec)),
    writeFile(paths.context, JSON.stringify(inputs.options.context)),
  ]);
  const capture = () =>
    run("sources", inputs.configPath, paths.capture, "--allow-root", root);
  const evaluate = (output = paths.bundle, source = paths.capture) =>
    run(
      "capture",
      paths.graph,
      paths.policy,
      output,
      "--source-capture",
      source,
      "--relation-pack",
      join(root, "pack.json"),
      "--projection",
      paths.spec,
      "--context",
      paths.context,
      "--as-of",
      inputs.options.evaluatedAt,
    );
  return { ...inputs, paths, capture, evaluate };
}
describe("packaged provenance CLI and native consumer acceptance", () => {
  it("requires explicit local roots and refuses incomplete or unknown commands", async () => {
    const inputs = await fixture();
    expect(run("sources", inputs.configPath).code).toBe(2);
    expect(
      run("sources", inputs.configPath, "--fetch", "https://untrusted.invalid")
        .code,
    ).toBe(1);
    expect(inputs.capture().code).toBe(0);
    expect(
      run("provenance", inputs.paths.capture, "--workspace", inputs.configPath)
        .code,
    ).toBe(2);
    expect(
      run("provenance", inputs.paths.capture, "--allow-root", inputs.root).code,
    ).toBe(2);
    expect(
      run(
        "provenance",
        inputs.paths.capture,
        "--workspace",
        inputs.configPath,
        "--workspace",
        inputs.configPath,
        "--allow-root",
        inputs.root,
      ).code,
    ).toBe(2);
  }, 45000);
  it("writes only the requested capture and preserves existing files and caches", async () => {
    const inputs = await fixture(),
      before = await readdir(inputs.root);
    expect(inputs.capture().code).toBe(0);
    expect(await readdir(inputs.root)).toEqual(
      [...before, "capture.json"].sort(),
    );
    const saved = await readFile(inputs.paths.capture, "utf8");
    expect(inputs.capture().code).toBe(1);
    expect(await readFile(inputs.paths.capture, "utf8")).toBe(saved);
    expect(await readdir(inputs.root)).not.toContain(".cache");
  }, 45000);
  it("captures, replays, inspects, type-checks and executes checked native projection/tree modules", async () => {
    const inputs = await fixture();
    expect(inputs.capture().code).toBe(0);
    const evaluation = inputs.evaluate();
    expect(evaluation.stderr).not.toContain("Error");
    expect(evaluation.code).toBe(0);
    const bundle = parseSourceReplayJson(
      await readFile(inputs.paths.bundle, "utf8"),
    );
    expect(bundle.schemaVersion).toBe("3.0.0");
    const replay = run("replay", inputs.paths.bundle);
    expect(replay.code).toBe(0);
    expect(JSON.parse(replay.stdout)).toMatchObject({
      status: "verified",
      admitted: true,
      outputs: {
        sourceInspection: {
          relationship: "candidate-differs",
          sourceRediscovery: { status: "unavailable" },
        },
      },
    });
    const inspect = run("provenance", inputs.paths.bundle);
    expect(inspect.code).toBe(0);
    expect(JSON.parse(inspect.stdout)).toMatchObject({
      authentication: "not-evaluated",
      authorizationNow: "not-evaluated",
      active: "not-evaluated",
    });
    const generation = join(inputs.root, "generation.json");
    if (bundle.expected.compilation.status !== "viable")
      throw new Error(JSON.stringify(bundle.expected));
    await writeFile(
      generation,
      canonicalJson(bundle.expected.compilation.generation),
    );
    for (const [format, name, exportName] of [
      ["typescript", "bindings", "sourceBindings"],
      ["path-tree-typescript", "tree", "sourceTree"],
    ]) {
      const output = join(inputs.root, `${name}.ts`);
      const linked = run(
        "link",
        inputs.paths.graph,
        generation,
        inputs.paths.spec,
        output,
        "--policy",
        inputs.paths.policy,
        "--relation-pack",
        join(inputs.root, "pack.json"),
        "--format",
        format,
        "--export",
        exportName,
      );
      expect(linked.stderr).not.toContain("Error");
      expect(linked.code).toBe(0);
      await writeFile(
        join(inputs.root, `${name}.mjs`),
        ts.transpileModule(await readFile(output, "utf8"), {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
          },
        }).outputText,
      );
    }
    const checked = spawnSync(
      process.execPath,
      [
        "node_modules/typescript/bin/tsc",
        "--noEmit",
        "--target",
        "ES2022",
        "--module",
        "NodeNext",
        "--moduleResolution",
        "NodeNext",
        join(inputs.root, "bindings.ts"),
        join(inputs.root, "tree.ts"),
      ],
      { encoding: "utf8", timeout: 20000 },
    );
    expect(checked.stdout + checked.stderr).toBe("");
    expect(checked.status).toBe(0);
    const native = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
import assert from 'node:assert/strict';
const bindings=await import(${JSON.stringify(pathToFileURL(join(inputs.root, "bindings.mjs")).href)});
assert.equal(bindings.resolveSourceBindings('urn:example:consumer').slots.schema.id,'urn:example:schema');
assert.throws(()=>bindings.resolveSourceBindings('urn:example:missing'),/Unknown Metamap identity/);
const tree=await import(${JSON.stringify(pathToFileURL(join(inputs.root, "tree.mjs")).href)});
assert.equal(tree.hydrateSourceTree({networkId:'77'}).network[':networkId']._,'/network/77');
`,
      ],
      { encoding: "utf8", timeout: 20000 },
    );
    expect(native.stdout + native.stderr).toBe("");
    expect(native.status).toBe(0);
  }, 45000);
  it("retains a rejected source-bound evaluation and compares its unknown expression state", async () => {
    const inputs = await fixture();
    expect(inputs.capture().code).toBe(0);
    expect(inputs.evaluate().code).toBe(0);
    inputs.graph.mappings.splice(1, 1);
    inputs.rebind();
    await writeFile(inputs.paths.graph, JSON.stringify(inputs.graph));
    await writeFile(inputs.paths.policy, JSON.stringify(inputs.policy));
    const rejected = join(inputs.root, "rejected.json");
    expect(inputs.evaluate(rejected).code).toBe(1);
    const replay = run("replay", rejected);
    expect(replay.code).toBe(1);
    expect(JSON.parse(replay.stdout)).toMatchObject({
      status: "verified",
      admitted: false,
      outputs: {
        compilation: { status: "rejected" },
        sourceInspection: { relationship: "candidate-differs" },
      },
    });
    const compared = run("compare", inputs.paths.bundle, rejected);
    expect(compared.code).toBe(1);
    const result = JSON.parse(compared.stdout);
    expect(result.status).toBe("compared");
    const report = parseSourceCounterfactualJson(canonicalJson(result.report));
    expect(report.semantic.projections[0]).toMatchObject({
      beforeKnown: true,
      afterKnown: false,
      riskChanged: null,
    });
  }, 45000);
  it("reports byte changes during explicit inspection while preserving the saved capture", async () => {
    const inputs = await fixture();
    expect(inputs.capture().code).toBe(0);
    const saved = await readFile(inputs.paths.capture, "utf8");
    expect(
      run(
        "provenance",
        inputs.paths.capture,
        "--workspace",
        inputs.configPath,
        "--allow-root",
        inputs.root,
      ).code,
    ).toBe(0);
    await writeFile(
      join(inputs.root, "network.json"),
      JSON.stringify(inputs.adapters[0].document, null, 2),
    );
    const current = run(
      "provenance",
      inputs.paths.capture,
      "--workspace",
      inputs.configPath,
      "--allow-root",
      inputs.root,
    );
    expect(current.code).toBe(1);
    expect(JSON.parse(current.stdout).sourceRediscovery.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subject: "network", component: "inputs" }),
      ]),
    );
    expect(await readFile(inputs.paths.capture, "utf8")).toBe(saved);
    expect(await readdir(inputs.root)).not.toContain(".cache");
  }, 45000);
  it("keeps graph replay valid when raw sources disappear and reports current rediscovery unavailable", async () => {
    const inputs = await fixture();
    expect(inputs.capture().code).toBe(0);
    expect(inputs.evaluate().code).toBe(0);
    await rm(join(inputs.root, "network.json"));
    expect(run("provenance", inputs.paths.capture).code).toBe(0);
    expect(run("replay", inputs.paths.bundle).code).toBe(0);
    const current = run(
      "provenance",
      inputs.paths.bundle,
      "--workspace",
      inputs.configPath,
      "--allow-root",
      inputs.root,
    );
    expect(current.code).toBe(2);
    expect(JSON.parse(current.stdout).sourceRediscovery.status).toBe(
      "unavailable",
    );
  }, 45000);
  it("rejects receipt tampering even after receipt and distribution bundle are rehashed", async () => {
    const inputs = await fixture();
    expect(inputs.capture().code).toBe(0);
    expect(inputs.evaluate().code).toBe(0);
    const bundle = structuredClone(
        parseSourceReplayJson(await readFile(inputs.paths.bundle, "utf8")),
      ),
      receipt = bundle.inputs.sourceReceipts[0];
    receipt.configDigest = `sha256:${"0".repeat(64)}`;
    receipt.digest = sourceReceiptDigest(receipt);
    receipt.id = `urn:metamap:source-receipt:${receipt.digest.slice(7)}`;
    const invalid = join(inputs.root, "tampered.json");
    await writeFile(invalid, canonicalJson(rehashSourceReplay(bundle)));
    const replay = run("replay", invalid);
    expect(replay.code).toBe(1);
    expect(JSON.parse(replay.stdout)).toMatchObject({
      status: "rejected",
      issues: [{ code: "SOURCE_RECEIPT_BINDING_MISMATCH" }],
    });
    expect(run("provenance", invalid).code).toBe(1);
  }, 45000);
  it("refuses duplicate capture options, source capture for legacy policy and decoded duplicate keys", async () => {
    const inputs = await fixture();
    expect(inputs.capture().code).toBe(0);
    const output = join(inputs.root, "preserved.json");
    await writeFile(output, "preserved");
    expect(
      run(
        "capture",
        inputs.paths.graph,
        inputs.paths.policy,
        output,
        "--as-of",
        inputs.options.evaluatedAt,
        "--source-capture",
        inputs.paths.capture,
        "--source-capture",
        inputs.paths.capture,
      ).code,
    ).toBe(2);
    await writeFile(
      inputs.paths.policy,
      JSON.stringify({
        schemaVersion: "1.0.0",
        id: "urn:legacy:policy",
        graph: { id: inputs.graph.id },
        mappings: [],
        constraints: [],
        evidence: [],
      }),
    );
    expect(inputs.evaluate(output).code).toBe(1);
    expect(await readFile(output, "utf8")).toBe("preserved");
    await writeFile(
      inputs.paths.capture,
      (await readFile(inputs.paths.capture, "utf8")).replace(
        '"schemaVersion":"1.0.0"',
        '"schemaVersion":"1.0.0","schemaVersion":"1.0.0"',
      ),
    );
    expect(run("provenance", inputs.paths.capture).code).toBe(1);
  }, 45000);
  it("denies a symlink escape using only caller-selected root authority", async () => {
    const inputs = await fixture(),
      outside = await mkdtemp(join(tmpdir(), "metamap-cli-outside-"));
    roots.push(outside);
    expect(inputs.capture().code).toBe(0);
    await writeFile(join(outside, "secret.json"), "must never be parsed");
    await symlink(outside, join(inputs.root, "escape"));
    inputs.config.sources[0] = {
      ...inputs.config.sources[0],
      path: "escape/secret.json",
    };
    await writeFile(inputs.configPath, JSON.stringify(inputs.config));
    const current = run(
      "provenance",
      inputs.paths.capture,
      "--workspace",
      inputs.configPath,
      "--allow-root",
      inputs.root,
    );
    expect(current.code).toBe(2);
    expect(JSON.parse(current.stdout).sourceRediscovery.reason).toContain(
      "SOURCE_LOCATOR_DENIED",
    );
    const sources = run(
      "sources",
      inputs.configPath,
      "--allow-root",
      inputs.root,
    );
    expect(sources.code).toBe(1);
    expect(sources.stderr).toContain("SOURCE_LOCATOR_DENIED");
  }, 45000);
  it("compares changed captured sources without silently changing the explicit candidate", async () => {
    const inputs = await fixture();
    expect(inputs.capture().code).toBe(0);
    expect(inputs.evaluate().code).toBe(0);
    const shard = structuredClone(inputs.adapters[0].document);
    shard.entities[0].label = "changed source";
    await writeFile(join(inputs.root, "network.json"), JSON.stringify(shard));
    const changedCapture = join(inputs.root, "changed-capture.json");
    expect(
      run(
        "sources",
        inputs.configPath,
        changedCapture,
        "--allow-root",
        inputs.root,
      ).code,
    ).toBe(0);
    const candidate = join(inputs.root, "changed-lineage.json");
    expect(inputs.evaluate(candidate, changedCapture).code).toBe(0);
    const compared = run("compare", inputs.paths.bundle, candidate);
    expect(compared.code).toBe(0);
    const report = parseSourceCounterfactualJson(
      canonicalJson(JSON.parse(compared.stdout).report),
    );
    expect(report.graph.changes).toEqual([]);
    expect(report.inputChanges.map((change) => change.input)).toEqual(
      expect.arrayContaining([
        "sourceCapture",
        "sourceReceipts",
        "sourceSnapshot",
      ]),
    );
    expect(report.provenance.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subject: "network", component: "shard" }),
      ]),
    );
  }, 45000);
});
