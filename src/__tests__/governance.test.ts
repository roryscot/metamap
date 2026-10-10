import { generateKeyPairSync, sign, webcrypto } from "node:crypto";
import { setImmediate } from "node:timers/promises";
import { beforeEach, describe, expect, it } from "vitest";
import { canonicalDigest, canonicalJson } from "../canonical.js";
import {
  attachGovernedApprovalSignature,
  createApprovalPayload,
  createGovernedChangeProposal,
  governedApprovalSigningBytes,
  governedChangeRequirements,
  governanceDocumentDigest,
  parseGovernedArtifactManifest,
  parseGovernedChangeProposal,
  parseGovernedChangeProposalJson,
  parseSignedGovernedApproval,
  parseSignedGovernedApprovalJson,
  parseTrustedConsumerConfiguration,
  parseTrustedConsumerConfigurationJson,
  verifyEd25519Signature,
  verifyGovernedApproval,
  verifyGovernedArtifactBytes,
} from "../governance.js";
import type {
  GovernanceAction,
  GovernanceVerificationResult,
} from "../governance-model.js";
import { contentDigest } from "../stable.js";
import {
  governanceFixture,
  governanceNow,
  rehashGovernance,
} from "./helpers/governance-fixture.js";
import { createSourceCapture } from "../provenance.js";
import { assembleWorkspace } from "../workspace.js";
import { captureReplayBundle } from "../replay.js";
import { composeCorrespondences } from "../derivation.js";
import { coreRelationPack, RelationRegistry } from "../relations.js";
import { relationPackDigest } from "../relation-pack.js";

// Allow runner acknowledgements between synchronous replay/crypto cases. A
// microtask-only file can otherwise starve the worker's 60-second RPC deadline.
beforeEach(() => setImmediate());

function rejection(result: GovernanceVerificationResult, code: string) {
  expect(result).toMatchObject({ status: "rejected", issues: [{ code }] });
}
const oldManifest = "sha256:" + "1".repeat(64);
function changedLawBundle(f: ReturnType<typeof governanceFixture>) {
  f.inputs.pack.description = "Changed exact law source";
  const registry = new RelationRegistry([coreRelationPack, f.inputs.pack]);
  f.inputs.graph.relationPacks = f.inputs.graph.relationPacks?.map((pack) =>
    pack.id === f.inputs.pack.id
      ? { ...pack, digest: relationPackDigest(f.inputs.pack) }
      : pack,
  );
  f.inputs.graph.mappings = f.inputs.graph.mappings.filter(
    (mapping) => mapping.id !== f.inputs.request.resultId,
  );
  const result = composeCorrespondences(
    f.inputs.graph,
    {
      ...f.inputs.request,
      assessments: f.inputs.policy.assessments,
      evidence: f.inputs.policy.evidence,
    },
    registry,
  );
  if (result.status !== "proposed") throw new Error(JSON.stringify(result));
  f.inputs.graph.mappings.push(result.mapping);
  f.inputs.policy.derivations = [result.derivation];
  f.inputs.rebind();
  return captureReplayBundle(f.inputs.graph, f.inputs.policy, {
    ...f.inputs.options,
    relationRegistry: registry,
    projections: [f.inputs.spec],
    sourceCapture: f.inputs.sourceCapture,
  });
}

