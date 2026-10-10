import { readFile } from "node:fs/promises";
import {
  RelationRegistry,
  captureReplayBundle,
  createMetamapExplanationRequest,
  createMetamapRepairRequest,
  explainMetamap,
  parseSourceCaptureJson,
  searchMetamapRepairs,
  valueDigest,
} from "../../dist/index.js";

export async function debuggerScenarios() {
  const original = new Map();
  const json = async (path) => {
    const url = new URL("../provenance/" + path, import.meta.url),
      bytes = await readFile(url);
    original.set(url.href, bytes);
    return JSON.parse(bytes.toString("utf8"));
  };
  const originalGraph = await json("generated/graph.json"),
    originalPolicy = await json("generated/policy.json"),
    originalSpec = await json("generated/spec.json"),
    context = await json("context.json"),
    sourceCapture = parseSourceCaptureJson(
      JSON.stringify(await json("generated/source-capture.json")),
    );
  const base = (owners = true) => {
    const graph = structuredClone(originalGraph),
      policy = structuredClone(originalPolicy),
      spec = structuredClone(originalSpec);
    if (owners) {
      const provenance = {
        status: "declared",
        assertedBy: "synthetic-configuration-owner",
      };
      graph.authorities.push(
        {
          id: "urn:debugger:owner",
          mode: "canonical",
          concept: "urn:example:consumer",
          source: "urn:example:service",
          facts: ["configuration", "label"],
          provenance,
        },
        {
          id: "urn:debugger:delegated",
          mode: "delegated",
          concept: "urn:example:consumer",
          source: "urn:example:schema",
          facts: ["configuration"],
          delegatedFrom: "urn:debugger:owner",
          provenance,
        },
      );
    }
    const capture = () => {
      policy.graph.digest = valueDigest(graph);
      return captureReplayBundle(graph, policy, {
        sourceCapture,
        context,
        evaluatedAt: "2026-10-10T00:00:00.000Z",
        projections: [spec],
        relationRegistry: new RelationRegistry(sourceCapture.relationPacks),
      });
    };
    const explain = (options) => {
      const result = explainMetamap(
        createMetamapExplanationRequest(capture(), {
          consumer: spec.consumer,
          selection: {
            kind: "entity",
            id: "urn:example:consumer",
            projection: spec.id,
          },
          ...options,
        }),
      );
      if (result.status !== "explained")
        throw new Error(JSON.stringify(result.issues));
      return result.report;
    };
    return { graph, policy, spec, capture, explain };
  };
  const reports = {};
  const known = base();
  reports.known = known.explain();
  const failed = base(),
    before = failed.capture(),
    removed = failed.graph.mappings.shift();
  const current = failed.capture();
  const wrong = {
    ...structuredClone(removed),
    targets: ["urn:example:schema"],
  };
  const search = await searchMetamapRepairs(
    createMetamapRepairRequest(current, {
      consumer: failed.spec.consumer,
      requiredProjections: [failed.spec.id],
      allowedFacts: [
        { subject: removed.id, fact: "mapping.record" },
        { subject: failed.policy.id, fact: "policy.graph" },
      ],
      protectedFacts: [],
      edits: [
        {
          id: "restore-provider",
          kind: "restore-mapping",
          semanticCost: 1,
          mapping: removed,
        },
        {
          id: "incompatible-provider",
          kind: "restore-mapping",
          semanticCost: 1,
          mapping: wrong,
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
  if (search.status !== "searched") throw new Error(JSON.stringify(search));
  reports.failed = failed.explain({ before, repairs: search.report });
  const slot = base();
  slot.graph.mappings = [];
  slot.policy.derivations = [];
  slot.policy.assessments = [];
  slot.policy.evidence = [];
  slot.policy.uncertaintyRequirements = [];
  slot.policy.riskBudgets = [];
  slot.policy.mappings = [];
  slot.spec.budget = null;
  reports.slot = slot.explain();
  const badProof = base();
  badProof.policy.derivations[0].rule.id = "urn:unavailable:rule";
  reports.proof = badProof.explain();
  const conflict = base();
  conflict.policy.evidence[0].result = "contradicts";
  reports.conflict = conflict.explain();
  const risk = base();
  risk.policy.riskBudgets[0].maximumTotalCost = 4;
  reports.risk = risk.explain();
  reports.unknown = base().explain({
    selection: {
      kind: "entity",
      id: "urn:unavailable:operation",
      projection: null,
    },
  });
  const ambiguous = base();
  ambiguous.graph.entities.push({
    ...ambiguous.graph.entities[0],
    label: "Conflicting duplicate",
  });
  reports.ambiguous = ambiguous.explain();
  const changed = base(),
    previous = changed.capture();
  changed.graph.entities[0].label = "Network configuration after rename";
  changed.graph.entities[2].locators = [
    { uri: "json-schema:schemas/network-next.json" },
  ];
  reports.changed = changed.explain({ before: previous });
  const escaped = base();
  escaped.graph.entities[0].label =
    '<img src="https://example.invalid/must-not-fetch" onerror="alert(1)"><script>alert(2)</script> & "literal"';
  escaped.graph.entities[0].locators = [{ uri: "javascript:alert(3)" }];
  escaped.policy.assessments[0].measurementModel =
    "urn:model:</pre><script>alert(5)</script>";
  reports.escaped = escaped.explain();
  const empty = base(false);
  reports.empty = empty.explain({
    selection: {
      kind: "mapping",
      id: "urn:unavailable:mapping",
      projection: null,
    },
  });
  reports.truncated = base().explain({
    selection: {
      kind: "mapping",
      id: "urn:example:consumer-schema",
      projection: null,
    },
    limits: { maximumSubjects: 1, maximumMappings: 1 },
  });
  for (const [url, bytes] of original)
    if (!bytes.equals(await readFile(new URL(url))))
      throw new Error("Source example bytes changed");
  return { reports, original };
}
