# Contributing

## Development

Metamap requires Node.js 20 or newer.

```bash
npm ci
npm run format:check
npm run typecheck
npm test
npm run build
npm run example:generate
npm run example:check
npm run example:compile
npm run example:research
npm run example:routing
npm run example:bindings
npm run example:relations
npm run example:uncertainty
npm run example:path-tree
npm run example:topology
npm run example:replay
```

Before opening a pull request, also run `npm pack --dry-run` and verify that
only the intended public files are included. Intentional contributions to this
repository are licensed under Apache-2.0.

## Contract changes

The JSON schemas are the cross-language API. A schema, relation, identity, or
authority semantic change must include:

- a compatibility assessment and appropriate version change;
- tests for both valid and invalid documents;
- matching TypeScript model and validator changes;
- updated examples and architecture documentation.

Changes to viability policies, generations, context expressions, constraints,
impact propagation, evidence, or waivers are also contract changes. New
constraint kinds must include deterministic evaluator tests and documentation;
unknown kinds must continue to fail closed.

Published legacy schema bytes and compiled identities are pinned in
`evaluation/legacy-compatibility.json`. Preserve those pins and the original
evaluation protocols, scorers and results. New semantic profile artifacts use
separate schema identities and JCS content binding; legacy graph references
retain their old convention. See [CONTRACTS.md](CONTRACTS.md).

Every new semantic input must be captured and recomputed in replay in the same
increment. Test changed, missing and rehashed inputs, rejected candidates,
mixed-version rejection and unknown result states. Projection and path-tree
changes also require native checks of their generated TypeScript. Use
`npm run example:relations` for the opt-in proof-carrying workflow.
Use `npm run example:uncertainty` for typed evidence and consumer cost limits.
Use `npm run example:provenance` for complete source receipt bindings, accepted
and rejected replay 3.0, explicit read-only inspection and native outputs.
Preserve published receipt/snapshot/replay schemas; new complete captures have
their own schema identities. Test source/config/adapter/shard changes, rehashed
receipt mismatches, unavailable raw inputs and denied local/symlink locators.

Use `npm run example:governance` for exact external-owner approval and reviewed
native artifact bytes. Approval changes must test published crypto/JCS vectors,
independent signing, forgery, complete input/output tampering, scoped grants,
current time/revocation, self-appointed ownership and stale protected baselines.
Do not substitute verifier success for P10's consumer permission and activation
transaction tests. Synthetic signing keys stay in memory; never add private
credentials or production trust material to examples or test records.

After SDK edits, build the distribution before running distribution-backed
native/CLI acceptance tests. Normal npm test includes the protected activation
suite. Its Linux cases require a root test host or passwordless sudo and use
only disposable owner-controlled /tmp fixtures with a distinct unprivileged UID.
Temporary synthetic fixture keys remain private to that host and are removed;
never print or retain them in verification records. Non-Linux skips establish
only portable coverage. [ACTIVATION.md](ACTIVATION.md) defines the first host
profile, actual permission checks, crash/retry/rollback behavior and assumptions.
No privileged CI workflow edits or production installation are needed.

Adapters must be deterministic. Their fingerprints must cover every input that
can affect discovery, and emitted entities must use stable semantic IDs rather
than physical paths as identity.

Third-party adapter configuration is intentionally open. New built-in adapters
must still add a narrow TypeScript config interface, portable schema conditions,
registry coverage, and a representative shard test. Relation packs must keep
semantic entailment separate from evidential support and include an explicit
causal `impactDirection` for every relation intended for viable activation.

## Pull requests

Keep changes focused, explain the structural invariant being changed, and add a
regression test for behavior changes. Do not silently convert unresolved
candidate authority into canonical authority or infer semantic equivalence from
names.
