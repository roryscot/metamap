import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  RelationRegistry,
  canonicalJson,
  captureReplayBundle,
  captureWorkspaceSources,
  contentDigest,
  createSourceCapture,
  discoverWorkspace,
  exportSssomTsv,
  inspectCurrentSources,
  interpretSssomDocument,
  loadMetamapConfig,
  parseSssomTsv,
  replayMetamap,
  scientificSkosRelationPack,
  valueDigest,
} from "../../dist/index.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const cli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
const named = process.argv[2] === undefined ? null : resolve(process.argv[2]);
if (process.argv.length > 3)
  throw new Error("Use source.mjs [new-output-directory]");
if (named) await mkdir(named);
const root =
  named ?? (await mkdtemp(join(tmpdir(), "metamap-scientific-source-")));
const write = (name, value) =>
  writeFile(
    join(root, name),
    typeof value === "string" ? value : canonicalJson(value) + "\n",
    { flag: "wx" },
  );
let commands = 0;
async function run(expected, ...args) {
  let result;
  try {
    result = {
      code: 0,
      ...(await promisify(execFile)(process.execPath, [cli, ...args], {
        timeout: 30000,
        maxBuffer: 32 * 1024 * 1024,
      })),
    };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    result = { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
  assert.equal(result.code, expected, result.stderr);
  commands++;
  return result;
}
try {
  const bytes = await readFile(join(here, "fixtures/mgi-subset.sssom.tsv"));
  const manifest = JSON.parse(
    await readFile(join(here, "fixtures/mgi-subset-manifest.json"), "utf8"),
  );
  assert.equal(contentDigest(bytes), manifest.subsetByteDigest);
  assert.equal(bytes.byteLength, manifest.subsetByteCount);
  assert.equal(manifest.sourceRecordCount, 1564);
  assert.equal(manifest.subsetRecordCount, 7);
  const raw = parseSssomTsv(bytes);
  assert.equal(raw.rows.length, 7);
  assert.equal(raw.metadata.license, manifest.license);
  await write("mapping.data", bytes.toString("utf8"));
  await write("pack.json", scientificSkosRelationPack());
  const config = {
    schemaVersion: "1.0.0",
    id: "urn:metamap:example:scientific-source",
    namespace: "scientific-source",
    repository: "metamap-scientific-fixture",
    repositoryRoot: ".",
    sources: [
      {
        id: "mgi-subset",
        adapter: "sssom-tsv",
        path: "mapping.data",
        formatVersion: "1.0.0",
        sourceRevision: manifest.sourceCommit,
        provenance: manifest,
      },
    ],
    relationPacks: ["pack.json"],
    correspondences: [],
    outputs: {
      graph: "generated/graph.json",
      snapshot: "generated/snapshot.json",
      report: "generated/report.md",
      documentation: "generated/graph.md",
      cache: ".cache",
    },
  };
  await write("metamap.config.json", config);
  const registry = new RelationRegistry();
  const discovered = await discoverWorkspace(
    await loadMetamapConfig(join(root, "metamap.config.json")),
    {
      relationRegistry: registry,
      useCache: false,
      writeCache: false,
      portablePackUris: true,
    },
  );
  const capture = createSourceCapture(config, discovered, registry);
  assert.deepEqual(
    capture,
    await captureWorkspaceSources(join(root, "metamap.config.json"), {
      permittedRoots: [root],
    }),
  );
  assert.equal(discovered.graph.mappings.length, 7);
  assert.equal(new Set(discovered.graph.mappings.map((m) => m.id)).size, 7);
  assert.equal(
    new Set(discovered.graph.mappings.map((m) => m.relation)).size,
    5,
  );
  assert.deepEqual(discovered.graph.authorities, []);
  assert(
    discovered.graph.mappings.every(
      (m) => m.lossiness === "unknown" && m.provenance.confidence === undefined,
    ),
  );
  const exported = exportSssomTsv(raw),
    condensed = exportSssomTsv(raw, { condense: true });
  assert.deepEqual(parseSssomTsv(exported.text).rows, raw.rows);
  assert.deepEqual(
    interpretSssomDocument(parseSssomTsv(condensed.text)).records.map(
      (r) => r.fields,
    ),
    interpretSssomDocument(raw).records.map((r) => r.fields),
  );
  await write("export.sssom.tsv", exported.text);
  await write("condensed.sssom.tsv", condensed.text);
  await write("raw-document.json", raw);
  await write("interpretation.json", interpretSssomDocument(raw));
  await write("loss-report.json", exported.loss);
  await write("graph.json", discovered.graph);
  await write("source-capture.json", capture);
  const policy = {
    schemaVersion: "2.0.0",
    id: "urn:metamap:example:scientific-source-policy",
    graph: { id: discovered.graph.id, digest: valueDigest(discovered.graph) },
    mappings: [
      {
        select: { ids: discovered.graph.mappings.map((m) => m.id) },
        coverage: "partial",
        determinism: "deterministic",
        reversibility: "irreversible",
      },
    ],
    constraints: [],
    evidence: [],
    derivations: [],
    derivationLimits: { maxDepth: 8, maxDerivations: 32 },
    assessments: [],
    uncertaintyRequirements: [],
    riskBudgets: [],
  };
  await write("policy.json", policy);
  const bundle = captureReplayBundle(discovered.graph, policy, {
    evaluatedAt: "2026-10-10T00:00:00.000Z",
    relationRegistry: registry,
    sourceCapture: capture,
  });
  assert.equal(replayMetamap(bundle).status, "verified");
  assert.equal(replayMetamap(bundle).admitted, false);
  assert(
    bundle.expected.compilation.issues.some(
      (issue) => issue.code === "UNDECLARED_LOSSINESS",
    ),
  );
  await write("replay.json", bundle);
  await run(
    0,
    "sources",
    join(root, "metamap.config.json"),
    join(root, "command-capture.json"),
    "--allow-root",
    root,
  );
  assert.deepEqual(
    JSON.parse(await readFile(join(root, "command-capture.json"), "utf8")),
    capture,
  );
  await run(
    0,
    "provenance",
    join(root, "command-capture.json"),
    "--workspace",
    join(root, "metamap.config.json"),
    "--allow-root",
    root,
  );
  await run(1, "replay", join(root, "replay.json"));
  await run(
    1,
    "sources",
    join(root, "metamap.config.json"),
    join(root, "command-capture.json"),
    "--allow-root",
    root,
  );
  await run(2, "sources", join(root, "metamap.config.json"));
  assert.equal(
    (
      await inspectCurrentSources(capture, join(root, "metamap.config.json"), {
        permittedRoots: [root],
      })
    ).sourceRediscovery.status,
    "current",
  );
  assert.equal(
    contentDigest(await readFile(join(root, "mapping.data"))),
    manifest.subsetByteDigest,
  );
  assert.equal(
    contentDigest(await readFile(join(here, "fixtures/mgi-subset.sssom.tsv"))),
    manifest.subsetByteDigest,
  );
  console.log(
    JSON.stringify({
      sourceImport: "verified",
      native: "verified",
      commands,
      records: 7,
      originalRecords: 1564,
      predicates: 5,
      assertionIds: 7,
      rawAdmission: "rejected-unknown-lossiness",
      scientificTruth: "not-established",
      applied: false,
      ...(named ? { outputDirectory: named } : {}),
    }),
  );
} finally {
  if (!named) await rm(root, { recursive: true, force: true });
}
