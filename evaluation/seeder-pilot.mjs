import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  RelationRegistry,
  captureReplayBundle,
  compareMetamapBundles,
  compileMetamap,
  compileProjection,
  contentDigest,
  diffMetamapDocuments,
  stableJson,
  valuesEqual,
  replayCompilerIdentity,
} from "../dist/index.js";

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath || process.argv.length !== 4) {
  throw new Error(
    "Usage: node evaluation/seeder-pilot.mjs <Seeder packages/metamaps> <new-report.json>",
  );
}
const source = resolve(sourcePath);
const manifestText = await readFile(
  new URL("./seeder-inputs.json", import.meta.url),
  "utf8",
);
const protocolText = await readFile(
  new URL("./seeder-protocol.json", import.meta.url),
  "utf8",
);
const manifest = JSON.parse(manifestText);
const protocol = JSON.parse(protocolText);
const files = new Map();
for (const pin of manifest.inputs) {
  const bytes = await readFile(resolve(source, pin.path));
  assert.equal(
    contentDigest(bytes),
    pin.digest,
    `Pinned source mismatch: ${pin.path}`,
  );
  files.set(pin.path, bytes);
}
const json = (path) => JSON.parse(files.get(path).toString("utf8"));
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
const routes = {
  graph: json("web-routes.graph.json"),
  policy: json("web-routes.viability.json"),
  spec: json("web-routes.projection.json"),
};
const topology = {
  graph: json("generated/application-topology.graph.json"),
  policy: json("generated/application-topology.viability.json"),
  spec: json("application-topology.projection.json"),
};
// Exact preparation used by the pinned consumer generator, before either path runs.
topology.spec.select.ids = routes.graph.entities
  .filter((entry) => entry.kind === "routing:route")
  .map((entry) => entry.id)
  .sort();
const fixtures = { routes, topology };
const registry = () =>
  new RelationRegistry([new RelationRegistry().allPacks()[0], ...packs]);

function capture(input) {
  return captureReplayBundle(input.graph, input.policy, {
    evaluatedAt: protocol.evaluationTime,
    relationRegistry: registry(),
    projections: [input.spec],
  });
}

/** The same gates, without replay archives or the comparison report wrapper. */
function direct(input) {
  const privateInput = structuredClone(input);
  const relationRegistry = registry();
  const compilation = compileMetamap(privateInput.graph, privateInput.policy, {
    evaluatedAt: protocol.evaluationTime,
    relationRegistry,
  });
  const projection =
    compilation.status === "viable"
      ? compileProjection(
          privateInput.graph,
          compilation.generation,
          privateInput.spec,
          { relationRegistry },
        )
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
  const graph = diffMetamapDocuments(before.graph, after.graph);
  let changedSubjects;
  if (
    left.projection?.status === "projected" &&
    right.projection?.status === "projected"
  ) {
    const a = new Map(
      left.projection.projection.entries.map((entry) => [
        entry.subject.id,
        entry,
      ]),
    );
    const b = new Map(
      right.projection.projection.entries.map((entry) => [
        entry.subject.id,
        entry,
      ]),
    );
    changedSubjects = [...new Set([...a.keys(), ...b.keys()])]
      .filter((id) => !valuesEqual(a.get(id), b.get(id)))
      .sort();
  }
  return {
    admitted: right.admitted,
    changedSubjects,
    graph,
    violationSubjects: [
      ...new Set(
        [...right.compilation.issues, ...(right.projection?.issues ?? [])]
          .filter((issue) => issue.severity === "error")
          .flatMap((issue) => (issue.subjectId ? [issue.subjectId] : [])),
      ),
    ].sort(),
  };
}

function declared(input, id) {
  return input.policy.mappings.some(
    (entry) => entry.mapping === id || entry.select,
  );
}

function remove(input, mapping) {
  input.graph.mappings = input.graph.mappings.filter(
    (entry) => entry.id !== mapping.id,
  );
  input.policy.mappings = input.policy.mappings.filter(
    (entry) => entry.mapping !== mapping.id,
  );
}

function selected(input, id) {
  const entity = input.graph.entities.find((entry) => entry.id === id);
  return (
    !!entity &&
    (!input.spec.select.ids || input.spec.select.ids.includes(id)) &&
    (!input.spec.select.kinds || input.spec.select.kinds.includes(entity.kind))
  );
}

