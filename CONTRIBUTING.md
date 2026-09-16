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
npm run example:path-tree
npm run example:topology
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
