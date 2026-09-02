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
```

Before opening a pull request, also run `npm pack --dry-run` and verify that
only the intended public files are included.

## Contract changes

The JSON schemas are the cross-language API. A schema, relation, identity, or
authority semantic change must include:

- a compatibility assessment and appropriate version change;
- tests for both valid and invalid documents;
- matching TypeScript model and validator changes;
- updated examples and architecture documentation.

Adapters must be deterministic. Their fingerprints must cover every input that
can affect discovery, and emitted entities must use stable semantic IDs rather
than physical paths as identity.

## Pull requests

Keep changes focused, explain the structural invariant being changed, and add a
regression test for behavior changes. Do not silently convert unresolved
candidate authority into canonical authority or infer semantic equivalence from
names.