describe("fixed governance cryptography and strict inputs", () => {
  it("verifies RFC 8032 section 7.1 test 1 without using any signer", () => {
    const key = Buffer.from(
      "302a300506032b6570032100d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
      "hex",
    ).toString("base64");
    const signature = Buffer.from(
      "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
      "hex",
    ).toString("base64");
    expect(verifyEd25519Signature(Buffer.alloc(0), key, signature)).toBe(true);
    expect(
      verifyEd25519Signature(Buffer.from("different"), key, signature),
    ).toBe(false);
  });
  it("accepts an approval signed through independent WebCrypto over the published JCS payload", async () => {
    const f = governanceFixture(),
      prepared = f.propose(f.bundle());
    const payload = createApprovalPayload(prepared.proposal, {
      principal: "owner",
      key: "owner-key",
      grants: ["owner-grant"],
      issuedAt: "2026-10-10T00:30:00.000Z",
      expiresAt: "2026-10-10T02:00:00.000Z",
    });
    const key = await webcrypto.subtle.importKey(
      "pkcs8",
      f.keys.get("owner")!.export({ format: "der", type: "pkcs8" }),
      { name: "Ed25519" },
      false,
      ["sign"],
    );
    const signature = await webcrypto.subtle.sign(
      "Ed25519",
      key,
      Buffer.from(canonicalJson(payload), "utf8"),
    );
    const approval = attachGovernedApprovalSignature(
      payload,
      new Uint8Array(signature),
    );
    expect(
      verifyGovernedApproval(prepared.proposal, approval, f.context()).status,
    ).toBe("authorized");
  });
  it("requires an exact Ed25519 public key, canonical base64 and a 64-byte signature", () => {
    const f = governanceFixture();
    f.trust.keys[0].publicKey = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    })
      .publicKey.export({ format: "der", type: "spki" })
      .toString("base64");
    expect(() => parseTrustedConsumerConfiguration(f.trust)).toThrow(/Ed25519/);
    expect(() =>
      verifyEd25519Signature(Buffer.alloc(0), "???", "x".repeat(88)),
    ).toThrow();
    const good = governanceFixture();
    good.trust.keys[0].publicKey += "\n";
    expect(() => parseTrustedConsumerConfiguration(good.trust)).toThrow(
      /base64/,
    );
    const next = governanceFixture(),
      prepared = next.propose(next.bundle());
    const payload = next.approve(prepared.proposal).payload;
    expect(() =>
      attachGovernedApprovalSignature(payload, Buffer.alloc(63)),
    ).toThrow(/byte length/);
  });
  it("rejects duplicate, escaped duplicate, unsupported and invalid-Unicode signed/configuration inputs", () => {
    const f = governanceFixture(),
      p = f.propose(f.bundle()),
      a = f.approve(p.proposal);
    expect(() =>
      parseSignedGovernedApprovalJson(
        canonicalJson(a).replace(
          '"schemaVersion":"1.0.0"',
          '"schemaVersion":"1.0.0","schema\\u0056ersion":"1.0.0"',
        ),
      ),
    ).toThrow(/Duplicate/);
    expect(() =>
      parseTrustedConsumerConfigurationJson(
        '{"schemaVersion":"1.0.0","schemaVersion":"1.0.0"}',
      ),
    ).toThrow(/Duplicate/);
    expect(() =>
      parseGovernedChangeProposalJson(
        canonicalJson(p.proposal).replace(
          '"proposer":"agent"',
          '"proposer":"\\ud800"',
        ),
      ),
    ).toThrow();
    const extra = { ...a, publicKey: f.trust.keys[0].publicKey };
    expect(() => parseSignedGovernedApproval(extra)).toThrow();
    expect(() =>
      parseSignedGovernedApproval({
        ...a,
        payload: { ...a.payload, algorithm: "Ed448" },
      }),
    ).toThrow();
  });
  it("rejects getters, toJSON, undefined and unsafe manifest integers without invoking code", () => {
    const f = governanceFixture(),
      prepared = f.propose(f.bundle());
    let invoked = false;
    const value = Object.defineProperty({}, "schemaVersion", {
      enumerable: true,
      get() {
        invoked = true;
        return "1.0.0";
      },
    });
    expect(() => parseGovernedChangeProposal(value)).toThrow();
    expect(() =>
      parseTrustedConsumerConfiguration({
        ...f.trust,
        toJSON() {
          invoked = true;
          return {};
        },
      }),
    ).toThrow();
    expect(invoked).toBe(false);
    expect(() =>
      parseGovernedArtifactManifest({
        ...prepared.proposal.artifacts,
        files: [
          {
            ...prepared.proposal.artifacts.files[0],
            byteLength: 9007199254740992,
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseSignedGovernedApproval({
        ...f.approve(prepared.proposal),
        extra: undefined,
      }),
    ).toThrow();
  });
  it.each(["principal", "key", "grant"])(
    "rejects duplicate %s identities and unknown principal references",
    (kind) => {
      const f = governanceFixture();
      if (kind === "principal") f.trust.principals.push(f.trust.principals[0]);
      if (kind === "key") f.trust.keys.push(f.trust.keys[0]);
      if (kind === "grant") f.trust.grants.push(f.trust.grants[0]);
      expect(() => parseTrustedConsumerConfiguration(f.trust)).toThrow(
        /Duplicate/,
      );
      const next = governanceFixture();
      next.trust.keys[0].principal = "candidate-appointed";
      expect(() => parseTrustedConsumerConfiguration(next.trust)).toThrow(
        /not externally registered/,
      );
    },
  );
});

describe("exact unapproved proposals and byte manifests", () => {
  it("preserves complete input values, emits native outputs and grants no permission by construction", () => {
    const f = governanceFixture(),
      bundle = f.bundle();
    const original = structuredClone({ trust: f.trust, bundle });
    const originalFrozen = Object.isFrozen(bundle);
    const prepared = f.propose(bundle);
    expect(
      parseGovernedChangeProposalJson(canonicalJson(prepared.proposal)),
    ).toEqual(prepared.proposal);
    expect(prepared.proposal.candidate).toEqual(bundle);
    expect(
      prepared.proposal.requirements.some((r) => r.action === "bootstrap"),
    ).toBe(true);
    expect(prepared.files["bindings-0.ts"]).toContain(
      "resolveMetamapProjection",
    );
    expect(prepared.files["path-tree-0.ts"]).toContain("hydratePathTree");
    for (const descriptor of prepared.proposal.artifacts.files) {
      expect(descriptor.byteDigest).toBe(
        contentDigest(prepared.files[descriptor.path]),
      );
      expect(descriptor.byteLength).toBe(
        Buffer.byteLength(prepared.files[descriptor.path], "utf8"),
      );
    }
    verifyGovernedArtifactBytes(prepared.proposal, prepared.files);
    expect({ trust: f.trust, bundle }).toEqual(original);
    expect(Object.isFrozen(bundle)).toBe(originalFrozen);
    expect(Object.isFrozen(f.trust)).toBe(false);
    expect("approval" in prepared.proposal).toBe(false);
  });
  it.each(["changed", "missing", "additional"])(
    "rejects %s reviewed output bytes without trusting rehashed file claims",
    (change) => {
      const f = governanceFixture(),
        p = f.propose(f.bundle()),
        files = { ...p.files };
      if (change === "changed")
        files["bindings-0.ts"] += "// substituted after review\n";
      if (change === "missing") delete files["policy.json"];
      if (change === "additional")
        files["extra.ts"] = "export const unreviewed = true;\n";
      expect(() => verifyGovernedArtifactBytes(p.proposal, files)).toThrow(
        /bytes|inventory/,
      );
      const forged = structuredClone(p.proposal);
      forged.artifacts.files[0].byteDigest = contentDigest("forged");
      rehashGovernance(forged.artifacts, "artifacts");
      rehashGovernance(forged, "change-proposal");
      expect(() => parseGovernedChangeProposal(forged)).toThrow(
        /exact recomputed/,
      );
    },
  );
  it("rejects removed delta requirements even with recomputed proposal addresses", () => {
    const f = governanceFixture(),
      p = structuredClone(f.propose(f.bundle()).proposal);
    p.requirements = p.requirements.filter((r) => r.action === "activate");
    rehashGovernance(p, "change-proposal");
    expect(() => parseGovernedChangeProposal(p)).toThrow(/classified delta/);
  });
  it("rejects a failed evaluation, missing/wrong consumer projections and unrequested rollback bootstrap", () => {
    const f = governanceFixture();
    f.inputs.policy.riskBudgets[0].maximumTotalCost = 4;
    expect(() => f.propose(f.bundle())).toThrow(/admitted replay/);
    const next = governanceFixture();
    next.inputs.spec.consumer = "wrong-consumer";
    expect(() => next.propose(next.bundle())).toThrow();
    const valid = governanceFixture();
    expect(() => valid.propose(valid.bundle(), null, "rollback")).toThrow(
      /requires/,
    );
    expect(() =>
      createGovernedChangeProposal(valid.bundle(), {
        ...valid.context(),
        baseline: null,
        proposer: "agent",
        consumer: valid.trust.consumer,
        environment: "different",
      }),
    ).toThrow();
  });
  it("checks content addresses over every field including schema metadata", () => {
    const f = governanceFixture(),
      p = f.propose(f.bundle()).proposal;
    expect(governanceDocumentDigest(p)).toBe(p.digest);
    const changed = { ...p, $schema: "urn:alternate:schema" };
    expect(governanceDocumentDigest(changed)).not.toBe(p.digest);
    expect(() => parseGovernedChangeProposal(changed)).toThrow(
      /content address/,
    );
    expect(
      governanceDocumentDigest({ ...p, id: "ignored", digest: "ignored" }),
    ).toBe(p.digest);
  });
});

describe("current externally scoped approval verification", () => {
  it("rejects a shared public key assigned to independent principal identities", () => {
    const f = governanceFixture();
    f.trust.keys[1].publicKey = f.trust.keys[0].publicKey;
    expect(() => parseTrustedConsumerConfiguration(f.trust)).toThrow(
      /two independent/,
    );
  });
  it("rejects an invalid assessment revision before a proposal can be approved", () => {
    const f = governanceFixture();
    f.inputs.policy.assessments[0].sourceRevision = "wrong-revision";
    expect(() => f.inputs.recompose()).toThrow(/ASSESSMENT_REVISION_MISMATCH/);
    expect(() => f.propose(f.bundle())).toThrow();
  });
  it("requires owner approval to remove a working constraint or broaden uncertainty acceptance", () => {
    const f = governanceFixture();
    f.inputs.policy.constraints = [
      {
        id: "urn:test:working-constraint",
        kind: "core:requires-evidence",
        subjects: [f.inputs.graph.mappings[0].id],
        parameters: { kinds: ["uncertainty:identity"] },
      },
    ];
    const before = f.bundle(),
      baseline = { manifestDigest: oldManifest, replay: before };
    f.inputs.policy.constraints = [];
    f.inputs.policy.uncertaintyRequirements[0].allowedStates = [
      "supported",
      "unknown",
    ];
    f.inputs.policy.uncertaintyRequirements[0].requireEvidence = false;
    const p = f.propose(f.bundle(), baseline);
    expect(p.proposal.requirements).toEqual(
      expect.arrayContaining([
        {
          action: "relax-policy",
          subject: f.inputs.policy.id,
          fact: "policy.constraints",
        },
        {
          action: "relax-policy",
          subject: f.inputs.policy.id,
          fact: "policy.uncertaintyRequirements",
        },
      ]),
    );
    rejection(
      verifyGovernedApproval(
        p.proposal,
        f.approve(p.proposal, "agent"),
        f.context(baseline),
      ),
      "GOVERNANCE_OWNER_REQUIRED",
    );
    expect(
      verifyGovernedApproval(
        p.proposal,
        f.approve(p.proposal),
        f.context(baseline),
      ).status,
    ).toBe("authorized");
  });
  it.each(["evaluation-time", "changed-subjects"])(
    "classifies %s as an explicit context scope and invalidates old approval",
    (fact) => {
      const f = governanceFixture(),
        before = f.bundle(),
        baseline = { manifestDigest: oldManifest, replay: before };
      const initial = f.propose(before, baseline),
        approval = f.approve(initial.proposal);
      const candidate = captureReplayBundle(f.inputs.graph, f.inputs.policy, {
        ...f.inputs.options,
        projections: [f.inputs.spec],
        sourceCapture: f.inputs.sourceCapture,
        ...(fact === "evaluation-time"
          ? { evaluatedAt: "2026-10-09T01:00:00.000Z" }
          : { changedSubjects: [f.inputs.graph.entities[0].id] }),
      });
      const p = f.propose(candidate, baseline);
      expect(p.proposal.requirements).toContainEqual({
        action: "change-context",
        subject: f.trust.consumer,
        fact,
      });
      rejection(
        verifyGovernedApproval(p.proposal, approval, f.context(baseline)),
        "GOVERNANCE_APPROVAL_CONTENT_MISMATCH",
      );
    },
  );
  it("combines explicitly selected grants without combining an action from one with an unrelated fact from another", () => {
    const f = governanceFixture(),
      before = f.bundle(),
      baseline = { manifestDigest: oldManifest, replay: before };
    f.inputs.graph.entities[2].locators = [
      { uri: "json-schema:schemas/next.json" },
    ];
    f.inputs.rebind();
    f.trust.grants[0].actions = ["activate"];
    f.trust.grants.push({
      ...f.trust.grants[0],
      id: "owner-rebind",
      actions: ["rebind-implementation"],
    });
    const p = f.propose(f.bundle(), baseline);
    const payload = createApprovalPayload(p.proposal, {
      principal: "owner",
      key: "owner-key",
      grants: ["owner-rebind", "owner-grant"],
      issuedAt: "2026-10-10T00:30:00.000Z",
      expiresAt: "2026-10-10T02:00:00.000Z",
    });
    const approval = attachGovernedApprovalSignature(
      payload,
      sign(null, governedApprovalSigningBytes(payload), f.keys.get("owner")!),
    );
    expect(
      verifyGovernedApproval(p.proposal, approval, f.context(baseline)).status,
    ).toBe("authorized");
    f.trust.grants.at(-1)!.scopes = [{ subject: "*", fact: "unrelated" }];
    const changed = f.propose(f.bundle(), baseline);
    const newPayload = createApprovalPayload(changed.proposal, {
      ...payload,
      grants: payload.grants,
    });
    const current = attachGovernedApprovalSignature(
      newPayload,
      sign(
        null,
        governedApprovalSigningBytes(newPayload),
        f.keys.get("owner")!,
      ),
    );
    rejection(
      verifyGovernedApproval(changed.proposal, current, f.context(baseline)),
      "GOVERNANCE_SCOPE_DENIED",
    );
  }, 15000);
  it("rejects a correctly signed reduced action list and graph-supplied trusted configuration", () => {
    const f = governanceFixture(),
      p = f.propose(f.bundle()),
      a = f.approve(p.proposal);
    const payload = {
      ...a.payload,
      requirements: a.payload.requirements.filter(
        (r) => r.action === "activate",
      ),
    };
    const approval = attachGovernedApprovalSignature(
      payload,
      sign(null, governedApprovalSigningBytes(payload), f.keys.get("owner")!),
    );
    rejection(
      verifyGovernedApproval(p.proposal, approval, f.context()),
      "GOVERNANCE_APPROVAL_CONTENT_MISMATCH",
    );
    const supplied = rehashGovernance(
      { ...p.proposal, trustedConfiguration: f.trust },
      "change-proposal",
    );
    rejection(
      verifyGovernedApproval(supplied, a, f.context()),
      "GOVERNANCE_INVALID_SHAPE",
    );
  });
  it("accepts exactly scoped owner approval and repeats pure verification without state writes", () => {
    const f = governanceFixture(),
      candidate = f.bundle(),
      p = f.propose(candidate);
    f.trust.grants[0].scopes = [
      ...new Map(
        p.proposal.requirements.map(
          ({ subject, fact }) =>
            [canonicalJson({ subject, fact }), { subject, fact }] as const,
        ),
      ).values(),
    ];
    const current = f.propose(candidate),
      approval = f.approve(current.proposal);
    const original = canonicalJson({
      proposal: current.proposal,
      approval,
      context: f.context(),
    });
    expect(
      verifyGovernedApproval(current.proposal, approval, f.context()),
    ).toMatchObject({
      status: "authorized",
      principal: "owner",
      approval: approval.id,
      grants: ["owner-grant"],
    });
    expect(
      verifyGovernedApproval(current.proposal, approval, f.context()).status,
    ).toBe("authorized");
    expect(
      canonicalJson({
        proposal: current.proposal,
        approval,
        context: f.context(),
      }),
    ).toBe(original);
  });
  it("allows an externally granted agent implementation rebinding without granting ownership", () => {
    const f = governanceFixture(),
      before = f.bundle();
    f.inputs.graph.entities[2].locators = [
      { uri: "json-schema:schemas/network-v2.json" },
    ];
    f.inputs.rebind();
    const baseline = { manifestDigest: oldManifest, replay: before },
      p = f.propose(f.bundle(), baseline);
    expect(p.proposal.requirements.map((r) => r.action)).toEqual([
      "activate",
      "rebind-implementation",
    ]);
    expect(
      verifyGovernedApproval(
        p.proposal,
        f.approve(p.proposal, "agent"),
        f.context(baseline),
      ).status,
    ).toBe("authorized");
  });
  it.each([
    "bootstrap",
    "authority",
    "constraints",
    "budget",
    "waiver",
    "requirements",
    "law",
    "rollback",
  ])("prevents an agent with broad grants from self-approving %s", (change) => {
    const f = governanceFixture(),
      before = f.bundle();
    let baseline =
      change === "bootstrap"
        ? null
        : { manifestDigest: oldManifest, replay: before };
    if (change === "authority") {
      f.inputs.graph.authorities.push({
        id: "urn:test:self-owner",
        concept: f.inputs.graph.entities[0].id,
        source: f.inputs.graph.entities[0].id,
        mode: "canonical",
        facts: ["schema"],
        provenance: { status: "declared", assertedBy: "agent" },
      });
      f.inputs.rebind();
    }
    if (change === "constraints")
      f.inputs.policy.constraints.push({
        id: "urn:test:constraint",
        kind: "core:requires-evidence",
        subjects: [f.inputs.graph.mappings[0].id],
        parameters: { kinds: ["uncertainty:identity"] },
      });
    if (change === "budget")
      f.inputs.policy.riskBudgets[0].maximumTotalCost += 1;
    if (change === "waiver")
      f.inputs.policy.waivers = [
        {
          id: "urn:test:waiver",
          codes: ["GOVERNANCE_OWNER_REQUIRED"],
          subjects: [f.inputs.graph.id],
          reason: "not an authorization",
          expiresAt: "2026-10-11T00:00:00.000Z",
          assertedBy: "agent",
        },
      ];
    if (change === "requirements") f.inputs.policy.uncertaintyRequirements = [];
    const bundle = change === "law" ? changedLawBundle(f) : f.bundle();
    const p = f.propose(
      bundle,
      baseline,
      change === "rollback" ? "rollback" : "deploy",
    );
    rejection(
      verifyGovernedApproval(
        p.proposal,
        f.approve(p.proposal, "agent"),
        f.context(baseline),
      ),
      "GOVERNANCE_OWNER_REQUIRED",
    );
  });
  it.each(["subject", "fact", "action"])(
    "rejects a wrong granted %s despite valid identity/signature",
    (field) => {
      const f = governanceFixture();
      if (field === "subject")
        f.trust.grants[0].scopes = [{ subject: "other-consumer", fact: "*" }];
      if (field === "fact")
        f.trust.grants[0].scopes = [{ subject: "*", fact: "unrelated" }];
      if (field === "action") f.trust.grants[0].actions = ["activate"];
      const p = f.propose(f.bundle());
      rejection(
        verifyGovernedApproval(p.proposal, f.approve(p.proposal), f.context()),
        "GOVERNANCE_SCOPE_DENIED",
      );
    },
  );
  it.each(["signature", "key", "principal", "principal-key", "grant"])(
    "rejects forged or unknown %s",
    (field) => {
      const f = governanceFixture(),
        p = f.propose(f.bundle()),
        a = structuredClone(f.approve(p.proposal));
      if (field === "signature") {
        const bytes = Buffer.from(a.signature, "base64");
        bytes[0] ^= 1;
        a.signature = bytes.toString("base64");
      }
      if (field === "key") a.payload.key = "unregistered";
      if (field === "principal") a.payload.principal = "candidate-appointed";
      if (field === "principal-key") a.payload.principal = "agent";
      if (field === "grant") {
        const payload = createApprovalPayload(p.proposal, {
          principal: "owner",
          key: "owner-key",
          grants: ["unknown"],
          issuedAt: a.payload.issuedAt,
          expiresAt: a.payload.expiresAt,
        });
        const signed = attachGovernedApprovalSignature(
          payload,
          sign(
            null,
            governedApprovalSigningBytes(payload),
            f.keys.get("owner")!,
          ),
        );
        rejection(
          verifyGovernedApproval(p.proposal, signed, f.context()),
          "GOVERNANCE_UNKNOWN_GRANT",
        );
        return;
      }
      rehashGovernance(a, "approval");
      rejection(
        verifyGovernedApproval(p.proposal, a, f.context()),
        field === "signature"
          ? "GOVERNANCE_BAD_SIGNATURE"
          : "GOVERNANCE_UNKNOWN_IDENTITY",
      );
    },
  );
  it.each(["principal", "key", "grant"])(
    "rejects a currently revoked %s and prevents old-trust approval reuse",
    (field) => {
      const f = governanceFixture(),
        p = f.propose(f.bundle()),
        approval = f.approve(p.proposal);
      if (field === "principal") f.trust.principals[0].revoked = true;
      if (field === "key") f.trust.keys[0].revoked = true;
      if (field === "grant") f.trust.grants[0].revoked = true;
      rejection(
        verifyGovernedApproval(p.proposal, approval, f.context()),
        "GOVERNANCE_STALE_TRUST",
      );
      const next = f.propose(f.bundle());
      rejection(
        verifyGovernedApproval(
          next.proposal,
          f.approve(next.proposal),
          f.context(),
        ),
        "GOVERNANCE_REVOKED",
      );
    },
  );
  it.each([
    "2026-10-10T00:29:59.999Z",
    "2026-10-10T02:00:00.000Z",
    "2026-10-11T00:00:00.000Z",
  ])(
    "uses the current clock %s rather than the captured evaluation time",
    (now) => {
      const f = governanceFixture(),
        p = f.propose(f.bundle());
      rejection(
        verifyGovernedApproval(p.proposal, f.approve(p.proposal), {
          ...f.context(),
          now,
        }),
        "GOVERNANCE_APPROVAL_NOT_CURRENT",
      );
    },
  );
  it.each(["key", "grant"])(
    "requires current %s validity to cover the entire signed interval",
    (kind) => {
      const f = governanceFixture();
      if (kind === "key")
        f.trust.keys[0].validUntil = "2026-10-10T01:30:00.000Z";
      else f.trust.grants[0].validUntil = "2026-10-10T01:30:00.000Z";
      const p = f.propose(f.bundle());
      rejection(
        verifyGovernedApproval(p.proposal, f.approve(p.proposal), f.context()),
        kind === "key"
          ? "GOVERNANCE_KEY_NOT_CURRENT"
          : "GOVERNANCE_GRANT_NOT_CURRENT",
      );
    },
  );
  it("rejects wrong environment, stale trust and a separately supplied stale protected baseline", () => {
    const f = governanceFixture(),
      bundle = f.bundle(),
      baseline = { manifestDigest: oldManifest, replay: bundle };
    const p = f.propose(bundle, baseline),
      a = f.approve(p.proposal);
    rejection(
      verifyGovernedApproval(p.proposal, a, {
        ...f.context(baseline),
        trustedConfiguration: { ...f.trust, environment: "other" },
      }),
      "GOVERNANCE_WRONG_ENVIRONMENT",
    );
    rejection(
      verifyGovernedApproval(p.proposal, a, {
        ...f.context(baseline),
        trustedConfiguration: { ...f.trust, revision: "trust-r2" },
      }),
      "GOVERNANCE_STALE_TRUST",
    );
    rejection(
      verifyGovernedApproval(
        p.proposal,
        a,
        f.context({ ...baseline, manifestDigest: "sha256:" + "2".repeat(64) }),
      ),
      "GOVERNANCE_STALE_BASELINE",
    );
    rejection(
      verifyGovernedApproval(p.proposal, a, f.context(null)),
      "GOVERNANCE_STALE_BASELINE",
    );
    rejection(
      verifyGovernedApproval(p.proposal, a, {
        ...f.context(baseline),
        trustedConfiguration: {
          ...f.trust,
          stateDirectory: "/different-protected-state",
        },
      }),
      "GOVERNANCE_STALE_TRUST",
    );
  });
  it.each([
    "graph",
    "law",
    "evidence",
    "assessment",
    "budget",
    "context",
    "projection",
    "source",
  ])(
    "invalidates an old approval after a valid %s candidate change",
    (change) => {
      const f = governanceFixture(),
        first = f.propose(f.bundle()),
        approval = f.approve(first.proposal);
      let sourceCapture = f.inputs.sourceCapture;
      if (change === "graph") {
        f.inputs.graph.entities[0].label = "changed";
        f.inputs.rebind();
      }
      if (change === "evidence") {
        f.inputs.policy.evidence[0].producer = "changed-assessor";
        f.inputs.recompose();
      }
      if (change === "assessment") {
        f.inputs.policy.assessments[0].assessor = "new-assessor";
        f.inputs.recompose();
      }
      if (change === "budget")
        f.inputs.policy.riskBudgets[0].maximumTotalCost += 1;
      if (change === "context") {
        f.inputs.options.context.extra = "new";
        f.inputs.recompose();
      }
      if (change === "projection") f.inputs.spec.id = "urn:test:new-spec";
      if (change === "source") {
        const adapters = structuredClone(f.inputs.adapters);
        adapters[0].document.revision = "changed-source-revision";
        const discovery = assembleWorkspace(
          f.inputs.config,
          adapters,
          [{ configuredPath: "pack.json", pack: f.inputs.pack }],
          f.inputs.registry,
          { portablePackUris: true },
        );
        sourceCapture = createSourceCapture(
          f.inputs.config,
          discovery,
          f.inputs.registry,
        );
      }
      const currentBundle =
        change === "law"
          ? changedLawBundle(f)
          : captureReplayBundle(f.inputs.graph, f.inputs.policy, {
              ...f.inputs.options,
              projections: [f.inputs.spec],
              sourceCapture,
            });
      const next = f.propose(currentBundle);
      expect(next.proposal.digest).not.toBe(first.proposal.digest);
      rejection(
        verifyGovernedApproval(next.proposal, approval, f.context()),
        "GOVERNANCE_APPROVAL_CONTENT_MISMATCH",
      );
    },
  );
  it("binds rollback intent separately and ignores graph-supplied trust/key material", () => {
    const f = governanceFixture(),
      before = f.bundle(),
      baseline = { manifestDigest: oldManifest, replay: before };
    f.inputs.graph.metadata = {
      "trusted-principal": "agent",
      "trusted-key": f.trust.keys[1].publicKey,
    };
    f.inputs.rebind();
    const candidate = f.bundle(),
      deploy = f.propose(candidate, baseline),
      approval = f.approve(deploy.proposal);
    const rollback = f.propose(candidate, baseline, "rollback");
    rejection(
      verifyGovernedApproval(rollback.proposal, approval, f.context(baseline)),
      "GOVERNANCE_APPROVAL_CONTENT_MISMATCH",
    );
    expect(
      verifyGovernedApproval(
        rollback.proposal,
        f.approve(rollback.proposal),
        f.context(baseline),
      ).status,
    ).toBe("authorized");
    expect(canonicalDigest(f.trust)).toBe(deploy.proposal.trust.digest);
    expect(governanceNow).not.toBe(before.inputs.evaluatedAt);
  });
});
