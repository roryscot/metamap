import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "metamap-package-"));
const run = (program, args, cwd = temporary) =>
  exec(program, args, { cwd, timeout: 180000, maxBuffer: 16 * 1024 * 1024 });

try {
  const { stdout } = await run(
    "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary],
    root,
  );
  const [packed] = JSON.parse(stdout);
  const files = new Set(packed.files.map((entry) => entry.path));
  for (const path of [
    "dist/index.js",
    "dist/index.d.ts",
    "LIFECYCLE.md",
    "examples/lifecycle/run.mjs",
    "examples/activation/promoter.mjs",
    "examples/scientific-mapping/consumer.mjs",
  ]) {
    assert.ok(files.has(path), `Missing packaged public file: ${path}`);
  }
  assert.ok(
    [...files].every((path) => !/^(?:evaluation|work|\.cache)\//.test(path)),
    "Package contains private working/evaluation files",
  );
  await writeFile(
    join(temporary, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: { "@roryscot/metamap": `file:./${packed.filename}` },
    }),
    { flag: "wx" },
  );
  await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"]);
  const installed = join(temporary, "node_modules/@roryscot/metamap");
  const manifest = JSON.parse(
    await readFile(join(installed, "package.json"), "utf8"),
  );
  const probe = `
    import assert from 'node:assert/strict';
    import { readFile } from 'node:fs/promises';
    const manifest = ${JSON.stringify(manifest)};
    let modules = 0, json = 0;
    for (const [key, target] of Object.entries(manifest.exports)) {
      const specifier = '@roryscot/metamap' + (key === '.' ? '' : key.slice(1));
      if (typeof target === 'string') {
        JSON.parse(await readFile(new URL(import.meta.resolve(specifier)), 'utf8'));
        json++;
      } else {
        const exported = await import(specifier);
        assert.ok(exported && typeof exported === 'object');
        await readFile(new URL(target.types, import.meta.resolve('@roryscot/metamap').replace(/dist\\/index\\.js$/, '')));
        modules++;
      }
    }
    console.log(JSON.stringify({ modules, json, allPublicExports: 'imported' }));
  `;
  await writeFile(join(temporary, "probe.mjs"), probe, { flag: "wx" });
  const exportsResult = await run(process.execPath, [
    join(temporary, "probe.mjs"),
  ]);
  const lifecycleResult = await run(process.execPath, [
    join(installed, "examples/lifecycle/run.mjs"),
  ]);
  const lifecycle = JSON.parse(
    lifecycleResult.stdout.trim().split("\n").at(-1),
  );
  assert.equal(lifecycle.lifecycle, "verified");
  assert.equal(lifecycle.nativeRuns, 3);
  assert.equal(lifecycle.productionActive, false);
  assert.equal(lifecycle.privateKeysRetained, false);
  console.log(
    JSON.stringify({
      package: `${packed.name}@${packed.version}`,
      fileCount: files.size,
      installedArchive: true,
      publicExports: JSON.parse(exportsResult.stdout.trim()),
      lifecycle,
    }),
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
