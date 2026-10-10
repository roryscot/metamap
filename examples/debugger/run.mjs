import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  renderMetamapExplanationHtml,
} from "../../dist/index.js";
import { renderMetamapExplanationHtml as subpathRender } from "@roryscot/metamap/debugger";
import { debuggerScenarios } from "./scenarios.mjs";

assert.equal(subpathRender, renderMetamapExplanationHtml);
const { reports, original } = await debuggerScenarios();
assert.equal(reports.known.admission, "viable");
assert.equal(reports.failed.admission, "rejected");
assert.equal(reports.unknown.selection.state, "missing");
assert.equal(reports.ambiguous.selection.state, "ambiguous");
const before = canonicalJson(reports);
const temporary = await mkdtemp(join(tmpdir(), "metamap-debugger-example-"));
const destination = process.argv[2] ? resolve(process.argv[2]) : temporary;
if (destination !== temporary) await mkdir(destination);
const cli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
let commandChecks = 0;
const command = (args, expected) => {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, expected, result.stderr + result.stdout);
  commandChecks++;
  return result;
};
try {
  for (const [name, report] of Object.entries(reports)) {
    const html = renderMetamapExplanationHtml(report);
    assert(html.startsWith("<!doctype html>"));
    assert(!html.includes("<script") && !html.includes("<img"));
    await writeFile(join(destination, name + ".html"), html, {
      encoding: "utf8",
      flag: "wx",
    });
    await writeFile(
      join(destination, name + ".json"),
      canonicalJson(report) + "\n",
      { encoding: "utf8", flag: "wx" },
    );
  }
  const input = join(temporary, "request.json"),
    output = join(temporary, "new-view.html");
  await writeFile(input, canonicalJson(reports.failed));
  assert.equal(
    command(["inspect", input], 0).stdout,
    renderMetamapExplanationHtml(reports.failed),
  );
  command(["inspect", input, output], 0);
  const written = await readFile(output);
  assert.equal(
    written.toString("utf8"),
    renderMetamapExplanationHtml(reports.failed),
  );
  const wrapped = join(temporary, "explained-result.json");
  await writeFile(
    wrapped,
    canonicalJson({ status: "explained", report: reports.failed }),
  );
  assert.equal(
    command(["inspect", wrapped], 0).stdout,
    renderMetamapExplanationHtml(reports.failed),
  );
  await writeFile(
    wrapped,
    canonicalJson({
      status: "explained",
      report: reports.failed,
      approve: true,
    }),
  );
  command(["inspect", wrapped, output], 1);
  assert.deepEqual(await readFile(output), written);
  command(["inspect", input, output], 1);
  assert.deepEqual(await readFile(output), written);
  command(["inspect"], 2);
  command(["inspect", input, "--apply"], 1);
  command(["inspect", input, "--approve"], 1);
  const invalid = join(temporary, "invalid.json"),
    absent = join(temporary, "absent.html");
  await writeFile(invalid, '{"id":"first","id":"second"}');
  command(["inspect", invalid, absent], 1);
  await assert.rejects(readFile(absent), { code: "ENOENT" });
  await writeFile(invalid, Buffer.from([0xc3, 0x28]));
  command(["inspect", invalid, output], 1);
  assert.deepEqual(await readFile(output), written);
  const tampered = structuredClone(reports.known);
  tampered.approval.active = "active";
  await writeFile(invalid, JSON.stringify(tampered));
  command(["inspect", invalid, absent], 1);
  await assert.rejects(readFile(absent), { code: "ENOENT" });
  assert.equal(canonicalJson(reports), before);
  for (const [url, bytes] of original)
    assert.deepEqual(await readFile(new URL(url)), bytes);
  console.log(
    JSON.stringify({
      debugger: "verified",
      native: "verified",
      scenarios: Object.keys(reports),
      commandChecks,
      browser: "not-run-by-this-example",
      applied: false,
      authority: "not-evaluated",
      destination:
        destination === temporary ? "temporary-cleaned" : destination,
    }),
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
