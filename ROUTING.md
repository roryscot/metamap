# Semantic routing

Metamap can replace static enums and registries when they duplicate semantic
relationships owned by multiple parts of a system. It remains a compiler, not
a dynamic service locator: applications execute ordinary generated structures.

## Boundary

Use a native enum when the values are closed, local, and intrinsic to an
algorithm or protocol. Use a Metamap identity when a value is open to extension
or must correspond to handlers, schemas, policies, endpoints, events, plugins,
or representations owned elsewhere.

```text
local closed value                 cross-boundary semantic identity
------------------                 --------------------------------
byte order                         command
parser state internal              public event
fixed wire-protocol constant       plugin capability
small algorithmic discriminator    workflow operation
```

The graph is the semantic control plane. The output of `metamap link` is an
immutable data-plane table suitable for constant-time lookup.

## Routing vocabulary

`relation-packs/routing.json` defines:

- `routing:handled_by`
- `routing:accepts`
- `routing:authorized_by`
- `routing:emits`
- `routing:exposed_as`
- `routing:transitions_to`

The vocabulary uses open graph entity kinds such as `routing:command`,
`routing:event`, `routing:route`, and `routing:handler`. Domain-specific packs
can add more relations without changing the projection compiler.

## Projection specification

A projection selects entities by stable identity, kind, or the intersection of
both. Each slot declares a relation, direction, runtime cardinality, optional
target kinds, and whether a lossy relationship is acceptable.

```json
{
  "schemaVersion": "1.0.0",
  "id": "urn:example:projection:commands",
  "select": { "kinds": ["routing:command"] },
  "slots": [
    {
      "name": "handler",
      "relation": "routing:handled_by",
      "direction": "outgoing",
      "cardinality": "exactly-one",
      "targetKinds": ["routing:handler"]
    }
  ]
}
```

Supported slot cardinalities are `exactly-one`, `zero-or-one`, `one-or-more`,
and `many`. They apply after contextual activation and target-kind filtering.
An empty `slots` array emits only the selected identities and metadata, which
is useful as an enum replacement whose TypeScript union is derived from graph
membership.

## Failure model

Linking fails before writing an artifact when:

- the graph or generation is invalid;
- the generation was compiled from a different graph digest;
- an active mapping is absent from the graph;
- the specification selects a missing entity or selects nothing;
- a relation is not registered;
- a required slot has no active target;
- a singular slot resolves more than one target;
- a target has a disallowed kind;
- an active link is lossy and the slot did not explicitly allow it.

This is intentionally stricter than a switch statement or dictionary. Missing
routes cannot silently fall through, and contextual deactivation cannot produce
a partial runtime router.

## Generated artifacts

JSON projections preserve the graph, generation, and specification bindings as
content digests. TypeScript projections contain a dependency-free `as const`
lookup, a key-derived identity union, and a resolver that throws on unknown
identities.

Target locators remain references. A consuming build integration can translate
locators into native imports, dependency-injection tokens, RPC descriptors, or
other runtime values. Those emitters belong at language or framework boundaries
rather than in the language-neutral kernel.

## Recommended adoption

Start with one duplicated command or event enum:

1. Give every semantic operation a stable URI-like identity.
2. Emit handlers, schemas, policies, and endpoints as entities from their
   owning packages.
3. Declare rather than infer their mappings.
4. Compile a viable generation in CI.
5. Link a checked projection and import the generated artifact.
6. Delete the duplicated enum and hand-maintained registry only after the
   generated path has equivalent tests.

The graph can then federate across repositories through `metamap-shard`
without changing runtime lookup behavior.

## Complete application topology

The routing pack expresses semantic operations. The complementary application
topology pack connects those operations to framework pages and containers,
content, context providers and requirements, loaders, parameter schemas,
middleware, fallbacks, outlets, and hydration boundaries. It also supplies
kind-selected totality, reachability, and context-dominance constraints, so a
newly discovered leaf fails before generation unless it is mapped or explicitly
excluded. See [APPLICATION_TOPOLOGY.md](APPLICATION_TOPOLOGY.md).
