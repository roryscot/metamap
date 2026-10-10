import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as current from "../dist/index.js";

const [sourcePath, priorPath, outputPath] = process.argv.slice(2);
if (!sourcePath || !priorPath || !outputPath || process.argv.length !== 5)
  throw new Error(
    "Usage: node evaluation/localization-pilot.mjs <Seeder packages/metamaps> <prior distribution directory> <new-report.json>",
  );
const previous = await import(
  pathToFileURL(resolve(priorPath, "dist/index.js"))
);
assert.equal(previous.replayCompilerIdentity().version, "0.7.0");
const protocolText = await readFile(
  new URL("./localization-protocol.json", import.meta.url),
  "utf8",
);
const protocolDigest = current.contentDigest(protocolText);
assert.equal(
  protocolDigest,
  "sha256:18672be672f0221dc220a66b3c892743ff30648111fb0f215ab3bd3eaa3a6847",
  "The frozen protocol changed",
);
const protocol = JSON.parse(protocolText);
const manifest = JSON.parse(
  await readFile(new URL("./seeder-inputs.json", import.meta.url), "utf8"),
);
const source = resolve(sourcePath);
const files = new Map();
async function verifyPins() {
  for (const pin of manifest.inputs) {
    const bytes = await readFile(resolve(source, pin.path));
    assert.equal(
      current.contentDigest(bytes),
      pin.digest,
      `Pinned source mismatch: ${pin.path}`,
    );
    files.set(pin.path, bytes);
  }
}
await verifyPins();
const json = (path) => JSON.parse(files.get(path).toString("utf8"));
const graph = json("generated/application-topology.graph.json");
const policy = json("generated/application-topology.viability.json");
const spec = json("application-topology.projection.json");
const selected = json("web-routes.graph.json")
  .entities.filter((e) => e.kind === "routing:route")
  .map((e) => e.id)
  .sort();
spec.select.ids = selected;
const packs = await Promise.all(
  ["routing", "application-topology"].map(async (name) =>
    JSON.parse(
      await readFile(
        new URL(`../relation-packs/${name}.json`, import.meta.url),
        "utf8",
      ),
    ),
  ),
);
const registry = (api) => {
  const result = new api.RelationRegistry();
  for (const pack of packs) result.registerPack(pack);
  return result;
};
const capture = (api, input) =>
  api.captureReplayBundle(input.graph, input.policy, {
    evaluatedAt: protocol.evaluationTime,
    relationRegistry: registry(api),
    projections: [spec],
  });

function direct(input, changedSubjects = []) {
  const copy = structuredClone(input);
  const relationRegistry = registry(current);
  const compilation = current.compileMetamap(copy.graph, copy.policy, {
    evaluatedAt: protocol.evaluationTime,
    relationRegistry,
    changedSubjects,
  });
  const projection =
    compilation.status === "viable"
      ? current.compileProjection(copy.graph, compilation.generation, spec, {
          relationRegistry,
        })
      : undefined;
  return {
    compilation,
    projection,
    admitted:
      compilation.status === "viable" && projection?.status === "projected",
  };
}

function directComparison(before, after) {
  const left = direct(before);
  const right = direct(after);
  const origins = current
    .diffMetamapDocuments(before.graph, after.graph)
    .changes.map((entry) => entry.id);
  const paths = [];
  for (const input of [before, after]) {
    const known = new Set(
      [
        ...input.graph.entities,
        ...input.graph.mappings,
        ...input.graph.authorities,
      ].map((entry) => entry.id),
    );
    for (const origin of origins)
      if (known.has(origin))
        paths.push(...direct(input, [origin]).compilation.impact.paths);
  }
  return {
    admitted: right.admitted,
    errors: [
      ...right.compilation.issues,
      ...(right.projection?.issues ?? []),
    ].filter((entry) => entry.severity === "error"),
    paths,
    compilationBefore: left.compilation,
    compilationAfter: right.compilation,
  };
}

function compared(api, before, after) {
  const beforeBundle = capture(api, before);
  const afterBundle = capture(api, after);
  const result = api.compareMetamapBundles(beforeBundle, afterBundle);
  assert.equal(result.status, "compared");
  assert.equal(api.validateCounterfactualReport(result.report).valid, true);
  return {
    admitted: result.report.after.admitted,
    errors: result.report.issues.introduced
      .map((entry) => entry.issue)
      .filter((entry) => entry.severity === "error"),
    paths: [
      ...result.report.impact.before.paths,
      ...result.report.impact.after.paths,
    ],
    report: result.report,
    outputsBefore: beforeBundle.expected,
    outputsAfter: afterBundle.expected,
  };
}

