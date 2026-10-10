import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

describe("distribution-backed explanation and command", () => {
  it("uses one verified report for public API and strict command, preserving sources", async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(
          new URL("../../examples/explanation/run.mjs", import.meta.url),
        ),
      ],
      { timeout: 90000, maxBuffer: 16 * 1024 * 1024 },
    );
    expect(JSON.parse(stdout.trim().split("\n").at(-1)!)).toMatchObject({
      explanation: "verified",
      native: "verified",
      commandChecks: 10,
      uniqueCause: "not-established",
      currentAuthority: "not-evaluated",
      applied: false,
    });
  }, 120000);
});
