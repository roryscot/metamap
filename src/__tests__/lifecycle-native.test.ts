import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("runs the public governed lifecycle and native bindings while preserving active state on negative cases", async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      fileURLToPath(
        new URL("../../examples/lifecycle/run.mjs", import.meta.url),
      ),
    ],
    { timeout: 90000, maxBuffer: 16 * 1024 * 1024 },
  );
  expect(JSON.parse(stdout.trim().split("\n").at(-1)!)).toMatchObject({
    lifecycle: "verified",
    sourceShards: 2,
    checkedDerivations: 1,
    ordinalCost: 5,
    nativeRuns: 3,
    physicalMove: "stable-identities-new-bindings",
    staleApproval: "rejected",
    tamperedOutput: "rejected",
    authorityExpansion: "viable-owner-approval-required",
    missingBinding: "rejected-preserved-active",
    ambiguousBinding: "rejected-preserved-active",
    lowerBudget: "rejected-preserved-active",
    undeclaredInference: "unsupported-no-binding",
    strictEvidence: "rejected-preserved-active",
    rollback: "fresh-owner-approval-verified",
    activationProfile: "synthetic-in-memory",
    productionActive: false,
    privateKeysRetained: false,
  });
}, 120000);
