import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadMetamapConfig } from "../config.js";
import { discoverWorkspace } from "../workspace.js";
import { createSourceCapture } from "../provenance.js";
import { captureReplayBundle } from "../replay.js";
import { RelationRegistry } from "../relations.js";
import { valueDigest } from "../stable.js";
import {
  createScientificCrate,
  verifyScientificCrate,
} from "../scientific-crate.js";
import type {
  ScientificCrate,
  ScientificCrateOptions,
} from "../scientific-crate.js";
import type { SourceReplayBundle } from "../semantic-replay-model.js";
import type { MetamapSemanticPolicy } from "../semantic-model.js";
import { writeSssomWorkspace } from "./helpers/sssom-fixture.js";

beforeEach(() => setImmediate());
describe.each([false, true])(
  "scientific crate with external metadata %s",
  (external) => {
    let root: string,
      replay: SourceReplayBundle,
      options: ScientificCrateOptions,
      crate: ScientificCrate;
    beforeAll(async () => {
      const f = await writeSssomWorkspace(external);
      root = f.root;
      const registry = new RelationRegistry();
      const discovery = await discoverWorkspace(
        await loadMetamapConfig(f.configPath),
        {
          relationRegistry: registry,
          useCache: false,
          writeCache: false,
          portablePackUris: true,
        },
      );
      const capture = createSourceCapture(f.config, discovery, registry);
      const graph = structuredClone(discovery.graph);
      for (const mapping of graph.mappings) mapping.lossiness = "lossy";
      const policy: MetamapSemanticPolicy = {
        schemaVersion: "2.0.0",
        id: "urn:test:scientific-crate-policy",
        graph: { id: graph.id, digest: valueDigest(graph) },
        mappings: [
          {
            select: { ids: graph.mappings.map((m) => m.id) },
            coverage: "partial",
            determinism: "deterministic",
            reversibility: "irreversible",
          },
        ],
        constraints: [],
        evidence: [],
        assessments: [],
        derivations: [],
        uncertaintyRequirements: [],
        riskBudgets: [],
        derivationLimits: { maxDepth: 8, maxDerivations: 32 },
      };
      const consumer = "urn:test:scientific-crate-consumer";
      replay = captureReplayBundle(graph, policy, {
        evaluatedAt: "2026-10-10T00:00:00.000Z",
        relationRegistry: registry,
        sourceCapture: capture,
        projections: [
          {
            schemaVersion: "2.0.0",
            id: "urn:test:scientific-crate-projection",
            consumer,
            budget: null,
            select: { kinds: ["scientific:entity"] },
            slots: [
              {
                name: "exact",
                relation: "scientific:exact-match",
                direction: "outgoing",
                cardinality: "many",
                allowLossy: true,
              },
            ],
          },
        ],
      });
      options = {
        name: "Synthetic scientific source",
        description: "Bounded licensed two-record fixture",
        datePublished: "2026-10-10",
        consumer,
        environment: "test",
        rawInputs: {},
      };
      for (const input of replay.inputs.sourceReceipts[0].inputs)
        options.rawInputs[input.path] = await readFile(
          join(root, input.path),
          "utf8",
        );
      crate = createScientificCrate(replay, options);
    });
    afterAll(async () => {
      if (root) await rm(root, { recursive: true, force: true });
    });
    it("checks included exact raw bytes against receipts and captured interpretation and recomputes native output", () => {
      expect(verifyScientificCrate(crate)).toMatchObject({
        status: "verified",
        externalRawInputs: 0,
      });
      const metadata = crate.metadata["@graph"] as Array<
        Record<string, unknown>
      >;
      expect(metadata.find((entity) => entity["@id"] === "./")).toMatchObject({
        "@type": "Dataset",
        datePublished: options.datePublished,
      });
      expect(Object.keys(crate.files)).toContain("bindings-0.ts");
    });
    it("keeps missing raw input as a reference without claiming an embedded payload", () => {
      const reference = createScientificCrate(replay, {
        ...options,
        rawInputs: {},
      });
      expect(verifyScientificCrate(reference).externalRawInputs).toBe(
        external ? 2 : 1,
      );
      expect(
        Object.keys(reference.files).some((path) => path.startsWith("source/")),
      ).toBe(false);
    });
    it.each(["metadata", "bytes", "inventory", "replay"])(
      "rejects %s tampering",
      (kind) => {
        const value = structuredClone(crate);
        if (kind === "metadata")
          value.metadata["@context"] =
            "https://example.org/substituted-context";
        if (kind === "bytes") value.files["bindings-0.ts"] += "\n";
        if (kind === "inventory") delete value.files["graph.json"];
        if (kind === "replay") value.files["replay.json"] = "{}";
        expect(() => verifyScientificCrate(value)).toThrow();
      },
    );
    it("rejects wrong raw bytes and extra payload files before presenting verified provenance", () => {
      expect(() =>
        createScientificCrate(replay, {
          ...options,
          rawInputs: { ...options.rawInputs, "mapping.data": "forged" },
        }),
      ).toThrow(/receipt/);
      expect(() =>
        createScientificCrate(replay, {
          ...options,
          rawInputs: { "../escape": "value" },
        }),
      ).toThrow(/payload path/);
      expect(() =>
        createScientificCrate(replay, {
          ...options,
          datePublished: "2026-02-30",
        }),
      ).toThrow();
      expect(() =>
        createScientificCrate(replay, {
          ...options,
          externalOriginal: {
            uri: "https://w3id.org/ro/crate/1.2",
            name: "conflicting source",
            description: "Duplicates a specification entity",
          },
        }),
      ).toThrow(/Conflicting JSON-LD/);
    });
  },
);
