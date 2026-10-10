import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MetamapDocument, RelationPack } from "../model.js";
import type { MetamapProjectionSpec } from "../projection.js";
import { RelationRegistry } from "../relations.js";
import {
  captureReplayBundle,
  parseReplayBundle,
  replayMetamap,
  validateReplayBundle,
  type CaptureReplayOptions,
  type MetamapReplayBundle,
} from "../replay.js";
import { valueDigest } from "../stable.js";
import { compileMetamap } from "../viability.js";
import type { MetamapViabilityPolicy } from "../viability-model.js";

function fixture<T>(path: string): T {
  return JSON.parse(
    readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"),
  ) as T;
}

const evaluatedAt = "2026-09-15T00:00:00.000Z";

function inputs(example = "routing") {
  const graph = fixture<MetamapDocument>(`examples/${example}/graph.json`);
  const policy = fixture<MetamapViabilityPolicy>(
    `examples/${example}/viability-policy.json`,
  );
  const spec = fixture<MetamapProjectionSpec>(
    `examples/${example}/projection.json`,
  );
  const registry = new RelationRegistry();
  registry.registerPack(fixture<RelationPack>("relation-packs/routing.json"));
  return { graph, policy, spec, registry };
}

function capture(example = "routing"): MetamapReplayBundle {
  const { graph, policy, spec, registry } = inputs(example);
  return captureReplayBundle(graph, policy, {
    evaluatedAt,
    projections: [spec],
    relationRegistry: registry,
  });
}

/** A new content address is not permission to change the captured result. */
function resign(bundle: MetamapReplayBundle): MetamapReplayBundle {
  const { $schema: _schema, id: _id, digest: _digest, ...content } = bundle;
  bundle.digest = valueDigest(content);
  bundle.id = `urn:metamap:replay:${bundle.digest.replace(/^sha256:/, "")}`;
  return bundle;
}

