# Captured source provenance

P08 adds a complete source capture using the existing configuration,
`AdapterResult` records and discovery snapshot. See `BUILD_PLAN.md` for the
verified scope and remaining governance work.

The new source-capture sidecar is version 1.0.0. It retains the full source
configuration, adapter outputs, source-composed graph and relation-pack values.
Receipts bind each configured source to its revision, adapter ID/version,
configuration digest, input byte digests and emitted shard digest. Offline
inspection reconstructs the source graph with the existing workspace composer
and correspondence materializer. It never executes an adapter from a capture.

Replay/comparison 3.0.0 explicitly add that complete capture. Their compiler,
policy, generation, projection and path-tree contracts retain their existing
versions. Published replay/comparison 1.0.0 and 2.0.0 schemas, receipt 1.0.0 and
snapshot 1.0.0 remain byte-for-byte unchanged. A partial receipt list is not a
complete source capture and remains an explicit error in replay 2.0.0.

The captured source graph and evaluated candidate graph have separate bindings.
Their difference is reported; candidate changes do not acquire source
attribution merely by sharing a replay bundle. A reproduced evaluation can be
rejected. Recorded lineage, authentication, current authorization and active
state are separate properties.

Raw inputs are not embedded. Offline inspection reports source rediscovery as
unavailable. Explicit current-source inspection uses only a caller-selected
local workspace and permitted roots, checks lexical and resolved paths, runs
installed built-in adapters without reading or writing caches, and reports
source, configuration, adapter, input, pack and shard changes. Capture locators
never authorize filesystem reads or network fetches.

Acceptance requires admitted and rejected capture/replay, rehashed receipt and
source-binding tampering, missing dependencies, candidate/source differences,
current-source changes, denied locators and symlink escapes, and read-only
inspection. Existing examples, legacy compatibility pins and evaluation
protocols/results must remain unchanged. Authentication and protected
activation are P09/P10 and remain outstanding.

## Capture and inspect

```sh
metamap sources examples/provenance/metamap.config.json sources.json \
  --allow-root .
metamap provenance sources.json
metamap provenance sources.json \
  --workspace examples/provenance/metamap.config.json --allow-root .
metamap capture examples/provenance/generated/graph.json \
  examples/provenance/generated/policy.json evaluation.json \
  --source-capture sources.json --relation-pack examples/relations/pack.json \
  --projection examples/provenance/generated/spec.json \
  --context examples/provenance/context.json --as-of 2026-10-10T00:00:00.000Z
metamap replay evaluation.json
metamap provenance evaluation.json
```

The context must match the proof's captured context. The example uses
`{"environment":"example"}`, recorded in `examples/provenance/context.json`.
`npm run example:provenance` performs the complete
SDK workflow, including accepted/rejected replay and native consumer execution.
Capture/report output files use exclusive creation; existing files are preserved.

`sources` writes only its requested capture. `provenance` writes nothing. Offline
inspection exits 0 for valid recorded bindings. Explicit current inspection
exits 0 for unchanged values/bytes, 1 for changes and 2 for unavailable
rediscovery. Invalid captures, denied source reads and other command failures
use the CLI's existing error exit 1; incomplete invocation uses 2. A verified
rejected evaluation remains a replay exit 1.

## Bindings and limits

The sidecar contains `config`, ordered `adapters`, complete `relationPacks` and
the source-composed `graph`; these are the existing records, with one configured
source per adapter result. Receipts and the snapshot are derived from them.
Replay 3.0 stores the complete capture, those exact derived receipts/snapshot,
the candidate evaluation inputs and its recomputed source inspection.

Source-capture 1.0 defines portable pack references as
`repo:` followed by the percent-encoded configured pack path. Read-only capture
selects `portablePackUris: true` in the existing workspace assembler. Ordinary
legacy workspace output keeps its relative pack references; executable packs
2.0 always receive portable URIs and cannot replace a conflicting or absent
explicit shard pack digest. Captured adapter documents must satisfy graph 2.0's
portable schema; a legacy shard with a relative pack URI must be migrated
explicitly before complete capture. No graph URI grants a read permission.

The snapshot retains its existing legacy value digests for graph and complete
configuration. Receipt configuration digests use JCS for the complete per-source
configuration; shard digests retain graph 2.0's legacy convention. A declared
shard revision is recorded as declared. If absent, the receipt uses a JCS digest
of source ID, adapter ID/version, source configuration digest and input records.
Receipt/capture digests cover every member, including `$schema` when present,
except their own `id`/`digest`. Rehashing a wrong receipt cannot make it agree
with its full captured records or old expected replay output.

Input locators are nonempty repository-relative portable paths, with no absolute
path, protocol, traversal, duplicate path or control character. Source inspection
uses separately provided permitted roots for the selected current configuration,
repository, source files/directories and packs. It checks resolved paths for
symlink escapes before adapter reads and compares discovered input digests with
raw file bytes afterward. Directories are checked conservatively in full. The
initial current-source profile runs only installed built-in adapters, never code
named by a capture; programmatically captured custom adapter outputs can still
be inspected and replayed offline. Filesystem inspection is an observation of
the selected local workspace, not a transaction locking another writer.

`createSourceCapture(config, discovery, registry)` records already obtained
adapter outputs; it neither checks their raw bytes nor executes their adapters.
Use discovery's portable pack profile and supply its exact registry. The
`captureWorkspaceSources(configPath, { permittedRoots })` operation explicitly
obtains fresh built-in outputs and checks byte fingerprints without cache I/O.
`inspectCurrentSources` compares a separately selected workspace with an
existing capture. Source changes report workspace/source scope, component and
before/after digests, including source addition/removal, configuration, adapter,
revision, inputs, shard, packs and composed graph.

Graph metadata changes can change the source/candidate digest relationship
without changing entity/mapping/authority records. `graphChanges` describes those
records; `relationship` compares the full graph digests. Candidate overlays are
explicit and remain separate from their source baseline. Compilation can admit
an explicit hypothetical candidate while inspection shows that its values
differ from the captured sources. Protected governance must decide whether
that exact candidate is authorized to become active.

Content addressing is not authentication. A party able to replace a capture
and all of its expectations can create a different internally consistent
record. External trusted grants and signed approvals must bind the exact
candidate and provenance; that protection is P09/P10. Recorded input hashes
also do not establish scientific truth or physically causal relationships.
