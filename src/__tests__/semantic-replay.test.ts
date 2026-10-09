import { describe, expect, it } from "vitest";
import { canonicalJson } from "../canonical.js";
import { captureReplayBundle, replayMetamap } from "../replay.js";
import {
  parseSemanticReplayJson,
  semanticReplayDigest,
  validateSemanticReplayBundle,
} from "../semantic-replay.js";
import type {
  CaptureSemanticReplayOptions,
  SemanticReplayBundle,
} from "../semantic-replay-model.js";
import { semanticFixture } from "./helpers/semantic-fixture.js";

function rehash(bundle: SemanticReplayBundle) {
  bundle.digest = semanticReplayDigest(bundle);
  bundle.id = `urn:metamap:replay:${bundle.digest.slice(7)}`;
  return bundle;
}
describe("semantic capture and exact replay", () => {
  it("reproduces the graph, checked proof, projection and path tree without mutating inputs", () => {
    const inputs = semanticFixture();
    const saved = structuredClone({
      graph: inputs.graph,
      policy: inputs.policy,
      spec: inputs.spec,
    });
    const bundle = inputs.capture();
    expect(validateSemanticReplayBundle(bundle)).toEqual({
      valid: true,
      issues: [],
    });
    expect(
      replayMetamap(parseSemanticReplayJson(canonicalJson(bundle))),
    ).toEqual({
      status: "verified",
      bundle: bundle.id,
      admitted: true,
      outputs: bundle.expected,
    });
    expect(bundle.expected.projections[0].pathTree?.status).toBe("projected");
    expect(bundle.inputs.sourceSnapshot).toBeNull();
    expect(bundle.inputs.sourceReceipts).toEqual([]);
    expect(Object.isFrozen(bundle.inputs.policy.derivations)).toBe(true);
    expect({
      graph: inputs.graph,
      policy: inputs.policy,
      spec: inputs.spec,
    }).toEqual(saved);
  });
  it("includes the schema URI in every new capture binding", () => {
    const bundle = structuredClone(semanticFixture().capture());
    bundle.$schema = "urn:example:different-schema";
    expect(validateSemanticReplayBundle(bundle).valid).toBe(false);
  });
  it("rejects changed context, time, proof and budget inputs even if the outer bundle is rehashed", () => {
    const original = semanticFixture().capture();
    for (const mutate of [
      (bundle: SemanticReplayBundle) => {
        bundle.inputs.context.environment = "changed";
      },
      (bundle: SemanticReplayBundle) => {
        bundle.inputs.evaluatedAt = "2026-10-10T00:00:00.000Z";
      },
      (bundle: SemanticReplayBundle) => {
        bundle.inputs.policy.derivations = [];
      },
      (bundle: SemanticReplayBundle) => {
        bundle.inputs.projections[0].budget = "urn:example:budget";
      },
    ]) {
      const bundle = structuredClone(original);
      mutate(bundle);
      const result = replayMetamap(rehash(bundle));
      expect(result).toMatchObject({
        status: "rejected",
        issues: [{ code: "REPLAY_OUTPUT_MISMATCH" }],
      });
    }
  });
  it("recomputes a forged expected projection, dependency closure and path tree", () => {
    const original = semanticFixture().capture();
    for (const mutate of [
      (bundle: SemanticReplayBundle) => {
        const result = bundle.expected.projections[0].result;
        if (result.status === "projected")
          result.projection.semantic.usedMappings = [];
      },
      (bundle: SemanticReplayBundle) => {
        const result = bundle.expected.projections[0].result;
        if (result.status === "projected")
          result.projection.entries[0].slots[0].targets[0].locators = [
            { uri: "file:///substitute.json" },
          ];
      },
      (bundle: SemanticReplayBundle) => {
        const result = bundle.expected.projections[0].pathTree;
        if (result?.status === "projected") result.pathTree.params = [];
      },
    ]) {
      const bundle = structuredClone(original);
      mutate(bundle);
      expect(replayMetamap(rehash(bundle))).toMatchObject({
        status: "rejected",
        issues: [{ code: "REPLAY_OUTPUT_MISMATCH" }],
      });
    }
  });
  it("requires the exact installed executor, runtime and dependency payload", () => {
    const original = semanticFixture().capture();
    for (const mutate of [
      (bundle: SemanticReplayBundle) => {
        bundle.compiler.digest = `sha256:${"0".repeat(64)}`;
      },
      (bundle: SemanticReplayBundle) => {
        bundle.compiler.runtime.node = "20.0.0";
      },
      (bundle: SemanticReplayBundle) => {
        bundle.compiler.dependencies[0].digest = `sha256:${"0".repeat(64)}`;
      },
    ]) {
      const bundle = structuredClone(original);
      mutate(bundle);
      expect(replayMetamap(rehash(bundle))).toMatchObject({
        status: "rejected",
        issues: [{ code: "REPLAY_COMPILER_MISMATCH" }],
      });
    }
  });
  it("rejects missing, duplicate or substituted packs and missing exact graph pack digests", () => {
    const original = semanticFixture().capture();
    for (const mutate of [
      (bundle: SemanticReplayBundle) => {
        bundle.inputs.relationPacks.pop();
      },
      (bundle: SemanticReplayBundle) => {
        bundle.inputs.relationPacks.push(bundle.inputs.relationPacks[1]);
      },
      (bundle: SemanticReplayBundle) => {
        bundle.inputs.relationPacks[1].version = "different";
      },
      (bundle: SemanticReplayBundle) => {
        delete bundle.inputs.graph.relationPacks![1].digest;
      },
    ]) {
      const bundle = structuredClone(original);
      mutate(bundle);
      expect(validateSemanticReplayBundle(rehash(bundle)).valid).toBe(false);
    }
  });
  it("preserves a reproduced compilation rejection and does not create projections", () => {
    const inputs = semanticFixture();
    inputs.graph.mappings.splice(1, 1);
    inputs.rebind();
    const bundle = inputs.capture(),
      result = replayMetamap(bundle);
    expect(result).toMatchObject({
      status: "verified",
      admitted: false,
      outputs: { compilation: { status: "rejected" }, projections: [] },
    });
    expect(bundle.inputs.policy.derivations).toHaveLength(1);
  });
  it("keeps successful compilation distinct from a rejected consumer expression", () => {
    const inputs = semanticFixture();
    inputs.spec.slots[0].targetKinds = ["operation"];
    const bundle = inputs.capture();
    expect(replayMetamap(bundle)).toMatchObject({
      status: "verified",
      admitted: false,
      outputs: {
        compilation: { status: "viable" },
        projections: [{ result: { status: "rejected" } }],
      },
    });
  });
  it("refuses requested source rediscovery, custom executors and repeated projection identities", () => {
    const inputs = semanticFixture();
    expect(() =>
      captureReplayBundle(inputs.graph, inputs.policy, {
        ...inputs.options,
        projections: [inputs.spec, inputs.spec],
      }),
    ).toThrow(/REPLAY_DUPLICATE_PROJECTION/);
    expect(() =>
      captureReplayBundle(inputs.graph, inputs.policy, {
        ...inputs.options,
        constraintRegistry: {},
      } as unknown as CaptureSemanticReplayOptions),
    ).toThrow(/built-in constraint/);
    const bundle = structuredClone(inputs.capture());
    bundle.inputs.sourceSnapshot = {
      schemaVersion: "1.0.0",
      graphId: inputs.graph.id,
      graphRevision: inputs.graph.revision!,
      graphDigest: bundle.inputs.policy.graph.digest!,
      configDigest: `sha256:${"0".repeat(64)}`,
      sources: [],
      counts: {
        entities: inputs.graph.entities.length,
        mappings: inputs.graph.mappings.length,
        authorities: 0,
      },
    };
    expect(replayMetamap(rehash(bundle))).toMatchObject({
      status: "rejected",
      issues: [{ code: "REPLAY_SOURCE_CAPTURE_NOT_IMPLEMENTED" }],
    });
  });
  it("rejects named executable loading and duplicate decoded keys", () => {
    const original = semanticFixture().capture();
    const invalid = structuredClone(original) as unknown as Record<
      string,
      unknown
    >;
    invalid.constraintExecutor = "file:///untrusted.mjs";
    expect(replayMetamap(invalid).status).toBe("rejected");
    expect(() =>
      parseSemanticReplayJson(
        JSON.stringify(original).replace(
          '"evaluatedAt":"2026-10-09T00:00:00.000Z"',
          '"evaluatedAt":"2026-10-09T00:00:00.000Z","evaluatedAt":"2026-10-09T00:00:00.000Z"',
        ),
      ),
    ).toThrow(/Duplicate/);
  });
});