describe("compiler replay contract", () => {
  it("round-trips the compiler and static projection without changing legacy generations or caller inputs", () => {
    const { graph, policy, spec, registry } = inputs();
    const original = structuredClone({ graph, policy, spec });
    const legacy = compileMetamap(
      structuredClone(graph),
      structuredClone(policy),
      { evaluatedAt, relationRegistry: registry },
    );
    const bundle = captureReplayBundle(graph, policy, {
      evaluatedAt,
      projections: [spec],
      relationRegistry: registry,
    });
    const serialized = JSON.parse(JSON.stringify(bundle)) as unknown;

    expect(validateReplayBundle(serialized)).toEqual({
      valid: true,
      issues: [],
    });
    expect(parseReplayBundle(serialized).expected.compilation).toEqual(legacy);
    expect(replayMetamap(serialized)).toEqual(
      expect.objectContaining({
        status: "verified",
        admitted: true,
        outputs: bundle.expected,
      }),
    );
    expect({ graph, policy, spec }).toEqual(original);
    expect(Object.isFrozen(graph)).toBe(false);
    expect(Object.isFrozen(bundle.inputs.graph)).toBe(true);
    expect(bundle.compiler.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "ajv" }),
        expect.objectContaining({ name: "ajv-formats" }),
      ]),
    );
  });

  it("reproduces nested path trees with the same generation and projection bindings", () => {
    const bundle = capture("path-tree");
    expect(bundle.expected.projections[0].pathTree?.status).toBe("projected");
    expect(replayMetamap(JSON.parse(JSON.stringify(bundle)))).toEqual(
      expect.objectContaining({
        status: "verified",
        admitted: true,
        outputs: bundle.expected,
      }),
    );
  });

  it("captures explicit context and evaluation time instead of reading a new clock during replay", () => {
    const graph = fixture<MetamapDocument>(
      "examples/example-authority-graph.json",
    );
    const policy = fixture<MetamapViabilityPolicy>(
      "examples/example-viability-policy.json",
    );
    const context = { environment: "production", maintenance: false };
    const bundle = captureReplayBundle(graph, policy, { context, evaluatedAt });
    context.maintenance = true;
    policy.evidence.length = 0;
    expect(bundle.inputs.context.maintenance).toBe(false);
    expect(replayMetamap(bundle)).toEqual(
      expect.objectContaining({ status: "verified", admitted: true }),
    );
  });

  it("rejects malformed and unsupported portable contracts before replay", () => {
    const original = capture();
    for (const change of [
      (bundle: Record<string, unknown>) => {
        bundle.schemaVersion = "2.0.0";
      },
      (bundle: Record<string, unknown>) => {
        bundle.execute = "file:///untrusted.js";
      },
      (bundle: Record<string, unknown>) => {
        bundle.constraintExecutor = "file:///untrusted.js";
      },
    ]) {
      const bundle = structuredClone(original) as unknown as Record<
        string,
        unknown
      >;
      change(bundle);
      expect(replayMetamap(bundle)).toEqual(
        expect.objectContaining({
          status: "rejected",
          issues: expect.arrayContaining([
            expect.objectContaining({ code: "INVALID_REPLAY_BUNDLE" }),
          ]),
        }),
      );
    }
    const missingTime = structuredClone(original);
    delete (missingTime.inputs as Partial<typeof missingTime.inputs>)
      .evaluatedAt;
    expect(validateReplayBundle(missingTime).valid).toBe(false);
  });

  it("detects changed inputs and identities without silently accepting a new content address", () => {
    const bundle = structuredClone(capture());
    bundle.inputs.context.environment = "production";
    expect(replayMetamap(bundle)).toEqual(
      expect.objectContaining({
        status: "rejected",
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "REPLAY_DIGEST_MISMATCH" }),
          expect.objectContaining({ code: "REPLAY_ID_MISMATCH" }),
        ]),
      }),
    );
  });

  it("recomputes results and rejects a forged expected generation even after the bundle is rehashed", () => {
    const bundle = structuredClone(capture());
    if (bundle.expected.compilation.status !== "viable")
      throw new Error("Expected viable fixture");
    bundle.expected.compilation.generation.activeMappings.length = 0;
    resign(bundle);
    expect(replayMetamap(bundle)).toEqual(
      expect.objectContaining({
        status: "rejected",
        issues: [expect.objectContaining({ code: "REPLAY_OUTPUT_MISMATCH" })],
      }),
    );
  });

  it("rejects a different installed compiler, dependency payload, or runtime", () => {
    const original = capture();
    for (const change of [
      (bundle: MetamapReplayBundle) => {
        bundle.compiler.digest = `sha256:${"0".repeat(64)}`;
      },
      (bundle: MetamapReplayBundle) => {
        bundle.compiler.dependencies[0].digest = `sha256:${"0".repeat(64)}`;
      },
      (bundle: MetamapReplayBundle) => {
        bundle.compiler.runtime.node = "0.0.0";
      },
      (bundle: MetamapReplayBundle) => {
        bundle.compiler.format = "distribution";
      },
    ]) {
      const bundle = structuredClone(original);
      change(bundle);
      resign(bundle);
      expect(replayMetamap(bundle)).toEqual(
        expect.objectContaining({
          status: "rejected",
          issues: [
            expect.objectContaining({ code: "REPLAY_COMPILER_MISMATCH" }),
          ],
        }),
      );
    }
  });

  it("rejects missing, substituted, and duplicate relation-pack dependencies", () => {
    const original = capture();
    const missing = structuredClone(original);
    missing.inputs.relationPacks = missing.inputs.relationPacks.filter(
      (pack) => !pack.id.endsWith(":routing"),
    );
    expect(replayMetamap(resign(missing))).toEqual(
      expect.objectContaining({
        status: "rejected",
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "REPLAY_RELATION_PACK_MISMATCH" }),
        ]),
      }),
    );
    const duplicate = structuredClone(original);
    duplicate.inputs.relationPacks.push(
      structuredClone(duplicate.inputs.relationPacks[0]),
    );
    expect(validateReplayBundle(resign(duplicate))).toEqual(
      expect.objectContaining({
        valid: false,
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "REPLAY_DUPLICATE_PACK" }),
        ]),
      }),
    );
    const core = structuredClone(original);
    core.inputs.relationPacks.find((pack) =>
      pack.id.endsWith(":core"),
    )!.relations[0].impactDirection = "none";
    expect(replayMetamap(resign(core))).toEqual(
      expect.objectContaining({
        status: "rejected",
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "REPLAY_CORE_PACK_MISMATCH" }),
        ]),
      }),
    );
  });

  it("reproduces rejected compilation without upgrading it to admission", () => {
    const { graph, policy, spec, registry } = inputs();
    graph.mappings[0].lossiness = "unknown";
    const bundle = captureReplayBundle(graph, policy, {
      evaluatedAt,
      projections: [spec],
      relationRegistry: registry,
    });
    expect(bundle.expected.compilation.status).toBe("rejected");
    expect(bundle.expected.projections).toEqual([]);
    expect(replayMetamap(bundle)).toEqual(
      expect.objectContaining({ status: "verified", admitted: false }),
    );
  });

  it("keeps projection rejection distinct from successful graph compilation", () => {
    const { graph, policy, spec, registry } = inputs();
    spec.slots[0].targetKinds = ["routing:incorrect-handler"];
    const bundle = captureReplayBundle(graph, policy, {
      evaluatedAt,
      projections: [spec],
      relationRegistry: registry,
    });
    expect(bundle.expected.compilation.status).toBe("viable");
    expect(bundle.expected.projections[0].result.status).toBe("rejected");
    expect(replayMetamap(bundle)).toEqual(
      expect.objectContaining({ status: "verified", admitted: false }),
    );
  });

  it("requires explicit executor support and unambiguous projection identities", () => {
    const { graph, policy, spec, registry } = inputs();
    expect(() =>
      captureReplayBundle(graph, policy, {
        evaluatedAt,
        constraintRegistry: {},
      } as CaptureReplayOptions),
    ).toThrow("only built-in constraint evaluators");
    expect(() =>
      captureReplayBundle(graph, policy, {
        evaluatedAt,
        projections: [spec, spec],
        relationRegistry: registry,
      }),
    ).toThrow("REPLAY_DUPLICATE_PROJECTION");
    policy.constraints.push({
      id: "urn:test:custom",
      kind: "custom:unknown",
      subjects: [graph.entities[0].id],
    });
    const bundle = captureReplayBundle(graph, policy, {
      evaluatedAt,
      relationRegistry: registry,
    });
    expect(bundle.expected.compilation.status).toBe("rejected");
    expect(replayMetamap(bundle)).toEqual(
      expect.objectContaining({ status: "verified", admitted: false }),
    );
  });
});
