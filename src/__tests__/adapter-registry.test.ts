import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AdapterRegistry,
  createDefaultAdapterRegistry,
} from "../adapters/registry.js";
import type {
  AdapterContext,
  AdapterResult,
  MetamapAdapter,
} from "../adapters/types.js";
import { parseMetamapConfig, type MetamapSourceConfig } from "../config.js";
import { METAMAP_SCHEMA_VERSION } from "../model.js";
import { discoverWorkspace, workspaceHasErrors } from "../workspace.js";

interface FixtureSourceConfig extends MetamapSourceConfig {
  adapter: "fixture";
  marker: string;
}

class FixtureAdapter implements MetamapAdapter<FixtureSourceConfig> {
  readonly id = "fixture" as const;
  readonly version = "1.0.0";

  async fingerprint(): Promise<AdapterResult["inputs"]> {
    return [];
  }

  async discover(
    config: FixtureSourceConfig,
    context: AdapterContext,
  ): Promise<AdapterResult> {
    const provenance = { status: "observed" as const, assertedBy: this.id };
    return {
      sourceId: config.id,
      adapter: this.id,
      adapterVersion: this.version,
      inputs: [],
      diagnostics: [],
      document: {
        schemaVersion: METAMAP_SCHEMA_VERSION,
        id: `urn:test:fixture-shard:${config.id}`,
        namespace: context.namespace,
        entities: ["candidate", "benchmark"].map((name) => ({
          id: `urn:test:${name}`,
          kind: "research-claim",
          label: `${config.marker}:${name}`,
          attributes: {
            sourceId: config.id,
            structureKind: "research-claim",
            name,
          },
          provenance,
        })),
        mappings: [],
        authorities: [],
      },
    };
  }
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("adapter registry", () => {
  it("ships a portable graph-shard adapter with the built-ins", () => {
    expect(createDefaultAdapterRegistry().ids()).toEqual([
      "json-collections",
      "legacy-sources",
      "metamap-shard",
      "prisma",
      "typescript-zod",
    ]);
  });

  it("discovers an open custom source and correspondence kind", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "metamap-registry-"));
    temporaryDirectories.push(repositoryRoot);
    const config = parseMetamapConfig({
      schemaVersion: "1.0.0",
      id: "urn:test:custom-adapter",
      namespace: "test",
      repository: "fixture",
      repositoryRoot: ".",
      sources: [{ id: "claims", adapter: "fixture", marker: "custom-value" }],
      correspondences: [
        {
          id: "candidate-benchmark",
          source: {
            sourceId: "claims",
            kind: "research-claim",
            name: "candidate",
          },
          target: {
            sourceId: "claims",
            kind: "research-claim",
            name: "benchmark",
          },
        },
      ],
      outputs: {
        graph: "generated/graph.json",
        snapshot: "generated/snapshot.json",
        report: "generated/report.md",
        documentation: "generated/graph.md",
        cache: ".cache/metamap",
      },
    });
    const registry = new AdapterRegistry().register(new FixtureAdapter());
    const discovery = await discoverWorkspace(
      {
        config,
        configPath: join(repositoryRoot, "metamap.config.json"),
        configDirectory: repositoryRoot,
        repositoryRoot,
      },
      { adapterRegistry: registry, useCache: false },
    );

    expect(workspaceHasErrors(discovery)).toBe(false);
    expect(discovery.graph.entities.map((entry) => entry.kind)).toContain(
      "research-claim",
    );
    expect(discovery.graph.mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relation: "core:derives_from" }),
      ]),
    );
  });

  it("fails loudly when an adapter was not registered", () => {
    expect(() => new AdapterRegistry().require("missing")).toThrow(
      /Adapter missing is not registered/,
    );
  });
});
