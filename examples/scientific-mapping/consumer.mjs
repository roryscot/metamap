import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import ts from "typescript";
import { createScientificLookup } from "./lookup.mjs";
import {
  RelationRegistry,
  canonicalJson,
  captureReplayBundle,
  compileMetamap,
  compileProjection,
  composeCorrespondences,
  contentDigest,
  createScientificCrate,
  compareMetamapBundles,
  prepareGovernedArtifacts,
  replayMetamap,
  valueDigest,
  verifyScientificCrate,
} from "../../dist/index.js";

const named = process.argv[2] === undefined ? null : resolve(process.argv[2]);
if (process.argv.length > 3)
  throw new Error("Use consumer.mjs [new-output-directory]");
if (named) await mkdir(named);
const root =
  named ?? (await mkdtemp(join(tmpdir(), "metamap-scientific-consumer-")));
const sourceRoot = join(root, "captured-source");
const read = async (name) =>
  JSON.parse(await readFile(join(sourceRoot, name), "utf8"));
const write = (name, value) =>
  writeFile(
    join(root, name),
    typeof value === "string" ? value : canonicalJson(value) + "\n",
    { flag: "wx" },
  );
const run = promisify(execFile);
try {
  await run(
    process.execPath,
    [fileURLToPath(new URL("source.mjs", import.meta.url)), sourceRoot],
    { timeout: 60000, maxBuffer: 32 * 1024 * 1024 },
  );
  const capture = await read("source-capture.json"),
    rawGraph = capture.graph;
  const registry = new RelationRegistry(capture.relationPacks);
  const graph = structuredClone(rawGraph);
  // Explicit exploratory consumer declaration, recorded in a separate candidate.
  // The original unknown source assessments and bytes remain unchanged.
  for (const mapping of graph.mappings) mapping.lossiness = "lossy";
  const broad = graph.mappings.find(
    (mapping) => mapping.relation === "scientific:broad-match",
  );
  const proof = composeCorrespondences(
    graph,
    {
      schemaVersion: "1.0.0",
      law: "urn:metamap:scientific:law:reverse-broad",
      premises: [broad.id],
      context: { executeScientificReversal: false },
      bounds: { maxDepth: 8, maxDerivations: 32 },
      derivations: [],
      assessments: [],
      evidence: [],
    },
    registry,
  );
  assert.equal(proof.status, "proposed", JSON.stringify(proof));
  graph.mappings.push(proof.mapping);
  const consumer = "urn:metamap:example:exploratory-scientific-consumer";
  const budget = "urn:metamap:example:scientific-ordinal-budget";
  const relations = ["exact", "close", "broad", "narrow", "related"];
  const spec = {
    schemaVersion: "2.0.0",
    id: "urn:metamap:example:scientific-lookup",
    consumer,
    budget,
    select: { ids: graph.entities.map((entity) => entity.id) },
    slots: relations.map((name) => ({
      name,
      relation: `scientific:${name}-match`,
      direction: "outgoing",
      cardinality: "many",
      allowLossy: true,
    })),
  };
  const costs = {
    "scientific:exact-match": 1,
    "scientific:close-match": 4,
    "scientific:broad-match": 2,
    "scientific:narrow-match": 2,
    "scientific:related-match": 5,
  };
  const policy = {
    schemaVersion: "2.0.0",
    id: "urn:metamap:example:scientific-exploratory-policy",
    graph: { id: graph.id, digest: valueDigest(graph) },
    mappings: [
      {
        select: { ids: rawGraph.mappings.map((m) => m.id) },
        coverage: "partial",
        determinism: "deterministic",
        reversibility: "irreversible",
      },
      {
        mapping: proof.mapping.id,
        coverage: "partial",
        determinism: "deterministic",
        reversibility: "irreversible",
        applicability: {
          when: {
            key: "executeScientificReversal",
            operator: "equals",
            value: true,
          },
        },
      },
    ],
    constraints: [],
    evidence: [],
    assessments: [],
    uncertaintyRequirements: [],
    derivations: [proof.derivation],
    derivationLimits: { maxDepth: 8, maxDerivations: 32 },
    riskBudgets: [
      {
        id: budget,
        consumer,
        classifications: graph.mappings.map((m) => ({
          id: "urn:metamap:example:classification:" + m.id.split(":").at(-1),
          select: { ids: [m.id] },
          classification:
            m.id === proof.mapping.id
              ? "normative-derived-inverse"
              : "source-declared-approximation",
          cost: m.id === proof.mapping.id ? 0 : costs[m.relation],
        })),
        maximumTotalCost: 18,
        maximumInferredMappings: 0,
        maximumLossyMappings: 7,
        requireCompleteClassification: true,
        requireCompleteDependencies: true,
      },
    ],
  };
  const options = {
    relationRegistry: registry,
    sourceCapture: capture,
    evaluatedAt: "2026-10-10T00:00:00.000Z",
    projections: [spec],
    context: { executeScientificReversal: false },
  };
  const bundle = captureReplayBundle(graph, policy, options);
  assert.deepEqual(
    [replayMetamap(bundle).status, replayMetamap(bundle).admitted],
    ["verified", true],
    JSON.stringify({
      compilation: bundle.expected.compilation.status,
      issues: bundle.expected.compilation.issues,
      projections: bundle.expected.projections.map((output) => ({
        status: output.result.status,
        issues: output.result.issues,
      })),
    }),
  );
  const projection = bundle.expected.projections[0].result;
  assert.equal(projection.status, "projected", JSON.stringify(projection));
  assert.equal(projection.projection.semantic.risk.totalCost, 18);
  assert.equal(projection.projection.semantic.usedMappings.length, 7);
  assert.equal(projection.projection.semantic.risk.inferredMappings.length, 0);
  // The normative inverse proof is inspectable; the existing admission contract
  // rejects execution of the approximate binding in reverse.
  const reversalPolicy = structuredClone(policy);
  delete reversalPolicy.mappings[1].applicability;
  const reversal = compileMetamap(graph, reversalPolicy, {
    relationRegistry: registry,
    evaluatedAt: options.evaluatedAt,
    context: options.context,
  });
  assert.equal(reversal.status, "rejected");
  assert(
    reversal.issues.some(
      (issue) => issue.code === "IRREVERSIBLE_DERIVATION_PREMISE",
    ),
  );
  assert(
    proof.derivation.uncertainty.every(
      (dimension) => dimension.status === "unknown",
    ),
  );
  const originalIds = new Set(rawGraph.mappings.map((m) => m.id));
  const preservedIds = new Set(
    projection.projection.entries
      .flatMap((entry) => entry.slots.flatMap((slot) => slot.mappings))
      .filter((id) => originalIds.has(id)),
  );
  assert.deepEqual(preservedIds, originalIds);

  const strict = structuredClone(policy);
  strict.id = "urn:metamap:example:scientific-supported-evidence-policy";
  strict.uncertaintyRequirements = [
    {
      id: "urn:metamap:example:identity-required",
      select: { ids: graph.mappings.map((m) => m.id) },
      dimension: "identity",
      allowedStates: ["supported"],
      requireEvidence: true,
    },
  ];
  const strictBundle = captureReplayBundle(graph, strict, options);
  assert.equal(replayMetamap(strictBundle).status, "verified");
  assert.equal(replayMetamap(strictBundle).admitted, false);
  assert(
    strictBundle.expected.compilation.issues.some(
      (issue) => issue.code === "UNCERTAINTY_STATE_NOT_ALLOWED",
    ),
  );
  const limited = structuredClone(policy);
  limited.riskBudgets[0].maximumTotalCost = 17;
  const lowBundle = captureReplayBundle(graph, limited, options);
  assert.equal(lowBundle.expected.compilation.status, "viable");
  assert.equal(lowBundle.expected.projections[0].result.status, "rejected");
  assert.equal(replayMetamap(lowBundle).admitted, false);
  assert.equal(compareMetamapBundles(bundle, strictBundle).status, "compared");

  const changed = structuredClone(graph);
  changed.mappings.find((m) => m.id === broad.id).provenance.sourceRevision =
    "deliberately-changed-r2";
  const stalePolicy = {
    ...policy,
    graph: { id: changed.id, digest: valueDigest(changed) },
  };
  const stale = compileMetamap(changed, stalePolicy, {
    relationRegistry: registry,
    evaluatedAt: options.evaluatedAt,
    context: options.context,
  });
  assert.equal(stale.status, "rejected", JSON.stringify(stale));
  assert(stale.issues.some((issue) => issue.code.includes("DERIVATION")));

  const prepared = prepareGovernedArtifacts(
    bundle,
    consumer,
    "offline-exploration",
  );
  for (const [name, text] of Object.entries(prepared.files))
    await write(name, text);
  const source = prepared.files["bindings-0.ts"];
  await write(
    "bindings-0.mjs",
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    }).outputText,
  );
  await run(
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
      join(root, "bindings-0.ts"),
    ],
    { timeout: 30000 },
  );
  const native = await import(pathToFileURL(join(root, "bindings-0.mjs")).href);
  const exported = Object.values(native).find(
    (value) => typeof value === "function",
  );
  assert(exported, "Generated native resolver missing");
  const duplicate = rawGraph.mappings.filter(
    (m) => m.sources[0] === "http://purl.obolibrary.org/obo/MP_0000433",
  );
  assert.equal(duplicate.length, 2);
  const resolved = exported(duplicate[0].sources[0]);
  assert.deepEqual(
    resolved.slots.narrow.map((target) => target.id),
    [duplicate[0].targets[0]],
  );
  const entry = projection.projection.entries.find(
    (entry) => entry.subject.id === duplicate[0].sources[0],
  );
  assert.deepEqual(
    new Set(entry.slots.find((slot) => slot.name === "narrow").mappings),
    new Set(duplicate.map((m) => m.id)),
  );
  assert.notDeepEqual(
    duplicate[0].attributes.sssom.fields,
    duplicate[1].attributes.sssom.fields,
  );
  const nativeGraph = JSON.parse(
    await readFile(join(root, "graph.json"), "utf8"),
  );
  const nativeProjection = JSON.parse(
    await readFile(join(root, "projection-0.json"), "utf8"),
  );
  const lookup = createScientificLookup(
    exported,
    nativeProjection,
    nativeGraph,
  );
  const originalAssertions = new Map(
    rawGraph.mappings.map((mapping) => [mapping.id, mapping]),
  );
  const observed = new Map();
  for (const entity of rawGraph.entities)
    for (const slot of Object.values(lookup(entity.id).slots))
      for (const assertion of slot.assertions) {
        assert.equal(assertion.relation, slot.relation);
        assert.deepEqual(
          assertion.attributes.sssom,
          originalAssertions.get(assertion.id).attributes.sssom,
        );
        observed.set(assertion.id, assertion);
      }
  assert.equal(observed.size, 7);
  assert.equal(
    lookup(duplicate[0].sources[0]).slots.narrow.assertions.length,
    2,
  );
  assert.throws(
    () => exported("urn:metamap:unknown"),
    /Unknown Metamap identity/,
  );

  const bytes = await readFile(join(sourceRoot, "mapping.data"), "utf8");
  const manifest = JSON.parse(
    await readFile(
      new URL("fixtures/mgi-subset-manifest.json", import.meta.url),
      "utf8",
    ),
  );
  const crateOptions = {
    name: "Seven MGI SSSOM assertions with a checked exploratory lookup",
    description:
      "Seven-of-1564 source subset; each assertion and original context retained; conservative consumer approximation plus one normative SKOS inverse",
    datePublished: "2026-10-10",
    consumer,
    environment: "offline-exploration",
    rawInputs: { "mapping.data": bytes },
    externalOriginal: {
      uri: `https://raw.githubusercontent.com/mapping-commons/mh_mapping_initiative/${manifest.sourceCommit}/${manifest.sourcePath}`,
      name: "Original full MGI mapping TSV",
      description:
        "Pinned original 1564-record producer source; subset selection and byte digest are retained in the source capture",
    },
  };
  const crate = createScientificCrate(bundle, crateOptions);
  assert.equal(verifyScientificCrate(crate).status, "verified");
  const referenceOnly = createScientificCrate(bundle, {
    ...crateOptions,
    rawInputs: {},
  });
  assert.equal(verifyScientificCrate(referenceOnly).externalRawInputs, 1);
  assert(
    !Object.keys(referenceOnly.files).some((name) =>
      name.startsWith("source/"),
    ),
  );
  await mkdir(join(root, "crate"));
  for (const [name, text] of Object.entries({
    ...crate.files,
    "ro-crate-metadata.json": canonicalJson(crate.metadata) + "\n",
  })) {
    const path = join(root, "crate", name);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, text, { flag: "wx" });
  }
  for (const alter of [
    (value) => {
      value.metadata["@graph"][1].license = {
        "@id": "https://example.org/wrong-license",
      };
    },
    (value) => {
      value.files["source/mapping.data"] += "\n";
    },
    (value) => {
      delete value.files["bindings-0.ts"];
    },
    (value) => {
      value.files["unexpected.txt"] = "extra";
    },
    (value) => {
      value.metadata["@graph"][0].about = { "@id": "missing-root" };
    },
  ]) {
    const tampered = structuredClone(crate);
    alter(tampered);
    assert.throws(() => verifyScientificCrate(tampered));
  }
  assert.equal(
    contentDigest(await readFile(join(sourceRoot, "mapping.data"))),
    manifest.subsetByteDigest,
  );
  assert(rawGraph.mappings.every((m) => m.lossiness === "unknown"));
  assert.deepEqual(rawGraph.authorities, []);
  await write("strict-replay.json", strictBundle);
  await write("budget-rejected-replay.json", lowBundle);
  await write("stale-proof-result.json", stale);
  const verification = {
    consumerLookup: "executed-and-typechecked",
    sourceAssertions: 7,
    relations: 5,
    distinctDuplicateAssertions: 2,
    checkedDerivations: 1,
    derivedExpression: "inactive-irreversible-premise",
    uncertainty: "six-dimensions-unknown",
    ordinalCost: 18,
    budget17: "rejected",
    supportedEvidence: "rejected",
    staleProof: "rejected",
    crate: "verified",
    missingRawPayload: "reference-only",
    crateTamperCases: 5,
    sourceBytesPreserved: true,
    scientificTruth: "not-established",
    authorization: "not-evaluated",
    active: false,
  };
  await write("verification.json", verification);
  console.log(
    JSON.stringify({
      ...verification,
      ...(named ? { outputDirectory: named } : {}),
    }),
  );
} finally {
  if (!named) await rm(root, { recursive: true, force: true });
}
