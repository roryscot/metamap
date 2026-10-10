import { describe, expect, it } from "vitest";
import { canonicalJson } from "../canonical.js";
import { compareMetamapBundles } from "../counterfactual.js";
import { captureReplayBundle, replayMetamap } from "../replay.js";
import {
  parseSourceReplayJson,
  semanticReplayDigest,
  validateSemanticReplayBundle,
  validateSourceReplayBundle,
} from "../semantic-replay.js";
import type {
  CaptureSourceReplayOptions,
  SourceReplayBundle,
} from "../semantic-replay-model.js";
import { sourceReceiptDigest, sourceCaptureLineage } from "../provenance.js";
import {
  parseSourceCounterfactualJson,
  semanticCounterfactualDigest,
  validateSourceCounterfactualReport,
} from "../semantic-counterfactual.js";
import {
  rehashCapture,
  rehashSourceReplay,
  sourceFixture,
} from "./helpers/source-fixture.js";

function capture(inputs = sourceFixture()) {
  return captureReplayBundle(inputs.graph, inputs.policy, {
    ...inputs.options,
    projections: [inputs.spec],
    sourceCapture: inputs.sourceCapture,
  });
}
describe("source-bound exact replay and comparisons", () => {
  it("captures the full source graph separately from the checked candidate and retains policy/projection version 2", () => {
    const inputs = sourceFixture();
    inputs.supported();
    inputs.requireIdentity();
    inputs.budget();
    inputs.recompose();
    const original = structuredClone({
      graph: inputs.graph,
      policy: inputs.policy,
      capture: inputs.sourceCapture,
    });
    const bundle = capture(inputs);
    expect(bundle.schemaVersion).toBe("3.0.0");
    expect(bundle.inputs.policy.schemaVersion).toBe("2.0.0");
    expect(bundle.expected.projections[0].result.status).toBe("projected");
    expect(bundle.inputs.sourceReceipts).toHaveLength(2);
    expect(bundle.inputs.sourceSnapshot.graphDigest).toBe(
      bundle.expected.sourceInspection.sourceGraph.digest,
    );
    expect(bundle.expected.sourceInspection.evaluatedGraph.digest).not.toBe(
      bundle.inputs.sourceSnapshot.graphDigest,
    );
    expect(bundle.expected.sourceInspection.relationship).toBe(
      "candidate-differs",
    );
    expect(validateSemanticReplayBundle(bundle).valid).toBe(false);
    expect(validateSourceReplayBundle(bundle)).toEqual({
      valid: true,
      issues: [],
    });
    expect(replayMetamap(parseSourceReplayJson(canonicalJson(bundle)))).toEqual(
      {
        status: "verified",
        admitted: true,
        bundle: bundle.id,
        outputs: bundle.expected,
      },
    );
    expect({
      graph: inputs.graph,
      policy: inputs.policy,
      capture: inputs.sourceCapture,
    }).toEqual(original);
  });
  it("reproduces rejected admission and provenance without creating consumer outputs", () => {
    const inputs = sourceFixture();
    inputs.graph.mappings.splice(1, 1);
    inputs.rebind();
    const bundle = capture(inputs);
    expect(replayMetamap(bundle)).toMatchObject({
      status: "verified",
      admitted: false,
      outputs: {
        compilation: { status: "rejected" },
        projections: [],
        sourceInspection: {
          relationship: "candidate-differs",
          authentication: "not-evaluated",
          authorizationNow: "not-evaluated",
          active: "not-evaluated",
        },
      },
    });
  });
  it.each([
    "source",
    "sourceRevision",
    "adapter",
    "configDigest",
    "inputs",
    "shard",
  ])(
    "detects rehashed %s receipt substitution in a rehashed bundle",
    (field) => {
      const bundle = structuredClone(capture());
      const receipt = bundle.inputs.sourceReceipts[0];
      if (field === "source") receipt.source = "different";
      if (field === "sourceRevision") receipt.sourceRevision = "new-revision";
      if (field === "adapter") receipt.adapter.version = "new-version";
      if (field === "configDigest")
        receipt.configDigest = `sha256:${"0".repeat(64)}`;
      if (field === "inputs")
        receipt.inputs[0].digest = `sha256:${"0".repeat(64)}`;
      if (field === "shard") receipt.shard.digest = `sha256:${"0".repeat(64)}`;
      receipt.digest = sourceReceiptDigest(receipt);
      receipt.id = `urn:metamap:source-receipt:${receipt.digest.slice(7)}`;
      expect(replayMetamap(rehashSourceReplay(bundle))).toMatchObject({
        status: "rejected",
        issues: [{ code: "SOURCE_RECEIPT_BINDING_MISMATCH" }],
      });
    },
  );
  it("detects altered source composition after both source capture and bundle are rehashed", () => {
    const bundle = structuredClone(capture());
    bundle.inputs.sourceCapture.config.sources[0] = {
      ...bundle.inputs.sourceCapture.config.sources[0],
      path: "other.json",
    };
    rehashCapture(bundle.inputs.sourceCapture);
    expect(replayMetamap(rehashSourceReplay(bundle))).toMatchObject({
      status: "rejected",
      issues: [{ code: "SOURCE_GRAPH_MISMATCH" }],
    });
  });
  it("checks source-only changes even when candidate compilation and graph are unchanged", () => {
    const bundle = structuredClone(capture());
    // Shard metadata does not alter its composed graph, but remains captured provenance.
    bundle.inputs.sourceCapture.adapters[0].document.revision =
      "different-revision";
    rehashCapture(bundle.inputs.sourceCapture);
    Object.assign(
      bundle.inputs,
      sourceCaptureLineage(bundle.inputs.sourceCapture),
    );
    expect(validateSourceReplayBundle(rehashSourceReplay(bundle)).valid).toBe(
      true,
    );
    expect(replayMetamap(bundle)).toMatchObject({
      status: "rejected",
      issues: [{ code: "REPLAY_OUTPUT_MISMATCH" }],
    });
  });
  it("rejects missing captures, receipts, snapshot members, packs and named executors", () => {
    const original = capture();
    const mutations: Array<(bundle: SourceReplayBundle) => void> = [
      (bundle) => {
        delete (bundle.inputs as Partial<SourceReplayBundle["inputs"]>)
          .sourceCapture;
      },
      (bundle) => {
        bundle.inputs.sourceReceipts = [];
      },
      (bundle) => {
        bundle.inputs.sourceSnapshot.sources = [];
      },
      (bundle) => {
        bundle.inputs.sourceCapture.relationPacks.pop();
        rehashCapture(bundle.inputs.sourceCapture);
      },
      (bundle) => {
        (
          bundle as unknown as { constraintExecutor: string }
        ).constraintExecutor = "file:///untrusted.mjs";
      },
    ];
    for (const mutate of mutations) {
      const bundle = structuredClone(original);
      mutate(bundle);
      expect(replayMetamap(rehashSourceReplay(bundle)).status).toBe("rejected");
    }
  });
  it("refuses source overrides, legacy source capture and duplicate decoded capture keys", () => {
    const inputs = sourceFixture();
    expect(() =>
      captureReplayBundle(inputs.graph, inputs.policy, {
        ...inputs.options,
        sourceCapture: inputs.sourceCapture,
        sourceSnapshot: inputs.discovery.snapshot,
      } as unknown as CaptureSourceReplayOptions),
    ).toThrow(/overrides/);
    expect(() =>
      captureReplayBundle(
        inputs.graph,
        {
          schemaVersion: "1.0.0",
          id: "urn:legacy:policy",
          graph: { id: inputs.graph.id },
          mappings: [],
          constraints: [],
          evidence: [],
        },
        { ...inputs.options, sourceCapture: inputs.sourceCapture },
      ),
    ).toThrow(/Source capture requires/);
    const bundle = capture(inputs);
    expect(() =>
      parseSourceReplayJson(
        canonicalJson(bundle).replace(
          '"schemaVersion":"3.0.0"',
          '"schemaVersion":"3.0.0","schemaVersion":"3.0.0"',
        ),
      ),
    ).toThrow(/Duplicate/);
  });
  it("recomputes forged lineage reports and keeps expected raw rediscovery unavailable", () => {
    const original = capture();
    for (const mutate of [
      (bundle: SourceReplayBundle) => {
        bundle.expected.sourceInspection.lineage.recordedInputDigests = 0;
      },
      (bundle: SourceReplayBundle) => {
        bundle.expected.sourceInspection.capture.digest = `sha256:${"0".repeat(64)}`;
      },
      (bundle: SourceReplayBundle) => {
        bundle.expected.sourceInspection.sourceRediscovery = {
          status: "current",
          currentCapture: bundle.expected.sourceInspection.capture,
          changes: [],
        };
      },
    ]) {
      const bundle = structuredClone(original);
      mutate(bundle);
      expect(replayMetamap(rehashSourceReplay(bundle))).toMatchObject({
        status: "rejected",
        issues: [{ code: "REPLAY_OUTPUT_MISMATCH" }],
      });
    }
  });
  it("retains exact executor, runtime, dependency, proof and budget tampering checks", () => {
    const original = capture();
    for (const mutate of [
      (bundle: SourceReplayBundle) => {
        bundle.compiler.runtime.node = "20.0.0";
      },
      (bundle: SourceReplayBundle) => {
        bundle.compiler.dependencies.pop();
      },
      (bundle: SourceReplayBundle) => {
        bundle.compiler.digest = `sha256:${"0".repeat(64)}`;
      },
      (bundle: SourceReplayBundle) => {
        bundle.inputs.policy.derivations = [];
      },
      (bundle: SourceReplayBundle) => {
        bundle.inputs.projections[0].budget = "urn:missing:budget";
      },
    ]) {
      const bundle = structuredClone(original);
      mutate(bundle);
      expect(replayMetamap(rehashSourceReplay(bundle)).status).toBe("rejected");
    }
  });
  it("compares source/candidate lineage and preserves unknown rejected projection deltas", () => {
    const inputs = sourceFixture(),
      before = capture(inputs);
    inputs.graph.mappings.splice(1, 1);
    inputs.rebind();
    const after = capture(inputs);
    const result = compareMetamapBundles(before, after);
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    expect(result.report.schemaVersion).toBe("3.0.0");
    expect(result.report.provenance.changes).toEqual([]);
    expect(result.report.provenance.after.graphChanges.changes).toEqual(
      expect.arrayContaining([
        {
          change: "removed",
          kind: "mapping",
          id: "urn:example:service-schema",
        },
      ]),
    );
    expect(result.report.semantic.projections[0]).toMatchObject({
      beforeKnown: true,
      afterKnown: false,
      usedMappingsChanged: null,
      riskChanged: null,
    });
    expect(parseSourceCounterfactualJson(canonicalJson(result.report))).toEqual(
      result.report,
    );
  });
  it("rejects mixed replay profiles and altered rehashed report known-state claims", () => {
    const inputs = sourceFixture();
    const before = capture(inputs),
      after = captureReplayBundle(inputs.graph, inputs.policy, inputs.options);
    expect(compareMetamapBundles(before, after)).toMatchObject({
      status: "rejected",
      issues: [{ code: "COUNTERFACTUAL_VERSION_MISMATCH" }],
    });
    const compared = compareMetamapBundles(before, before);
    if (compared.status !== "compared")
      throw new Error(JSON.stringify(compared));
    const report = structuredClone(compared.report);
    report.semantic.projections[0].beforeKnown = false;
    report.digest = semanticCounterfactualDigest(report);
    report.id = `urn:metamap:counterfactual:${report.digest.slice(7)}`;
    expect(validateSourceCounterfactualReport(report).valid).toBe(false);
    expect(semanticReplayDigest(before)).toBe(before.digest);
  });
});
