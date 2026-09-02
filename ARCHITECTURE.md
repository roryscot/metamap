# Metamap architecture

## Purpose

A Metamap is a canonical index of identities, structural correspondences,
authority boundaries, and derivation rules. Referenced systems remain
authoritative for their own data.

Metamap is a graph of references between structures, not a universal tree. It
contains enough evidence to answer which structure owns a particular fact,
whether projections have drifted, and what a structural change can affect.

## Processing boundary

```text
domain sources -> language/domain adapters -> independent graph shards
                                             -> deterministic composition
                                             -> explicit correspondence overlay
                                             -> validation + baseline diff
viability policy + evaluation context -------+-> viability compiler
                                                  -> immutable generation
                                                  -> atomic activation
                                                  -> queries, reports, projections
```

Parsing is necessarily source-specific. A TypeScript adapter may use the
compiler API and a Python adapter may use `ast`; both interoperate by emitting
the same language-neutral graph document. The runtime `AdapterRegistry` accepts
consumer adapters without editing the kernel. Processes written in other
languages can instead publish a portable document and enter through the
`metamap-shard` adapter.

## Core model

### Entity and locator

An entity has a stable semantic identity and an open `kind`. Physical paths,
symbols, URLs, and database locations are resolvable locators rather than
identity. Moving a file can therefore preserve the entity it represents.

```text
urn:example:concept:item-domain
urn:example:element:database:model:Item:field:title
urn:example:element:schemas:schema:itemSchema:field:title
```

### Structural mapping

A mapping is a first-class, potentially n-ary correspondence. It declares a
typed relation, directional endpoints, cardinality, lossiness, an optional
transformation, invariants, and provenance. Relations come from versioned packs
that constrain endpoint kinds and composition semantics.

The engine does not infer semantic equivalence merely because names match or
because mappings form a path.

### Fact-scoped authority

Authority belongs to facts rather than entire files. The same concept can have
one structure owning persistence type, another public presence, and another its
display label.

- `canonical` is authoritative for the stated facts.
- `delegated` is a fact-scope-preserving handoff from `delegatedFrom`.
- `candidate` is discovered or imported ownership awaiting a decision.

Delegation may narrow but not widen scope. Resolution returns the canonical
root and effective leaf owner and rejects overlapping canonical or delegated
branches.

### Provenance

Mappings and authority declarations identify whether they were declared,
observed, generated, or inferred, who asserted them, and—when available—their
source revision and confidence.

### Viability policy and generation

The graph is the stable structural substrate; environment-specific expression
belongs in a separate viability policy. The policy gives every mapping explicit
coverage, determinism, reversibility, activation and inhibition conditions,
constraints, evidence, and temporary waivers.

Compilation is fail-closed. A candidate becomes an immutable,
content-addressed generation only after graph validation, policy binding,
context resolution, constraint evaluation, evidence checks, waiver expiry, and
impact analysis all succeed. Activation preserves the last viable generation
if the candidate is rejected.

This separation permits variation without permissiveness: one graph can have
different valid expressions in development and production while missing
context, unknown lossiness, contradictory evidence, and invalid composition
fail immediately.

## Discovery and correspondence

Each source adapter has a small deterministic contract:

```text
fingerprint(config, context) -> content-addressed inputs
discover(config, context)    -> graph shard + diagnostics
```

Built-in and consumer adapters use the same registry and cache path. Unknown
adapter identifiers fail before discovery and list the registered choices.
Adapter-defined configuration fields and structure kinds remain open, while
the shared workspace envelope is validated by the portable configuration
schema.

Domain relation packs are also portable inputs. A workspace loads their JSON
documents explicitly, registers their semantics for validation and impact
analysis, and records their paths and content digests in the composed graph.
Direct graph commands require explicit repeatable `--relation-pack` arguments;
the CLI never fetches or executes a relation pack implicitly.

Discovery observes structure but never establishes equivalence. Workspace
configuration supplies the semantic join: explicit structure and field pairs,
compared facts, coverage rules, transformations, reviewed differences, and
fact authority.

This separation is the language-agnostic boundary. Source knowledge stops at
the adapter; graph semantics do not depend on the implementation language.

## Validation

The kernel and workspace gate validate:

1. Supported document and configuration versions.
2. Globally unique entities, mappings, authorities, and locators.
3. Resolvable endpoints and authority references.
4. Relation endpoint kinds and cardinality.
5. Canonical authority uniqueness per concept and fact.
6. Delegation ancestry, scope narrowing, cycles, and branch overlap.
7. Candidate authority that still needs a human decision.
8. Relation cycles forbidden by the active pack.
9. Declared structure and field existence and configured coverage.
10. Type, presence, nullability, cardinality, and enum-value drift.
11. Stale or incomplete difference waivers.
12. Stable-ID changes from the committed graph baseline.
13. Complete viability declarations for every mapping.
14. Required context and declared transform guarantees.
15. Executable constraints and contradictory evidence.
16. Exact waiver scope and expiry.

Errors fail generation and CI. Warnings can preserve a usable imported graph
while keeping unresolved migration debt visible.

## Federation and scale

Adapters emit independent shards. Composition deduplicates equal identities and
rejects conflicting definitions and incompatible relation-pack versions.
Content fingerprints cache unchanged adapter results, so a source edit
invalidates only its shard. Snapshots bind outputs to configuration, adapter
versions, and source digests.

The reference implementation keeps a repository-scale graph in memory with
indexes by identity, relation, kind, locator, and authority scope. Larger
systems can persist the same documents in relational, graph, or search indexes
and ingest changed shards independently.

The `metamap-shard` adapter is the federation seam: a separately versioned
service, repository, or language runtime owns discovery and publishes only the
portable graph it observed. Metamap revalidates that shard after composition
against the workspace's exact relation-pack registry.

Scaling does not require changing the authority or correspondence model. It
adds operational federation:

- ownership-domain shard partitioning;
- signed or content-addressed shard publication;
- schema and relation-pack compatibility checks at ingestion;
- lazy locator resolution;
- reverse-impact indexes and event-driven incremental validation.

Relations additionally declare causal `impactDirection`. This avoids assuming
that graph traversal and failure propagation are the same. Incremental
validation begins with changed subjects, follows active causal edges, and
reports the path through each mapping to the affected structure.

## Consumer boundary

The reusable repository owns schemas, core semantics, generic adapters, the
CLI, and the reference implementation. A consuming repository owns its:

- `metamap.config.json`;
- semantic correspondences and authority decisions;
- source manifests and adapter inputs;
- generated graph, snapshot, drift report, and documentation;
- CI policy deciding which drift severities fail.
- viability policies, contexts, evidence producers, and activation state.

This keeps the engine general while the structural source of truth remains next
to the system it describes.
