import { describe, expect, it } from "vitest";
import {
  createMetamapRepairRequest,
  parseMetamapRepairRequest,
  parseMetamapRepairRequestJson,
  parseMetamapRepairReport,
  parseMetamapRepairReportJson,
  searchMetamapRepairs,
} from "../repair.js";
import type {
  MetamapRepairEdit,
  MetamapRepairReport,
  MetamapRepairRequest,
} from "../repair-model.js";
import { canonicalJson } from "../canonical.js";
import { valueDigest } from "../stable.js";
import { rehashSourceReplay } from "./helpers/source-fixture.js";
import { repairFixture, rehashRepair } from "./helpers/repair-fixture.js";

async function search(
  request: MetamapRepairRequest,
  signal?: AbortSignal,
): Promise<MetamapRepairReport> {
  const result = await searchMetamapRepairs(request, { signal });
  if (result.status !== "searched")
    throw new Error(JSON.stringify(result.issues));
  return result.report;
}
const evaluated = (report: MetamapRepairReport) =>
  report.attempts.filter((attempt) => attempt.status === "evaluated");
describe("bounded read-only repair using the existing compiler", () => {
  it("restores a supplied mapping with explicit binding updates and owner-review requirements", async () => {
    const f = repairFixture(),
      request = f.request(),
      before = canonicalJson(request),
      report = await search(request),
      proposal = evaluated(report)[0];
    expect(proposal).toMatchObject({
      viable: true,
      admitted: true,
      authorization: "approval-required",
      rank: { editedRecords: 1, semanticCost: 1 },
    });
    expect(proposal.candidate.inputs.sourceCapture).toEqual(
      request.baseline.inputs.sourceCapture,
    );
    expect(proposal.candidate.inputs.policy.graph.digest).toBe(
      valueDigest(proposal.patch.graph.value),
    );
    expect(proposal.patch.bindingUpdates).toEqual([
      {
        subject: f.inputs.policy.id,
        fact: "policy.graph",
        before: request.baseline.inputs.policy.graph,
        after: proposal.candidate.inputs.policy.graph,
      },
    ]);
    expect(proposal.comparison.projections[0]).toMatchObject({
      before: "rejected",
      after: "projected",
      bindingsChanged: true,
    });
    expect(proposal.requirements).toContainEqual({
      action: "activate",
      subject: request.consumer,
      fact: "activation",
    });
    expect(proposal.requirements).toContainEqual({
      action: "change-graph",
      subject: f.mapping.id,
      fact: "mapping.record",
    });
    expect(proposal.remainingFailures).toEqual([]);
    expect(report).toMatchObject({
      applied: false,
      status: "complete",
      coverage: { totalCombinations: "1", attempted: 1, unexamined: "0" },
      minimality: {
        status: "within-finite-space",
        proposal: proposal.id,
        global: false,
      },
    });
    expect(parseMetamapRepairReportJson(JSON.stringify(report))).toEqual(
      report,
    );
    expect(Object.isFrozen(report.attempts[0])).toBe(true);
    expect(canonicalJson(request)).toBe(before);
  }, 30000);
  it("rejects an equally small incompatible target and retains the actual consumer failure", async () => {
    const f = repairFixture(),
      wrong = structuredClone(f.restore);
    if (wrong.kind !== "restore-mapping")
      throw new Error("Expected restoration");
    wrong.id = "bad-target";
    wrong.mapping.targets = [f.inputs.graph.entities[1].id];
    const report = await search(f.request([f.restore, wrong]));
    const bad = evaluated(report).find(
      (attempt) => attempt.edits[0] === wrong.id,
    )!;
    expect(bad).toMatchObject({
      admitted: true,
      viable: false,
      authorization: "unavailable",
    });
    expect(
      bad.remainingFailures.some((failure) => failure.stage === "projection"),
    ).toBe(true);
    expect(report.proposals).toHaveLength(1);
    expect(report.attempts.at(-1)).toMatchObject({
      status: "blocked",
      issues: [{ code: "REPAIR_CONFLICTING_EDITS" }],
    });
  }, 30000);
  it.each([
    "scope",
    "protected-record",
    "protected-target",
    "protected-binding",
  ])("blocks %s before compilation", async (mode) => {
    const f = repairFixture();
    const boundary =
      mode === "scope"
        ? { allowedFacts: [{ subject: f.mapping.id, fact: "mapping.record" }] }
        : {
            protectedFacts: [
              mode === "protected-binding"
                ? { subject: f.inputs.policy.id, fact: "policy.graph" }
                : {
                    subject: f.mapping.id,
                    fact:
                      mode === "protected-record"
                        ? "mapping.record"
                        : "mapping.targets",
                  },
            ],
          };
    const report = await search(f.request([f.restore], boundary)),
      attempt = report.attempts[0];
    expect(attempt.status).toBe("blocked");
    if (attempt.status === "blocked")
      expect(
        attempt.issues.some(
          (issue) =>
            issue.code ===
            (mode === "scope"
              ? "REPAIR_SCOPE_DENIED"
              : "REPAIR_PROTECTED_FACT"),
        ),
      ).toBe(true);
    expect(report.proposals).toEqual([]);
    expect(report.minimality.status).toBe("not-established");
  });
  it("selects a supplied captured target and blocks an invented entity", async () => {
    const f = repairFixture();
    f.inputs.graph.mappings.push({
      ...f.mapping,
      targets: [f.inputs.graph.entities[1].id],
    });
    const index = f.inputs.graph.mappings.length - 1;
    const good: MetamapRepairEdit = {
      id: "good",
      kind: "select-target",
      semanticCost: 2,
      mappingIndex: index,
      expectedDigest: valueDigest(f.inputs.graph.mappings[index]),
      target: f.mapping.targets[0],
    };
    const unknown = { ...good, id: "unknown", target: "urn:unrecorded:target" };
    const report = await search(f.request([unknown, good]));
    expect(evaluated(report)[0].viable).toBe(true);
    expect(
      report.attempts.find((attempt) => attempt.edits[0] === unknown.id),
    ).toMatchObject({
      status: "blocked",
      issues: [{ code: "REPAIR_UNKNOWN_TARGET" }],
    });
    expect(evaluated(report)[0].requirements).toContainEqual({
      action: "rebind-implementation",
      subject: f.mapping.id,
      fact: "mapping.targets",
    });
  }, 30000);
  it("removes an exact duplicate and refuses an arbitrary deletion", async () => {
    const f = repairFixture();
    f.inputs.graph.mappings.push(f.mapping, {
      ...f.mapping,
    });
    const edit: MetamapRepairEdit = {
      id: "remove-duplicate",
      kind: "remove-duplicate",
      semanticCost: 1,
      mappingIndex: 3,
      expectedDigest: valueDigest(f.inputs.graph.mappings[3]),
      keepIndex: 2,
      keepDigest: valueDigest(f.mapping),
    };
    const proposal = evaluated(await search(f.request([edit])))[0];
    expect(proposal.viable).toBe(true);
    expect(proposal.patch.graph.value.mappings).toHaveLength(3);
    expect(proposal.patch.graph.value.mappings[2]).toEqual(f.mapping);
    expect(
      (
        await search(
          f.request([
            {
              ...edit,
              keepIndex: 0,
              keepDigest: valueDigest(f.inputs.graph.mappings[0]),
            },
          ]),
        )
      ).attempts[0],
    ).toMatchObject({
      status: "blocked",
      issues: [{ code: "REPAIR_NOT_DUPLICATE" }],
    });
  }, 30000);
  it("repairs a missing mapping and declaration together while preserving all policy protections", async () => {
    const f = repairFixture();
    f.inputs.policy.mappings = [
      {
        select: { relations: ["example:depends"] },
        coverage: "total",
        determinism: "deterministic",
        reversibility: "reversible",
      },
    ];
    const declaration: MetamapRepairEdit = {
      id: "declare",
      kind: "supply-declaration",
      semanticCost: 3,
      declaration: {
        mapping: f.mapping.id,
        coverage: "total",
        determinism: "deterministic",
        reversibility: "reversible",
      },
    };
    const request = f.request([f.restore, declaration]),
      report = await search(request),
      proposal = evaluated(report).find((attempt) => attempt.viable)!;
    expect(report.proposals).toHaveLength(1);
    expect(proposal.edits).toEqual(["declare", "restore-schema"]);
    expect(proposal.rank).toEqual({ editedRecords: 2, semanticCost: 4 });
    expect(proposal.patch.policy.value.mappings[0]).toEqual(
      request.baseline.inputs.policy.mappings[0],
    );
    for (const field of [
      "constraints",
      "evidence",
      "waivers",
      "assessments",
      "uncertaintyRequirements",
      "riskBudgets",
      "derivations",
      "derivationLimits",
    ] as const)
      expect(proposal.patch.policy.value[field]).toEqual(
        request.baseline.inputs.policy[field],
      );
    expect(proposal.requirements).toContainEqual({
      action: "change-policy",
      subject: f.inputs.policy.id,
      fact: "policy.mappings",
    });
    expect(parseMetamapRepairReport(report)).toEqual(report);
  }, 30000);
  it("supplies only a missing effective declaration", async () => {
    const f = repairFixture();
    f.inputs.graph.mappings.push(f.mapping);
    f.inputs.policy.mappings = [
      {
        select: { relations: ["example:depends"] },
        coverage: "total",
        determinism: "deterministic",
        reversibility: "reversible",
      },
    ];
    const edit: MetamapRepairEdit = {
      id: "declare",
      kind: "supply-declaration",
      semanticCost: 1,
      declaration: {
        mapping: f.mapping.id,
        coverage: "total",
        determinism: "deterministic",
        reversibility: "reversible",
      },
    };
    expect(evaluated(await search(f.request([edit])))[0].viable).toBe(true);
    f.inputs.policy.mappings.push(edit.declaration);
    f.inputs.graph.mappings.push({ ...f.mapping });
    expect((await search(f.request([edit]))).attempts[0]).toMatchObject({
      status: "blocked",
      issues: [{ code: "REPAIR_DECLARATION_EXISTS" }],
    });
  }, 30000);
  it("keeps the existing risk budget rejection instead of raising limits", async () => {
    const f = repairFixture();
    f.inputs.policy.riskBudgets = [
      {
        id: "urn:repair:budget",
        consumer: f.inputs.spec.consumer,
        classifications: [
          {
            id: "urn:repair:class",
            select: { relations: ["example:depends", "example:uses_schema"] },
            classification: "consumer-choice",
            cost: 4,
          },
        ],
        maximumTotalCost: 3,
        requireCompleteClassification: true,
        requireCompleteDependencies: true,
      },
    ];
    f.inputs.spec.budget = "urn:repair:budget";
    const request = f.request(),
      report = await search(request),
      proposal = evaluated(report)[0];
    expect(proposal).toMatchObject({
      admitted: true,
      viable: false,
      authorization: "unavailable",
    });
    expect(
      proposal.remainingFailures.some((failure) =>
        failure.issue.code.includes("BUDGET"),
      ),
    ).toBe(true);
    expect(proposal.candidate.inputs.policy.riskBudgets).toEqual(
      request.baseline.inputs.policy.riskBudgets,
    );
    expect(report.proposals).toHaveLength(0);
  }, 30000);
  it.each(["candidate-limit", "edit-limit", "elapsed-limit", "cancelled"])(
    "reports %s as incomplete with no minimum claim",
    async (reason) => {
      const f = repairFixture(),
        other = structuredClone(f.restore);
      other.id = "other";
      const bounds = {
        maximumCandidates: reason === "candidate-limit" ? 1 : 32,
        maximumEdits: reason === "edit-limit" ? 1 : 8,
        maximumDerivationDepth: f.inputs.policy.derivationLimits.maxDepth,
        maximumElapsedMilliseconds: reason === "elapsed-limit" ? 1 : 60000,
      };
      const request = f.request([f.restore, other], { bounds }),
        before = canonicalJson(request),
        controller = new AbortController();
      if (reason === "cancelled") controller.abort();
      const report = await search(request, controller.signal);
      expect(report.status).toBe("incomplete");
      expect(report.coverage.stopReasons).toContain(reason);
      expect(BigInt(report.coverage.unexamined)).toBeGreaterThan(0n);
      expect(report.minimality).toEqual({
        status: "not-established",
        proposal: null,
        global: false,
      });
      expect(canonicalJson(request)).toBe(before);
      expect(parseMetamapRepairReport(report)).toEqual(report);
    },
    30000,
  );
  it("rejects a captured policy depth outside the supplied bound", async () => {
    const request = structuredClone(repairFixture().request());
    request.bounds.maximumDerivationDepth = 1;
    rehashRepair(request);
    expect(await searchMetamapRepairs(request)).toMatchObject({
      status: "rejected",
      issues: [{ code: "REPAIR_DERIVATION_BOUND_MISMATCH" }],
    });
  });
  it.each([
    "change-authority",
    "relax-policy",
    "raise-budget",
    "add-waiver",
    "create-evidence",
    "change-law",
    "change-source",
  ])("cannot express forbidden %s edits", async (kind) => {
    const request = structuredClone(repairFixture().request()) as any;
    request.edits[0].kind = kind;
    rehashRepair(request);
    expect(await searchMetamapRepairs(request)).toMatchObject({
      status: "rejected",
      issues: [{ code: "REPAIR_INVALID_SHAPE" }],
    });
  });
  it.each(["now", "trustedConfiguration", "approval", "constraintRegistry"])(
    "rejects incoming %s",
    async (name) => {
      const request = structuredClone(repairFixture().request()) as any;
      request[name] = {};
      rehashRepair(request);
      expect(await searchMetamapRepairs(request)).toMatchObject({
        status: "rejected",
        issues: [{ code: "REPAIR_INVALID_SHAPE" }],
      });
    },
  );
  it("rejects duplicate JSON, content changes and a rehashed false baseline evaluation", () => {
    expect(() =>
      parseMetamapRepairRequestJson('{"edits":[],"edits":[]}'),
    ).toThrow(/Duplicate/);
    const f = repairFixture(),
      request = structuredClone(f.request());
    request.edits[0].semanticCost++;
    expect(() => parseMetamapRepairRequest(request)).toThrow(
      /complete content/,
    );
    const baseline = structuredClone(f.capture());
    baseline.expected.projections[0].result.issues = [];
    rehashSourceReplay(baseline);
    expect(() =>
      createMetamapRepairRequest(baseline, {
        consumer: request.consumer,
        requiredProjections: request.requiredProjections,
        allowedFacts: request.allowedFacts,
        protectedFacts: request.protectedFacts,
        edits: request.edits,
        bounds: request.bounds,
      }),
    ).toThrow(/REPLAY_OUTPUT/);
  });
  it("blocks stale digests, a changed duplicate keeper and cost overflow", async () => {
    const f = repairFixture();
    f.inputs.graph.mappings.push({
      ...f.mapping,
      targets: [f.inputs.graph.entities[1].id],
    });
    const stale: MetamapRepairEdit = {
      id: "stale",
      kind: "select-target",
      semanticCost: 1,
      mappingIndex: 2,
      expectedDigest: "sha256:" + "0".repeat(64),
      target: f.mapping.targets[0],
    };
    expect((await search(f.request([stale]))).attempts[0]).toMatchObject({
      status: "blocked",
      issues: [{ code: "REPAIR_STALE_MAPPING" }],
    });
    f.inputs.graph.mappings[2] = f.mapping;
    f.inputs.graph.mappings.push({ ...f.mapping });
    const remove: MetamapRepairEdit = {
      id: "remove",
      kind: "remove-duplicate",
      semanticCost: Number.MAX_SAFE_INTEGER,
      mappingIndex: 3,
      expectedDigest: valueDigest(f.inputs.graph.mappings[3]),
      keepIndex: 2,
      keepDigest: valueDigest(f.mapping),
    };
    const select: MetamapRepairEdit = {
      id: "select",
      kind: "select-target",
      semanticCost: Number.MAX_SAFE_INTEGER,
      mappingIndex: 2,
      expectedDigest: valueDigest(f.mapping),
      target: f.inputs.graph.entities[1].id,
    };
    const last = (await search(f.request([remove, select]))).attempts.at(-1)!;
    expect(last.status).toBe("blocked");
    if (last.status === "blocked")
      expect(last.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining([
          "REPAIR_KEEPER_CHANGED",
          "REPAIR_COST_OVERFLOW",
        ]),
      );
  }, 30000);
  it("recomputes patch, authorization, coverage, ranking and minimum claims after rehashing", async () => {
    const report = await search(repairFixture().request());
    for (const change of ["patch", "approval", "coverage", "rank", "minimum"]) {
      const altered = structuredClone(report) as any;
      if (change === "patch")
        altered.attempts[0].patch.graph.value.mappings = [];
      if (change === "approval")
        altered.attempts[0].authorization = "authorized";
      if (change === "coverage") altered.coverage.totalCombinations = "2";
      if (change === "rank") altered.proposals = [];
      if (change === "minimum") altered.minimality.global = true;
      rehashRepair(altered, "repair-result");
      expect(() => parseMetamapRepairReport(altered)).toThrow();
    }
  }, 30000);
  it("ranks by changed records, declared cost and stable identity regardless of input edit order", async () => {
    const f = repairFixture(),
      other = structuredClone(f.restore);
    if (other.kind !== "restore-mapping")
      throw new Error("Expected restoration");
    other.id = "cheaper";
    other.semanticCost = 0;
    other.mapping.id = "urn:repair:alternative";
    const a = await search(f.request([f.restore, other])),
      b = await search(f.request([other, f.restore]));
    expect(a.proposals).toEqual(b.proposals);
    expect(a.proposals).toHaveLength(3);
    const ranked = a.proposals.map((id) =>
      a.attempts.find((attempt) => attempt.id === id)!,
    );
    expect(ranked[0]).toMatchObject({
      edits: [other.id],
      rank: { editedRecords: 1, semanticCost: 0 },
    });
    expect(ranked[2]).toMatchObject({
      rank: { editedRecords: 2, semanticCost: 1 },
    });
  }, 30000);
  it("rejects a changed proof premise through the shared compiler without inventing a replacement proof", async () => {
    const f = repairFixture();
    f.inputs.recompose();
    const target = f.inputs.graph.mappings[0].targets[0];
    f.inputs.graph.mappings[0].targets = [f.inputs.graph.entities[2].id];
    const good: MetamapRepairEdit = {
      id: "good",
      kind: "select-target",
      semanticCost: 1,
      mappingIndex: 0,
      expectedDigest: valueDigest(f.inputs.graph.mappings[0]),
      target,
    };
    const bad = { ...good, id: "bad", target: f.inputs.graph.entities[0].id };
    const request = f.request([good, bad]),
      report = await search(request),
      failed = evaluated(report).find(
        (attempt) => attempt.edits[0] === bad.id,
      )!;
    expect(failed.viable).toBe(false);
    expect(
      failed.remainingFailures.some((failure) =>
        failure.issue.code.includes("DERIVATION"),
      ),
    ).toBe(true);
    const restored = evaluated(report).find(
      (attempt) => attempt.edits[0] === good.id,
    )!;
    expect(restored.viable).toBe(true);
    expect(restored.candidate.inputs.policy.derivations).toEqual(
      request.baseline.inputs.policy.derivations,
    );
  }, 30000);
  it("supports cancellation between completed candidates without applying any result", async () => {
    const f = repairFixture(),
      other = structuredClone(f.restore);
    other.id = "other";
    const controller = new AbortController();
    setImmediate(() => setImmediate(() => controller.abort()));
    const request = f.request([f.restore, other]),
      before = canonicalJson(request),
      report = await search(request, controller.signal);
    expect(report.coverage.attempted).toBe(1);
    expect(report.coverage.stopReasons).toContain("cancelled");
    expect(report.applied).toBe(false);
    expect(report.minimality.status).toBe("not-established");
    expect(canonicalJson(request)).toBe(before);
  }, 30000);
  it("reports an empty explicit search space without a global impossibility claim", async () => {
    const report = await search(repairFixture().request([]));
    expect(report).toMatchObject({
      status: "complete",
      attempts: [],
      proposals: [],
      coverage: { totalCombinations: "0", unexamined: "0" },
      minimality: { status: "not-established", global: false },
    });
  });
  it("counts a large finite space exactly while starting only the bounded candidate count", async () => {
    const f = repairFixture(),
      edits = Array.from({ length: 64 }, (_, index) => ({
        ...structuredClone(f.restore),
        id: String(index).padStart(2, "0"),
      }));
    const request = f.request(edits);
    const value = structuredClone(request);
    value.bounds.maximumCandidates = 1;
    rehashRepair(value);
    const report = await search(value);
    expect(report.coverage).toMatchObject({
      totalCombinations: "18446744073709551615",
      attempted: 1,
      unexamined: "18446744073709551614",
    });
    expect(report.coverage.stopReasons).toEqual(
      expect.arrayContaining(["candidate-limit", "edit-limit"]),
    );
    expect(report.minimality.status).toBe("not-established");
  }, 30000);
});
