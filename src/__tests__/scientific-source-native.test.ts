import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

describe("installed scientific source API and command", () => {
  it("imports the pinned subset, preserves its export and executes read-only source/replay commands", async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(
          new URL(
            "../../examples/scientific-mapping/source.mjs",
            import.meta.url,
          ),
        ),
      ],
      { timeout: 60000, maxBuffer: 16 * 1024 * 1024 },
    );
    expect(JSON.parse(stdout.trim().split("\n").at(-1)!)).toMatchObject({
      sourceImport: "verified",
      native: "verified",
      commands: 5,
      records: 7,
      originalRecords: 1564,
      predicates: 5,
      assertionIds: 7,
      rawAdmission: "rejected-unknown-lossiness",
      scientificTruth: "not-established",
      applied: false,
    });
  }, 90000);
  it("executes and typechecks a distinct five-relation consumer with proof, budgets and a checked provenance crate", async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(
          new URL(
            "../../examples/scientific-mapping/consumer.mjs",
            import.meta.url,
          ),
        ),
      ],
      { timeout: 90000, maxBuffer: 32 * 1024 * 1024 },
    );
    expect(JSON.parse(stdout.trim().split("\n").at(-1)!)).toMatchObject({
      consumerLookup: "executed-and-typechecked",
      sourceAssertions: 7,
      relations: 5,
      distinctDuplicateAssertions: 2,
      checkedDerivations: 1,
      ordinalCost: 18,
      budget17: "rejected",
      supportedEvidence: "rejected",
      staleProof: "rejected",
      crate: "verified",
      missingRawPayload: "reference-only",
      crateTamperCases: 5,
      sourceBytesPreserved: true,
      scientificTruth: "not-established",
      active: false,
    });
  }, 120000);
});
