import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import ts from "typescript";
import { expect, it } from "vitest";
import { compilePathTree, emitTypeScriptPathTree } from "../path-tree.js";
import { compileProjection, emitTypeScriptProjection } from "../projection.js";
import { parseRelationPack } from "../relation-pack.js";
import { RelationRegistry } from "../relations.js";
import { parseSemanticPolicy } from "../semantic.js";
import { parseSemanticProjectionSpec } from "../semantic-projection.js";
import type { MetamapDocument } from "../model.js";
import { compileMetamap } from "../viability.js";

it("reproduces the typed example and type-checks/executes its generated native modules in CI", async () => {
  const read = async (name: string) =>
    JSON.parse(
      await readFile(
        new URL(
          `../../examples/uncertainty/generated/${name}.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
  const graph = (await read("graph")) as MetamapDocument;
  const policy = parseSemanticPolicy(await read("policy")),
    spec = parseSemanticProjectionSpec(await read("spec"));
  const registry = new RelationRegistry();
  registry.registerPack(
    parseRelationPack(
      JSON.parse(
        await readFile(
          new URL("../../examples/relations/pack.json", import.meta.url),
          "utf8",
        ),
      ),
    ),
  );
  const compilation = compileMetamap(graph, policy, {
    context: { environment: "example" },
    evaluatedAt: "2026-10-09T00:00:00.000Z",
    relationRegistry: registry,
  });
  if (compilation.status !== "viable")
    throw new Error(JSON.stringify(compilation));
  expect(compilation.generation).toEqual(await read("generation"));
  const projected = compileProjection(graph, compilation.generation, spec, {
    relationRegistry: registry,
    semanticPolicy: policy,
  });
  if (projected.status !== "projected")
    throw new Error(JSON.stringify(projected));
  expect(projected.projection).toEqual(await read("projection"));
  const tree = compilePathTree(projected.projection, spec);
  if (tree.status !== "projected") throw new Error(JSON.stringify(tree));
  expect(tree.pathTree).toEqual(await read("path-tree"));
  const directory = await mkdtemp(join(tmpdir(), "metamap-typed-native-test-"));
  try {
    const modules = {
      bindings: emitTypeScriptProjection(projected.projection, {
        exportName: "networkBindings",
      }),
      tree: emitTypeScriptPathTree(tree.pathTree, {
        exportName: "networkTree",
      }),
    };
    for (const [name, source] of Object.entries(modules)) {
      await writeFile(join(directory, `${name}.ts`), source);
      await writeFile(
        join(directory, `${name}.mjs`),
        ts.transpileModule(source, {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
          },
        }).outputText,
      );
    }
    await promisify(execFile)(
      process.execPath,
      [
        "node_modules/typescript/bin/tsc",
        "--noEmit",
        "--target",
        "ES2022",
        "--module",
        "NodeNext",
        "--moduleResolution",
        "NodeNext",
        join(directory, "bindings.ts"),
        join(directory, "tree.ts"),
      ],
      { timeout: 20000 },
    );
    // Execute native ESM in Node, independently of the test module transform.
    await promisify(execFile)(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
import assert from 'node:assert/strict';
const native = await import(${JSON.stringify(pathToFileURL(join(directory, "bindings.mjs")).href)});
assert.deepEqual(native.resolveNetworkBindings('urn:example:consumer').slots.dependencies.map(value => value.id).sort(), ['urn:example:schema', 'urn:example:service']);
assert.throws(() => native.resolveNetworkBindings('urn:example:missing'), /Unknown Metamap identity/);
const nested = await import(${JSON.stringify(pathToFileURL(join(directory, "tree.mjs")).href)});
assert.equal(nested.hydrateNetworkTree({networkId: '99'}).network[':networkId']._, '/network/99');
assert.equal(nested.networkTree.network[':networkId']._, '/network/:networkId');
`,
      ],
      { timeout: 20000 },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 45000);
