import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

describe("distribution-backed repair and native consumer", () => {
  it("executes supplied repaired providers, native paths and the strict read-only command", async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(
          new URL("../../examples/repair/run.mjs", import.meta.url),
        ),
      ],
      { timeout: 60000, maxBuffer: 16 * 1024 * 1024 },
    );
    expect(JSON.parse(stdout.trim().split("\n").at(-1)!)).toMatchObject({
      repair: "verified",
      applied: false,
      authorization: "approval-required",
      native: "verified",
      commandChecks: 10,
    });
  }, 90000);
});
