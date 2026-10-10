import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

describe("distribution-backed local debugger and command", () => {
  it("renders verified public scenarios and preserves source/input/existing output files", async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(
          new URL("../../examples/debugger/run.mjs", import.meta.url),
        ),
      ],
      { timeout: 90000, maxBuffer: 16 * 1024 * 1024 },
    );
    const result = JSON.parse(stdout.trim().split("\n").at(-1)!);
    expect(result).toMatchObject({
      debugger: "verified",
      native: "verified",
      commandChecks: 11,
      applied: false,
      authority: "not-evaluated",
      browser: "not-run-by-this-example",
    });
    expect(result.scenarios).toHaveLength(12);
  }, 120000);
});
