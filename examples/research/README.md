# Research federation example

This workspace demonstrates the boundary between an epistemic system such as
Research Machine and Metamap:

1. Research Machine remains authoritative for claims, hypotheses, protocols,
   runs, evidence, and lifecycle state.
2. An exporter emits `claim-shard.json`, a portable structural projection of
   those records with stable IDs and provenance.
3. `metamap.config.json` ingests the projection through `metamap-shard` and
   explicitly loads `relation-packs/research.json`.
4. `viability-policy.json` checks authority, live competition, and protocol
   coverage before producing an immutable generation.

Run the complete example from the repository root:

```bash
npm run example:research
```

The generated policy labels its result `research-state`. This means only that
the declared research structure is coherent. It does not mean that a hypothesis
is reviewed, mathematically consistent, empirically supported, or true. Those
stronger meanings require separate policies, registered executors, and scoped
evidence.

The sample records are illustrative and are not a replacement for the canonical
state of any real research campaign. A production exporter should derive stable
URIs from canonical Research Machine IDs, include record or ledger hashes in
locators, preserve workflow and evidence scope, and never infer a relation from
matching labels.
