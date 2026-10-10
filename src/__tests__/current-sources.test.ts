import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  captureWorkspaceSources,
  inspectCurrentSources,
  inspectSourceCapture,
} from "../provenance.js";
import { captureReplayBundle, replayMetamap } from "../replay.js";
import { discoverWorkspace } from "../workspace.js";
import { loadMetamapConfig } from "../config.js";
import { writeSourceWorkspace } from "./helpers/source-fixture.js";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "metamap-source-current-"));
  roots.push(root);
  return writeSourceWorkspace(root);
}
describe("explicit read-only current source inspection", () => {
  it("captures and checks installed sources without creating caches or changing any input/output bytes", async () => {
    const inputs = await fixture();
    await mkdir(join(inputs.root, "generated"));
    await writeFile(
      join(inputs.root, "generated", "graph.json"),
      "preserved output",
    );
    await mkdir(join(inputs.root, ".cache"));
    await writeFile(join(inputs.root, ".cache", "sentinel"), "preserved cache");
    const before = await readdir(inputs.root);
    const capture = await captureWorkspaceSources(inputs.configPath, {
      permittedRoots: [inputs.root],
    });
    expect(capture).toEqual(inputs.sourceCapture);
    expect(
      await inspectCurrentSources(capture, inputs.configPath, {
        permittedRoots: [inputs.root],
      }),
    ).toMatchObject({ sourceRediscovery: { status: "current", changes: [] } });
    expect(await readdir(inputs.root)).toEqual(before);
    expect(await readdir(join(inputs.root, ".cache"))).toEqual(["sentinel"]);
    expect(
      await readFile(join(inputs.root, "generated", "graph.json"), "utf8"),
    ).toBe("preserved output");
    expect(await readFile(join(inputs.root, "network.json"), "utf8")).toBe(
      JSON.stringify(inputs.adapters[0].document),
    );
  });
  it("does not write a cache when disabled through the existing workspace API", async () => {
    const inputs = await fixture();
    await discoverWorkspace(await loadMetamapConfig(inputs.configPath), {
      useCache: false,
      writeCache: false,
    });
    expect(await readdir(inputs.root)).not.toContain(".cache");
  });
  it("detects changed raw bytes even when parsed graph values are identical", async () => {
    const inputs = await fixture();
    await writeFile(
      join(inputs.root, "network.json"),
      JSON.stringify(inputs.adapters[0].document, null, 2),
    );
    const inspection = await inspectCurrentSources(
      inputs.sourceCapture,
      inputs.configPath,
      { permittedRoots: [inputs.root] },
    );
    expect(inspection.sourceRediscovery.status).toBe("changed");
    if (inspection.sourceRediscovery.status !== "changed")
      throw new Error(JSON.stringify(inspection));
    expect(inspection.sourceRediscovery.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subject: "network", component: "inputs" }),
      ]),
    );
  });
  it("detects source fact/revision and emitted shard changes", async () => {
    const inputs = await fixture(),
      shard = structuredClone(inputs.adapters[0].document);
    shard.revision = "network-r2";
    shard.entities[0].label = "changed";
    await writeFile(join(inputs.root, "network.json"), JSON.stringify(shard));
    const inspection = await inspectCurrentSources(
      inputs.sourceCapture,
      inputs.configPath,
      { permittedRoots: [inputs.root] },
    );
    expect(inspection.sourceRediscovery.status).toBe("changed");
    if (inspection.sourceRediscovery.status !== "changed")
      throw new Error(JSON.stringify(inspection));
    expect(
      inspection.sourceRediscovery.changes.map((change) => change.component),
    ).toEqual(expect.arrayContaining(["graph", "revision", "inputs", "shard"]));
  });
  it("detects changed configuration and removed/added source identities", async () => {
    const inputs = await fixture();
    inputs.config.sources[0] = {
      ...inputs.config.sources[0],
      id: "renamed-network",
    };
    await writeFile(inputs.configPath, JSON.stringify(inputs.config));
    const result = await inspectCurrentSources(
      inputs.sourceCapture,
      inputs.configPath,
      { permittedRoots: [inputs.root] },
    );
    if (result.sourceRediscovery.status !== "changed")
      throw new Error(JSON.stringify(result));
    expect(result.sourceRediscovery.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ component: "configuration" }),
        expect.objectContaining({
          subject: "network",
          component: "source",
          afterDigest: null,
        }),
        expect.objectContaining({
          subject: "renamed-network",
          component: "source",
          beforeDigest: null,
        }),
      ]),
    );
  });
  it("detects an adapter-version difference against separately rediscovered installed outputs", async () => {
    const inputs = await fixture();
    const capture = structuredClone(inputs.sourceCapture);
    capture.adapters[0].adapterVersion = "recorded-older-version";
    // Build a consistent older record, then compare it with the current installed adapter.
    const { assembleWorkspace } = await import("../workspace.js"),
      { RelationRegistry } = await import("../relations.js"),
      { createSourceCapture } = await import("../provenance.js");
    const registry = new RelationRegistry(capture.relationPacks);
    const previous = createSourceCapture(
      capture.config,
      assembleWorkspace(
        capture.config,
        capture.adapters,
        [{ configuredPath: "pack.json", pack: inputs.pack }],
        registry,
      ),
      registry,
    );
    const result = await inspectCurrentSources(previous, inputs.configPath, {
      permittedRoots: [inputs.root],
    });
    if (result.sourceRediscovery.status !== "changed")
      throw new Error(JSON.stringify(result));
    expect(result.sourceRediscovery.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subject: "network", component: "adapter" }),
      ]),
    );
  });
  it("detects changed relation-pack values without replacing the capture with current packs", async () => {
    const inputs = await fixture();
    inputs.pack.description = "changed pack";
    await writeFile(
      join(inputs.root, "pack.json"),
      JSON.stringify(inputs.pack),
    );
    const result = await inspectCurrentSources(
      inputs.sourceCapture,
      inputs.configPath,
      { permittedRoots: [inputs.root] },
    );
    if (result.sourceRediscovery.status !== "changed")
      throw new Error(JSON.stringify(result));
    expect(result.sourceRediscovery.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ component: "relation-packs" }),
      ]),
    );
    expect(
      inputs.sourceCapture.relationPacks.find(
        (pack) => pack.id === inputs.pack.id,
      )?.description,
    ).not.toBe("changed pack");
  });
  it("requires explicit roots before any current-source reads", async () => {
    const inputs = await fixture();
    await expect(
      captureWorkspaceSources(inputs.configPath, { permittedRoots: [] }),
    ).rejects.toThrow(/SOURCE_ROOT_REQUIRED/);
    expect(
      await inspectCurrentSources(inputs.sourceCapture, inputs.configPath, {
        permittedRoots: [],
      }),
    ).toMatchObject({
      sourceRediscovery: {
        status: "unavailable",
        reason: expect.stringContaining("SOURCE_ROOT_REQUIRED"),
      },
    });
  });
  it("denies config/root/input traversal and symlink escapes before reading external source content", async () => {
    const inputs = await fixture(),
      outside = await mkdtemp(join(tmpdir(), "metamap-source-outside-"));
    roots.push(outside);
    await writeFile(
      join(outside, "secret.json"),
      "not a graph; must never be parsed",
    );
    expect(
      await inspectCurrentSources(inputs.sourceCapture, inputs.configPath, {
        permittedRoots: [outside],
      }),
    ).toMatchObject({
      sourceRediscovery: {
        status: "unavailable",
        reason: expect.stringContaining("SOURCE_LOCATOR_DENIED"),
      },
    });
    inputs.config.sources[0] = {
      ...inputs.config.sources[0],
      path: join(outside, "secret.json"),
    };
    await writeFile(inputs.configPath, JSON.stringify(inputs.config));
    await expect(
      captureWorkspaceSources(inputs.configPath, {
        permittedRoots: [inputs.root],
      }),
    ).rejects.toThrow(/SOURCE_LOCATOR_DENIED/);
    await symlink(outside, join(inputs.root, "escape"));
    inputs.config.sources[0] = {
      ...inputs.config.sources[0],
      path: "escape/secret.json",
    };
    await writeFile(inputs.configPath, JSON.stringify(inputs.config));
    await expect(
      captureWorkspaceSources(inputs.configPath, {
        permittedRoots: [inputs.root],
      }),
    ).rejects.toThrow(/SOURCE_LOCATOR_DENIED/);
    inputs.config.repositoryRoot = outside;
    await writeFile(inputs.configPath, JSON.stringify(inputs.config));
    await expect(
      captureWorkspaceSources(inputs.configPath, {
        permittedRoots: [inputs.root],
      }),
    ).rejects.toThrow(/SOURCE_LOCATOR_DENIED/);
  });
  it("denies a nested symlink in a selected source directory", async () => {
    const inputs = await fixture(),
      outside = await mkdtemp(join(tmpdir(), "metamap-source-dir-outside-"));
    roots.push(outside);
    await mkdir(join(inputs.root, "schemas"));
    await symlink(outside, join(inputs.root, "schemas", "escape"));
    inputs.config.sources = [
      { id: "schemas", adapter: "typescript-zod", roots: ["schemas"] },
    ];
    await writeFile(inputs.configPath, JSON.stringify(inputs.config));
    await expect(
      captureWorkspaceSources(inputs.configPath, {
        permittedRoots: [inputs.root],
      }),
    ).rejects.toThrow(/SOURCE_LOCATOR_DENIED/);
  });
  it("reports missing raw bytes and uninstalled adapters as unavailable, while graph replay remains valid", async () => {
    const inputs = await fixture();
    const bundle = captureReplayBundle(inputs.graph, inputs.policy, {
      ...inputs.options,
      sourceCapture: inputs.sourceCapture,
      projections: [inputs.spec],
    });
    await rm(join(inputs.root, "network.json"));
    expect(
      inspectSourceCapture(inputs.sourceCapture).sourceRediscovery.status,
    ).toBe("unavailable");
    expect(replayMetamap(bundle)).toMatchObject({
      status: "verified",
      admitted: true,
    });
    expect(
      (
        await inspectCurrentSources(inputs.sourceCapture, inputs.configPath, {
          permittedRoots: [inputs.root],
        })
      ).sourceRediscovery.status,
    ).toBe("unavailable");
    inputs.config.sources[0] = {
      id: "network",
      adapter: "file:///untrusted.mjs",
    };
    await writeFile(inputs.configPath, JSON.stringify(inputs.config));
    expect(
      await inspectCurrentSources(inputs.sourceCapture, inputs.configPath, {
        permittedRoots: [inputs.root],
      }),
    ).toMatchObject({
      sourceRediscovery: {
        status: "unavailable",
        reason: expect.stringContaining("SOURCE_ADAPTER_UNAVAILABLE"),
      },
    });
  });
  it("rejects lossy UTF-8 decoding instead of calling its text hash an exact raw-byte receipt", async () => {
    const inputs = await fixture();
    const bytes = Buffer.from(JSON.stringify(inputs.adapters[0].document));
    const index =
      bytes.indexOf(Buffer.from('"label":"consumer"')) + '"label":"'.length;
    expect(index).toBeGreaterThan(0);
    bytes[index] = 0xff;
    await writeFile(join(inputs.root, "network.json"), bytes);
    await expect(
      captureWorkspaceSources(inputs.configPath, {
        permittedRoots: [inputs.root],
      }),
    ).rejects.toThrow(/SOURCE_INPUT_CHANGED/);
  });
});
