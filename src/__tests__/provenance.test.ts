import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { canonicalDigest, canonicalJson } from "../canonical.js";
import { RelationRegistry } from "../relations.js";
import { relationPackDigest } from "../relation-pack.js";
import { valueDigest } from "../stable.js";
import { assembleWorkspace } from "../workspace.js";
import {
  captureWorkspaceSources,
  compareSourceCaptures,
  createSourceCapture,
  inspectSourceCapture,
  parseSourceCaptureJson,
  parseSourceInspectionJson,
  parseSourceReceiptJson,
  sourceCaptureLineage,
  sourceLineageIssues,
  sourceReceiptDigest,
  validateSourceCapture,
  validateSourceInspection,
  validateSourceReceipt,
} from "../provenance.js";
import type { MetamapSourceCapture } from "../provenance-model.js";
import { rehashCapture, sourceFixture } from "./helpers/source-fixture.js";

describe("complete recorded source lineage", () => {
  it("reconstructs the existing workspace and binds each configuration, input and shard without mutating records", () => {
    const inputs = sourceFixture();
    const saved = structuredClone({
      config: inputs.config,
      adapters: inputs.adapters,
      graph: inputs.discovery.graph,
    });
    const capture = parseSourceCaptureJson(canonicalJson(inputs.sourceCapture));
    expect(validateSourceCapture(capture)).toEqual({ valid: true, issues: [] });
    const lineage = sourceCaptureLineage(capture);
    expect(lineage.sourceSnapshot).toEqual(inputs.discovery.snapshot);
    expect(lineage.sourceReceipts).toHaveLength(2);
    for (const [index, receipt] of lineage.sourceReceipts.entries()) {
      expect(parseSourceReceiptJson(canonicalJson(receipt))).toEqual(receipt);
      expect(receipt).toMatchObject({
        source: inputs.config.sources[index].id,
        sourceRevision: inputs.adapters[index].document.revision,
        configDigest: canonicalDigest(inputs.config.sources[index]),
        shard: {
          id: inputs.adapters[index].document.id,
          digest: valueDigest(inputs.adapters[index].document),
        },
        inputs: inputs.adapters[index].inputs,
      });
    }
    expect(sourceLineageIssues(capture, lineage)).toEqual([]);
    expect({
      config: inputs.config,
      adapters: inputs.adapters,
      graph: inputs.discovery.graph,
    }).toEqual(saved);
    expect(Object.isFrozen(inputs.adapters[0].inputs)).toBe(false);
    expect(Object.isFrozen(capture.adapters[0].inputs)).toBe(false);
  });
  it("keeps JCS receipt/capture bindings and referenced legacy graph/snapshot digests distinct", () => {
    const capture = sourceFixture().sourceCapture;
    const lineage = sourceCaptureLineage(capture);
    expect(lineage.sourceSnapshot.graphDigest).toBe(valueDigest(capture.graph));
    expect(lineage.sourceSnapshot.configDigest).toBe(
      valueDigest(capture.config),
    );
    expect(lineage.sourceReceipts[0].configDigest).not.toBe(
      valueDigest(capture.config.sources[0]),
    );
    const altered = structuredClone(capture);
    altered.$schema = "urn:changed:schema";
    expect(validateSourceCapture(altered).valid).toBe(false);
  });
  it.each(["configuration", "adapter", "input", "shard", "graph"])(
    "rejects a rehashed %s substitution that leaves old source composition bound",
    (change) => {
      const capture = structuredClone(sourceFixture().sourceCapture);
      if (change === "configuration")
        capture.config.sources[0] = {
          ...capture.config.sources[0],
          path: "different.json",
        };
      if (change === "adapter") capture.adapters[0].adapterVersion = "2.0.0";
      if (change === "input")
        capture.adapters[0].inputs[0].digest = `sha256:${"0".repeat(64)}`;
      if (change === "shard")
        capture.adapters[0].document.entities[0].label = "changed";
      if (change === "graph") capture.graph.entities[0].label = "changed";
      expect(validateSourceCapture(rehashCapture(capture))).toMatchObject({
        valid: false,
        issues: [{ code: "SOURCE_GRAPH_MISMATCH" }],
      });
    },
  );
  it("requires exactly the configured source inventory, including source order and adapter identity", () => {
    const original = sourceFixture().sourceCapture;
    for (const mutate of [
      (capture: MetamapSourceCapture) => capture.adapters.pop(),
      (capture: MetamapSourceCapture) =>
        capture.adapters.push(capture.adapters[0]),
      (capture: MetamapSourceCapture) => capture.adapters.reverse(),
      (capture: MetamapSourceCapture) => {
        capture.adapters[0].adapter = "other";
      },
      (capture: MetamapSourceCapture) => {
        capture.adapters[0].sourceId = "self-appointed";
      },
    ]) {
      const capture = structuredClone(original);
      mutate(capture);
      expect(
        validateSourceCapture(rehashCapture(capture)).issues.some(
          (issue) => issue.code === "SOURCE_INVENTORY_MISMATCH",
        ),
      ).toBe(true);
    }
  });
  it("rejects missing, duplicated, modified and unbound exact source relation packs", () => {
    const original = sourceFixture().sourceCapture;
    for (const mutate of [
      (capture: MetamapSourceCapture) => capture.relationPacks.pop(),
      (capture: MetamapSourceCapture) =>
        capture.relationPacks.push(capture.relationPacks[0]),
      (capture: MetamapSourceCapture) => {
        capture.relationPacks[0].description = "substitute";
      },
      (capture: MetamapSourceCapture) => {
        delete capture.graph.relationPacks![1].digest;
      },
      (capture: MetamapSourceCapture) => {
        capture.config.relationPacks = ["missing.json"];
      },
    ]) {
      const capture = structuredClone(original);
      mutate(capture);
      expect(validateSourceCapture(rehashCapture(capture)).valid).toBe(false);
    }
    expect(
      original.graph.relationPacks!.find(
        (pack) => pack.uri === "repo:pack.json",
      )?.digest,
    ).toBe(
      relationPackDigest(
        original.relationPacks.find((pack) => pack.schemaVersion === "2.0.0")!,
      ),
    );
  });
  it.each([
    "/private/source.json",
    "../outside.json",
    "a/../outside.json",
    "a\\outside.json",
    "https://untrusted.invalid/data",
    "a//b",
    "./source.json",
  ])("rejects locator %s without reading it", (path) => {
    const capture = structuredClone(sourceFixture().sourceCapture);
    capture.adapters[0].inputs[0].path = path;
    expect(
      validateSourceCapture(rehashCapture(capture)).issues.some(
        (issue) => issue.code === "SOURCE_LOCATOR_INVALID",
      ),
    ).toBe(true);
  });
  it("rejects duplicate input paths and decoded JSON keys, extra members and unknown versions", () => {
    const original = sourceFixture().sourceCapture;
    const repeated = structuredClone(original);
    repeated.adapters[0].inputs.push(repeated.adapters[0].inputs[0]);
    expect(
      validateSourceCapture(rehashCapture(repeated)).issues.some(
        (issue) => issue.code === "SOURCE_INPUT_DUPLICATE",
      ),
    ).toBe(true);
    expect(
      validateSourceCapture({ ...original, schemaVersion: "2.0.0" }).valid,
    ).toBe(false);
    expect(
      validateSourceCapture({ ...original, executor: "file:///untrusted.mjs" })
        .valid,
    ).toBe(false);
    expect(() =>
      parseSourceCaptureJson(
        canonicalJson(original).replace(
          '"schemaVersion":"1.0.0"',
          '"schemaVersion":"1.0.0","schemaVersion":"1.0.0"',
        ),
      ),
    ).toThrow(/Duplicate/);
    const receipt = structuredClone(
      sourceCaptureLineage(original).sourceReceipts[0],
    );
    receipt.digest = `sha256:${"0".repeat(64)}`;
    expect(validateSourceReceipt(receipt).valid).toBe(false);
  });
  it.each([
    "source",
    "revision",
    "adapter",
    "configuration",
    "inputs",
    "shard",
  ])(
    "rejects a rehashed %s receipt against complete captured records",
    (change) => {
      const capture = sourceFixture().sourceCapture;
      const lineage = structuredClone(sourceCaptureLineage(capture));
      const receipt = lineage.sourceReceipts[0];
      if (change === "source") receipt.source = "different";
      if (change === "revision") receipt.sourceRevision = "other-revision";
      if (change === "adapter") receipt.adapter.version = "other-version";
      if (change === "configuration")
        receipt.configDigest = `sha256:${"0".repeat(64)}`;
      if (change === "inputs")
        receipt.inputs[0].digest = `sha256:${"0".repeat(64)}`;
      if (change === "shard") receipt.shard.digest = `sha256:${"0".repeat(64)}`;
      receipt.digest = sourceReceiptDigest(receipt);
      receipt.id = `urn:metamap:source-receipt:${receipt.digest.slice(7)}`;
      expect(validateSourceReceipt(receipt).valid).toBe(true);
      expect(
        sourceLineageIssues(capture, lineage).some(
          (issue) => issue.code === "SOURCE_RECEIPT_BINDING_MISMATCH",
        ),
      ).toBe(true);
    },
  );
  it("rejects missing receipts and all altered snapshot bindings", () => {
    const capture = sourceFixture().sourceCapture;
    const lineage = structuredClone(sourceCaptureLineage(capture));
    lineage.sourceReceipts.pop();
    lineage.sourceSnapshot.counts.entities += 1;
    expect(
      sourceLineageIssues(capture, lineage).map((issue) => issue.code),
    ).toEqual(["SOURCE_SNAPSHOT_MISMATCH", "SOURCE_RECEIPT_BINDING_MISMATCH"]);
  });
  it("derives an explicit content revision when an adapter shard has no declared revision", () => {
    const inputs = sourceFixture();
    delete inputs.adapters[0].document.revision;
    const discovery = assembleWorkspace(
      inputs.config,
      inputs.adapters,
      [{ configuredPath: "pack.json", pack: inputs.pack }],
      inputs.registry,
    );
    const capture = createSourceCapture(
      inputs.config,
      discovery,
      inputs.registry,
    );
    expect(
      sourceCaptureLineage(capture).sourceReceipts[0].sourceRevision,
    ).toMatch(/^sha256:/);
  });
  it("shows source/candidate changes and raw rediscovery/authentication/authorization as separate states", () => {
    const inputs = sourceFixture();
    const inspection = inspectSourceCapture(inputs.sourceCapture, inputs.graph);
    expect(parseSourceInspectionJson(canonicalJson(inspection))).toEqual(
      inspection,
    );
    expect(inspection).toMatchObject({
      relationship: "candidate-differs",
      lineage: {
        status: "verified-record-bindings",
        recordedInputDigests: 2,
        rawInputs: "not-captured",
      },
      sourceRediscovery: { status: "unavailable" },
      authentication: "not-evaluated",
      authorizationNow: "not-evaluated",
      active: "not-evaluated",
    });
    expect(inspection.graphChanges.changes).toEqual([
      { change: "added", kind: "mapping", id: inputs.request.resultId },
    ]);
    expect(inspectSourceCapture(inputs.sourceCapture).relationship).toBe(
      "identical",
    );
    expect(
      validateSourceInspection({ ...inspection, authentication: "verified" })
        .valid,
    ).toBe(false);
    expect(
      validateSourceInspection({ ...inspection, relationship: "identical" })
        .valid,
    ).toBe(false);
  });
  it("reports metadata-only graph changes even when no semantic record changes exist", () => {
    const inputs = sourceFixture();
    const graph = structuredClone(inputs.sourceCapture.graph);
    graph.revision = "candidate";
    expect(inspectSourceCapture(inputs.sourceCapture, graph)).toMatchObject({
      relationship: "candidate-differs",
      graphChanges: { changes: [] },
    });
  });
  it("compares explicit new captures, including adapter, revision, configuration and shard changes", () => {
    const inputs = sourceFixture();
    inputs.adapters[0].adapterVersion = "2.0.0";
    inputs.adapters[0].document.revision = "network-r2";
    inputs.adapters[0].document.entities[0].label = "changed";
    inputs.config.sources[0] = {
      ...inputs.config.sources[0],
      path: "moved.json",
    };
    inputs.adapters[0].inputs[0].path = "moved.json";
    const discovery = assembleWorkspace(
      inputs.config,
      inputs.adapters,
      [{ configuredPath: "pack.json", pack: inputs.pack }],
      inputs.registry,
    );
    const after = createSourceCapture(
      inputs.config,
      discovery,
      inputs.registry,
    );
    expect(
      compareSourceCaptures(inputs.sourceCapture, after).map(
        (change) => change.component,
      ),
    ).toEqual(
      expect.arrayContaining([
        "configuration",
        "graph",
        "adapter",
        "revision",
        "shard",
      ]),
    );
  });
  it("does not execute accessors or serialize arbitrary producer objects", () => {
    const original = sourceFixture().sourceCapture;
    let called = false;
    const invalid = {
      ...original,
      get config() {
        called = true;
        return original.config;
      },
    };
    expect(validateSourceCapture(invalid).valid).toBe(false);
    expect(called).toBe(false);
    expect(
      validateSourceCapture({
        ...original,
        config: {
          ...original.config,
          toJSON() {
            called = true;
            return original.config;
          },
        },
      }).valid,
    ).toBe(false);
    expect(called).toBe(false);
  });
  it("refuses a factory with absent exact pack values rather than substituting current packs", () => {
    const inputs = sourceFixture();
    expect(() =>
      createSourceCapture(
        inputs.config,
        inputs.discovery,
        new RelationRegistry(),
      ),
    ).toThrow(/SOURCE_PACK_MISMATCH/);
  });
  it("records custom adapter outputs without installing or executing a module named by their configuration", () => {
    const inputs = sourceFixture();
    inputs.config.sources[0] = {
      id: "network",
      adapter: "captured-custom",
      module: "file:///never-loaded.mjs",
    };
    inputs.adapters[0].adapter = "captured-custom";
    const discovery = assembleWorkspace(
      inputs.config,
      inputs.adapters,
      [{ configuredPath: "pack.json", pack: inputs.pack }],
      inputs.registry,
    );
    const capture = createSourceCapture(
      inputs.config,
      discovery,
      inputs.registry,
    );
    expect(validateSourceCapture(capture).valid).toBe(true);
    expect(inspectSourceCapture(capture).sourceRediscovery.status).toBe(
      "unavailable",
    );
  });
  it("reproduces the committed source capture from the fixed local example files in CI", async () => {
    const repository = fileURLToPath(new URL("../../", import.meta.url));
    const path = fileURLToPath(
      new URL("../../examples/provenance/metamap.config.json", import.meta.url),
    );
    const captured = await captureWorkspaceSources(path, {
      permittedRoots: [repository],
    });
    const committed = parseSourceCaptureJson(
      await readFile(
        new URL(
          "../../examples/provenance/generated/source-capture.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(captured).toEqual(committed);
  });
  it("captures a legacy relation-pack workspace through the explicit portable reference profile", async () => {
    const repository = fileURLToPath(new URL("../../", import.meta.url));
    const captured = await captureWorkspaceSources(
      fileURLToPath(
        new URL("../../examples/research/metamap.config.json", import.meta.url),
      ),
      { permittedRoots: [repository] },
    );
    expect(
      captured.graph.relationPacks?.find(
        (pack) => pack.id === "urn:metamap:relation-pack:research",
      )?.uri,
    ).toBe("repo:relation-packs%2Fresearch.json");
    expect(validateSourceCapture(captured).valid).toBe(true);
  });
});