const results = [];
for (const scenario of protocol.cases) {
  const before = structuredClone({ graph, policy });
  const after = structuredClone(before);
  const mapping = before.graph.mappings.find(
    (entry) => entry.id === scenario.mapping,
  );
  let expectedIssueSubjects = scenario.expectedIssueSubjects;
  if (scenario.requiredContext) {
    expectedIssueSubjects = [
      ...new Set(
        before.graph.mappings
          .filter(
            (entry) =>
              entry.relation === "topology:requires_context" &&
              entry.targets.includes(scenario.requiredContext),
          )
          .flatMap((entry) => entry.sources)
          .filter((id) => selected.includes(id)),
      ),
    ].sort();
    assert.equal(
      expectedIssueSubjects.length,
      21,
      "Predeclared runtime-context route count changed",
    );
  }
  if (scenario.operation === "metadata") {
    after.graph.metadata = {
      ...after.graph.metadata,
      localizationAdministrativeNote: scenario.id,
    };
  } else {
    assert(mapping, `Unknown predeclared mapping ${scenario.mapping}`);
    after.graph.mappings = after.graph.mappings.filter(
      (entry) => entry.id !== mapping.id,
    );
    if (scenario.operation === "replace")
      after.graph.mappings.push({
        ...structuredClone(mapping),
        id: "urn:metamap:localization:equivalent-context-provider",
      });
    else assert.equal(scenario.operation, "remove");
  }
  assert.equal(
    after.policy.graph.digest,
    undefined,
    "Do not remove a strict policy binding",
  );
  after.graph.revision = `${before.graph.revision}:localization:${scenario.id}`;
  after.policy.graph.revision = after.graph.revision;
  const methods = {
    previous: compared(previous, before, after),
    current: compared(current, before, after),
    direct: directComparison(before, after),
  };
  const outputsPreserved =
    current.valuesEqual(
      methods.previous.outputsBefore,
      methods.current.outputsBefore,
    ) &&
    current.valuesEqual(
      methods.previous.outputsAfter,
      methods.current.outputsAfter,
    );
  const rows = {};
  for (const [name, method] of Object.entries(methods)) {
    const errorSubjects = new Set(
      method.errors.flatMap((entry) =>
        entry.subjectId ? [entry.subjectId] : [],
      ),
    );
    const links = (subjects) =>
      subjects.map((subjectId) => {
        const matches = method.paths.filter(
          (entry) =>
            entry.subjectId === subjectId &&
            entry.path[0] === scenario.mapping &&
            entry.path.at(-1) === subjectId,
        );
        return {
          subjectId,
          connected: matches.length > 0,
          path: matches[0]?.path ?? null,
        };
      });
    const failureLinks = links(expectedIssueSubjects);
    const producerLinks = links(scenario.producerSubjects ?? []);
    rows[name] = {
      admitted: method.admitted,
      errorSubjects: [...errorSubjects].sort(),
      admissionCorrect: method.admitted === scenario.expectedAdmission,
      requiredIssueSubjectsPresent: expectedIssueSubjects.every((id) =>
        errorSubjects.has(id),
      ),
      validControlHasNoFaults: scenario.expectedAdmission
        ? method.errors.length === 0
        : null,
      failureLinks,
      producerLinks,
    };
  }
  results.push({
    id: scenario.id,
    split: scenario.split,
    expectedAdmission: scenario.expectedAdmission,
    expectedIssueSubjects,
    mapping: scenario.mapping ?? null,
    outputsPreserved,
    methods: rows,
  });
}
await verifyPins();
const summary = {};
for (const name of ["previous", "current", "direct"]) {
  const rows = results.map((result) => result.methods[name]);
  const failureLinks = rows.flatMap((row) => row.failureLinks);
  const producerLinks = rows.flatMap((row) => row.producerLinks);
  summary[name] = {
    cases: rows.length,
    admissionCorrect: rows.filter((row) => row.admissionCorrect).length,
    casesWithRequiredIssueSubjects: rows.filter(
      (row) => row.requiredIssueSubjectsPresent,
    ).length,
    failureSubjects: failureLinks.length,
    connectedFailureSubjects: failureLinks.filter((row) => row.connected)
      .length,
    producerSubjects: producerLinks.length,
    connectedProducerSubjects: producerLinks.filter((row) => row.connected)
      .length,
    validControls: rows.filter((row) => row.validControlHasNoFaults !== null)
      .length,
    controlsWithoutFaults: rows.filter((row) => row.validControlHasNoFaults)
      .length,
  };
}
const allCorrect = (row) =>
  row.admissionCorrect === row.cases &&
  row.casesWithRequiredIssueSubjects === row.cases &&
  row.connectedFailureSubjects === row.failureSubjects &&
  row.connectedProducerSubjects === row.producerSubjects &&
  row.controlsWithoutFaults === row.validControls;
const passed =
  allCorrect(summary.current) && results.every((row) => row.outputsPreserved);
const equivalentDirectChecksMatch = current.valuesEqual(
  summary.current,
  summary.direct,
);
const output = {
  version: "1.0.0",
  runDate: "2026-10-09",
  evaluatedAt: protocol.evaluationTime,
  protocol,
  protocolDigest,
  scriptDigest: current.contentDigest(await readFile(new URL(import.meta.url))),
  source: manifest,
  executors: {
    previous: previous.replayCompilerIdentity(),
    current: current.replayCompilerIdentity(),
  },
  summary,
  outputsPreserved: results.filter((row) => row.outputsPreserved).length,
  mechanismAccepted: passed,
  equivalentDirectChecksMatch,
  expansionGate: {
    satisfied: false,
    reason:
      "The original pilot gate is unchanged. Improved dependency links over the previous report do not establish superiority to equivalent direct checks or reduced human effort.",
  },
  results,
};
await writeFile(resolve(outputPath), current.stableJson(output, true), {
  encoding: "utf8",
  flag: "wx",
});
console.log(
  current.stableJson(
    {
      summary,
      outputsPreserved: output.outputsPreserved,
      mechanismAccepted: passed,
      equivalentDirectChecksMatch,
      expansionGate: output.expansionGate,
    },
    true,
  ),
);
process.exitCode = passed ? 0 : 1;
