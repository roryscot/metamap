# Exact proposals and authenticated approvals

P09 implements the pure proposal/approval layer of M4. It can authenticate an
Ed25519 approval against separately supplied current consumer trust, action/fact
grants, baseline and clock. It performs no activation or filesystem writes.
P10 connects these checks to the existing activation interfaces and a first
Linux protected promoter profile. [ACTIVATION.md](ACTIVATION.md) specifies the
actual host boundary and its acceptance checks. Legacy promotion still rejects
v2; an incoming request cannot select governance or fall back to legacy mode.

A library caller that controls its own trust configuration can appoint its own
owner and verify its own signature. The protected consumer boundary must prevent
that configuration from becoming the consumer's current trust. A verifier return
value alone does not prove that boundary or that a consumer is active.

## Records and algorithms

Five new schemas define governance vocabulary, trusted consumer configuration,
artifact manifests, change proposals and signed approvals, all version 1.0.
Existing graph/policy/generation/projection/path-tree and replay 3.0 contracts
retain their versions and published bytes. Governance sidecars are lifecycle
records; they do not alter correspondence admission.

Trusted configuration is supplied by the consumer environment. It contains
principal roles, exact public keys, scoped grants, explicit revocation flags,
validity intervals, consumer/environment, revision, state directory and permitted
proposal roots. It is never loaded from graph ownership, source captures,
proposals or replay. One public key cannot identify two independent principals.
The full configuration digest is bound in addition to its revision.

Each proposal contains the complete admitted source-bound replay, exact baseline
manifest/replay or null for bootstrap, consumer/environment, deployment intent,
proposer attribution, current trust binding, computed action/fact requirements
and the generated artifact byte manifest. Proposer attribution is unauthenticated.
The baseline used for verification must be separately read from protected state.

Artifacts use the existing JSON and native TypeScript emitters: complete replay,
graph, policy, source capture, viable generation, every selected consumer
projection, lookup table and any requested path tree/helper. Fixed numeric
filenames avoid treating graph IDs or locators as output paths. The manifest
binds the complete file inventory, media types, UTF-8 byte lengths and SHA-256
byte digests. Missing, added or swapped outputs reject. Every selected projection
must belong to the named consumer; any failed compilation or projection rejects.

New content addresses use RFC 8785 JCS and SHA-256, excluding only their own
`id`/`digest` fields and including optional schema metadata. References preserve
their existing digest conventions. Signed approval is an addressed envelope of
the complete payload and external signature. Signature bytes cover the entire
JCS UTF-8 payload, whose fixed domain is `urn:metamap:approval:1`, version is
1.0 and algorithm is Ed25519. Payload binds proposal/artifact identities,
baseline, consumer/environment, intent, trust revision/digest, principal/key,
selected grants, complete computed delta, issuance and expiry.

Only canonical base64 of exact Ed25519 public SPKI DER and 64-byte signatures is
accepted. Private keys are never accepted by this library. An owner signs
externally; attaching a signature creates a record and confers no authorization.
Strict JSON parsing rejects duplicate and escaped duplicate member names,
unsupported fields/profiles, invalid Unicode and non-JSON values before
verification. Times are exact UTC values with milliseconds; issuance is inclusive
and expiry exclusive. Current trusted time controls approval/key/grant validity,
not a replay's historical evaluation time. Key and grant intervals must cover
the complete signed approval interval.

The implementation uses [Node crypto verification](https://nodejs.org/docs/latest-v20.x/api/crypto.html#cryptoverifyalgorithm-data-key-signature).
Tests include a published [RFC 8032 Ed25519 vector](https://www.rfc-editor.org/rfc/rfc8032#section-7.1),
independent WebCrypto signing, and the existing normative
[RFC 8785 canonicalization vectors](https://www.rfc-editor.org/rfc/rfc8785).

## Actions and fact scopes

Grants cover an action and a subject/fact together. Exact values match literally;
`*` alone is the explicit wildcard. Several selected grants can cover different
requirements, but an action in one grant cannot be combined with an unrelated
fact in another. Signature, trust, clock and grant failures cannot be waived by
ordinary viability waivers.

Every proposal requires `activate` over the consumer's `activation` fact.
Bootstrap and rollback add distinct actions. Entity locator changes and mapping
source/target/transform changes use `rebind-implementation`; other graph records
use `change-graph`. Authority deltas require both the authority record and every
old/new concept's `ownership:<fact>` scope. Source changes use complete captured
component differences. Context, evaluation time, changed subjects, projection
specifications and exact pack values have explicit requirements.

The first profile is deliberately conservative: every policy change apart from
its redundant graph binding requires `change-policy`; any change to constraints,
mapping semantics, uncertainty requirements or derivation limits additionally
requires `relax-policy`, even when it might tighten them. Added/removed budgets,
raised limits, changed cost rules/consumer and newly added or changed waivers
receive distinct budget/waiver actions. This avoids guessing that an arbitrary
semantic edit preserves or strengthens policy.

Bootstrap, rollback, authority, policy, relaxation, budget, waiver and law actions
require the authenticated principal's externally configured role to be `owner`,
as well as matching grants. Agent/service principals cannot bypass this with
broad grants or graph-declared canonical ownership. An agent can approve an
ordinary implementation rebinding only if the consumer explicitly grants that
action and all changed facts. Trust-root changes are outside the proposal schema
and must be managed separately by the consumer owner.

## SDK workflow

`createGovernedChangeProposal(replay, options)` returns an unapproved proposal and
all generated file bytes. Options select the consumer, environment, proposer
attribution, protected baseline and externally loaded trust configuration.

`createApprovalPayload(proposal, options)` prepares the complete signing payload.
`governedApprovalSigningBytes(payload)` returns its exact domain-separated bytes.
An external authorized owner signs those bytes with their own key.
`attachGovernedApprovalSignature(payload, signature)` creates the signed envelope.
It does not import keys, select an owner, or grant permission.

`verifyGovernedApproval(proposal, approval, context)` returns `authorized` or
structured rejection. Context supplies current external trust, protected
baseline and current trusted clock. `verifyGovernedArtifactBytes(proposal, files)`
independently requires the exact complete recomputed output bytes. The protected
promoter must perform both checks at its serialized write boundary.

Parsers include `parseTrustedConsumerConfiguration[Json]`,
`parseGovernedChangeProposal[Json]`, `parseSignedGovernedApproval[Json]` and
`parseGovernedArtifactManifest`. The root and `./governance`/`./governance-model`
package exports expose these contracts. No signing or promotion command is
added in P09.

Run `npm run example:governance` for ephemeral synthetic keys, exact owner approval,
agent self-approval rejection, changed-output rejection and type-checked native
consumer execution. It never uses production credentials or active state.
Full exact replay remains executor/runtime specific, including the captured
baseline; changing that environment requires an explicit migration.

P10's lifecycle and tests are documented in [ACTIVATION.md](ACTIVATION.md), including
both existing interfaces, complete immutable staging, atomic publication,
serialized stale-base checks, authorized retry and fresh owner rollback.
Rejecting a new activation after revocation is separate from retiring a previously
active generation. M4 requires the actual Linux permission/transaction checks,
not only the portable verifier tests; the controlling plan records their status.
