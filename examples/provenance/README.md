# Source-bound network configuration

Run `npm run example:provenance` from the repository root. Two independently
attributed JSON shards supply the network and schema correspondences. The
example captures their configurations, input byte digests and emitted shards,
checks an explicit composition proposal, and emits native consumer bindings.

`generated/source-capture.json`, `receipts.json` and `snapshot.json` preserve the
source baseline. `graph.json` is the candidate with one explicit derived
correspondence. `source-inspection.json` reports that difference and leaves
authentication, current authorization and active state unevaluated.

The tolerant policy accepts recorded identity support and a unique dependency
cost of 5. The strict policy rejects required unknown completeness. Both
evaluations replay with the exact installed executor in disposable bundles;
comparison preserves the rejected consumer's unknown risk delta. Receipt
tampering fails even when the receipt and bundle are rehashed.

The script checks current source inputs using an explicitly permitted local
root, creates no adapter cache, and executes the native bindings and hydrated
path tree. The package command also type-checks both emitted modules. Generated
files are candidate artifacts; no approval or activation occurs.

See [PROVENANCE.md](../../PROVENANCE.md) for SDK/CLI operations, contract versions,
portable references, digest rules and limitations. Raw source bytes are not
embedded in a capture; offline graph replay does not reconstruct them.
