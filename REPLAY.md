# Compiler replay

A replay bundle preserves one exact compiler evaluation: graph, policy,
relation-pack contents, context, evaluation time, changed subjects, projection
specifications, and the resulting compilation and projections. It can preserve
a rejection as well as a viable result.

Replay means the installed executor reproduced the recorded evaluation. It does
not authenticate the author, establish that evidence is true, grant approval,
rediscover sources, or activate a generation. A verified rejected evaluation
remains unadmitted.

## Capture and replay

```bash
metamap capture examples/routing/graph.json \
  examples/routing/viability-policy.json routing.replay.json \
  --as-of 2026-09-15T00:00:00.000Z \
  --relation-pack relation-packs/routing.json \
  --projection examples/routing/projection.json

metamap replay routing.replay.json
```

`capture` requires one explicit `--as-of` time. It accepts repeatable
`--relation-pack`, `--projection`, and `--changed` arguments and an optional
`--context` file. It writes a new bundle to the requested path, or JSON to
standard output. An existing output file is never overwritten.

`replay` reads only the bundle and the installed executor. It prints a result
with `status: verified` when compilation and projection results match exactly,
and a separate `admitted` flag. Both commands exit 0 only when the evaluation is
admitted, 1 for replay failure or reproduced rejection, and 2 for incomplete
usage. A rejected candidate is still captured for inspection when its inputs
match the portable contracts and dependency requirements.

## Executor and input completeness

Version 1 uses only built-in constraint evaluators. Custom evaluator registries
are explicitly unsupported. Unknown constraint kinds remain compiler errors.
No bundle field names a script or executable to import; replay uses the
installed compiler and registered JSON relation packs.

The compiler identity includes package version, source or distribution format,
compiler and schema file contents, transitive dependency contents, Node and ICU
versions, and default collation locale. Source execution and packaged JavaScript
are different executors. A mismatch produces `REPLAY_COMPILER_MISMATCH`; replay
never substitutes a newer executor silently. Replaying elsewhere requires the
same captured executor and runtime identity.

The bundle embeds exact pack contents, including the built-in core pack. Graph
pack references with digests must match those contents. Core substitutions,
missing or conflicting packs, duplicate projection IDs, malformed inputs, and
content-address mismatches reject replay.

External locators remain references. The compiler checks supplied evidence
records; it does not fetch or rerun an evidence producer. Captured graph
metadata may contain source fingerprints and adapter versions, but replay is
not a claim that the original raw sources can be reconstructed.

## TypeScript API

```typescript
import {
  captureReplayBundle,
  replayMetamap,
  stableJson,
} from "@roryscot/metamap";

const bundle = captureReplayBundle(graph, policy, {
  evaluatedAt: "2026-09-15T00:00:00.000Z",
  context: { environment: "production" },
  relationRegistry,
  projections: [projectionSpec],
});

const serialized = stableJson(bundle, true);
const result = replayMetamap(JSON.parse(serialized));
if (result.status === "verified" && result.admitted) {
  // Inspect the reproduced generation and projections.
}
```

Capture clones its inputs and returns a frozen bundle. It preserves existing
generation semantics and identifiers. Replay evaluates a private clone and
performs no source, evidence, output, or activation writes.

## Semantic profile 2.0

Policy 2.0 selects a replay 2.0 bundle. The same `captureReplayBundle` and
`replayMetamap` APIs and CLI commands dispatch explicitly on the version. Each
requested projection must also use spec 2.0 and name its consumer and budget
decision. The bundle binds the complete semantic policy, full pack values,
checked proofs and dependencies, original context/time, consumer specs and
generation/projection/path-tree 2.0 outputs. Removing a proof or changing an
expected output rejects replay even after the outer bundle is rehashed.

Use `parseSemanticReplayBundle` or `parseSemanticReplayJson` for the new contract.
The JSON reader and CLI reject duplicate decoded keys. New sidecars use
JCS/SHA-256 and cover `$schema` when present; graph 2.0 references retain their
legacy digest rule. `sourceSnapshot: null` and `sourceReceipts: []` explicitly
record absent captured source lineage. Partial lineage rejects with
`REPLAY_SOURCE_CAPTURE_NOT_IMPLEMENTED`; complete source capture uses replay 3.0.
No raw source fetch or rediscovery is implied by reproducing the captured graph.

Typed assessments, requirements and budgets execute through the same compiler
and proof engine. Replay supplies its full captured policy/evidence when
rechecking a typed projection. A required unknown dimension or excess cost
remains a reproduced rejection, with no invented zero cost or replacement view.
All replay profiles require the exact installed built-in executor, preserve
rejected evaluations and perform no activation.

Run `npm run example:relations` for checked derivations through a generated
native consumer, nested tree, exact replay and a removed-premise comparison.
Run `npm run example:uncertainty` for evaluated consumer cost, typed evidence,
the same graph under tolerant/strict policies and a reproduced rejection.

## Complete source profile 3.0

Supply `sourceCapture` to `captureReplayBundle` with policy 2.0, or use the CLI's
`--source-capture` option, to select replay 3.0 explicitly. The bundle binds a
complete source-capture 1.0 sidecar, its derived receipt/snapshot records and
the source/candidate graph relationship. Policy, generation, projection and
path tree retain version 2.0. Rejected candidates preserve the same provenance.

Use `parseSourceReplayBundle` or `parseSourceReplayJson` for this profile.
`replayMetamap` dispatches without source reads, named adapter execution or
current input substitution. `metamap provenance` inspects recorded lineage;
current rediscovery requires a separately selected workspace and explicit local
roots. Its freshness, authentication, authorization and active-state fields
are distinct from successful graph replay. Run `npm run example:provenance` and
see [PROVENANCE.md](PROVENANCE.md) for complete operations and limitations.

## Compatibility

The legacy replay sidecar schema is version 1.0.0. Package 0.7.0 added it without changing
graph 2.0.0, viability 1.0.0, generation 1.0.0, projection 1.0.0, or path-tree
1.0.0 contracts. The opt-in 2.0 schema has a separate identity and does not
rewrite those legacy schemas or digests. An old capture still requires its exact
old executor; the current compiler cannot silently substitute for it.
Existing callers do not need replay bundles. Schema references
are registered locally; validation performs no implicit network fetch.

Run `npm run example:replay` for a CLI round trip, tampering failure, reproduced
rejection, and output-overwrite protection in a disposable directory.