/** Oracles follow the declared consumer contracts and mutation targets, not evaluator outputs. */
function mutate(input, scenario) {
  const sorted = input.graph.mappings.toSorted((a, b) =>
    a.id.localeCompare(b.id),
  );
  const endpoint = sorted.find(
    (entry) =>
      entry.relation === "routing:exposed_as" &&
      entry.sources.some((id) => selected(input, id)),
  );
  assert(endpoint, "Fixture has no selected route endpoint");
  let expectedSubjects = [];
  let violationSubjects = [];
  if (scenario.operation === "remove-endpoint") {
    violationSubjects = endpoint.sources;
    remove(input, endpoint);
  } else if (scenario.operation === "duplicate-endpoint") {
    const target = structuredClone(
      input.graph.entities.find((entry) => entry.id === endpoint.targets[0]),
    );
    target.id = `urn:metamap:pilot:${scenario.id}:endpoint`;
    target.locators = [{ uri: `pilot:${scenario.id}/endpoint` }];
    const mapping = {
      ...structuredClone(endpoint),
      id: `urn:metamap:pilot:${scenario.id}:mapping`,
      targets: [target.id],
    };
    input.graph.entities.push(target);
    input.graph.mappings.push(mapping);
    if (!declared(input, mapping.id))
      input.policy.mappings.push({
        mapping: mapping.id,
        coverage: "total",
        determinism: "deterministic",
        reversibility: "irreversible",
      });
    violationSubjects = endpoint.sources;
  } else if (scenario.operation === "swap-authorization") {
    const candidates = sorted.filter(
      (entry) =>
        entry.relation === "routing:authorized_by" &&
        entry.sources.some((id) => selected(input, id)),
    );
    const a = candidates[0];
    const b = candidates.find(
      (entry) => !valuesEqual(entry.targets, a.targets),
    );
    assert(a && b, "Fixture needs two distinct selected authorization targets");
    [a.targets, b.targets] = [b.targets, a.targets];
    expectedSubjects = [...a.sources, ...b.sources];
  } else if (scenario.operation === "move-locator") {
    const target = input.graph.entities.find(
      (entry) => entry.id === endpoint.targets[0],
    );
    target.locators = [{ uri: "file:///pilot/relocated-endpoint.ts" }];
    expectedSubjects = sorted
      .filter(
        (entry) =>
          entry.relation === "routing:exposed_as" &&
          entry.targets.includes(target.id),
      )
      .flatMap((entry) => entry.sources)
      .filter((id) => selected(input, id));
  } else if (scenario.operation === "metadata") {
    input.graph.metadata = {
      ...(input.graph.metadata ?? {}),
      pilotAdministrativeNote: scenario.id,
    };
  } else if (scenario.operation === "remove-implementation") {
    const mapping = sorted.find(
      (entry) =>
        entry.relation === "topology:implemented_by" &&
        entry.sources.some((id) => selected(input, id)),
    );
    assert(mapping, "Fixture has no selected semantic-route implementation");
    violationSubjects = mapping.sources;
    remove(input, mapping);
  } else if (scenario.operation === "remove-provider-context") {
    const mapping = sorted.find(
      (entry) => entry.relation === "topology:provides_context",
    );
    assert(mapping, "Fixture has no provider/context mapping");
    violationSubjects = mapping.sources;
    remove(input, mapping);
  } else throw new Error(`Unknown predeclared operation ${scenario.operation}`);
  return {
    expectedSubjects: [...new Set(expectedSubjects)].sort(),
    violationSubjects: [...new Set(violationSubjects)].sort(),
  };
}

