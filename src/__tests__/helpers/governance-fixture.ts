import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import {
  createApprovalPayload,
  attachGovernedApprovalSignature,
  createGovernedChangeProposal,
  governedApprovalSigningBytes,
  governanceDocumentDigest,
} from "../../governance.js";
import type {
  GovernedBaseline,
  GovernedChangeProposal,
  GovernanceAction,
  TrustedConsumerConfiguration,
} from "../../governance-model.js";
import { captureReplayBundle } from "../../replay.js";
import type { SourceReplayBundle } from "../../semantic-replay-model.js";
import { sourceFixture } from "./source-fixture.js";

export const governanceActions: GovernanceAction[] = [
  "activate",
  "bootstrap",
  "rollback",
  "rebind-implementation",
  "change-graph",
  "change-authority",
  "change-policy",
  "relax-policy",
  "raise-budget",
  "add-waiver",
  "change-law",
  "change-source",
  "change-context",
  "change-projection",
];
export const governanceNow = "2026-10-10T01:00:00.000Z";
export function governanceFixture() {
  const inputs = sourceFixture();
  inputs.supported();
  inputs.requireIdentity();
  inputs.budget();
  inputs.recompose();
  const keys = new Map<string, KeyObject>();
  const pairs = ["owner", "agent", "service"].map((principal) => {
    const pair = generateKeyPairSync("ed25519");
    keys.set(principal, pair.privateKey);
    return {
      id: principal + "-key",
      principal,
      algorithm: "Ed25519" as const,
      publicKey: pair.publicKey
        .export({ type: "spki", format: "der" })
        .toString("base64"),
      validFrom: "2026-10-10T00:00:00.000Z",
      validUntil: "2026-10-11T00:00:00.000Z",
      revoked: false,
    };
  });
  const trust: TrustedConsumerConfiguration = {
    schemaVersion: "1.0.0",
    id: "urn:test:trust",
    revision: "trust-r1",
    mode: "governed",
    consumer: inputs.spec.consumer,
    environment: "synthetic-test",
    stateDirectory: "/test-protected/metamap",
    proposalRoots: ["/test-proposals"],
    principals: ["owner", "agent", "service"].map((id) => ({
      id,
      role: id as "owner" | "agent" | "service",
      revoked: false,
    })),
    keys: pairs,
    grants: ["owner", "agent", "service"].map((principal) => ({
      id: principal + "-grant",
      principal,
      actions: [...governanceActions],
      scopes: [{ subject: "*", fact: "*" }],
      revoked: false,
      validFrom: "2026-10-10T00:00:00.000Z",
      validUntil: "2026-10-11T00:00:00.000Z",
    })),
  };
  const bundle = () =>
    captureReplayBundle(inputs.graph, inputs.policy, {
      ...inputs.options,
      projections: [inputs.spec],
      sourceCapture: inputs.sourceCapture,
    });
  const propose = (
    candidate: SourceReplayBundle,
    baseline: GovernedBaseline | null = null,
    intent: "deploy" | "rollback" = "deploy",
  ) =>
    createGovernedChangeProposal(candidate, {
      consumer: trust.consumer,
      environment: trust.environment,
      proposer: "agent",
      baseline,
      intent,
      trustedConfiguration: trust,
    });
  const approve = (proposal: GovernedChangeProposal, principal = "owner") => {
    const payload = createApprovalPayload(proposal, {
      principal,
      key: principal + "-key",
      grants: [principal + "-grant"],
      issuedAt: "2026-10-10T00:30:00.000Z",
      expiresAt: "2026-10-10T02:00:00.000Z",
    });
    // External Node crypto is the test signer. The library has no signer or private-key API.
    return attachGovernedApprovalSignature(
      payload,
      sign(null, governedApprovalSigningBytes(payload), keys.get(principal)!),
    );
  };
  const context = (baseline: GovernedBaseline | null = null) => ({
    trustedConfiguration: trust,
    baseline,
    now: governanceNow,
  });
  return { inputs, trust, keys, bundle, propose, approve, context };
}
export function rehashGovernance<T extends { id: string; digest: string }>(
  value: T,
  kind: string,
): T {
  value.digest = governanceDocumentDigest(value);
  value.id = "urn:metamap:" + kind + ":" + value.digest.slice(7);
  return value;
}
