import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("verifies the public approval API and executes the exact reviewed native consumer bytes", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const result = spawnSync(process.execPath, ["examples/governance/run.mjs"], {
    cwd: root,
    encoding: "utf8",
    timeout: 25000,
  });
  expect(result.status, result.stderr + result.stdout).toBe(0);
  const output = JSON.parse(result.stdout);
  expect(output.approval).toBe("verified");
  expect(output.activation).toBe("not-attempted");
  expect(output.fileCount).toBe(9);
  expect(output.checks).toEqual([
    "exact-owner-approval",
    "agent-self-approval-rejected",
    "output-swap-rejected",
    "generated-typescript",
    "native-bindings",
    "native-path-hydration",
    "public-subpath",
  ]);
}, 45000);