function median(values) {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const fixtureChecks = {};
for (const [name, input] of Object.entries(fixtures)) {
  const baseline = direct(input);
  assert.equal(
    baseline.admitted,
    true,
    `Pinned ${name} baseline is not admitted: ${JSON.stringify(baseline)}`,
  );
  fixtureChecks[name] = {
    entities: input.graph.entities.length,
    mappings: input.graph.mappings.length,
    projectedSubjects: baseline.projection.projection.entries.length,
  };
}

const results = [];
for (const scenario of protocol.cases) {
  const before = structuredClone(fixtures[scenario.fixture]);
  const after = structuredClone(before);
  const oracle = mutate(after, scenario);
  // Candidate binding changes are explicit inputs to both paths, never a comparison-side repair.
  assert.equal(
    after.policy.graph.digest,
    undefined,
    "The protocol must not remove a strict policy digest binding",
  );
  after.graph.revision = `${before.graph.revision}:pilot:${scenario.id}`;
  after.policy.graph.revision = after.graph.revision;
  const beforeBundle = capture(before);
  const afterBundle = capture(after);
  const baselineTimes = [];
  const comparisonTimes = [];
  let baseline;
  let compared;
  // Warm each path once. Capture time is excluded from both comparison timings.
  directComparison(before, after);
  compareMetamapBundles(beforeBundle, afterBundle);
  for (let repetition = 0; repetition < protocol.repetitions; repetition++) {
    let start = performance.now();
    baseline = directComparison(before, after);
    baselineTimes.push(performance.now() - start);
    start = performance.now();
    compared = compareMetamapBundles(beforeBundle, afterBundle);
    comparisonTimes.push(performance.now() - start);
  }
  assert.equal(
    compared.status,
    "compared",
    `Comparison did not reproduce ${scenario.id}`,
  );
  const report = compared.report;
  const metaSubjects =
    report.projections[0].before === "projected" &&
    report.projections[0].after === "projected"
      ? report.projections[0].entries.map((entry) => entry.subjectId).sort()
      : undefined;
  const metaViolationSubjects = [
    ...new Set(
      report.issues.introduced
        .filter((entry) => entry.issue.severity === "error")
        .flatMap((entry) =>
          entry.issue.subjectId ? [entry.issue.subjectId] : [],
        ),
    ),
  ].sort();
  const score = (admitted, changedSubjects, violationSubjects) => ({
    admissionCorrect: admitted === scenario.expectedAdmission,
    runtimeChangesCorrect:
      scenario.expectedRuntimeChange === null
        ? null
        : valuesEqual(changedSubjects, oracle.expectedSubjects),
    violationLocalized: scenario.expectedAdmission
      ? null
      : oracle.violationSubjects.every((id) => violationSubjects.includes(id)),
  });
  results.push({
    id: scenario.id,
    fixture: scenario.fixture,
    split: scenario.split,
    expectedAdmission: scenario.expectedAdmission,
    oracle,
    baseline: {
      admitted: baseline.admitted,
      changedSubjects: baseline.changedSubjects ?? null,
      violationSubjects: baseline.violationSubjects,
      score: score(
        baseline.admitted,
        baseline.changedSubjects,
        baseline.violationSubjects,
      ),
      medianMs: median(baselineTimes),
      samplesMs: baselineTimes,
    },
    comparison: {
      admitted: report.after.admitted,
      changedSubjects: metaSubjects ?? null,
      violationSubjects: metaViolationSubjects,
      score: score(report.after.admitted, metaSubjects, metaViolationSubjects),
      medianMs: median(comparisonTimes),
      samplesMs: comparisonTimes,
    },
  });
}

for (const pin of manifest.inputs)
  assert.equal(
    contentDigest(await readFile(resolve(source, pin.path))),
    pin.digest,
    `Source changed during evaluation: ${pin.path}`,
  );
const summary = (method) => ({
  cases: results.length,
  admissionCorrect: results.filter((row) => row[method].score.admissionCorrect)
    .length,
  requiredRejections: results.filter((row) => !row.expectedAdmission).length,
  missedRequiredRejections: results.filter(
    (row) => !row.expectedAdmission && row[method].admitted,
  ).length,
  validControls: results.filter((row) => row.expectedAdmission).length,
  falseRejections: results.filter(
    (row) => row.expectedAdmission && !row[method].admitted,
  ).length,
  runtimeCases: results.filter(
    (row) => row[method].score.runtimeChangesCorrect !== null,
  ).length,
  runtimeChangesCorrect: results.filter(
    (row) => row[method].score.runtimeChangesCorrect === true,
  ).length,
  localizationCases: results.filter(
    (row) => row[method].score.violationLocalized !== null,
  ).length,
  violationsLocalized: results.filter(
    (row) => row[method].score.violationLocalized === true,
  ).length,
  medianComparisonMs: median(results.map((row) => row[method].medianMs)),
});
const baseline = summary("baseline");
const comparison = summary("comparison");
const regressionFree =
  comparison.admissionCorrect === comparison.cases &&
  comparison.runtimeChangesCorrect === comparison.runtimeCases &&
  comparison.violationsLocalized === comparison.localizationCases;
const advantage =
  regressionFree &&
  comparison.falseRejections <= baseline.falseRejections &&
  (comparison.missedRequiredRejections < baseline.missedRequiredRejections ||
    comparison.runtimeChangesCorrect > baseline.runtimeChangesCorrect ||
    comparison.violationsLocalized > baseline.violationsLocalized);
const output = {
  version: "1.0.0",
  evaluatedAt: protocol.evaluationTime,
  source: manifest,
  protocolDigest: contentDigest(protocolText),
  scriptDigest: contentDigest(await readFile(new URL(import.meta.url))),
  compiler: replayCompilerIdentity(),
  fixtureChecks,
  methods: {
    scope: protocol.scope,
    baseline: protocol.baseline,
    timing:
      "Three warm comparisons per case; captures excluded; direct gates shared; results are descriptive, not population estimates",
    notMeasured: protocol.notMeasured,
  },
  summary: { baseline, comparison },
  expansionGate: {
    satisfied: advantage,
    regressionFree,
    rule: protocol.expansionGate,
    conclusion: advantage
      ? "Bounded advantage observed; external validity and human effort still require measurement"
      : "No measured advantage satisfying the predeclared gate; broader expansion remains gated",
  },
  results,
};
await writeFile(resolve(outputPath), stableJson(output, true), {
  encoding: "utf8",
  flag: "wx",
});
console.log(
  stableJson(
    {
      fixtureChecks,
      summary: output.summary,
      expansionGate: output.expansionGate,
    },
    true,
  ),
);
process.exitCode = regressionFree ? 0 : 1;
