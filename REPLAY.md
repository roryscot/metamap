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

## Compatibility

The replay sidecar schema is version 1.0.0. Package 0.7.0 adds it without changing
graph 2.0.0, viability 1.0.0, generation 1.0.0, projection 1.0.0, or path-tree
1.0.0 contracts. Existing callers do not need replay bundles. Schema references
are registered locally; validation performs no implicit network fetch.

Run `npm run example:replay` for a CLI round trip, tampering failure, reproduced
rejection, and output-overwrite protection in a disposable directory.
