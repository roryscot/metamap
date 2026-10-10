import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MetamapActivator } from "../viability.js";
import { RelationRegistry } from "../relations.js";
import { ConstraintRegistry } from "../constraints.js";
import type { MetamapDocument } from "../model.js";
import type { MetamapViabilityPolicy } from "../viability-model.js";
import type {
  GovernedActivationRequest,
  GovernedActivationResult,
} from "../activation-model.js";
import {
  evaluateGovernedActivation,
  governedActivationBaseline,
  parseGovernedActivationManifest,
  parseGovernedActivationRequestJson,
  parseGovernedActivePointer,
} from "../governance.js";
import {
  governanceFixture,
  governanceNow,
  rehashGovernance,
} from "./helpers/governance-fixture.js";

function setup() {
  const f = governanceFixture();
  let now = governanceNow;
  const host = {
    mode: "governed" as const,
    configuration: () => f.trust,
    clock: () => now,
  };
  const activator = new MetamapActivator(
    new RelationRegistry(),
    new ConstraintRegistry(),
    host,
  );
  const prepared = f.propose(f.bundle());
  const request: GovernedActivationRequest = {
    schemaVersion: "1.0.0",
    ...prepared,
    approval: f.approve(prepared.proposal),
  };
  return {
    f,
    host,
    activator,
    request,
    time: (value: string) => {
      now = value;
    },
  };
}
function rejected(result: GovernedActivationResult, code: string) {
  expect(result).toMatchObject({
    status: "rejected",
    activated: false,
    issues: [{ code }],
  });
}
describe("governed activation through the existing in-memory interface", () => {
  it("atomically exposes one immutable, exact signed consumer state", () => {
    const { activator, request, f } = setup();
    const result = activator.activate(request);
    expect(result.status).toBe("activated");
    expect(activator.governedCurrent).toEqual(result.current);
    expect(activator.current).toBeUndefined();
    const current = activator.governedCurrent!;
    expect(current.files).toEqual(request.files);
    expect(current.manifest.acceptedTrust).toEqual(f.trust);
    expect(current.manifest.previousManifest).toBeNull();
    expect(current.manifest.activatedAt).toBe(governanceNow);
    expect(Object.isFrozen(current.files)).toBe(true);
    expect(Object.isFrozen(current.manifest.proposal.candidate)).toBe(true);
    expect(() => {
      current.files["graph.json"] = "changed";
    }).toThrow();
    expect(parseGovernedActivationManifest(current.manifest)).toEqual(
      current.manifest,
    );
    expect(governedActivationBaseline(current)?.manifestDigest).toBe(
      current.manifest.digest,
    );
  });
  it("requires the host to opt in; a request cannot select its trust root", () => {
    const { request } = setup();
    rejected(
      new MetamapActivator().activate(request),
      "GOVERNANCE_HOST_REQUIRED",
    );
  });
  it("makes only an identical still-authorized retry idempotent", () => {
    const { activator, request, time } = setup();
    expect(activator.activate(request).status).toBe("activated");
    const before = activator.governedCurrent;
    time("2026-10-10T01:30:00.000Z");
    expect(activator.activate(structuredClone(request))).toMatchObject({
      status: "already-active",
      activated: false,
      current: before,
    });
    expect(activator.governedCurrent).toBe(before);
    time("2026-10-10T02:00:00.000Z");
    rejected(activator.activate(request), "GOVERNANCE_APPROVAL_NOT_CURRENT");
    expect(activator.governedCurrent).toBe(before);
  });
  it.each(["files", "proposal", "signature", "extra", "ownTrust", "ownTime"])(
    "rejects altered %s without changing current state",
    (change) => {
      const { activator, request } = setup();
      expect(activator.activate(request).status).toBe("activated");
      const before = activator.governedCurrent;
      const bad = structuredClone(request) as GovernedActivationRequest &
        Record<string, unknown>;
      if (change === "files")
        bad.files["bindings-0.ts"] += "\n// swapped after approval\n";
      if (change === "proposal")
        bad.proposal.candidate.inputs.graph.label = "changed";
      if (change === "signature")
        bad.approval.signature = Buffer.alloc(64).toString("base64");
      if (change === "extra") bad.files["extra.ts"] = "export default 1;";
      if (change === "ownTrust") bad.trustedConfiguration = {};
      if (change === "ownTime") bad.now = governanceNow;
      expect(activator.activate(bad).status).toBe("rejected");
      expect(activator.governedCurrent).toBe(before);
    },
  );
  it("reads fresh trust and refuses revoked approval without retiring active state", () => {
    const { activator, request, f } = setup();
    activator.activate(request);
    const before = activator.governedCurrent;
    f.trust.keys[0].revoked = true;
    rejected(activator.activate(request), "GOVERNANCE_STALE_TRUST");
    expect(activator.governedCurrent).toBe(before);
    expect(parseGovernedActivationManifest(before!.manifest)).toEqual(
      before!.manifest,
    );
  });
  it("rejects agent self-approval and a legacy fallback even with a viable v1 graph", () => {
    const { activator, request, f } = setup();
    rejected(
      activator.activate({
        ...request,
        approval: f.approve(request.proposal, "agent"),
      }),
      "GOVERNANCE_OWNER_REQUIRED",
    );
    const document = JSON.parse(
      readFileSync(
        new URL("../../examples/example-authority-graph.json", import.meta.url),
        "utf8",
      ),
    ) as MetamapDocument;
    const policy = JSON.parse(
      readFileSync(
        new URL(
          "../../examples/example-viability-policy.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as MetamapViabilityPolicy;
    const legacy = activator.activate(document, policy, {
      evaluatedAt: "2026-09-02T00:00:00.000Z",
      context: { environment: "production", maintenance: false },
    });
    expect(legacy).toMatchObject({
      activated: false,
      compilation: {
        status: "rejected",
        issues: [{ code: "PROTECTED_ACTIVATION_REQUIRED" }],
      },
    });
    expect(activator.governedCurrent).toBeUndefined();
    expect(activator.current).toBeUndefined();
  });
  it("rejects stale-base deployment and requires a fresh owner-authorized rollback", () => {
    const { activator, request, f } = setup();
    activator.activate(request);
    const first = activator.governedCurrent!;
    f.inputs.graph.entities[2].locators = [
      { uri: "json-schema:schemas/implementation-v2.json" },
    ];
    f.inputs.rebind();
    const change = f.propose(f.bundle(), governedActivationBaseline(first));
    const next = {
      schemaVersion: "1.0.0" as const,
      ...change,
      approval: f.approve(change.proposal),
    };
    expect(activator.activate(next).status).toBe("activated");
    const second = activator.governedCurrent!;
    expect(second.manifest.previousManifest).toBe(first.manifest.digest);
    rejected(activator.activate(request), "GOVERNANCE_STALE_BASELINE");
    expect(activator.governedCurrent).toBe(second);
    const rollback = f.propose(
      first.manifest.proposal.candidate,
      governedActivationBaseline(second),
      "rollback",
    );
    rejected(
      activator.activate({
        schemaVersion: "1.0.0",
        ...rollback,
        approval: f.approve(rollback.proposal, "agent"),
      }),
      "GOVERNANCE_OWNER_REQUIRED",
    );
    expect(
      activator.activate({
        schemaVersion: "1.0.0",
        ...rollback,
        approval: f.approve(rollback.proposal),
      }).status,
    ).toBe("activated");
    expect(activator.governedCurrent!.files).toEqual(first.files);
    expect(activator.governedCurrent!.manifest.digest).not.toBe(
      first.manifest.digest,
    );
  }, 20000);
  it("reports an unavailable trusted host without changing current state", () => {
    const { activator, request, host } = setup();
    activator.activate(request);
    const before = activator.governedCurrent;
    host.configuration = () => {
      throw new Error("Owner configuration unavailable");
    };
    rejected(activator.activate(request), "GOVERNANCE_HOST_UNAVAILABLE");
    expect(activator.governedCurrent).toBe(before);
  });
});
describe("activation manifest and strict wire integrity", () => {
  it("rejects duplicate request fields, path traversal and caller clocks", () => {
    const { request } = setup();
    expect(() =>
      parseGovernedActivationRequestJson(
        '{"schemaVersion":"1.0.0",' + JSON.stringify(request).slice(1),
      ),
    ).toThrow(/Duplicate/);
    expect(() =>
      parseGovernedActivationRequestJson(
        JSON.stringify({
          ...request,
          files: { ...request.files, "../current.json": "{}" },
        }),
      ),
    ).toThrow();
    expect(() =>
      parseGovernedActivationRequestJson(
        JSON.stringify({ ...request, now: governanceNow }),
      ),
    ).toThrow();
  });
  it.each(["artifacts", "previousManifest", "activatedAt", "acceptedTrust"])(
    "rejects a rehashed historical manifest with altered %s",
    (field) => {
      const { activator, request } = setup();
      activator.activate(request);
      const bad = structuredClone(activator.governedCurrent!.manifest);
      if (field === "artifacts") bad.artifacts.files.pop();
      if (field === "previousManifest")
        bad.previousManifest = "sha256:" + "1".repeat(64);
      if (field === "activatedAt") bad.activatedAt = "2026-10-10T03:00:00.000Z";
      if (field === "acceptedTrust")
        bad.acceptedTrust.principals[0].role = "agent";
      rehashGovernance(bad, "activation");
      expect(() => parseGovernedActivationManifest(bad)).toThrow();
    },
  );
  it("requires an exact pointer identity and validates previous artifact bytes", () => {
    const { activator, request, f } = setup();
    activator.activate(request);
    const current = activator.governedCurrent!;
    const pointer = {
      schemaVersion: "1.0.0",
      consumer: current.manifest.consumer,
      environment: current.manifest.environment,
      manifest: { id: current.manifest.id, digest: current.manifest.digest },
    };
    expect(parseGovernedActivePointer(pointer)).toEqual(pointer);
    pointer.manifest.id = "urn:wrong";
    expect(() => parseGovernedActivePointer(pointer)).toThrow();
    const damaged = structuredClone(current);
    damaged.files["bindings-0.ts"] += "changed";
    rejected(
      evaluateGovernedActivation(request, f.context(), damaged),
      "GOVERNANCE_ARTIFACT_BYTES_MISMATCH",
    );
  });
});
