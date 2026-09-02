import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadMetamapConfig } from "../config.js";
import {
  checkWorkspace,
  discoverWorkspace,
  workspaceHasErrors,
  writeWorkspaceOutputs,
} from "../workspace.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("workspace pipeline", () => {
  it("generates a baseline, reuses unchanged shards, and detects drift", async () => {
    const root = await mkdtemp(join(tmpdir(), "metamap-workspace-test-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, "schemas"));
    await mkdir(join(root, "meta"));
    await writeFile(
      join(root, "schema.prisma"),
      `model Item {
  id String @id
}
`,
    );
    const zodPath = join(root, "schemas", "item.ts");
    await writeFile(
      zodPath,
      `import { z } from "zod";
export const itemSchema = z.object({ id: z.string() });
`,
    );
    const configPath = join(root, "meta", "metamap.config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        schemaVersion: "1.0.0",
        id: "urn:test:metamap:workspace",
        namespace: "test",
        repository: "fixture",
        repositoryRoot: "..",
        sources: [
          { id: "db", adapter: "prisma", path: "schema.prisma" },
          {
            id: "schemas",
            adapter: "typescript-zod",
            roots: ["schemas"],
          },
        ],
        correspondences: [
          {
            id: "item-domain",
            source: {
              sourceId: "schemas",
              kind: "schema",
              name: "itemSchema",
            },
            target: { sourceId: "db", kind: "model", name: "Item" },
            fields: {
              pairs: [{ source: "id", target: "id" }],
              requireSourceCoverage: true,
              requireTargetCoverage: true,
            },
            authority: { side: "target", facts: ["type"] },
          },
        ],
        outputs: {
          graph: "generated/graph.json",
          snapshot: "generated/snapshot.json",
          report: "generated/report.md",
          documentation: "generated/graph.md",
          cache: ".cache/metamap",
        },
        policy: {
          baselineChanges: "error",
          unconfiguredStructures: "ignore",
        },
      }),
    );

    const loaded = await loadMetamapConfig(configPath);
    const generated = await discoverWorkspace(loaded, { useCache: true });
    expect(workspaceHasErrors(generated)).toBe(false);
    expect(generated.cacheHits).toEqual([]);
    await writeWorkspaceOutputs(loaded, generated);

    const clean = await checkWorkspace(loaded, { useCache: true });
    expect(clean.cacheHits.sort()).toEqual(["db", "schemas"]);
    expect(clean.diff.changes).toEqual([]);
    expect(workspaceHasErrors(clean)).toBe(false);

    const reportPath = join(root, "generated", "report.md");
    const reportWithoutCache = await readFile(reportPath, "utf8");
    await writeWorkspaceOutputs(loaded, clean);
    expect(await readFile(reportPath, "utf8")).toBe(reportWithoutCache);

    await writeFile(
      zodPath,
      `import { z } from "zod";
export const itemSchema = z.object({ id: z.number().int() });
`,
    );
    const drifted = await checkWorkspace(loaded, { useCache: true });
    expect(drifted.cacheHits).toEqual(["db"]);
    expect(drifted.diff.changes.length).toBeGreaterThan(0);
    expect(drifted.driftIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "FIELD_DRIFT" }),
        expect.objectContaining({ code: "BASELINE_DRIFT" }),
      ]),
    );
    expect(workspaceHasErrors(drifted)).toBe(true);
  });
});
