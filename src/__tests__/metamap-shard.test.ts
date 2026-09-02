import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { MetamapShardAdapter } from "../adapters/metamap-shard.js";
import { parseMetamapConfig } from "../config.js";
import { parseRelationPack } from "../relation-pack.js";
import { RelationRegistry } from "../relations.js";
import { validateMetamapDocument } from "../validator.js";
import { discoverWorkspace, workspaceHasErrors } from "../workspace.js";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("portable Metamap shard adapter", () => {
  it("imports a shard emitted outside the core adapter runtime", async () => {
    const adapter = new MetamapShardAdapter();
    const result = await adapter.discover(
      {
        id: "research",
        adapter: "metamap-shard",
        path: "examples/research/claim-shard.json",
      },
      {
        namespace: "example-research",
        repository: "metamap",
        repositoryRoot,
      },
    );
    const researchPack = parseRelationPack(
      JSON.parse(
        await readFile(
          new URL("../../relation-packs/research.json", import.meta.url),
          "utf8",
        ),
      ) as unknown,
    );
    const registry = new RelationRegistry();
    registry.registerPack(researchPack);
    const validation = validateMetamapDocument(result.document, registry);

    expect(validation.issues).toEqual([]);
    expect(result.document.mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relation: "research:competes_with" }),
      ]),
    );
  });

  it("loads configured relation semantics into workspace validation", async () => {
    const outputRoot = await mkdtemp(
      join(tmpdir(), "metamap-shard-workspace-"),
    );
    temporaryDirectories.push(outputRoot);
    const config = parseMetamapConfig({
      schemaVersion: "1.0.0",
      id: "urn:test:research-workspace",
      namespace: "test-research",
      repository: "metamap",
      repositoryRoot: repositoryRoot,
      relationPacks: ["relation-packs/research.json"],
      sources: [
        {
          id: "research",
          adapter: "metamap-shard",
          path: "examples/research/claim-shard.json",
        },
      ],
      correspondences: [],
      outputs: {
        graph: join(outputRoot, "graph.json"),
        snapshot: join(outputRoot, "snapshot.json"),
        report: join(outputRoot, "report.md"),
        documentation: join(outputRoot, "graph.md"),
        cache: join(outputRoot, "cache"),
      },
    });
    const discovery = await discoverWorkspace(
      {
        config,
        configPath: join(outputRoot, "metamap.config.json"),
        configDirectory: outputRoot,
        repositoryRoot,
      },
      { useCache: false },
    );

    expect(workspaceHasErrors(discovery)).toBe(false);
    expect(discovery.graph.relationPacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "urn:metamap:relation-pack:research",
          version: "1.0.0",
          uri: "relation-packs/research.json",
        }),
      ]),
    );
  });
});
