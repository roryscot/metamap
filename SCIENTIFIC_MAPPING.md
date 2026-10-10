# Scientific mapping profile

MetaMap imports one explicitly selected local SSSOM 1.0 entity TSV profile.
This gives ontology references stable expanded IRI identities and assertions
explicit bindings, while keeping discovery, admission and executable expression
separate. It does not establish scientific truth or biological identity.

## Input and identities

Register `sssom-tsv` in an ordinary MetaMap configuration. Its narrow source
contract is `schemas/metamap-sssom-source.schema.json`, with `id`, `adapter`,
`path`, `formatVersion: "1.0.0"` and `sourceRevision`. Optional `metadataPath`
selects explicit local external YAML metadata. `recordIdColumn` selects unique
source assertion IDs. `provenance` carries caller-declared selection/attribution
context bound into the existing configuration, receipts and captured shard.
The published open MetaMap config contract remains unchanged.

Paths are local. Source inspection requires caller-supplied permitted roots and
checks both TSV and external metadata paths before reading. No remote source,
ontology or prefix lookup occurs. Every input byte digest, source revision,
adapter/configuration, complete emitted shard and selected relation pack is
captured by the existing provenance/replay 3.0 contracts. The compiler fingerprint
also covers bundled relation-pack bytes consumed by this adapter.

`parseSssomTsv`, `parseSssomDocument`, `interpretSssomDocument` and
`exportSssomTsv` are pure public functions. Raw metadata, decoded cell strings,
all supported fields, original CURIEs, expanded references and field origins are
retained. Built-in prefix redefinitions and unknown prefixes reject; identifiers
are case sensitive. Labels and physical file paths do not define entity identity.

Anonymous assertion IDs bind effective content, expanded references, scoped
source, set-only context and duplicate occurrence. Reordering identical records
preserves the ID set; changing anonymous assertion content changes its identity.
When a unique explicit record ID is selected, content changes retain that scoped
assertion identity. Repeated subject/predicate/object/justification tuples are
distinct assertions, with their complementary metadata preserved.

## Bounded format support

The authoritative SSSOM schema is v1.0.0, commit
`658de421c21a686f1213ff41879c9245ac0b4925`. Unmodified LinkML YAML and its BSD-3
license are in `standards/sssom-1.0.0/`; the exact generated draft-2019-09 JSON
schema is also packaged. Validation selects its `MappingSet` definition.
The generated slot index records the YAML digest and propagation annotations.

Metadata uses YAML 1.2 with duplicate keys, directives, tags, anchors and aliases
rejected. TSV quoting supports embedded tabs, line breaks and quotes; UTF-8 is
strict and a BOM rejects. Multi-values retain their declared separator meaning.
Set-to-record propagation occurs only when no individual row supplies that slot.
Condensation is off by default and must be explicitly selected; it applies only
to eligible common values and reports changed origins. Export checks effective
records, retained set context, prefixes and extension definitions, and emits a
loss report. Serialization may change; raw source byte identity is separate.

Defined scalar extension slots and type hints are retained. Undefined columns,
compound extensions, malformed values and missing mandatory core fields reject
explicitly. Literal, unmapped (`sssom:NoTermFound`) and negated records are
outside this entity profile and reject before graph construction. This narrower
profile does not claim universal SSSOM support or silently discard unknown data.

## Relations, uncertainty and admission

The bundled scientific SKOS pack uses an explicit predicate lookup for
`exactMatch`, `closeMatch`, `broadMatch`, `narrowMatch` and `relatedMatch`. These
remain separate internal relations. Unknown predicates retain an uninterpreted,
unregistered relation and cannot become checked bindings without an explicit
consumer semantics registration.

The pack declares exact transitivity/symmetry, close/related symmetry,
broad/narrow inversion, the exact-to-close consequence and relevant disjointness.
It supplies bounded reverse laws and one exact chain law. Close, broad, narrow
and related chaining have no default executable laws. No `owl:sameAs` is inferred.
[Normative SKOS mapping semantics](https://www.w3.org/TR/skos-reference/#mapping)
control these rules; pragmatic chaining assumptions need a different named profile.

Imported mappings retain **unknown lossiness**. Raw replay reproduces their
rejection under the existing admission guard. Source confidence remains raw
metadata; it does not become calibrated probability, typed evidence support,
authenticated ownership or approval. All six uncertainty dimensions remain
unknown unless the consumer supplies actual supported assessments.

The example selects a separate exploratory candidate declaring each of the
seven assertions lossy, irreversible and acceptable under its own ordinal costs:
exact 1, close 4, broad/narrow 2, related 5; total 18. These are policy costs,
not probabilities. A supported-identity requirement rejects; budget 17 rejects
the projection. The same source bytes remain unchanged.

A normative broad-to-narrow inverse proof is validated and retained in replay,
but its derived expression is explicitly inactive. Executing reversal requires a
reversible premise; declaring a lossy mapping reversible also rejects. The example
tests that negative boundary rather than relabeling a source lossless. Native
lookup execution preserves all seven original assertion IDs and justifications,
including two narrow assertions with the same core tuple and different metadata.

## Provenance package

`createScientificCrate` and `verifyScientificCrate` implement the closed,
single-source MetaMap scientific profile over [RO-Crate 1.2](https://www.researchobject.org/ro-crate/specification/1.2/).
They reuse checked replay and deterministic artifact preparation. The flat JSON-LD
metadata includes a self-describing descriptor, Dataset root, date, license,
source attribution, complete file inventory, sizes, SHA-256 values and external
references. Files include captured source/receipts, policy/proofs, generation,
projection, native TypeScript, replay, SSSOM export and loss report.

Supplied UTF-8 source payloads must match receipt hashes and, when complete,
the captured interpreted document. Omitted raw inputs are labeled references;
the full original producer URL remains external. Neither operation fetches
payloads or JSON-LD contexts, reads source paths, signs, approves or activates.
Verification recomputes the entire closed inventory and native outputs and
rejects substituted metadata, missing/extra files and tampered bytes. This is
declared-profile verification, not a universal RO-Crate validator. Independent
JSON-LD validation can use pinned official context bytes offline.

## Licensed fixture and independent conformance

The public fixture is seven records of the 1564-record MGI source at commit
`e4fe727428661f0093f6ab9269f4fb80387e39fc`, retaining exact producer metadata,
header and selected record bytes. The selection manifest records the full/subset
hashes, original record indices, changes, license and scope. The producer declares
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) and five creator IDs.
The source description explicitly ignores species restrictions; this context
remains visible. Original mapping-set identity does not establish subset completeness.

Pinned SSSOM-py 0.4.17 with sssom-schema 1.0.0 independently passed default parsing
and full JsonSchema, PrefixMapCompleteness and StrictCurieFormat validation of the
source and both exports. Independent TSV/YAML parsing preserved complete default
export metadata/cells; unknown-prefix validation rejects. The pinned checker's
strict parser reverses its valid-metadata flag and rejects valid metadata, so
strict-parser success is not claimed. Its built-in-prefix predicate detects
collisions although default parsing only warns. MetaMap rejects collisions.
The independent checker was not patched and no validation category was disabled.

Run `npm run example:scientific-source` and `npm run example:scientific`.
The source example exercises five actual CLI outcomes. The consumer example
typechecks and imports the generated lookup, validates positive/negative policies
and crate boundaries, and preserves the source pin. Supply a **new** output
directory to either script to retain review artifacts; existing outputs are never
overwritten. Neither example establishes current authorization or active state.
