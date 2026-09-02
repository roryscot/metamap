import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { promoteMetamapGeneration } from "../activation.js";
import type { MetamapDocument } from "../model.js";
import type { MetamapViabilityPolicy } from "../viability-model.js";

function fixture<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
}

describe("persistent generation activation", () => {
  it("atomically retains the previous generation when a candidate is rejected", async () => {
    const directory = await mkdtemp(join(tmpdir(), "metamap-activation-"));
    const path = join(directory, "current.json");
    try {
      const document = fixture<MetamapDocument>(
        "../../examples/example-authority-graph.json",
      );
      const policy = fixture<MetamapViabilityPolicy>(
        "../../examples/example-viability-policy.json",
      );
      const options = {
        context: { environment: "production", maintenance: false },
        evaluatedAt: "2026-09-02T00:00:00.000Z",
      } as const;
      const accepted = await promoteMetamapGeneration(
        document,
        policy,
        path,
        options,
      );
      expect(accepted.activated).toBe(true);
      const before = await readFile(path, "utf8");

      document.mappings[0].lossiness = "unknown";
      const rejected = await promoteMetamapGeneration(
        document,
        policy,
        path,
        options,
      );
      expect(rejected.activated).toBe(false);
      expect(rejected.previousDigest).toBe(accepted.current?.digest);
      expect(await readFile(path, "utf8")).toBe(before);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
