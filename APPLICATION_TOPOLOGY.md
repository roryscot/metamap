# Application topology

An application topology is the strongest form of Metamap's original routing
use case: a declarative structure of logic that joins every governed routing
leaf to its implementation, containers, content, context, policy, data, and
hydration contracts.

The invariant is:

> For a declared universe and evaluation context, every discovered structural
> leaf is uniquely mapped, explicitly excluded with provenance, or rejected.

"Perfect" means total with respect to a declared and discoverable universe. It
does not mean enumerating infinitely many runtime values. A dynamic route such
as `/campaign/[id]` is represented by its stable route identity, parameter
schema, implementation, enclosing containers, loaders, policies, content
sources, context requirements, and hydration contract. `/campaign/42` is a
runtime binding validated against that structure.

## Dynamic without runtime ambiguity

Metamap is dynamic in three ways:

1. adapters continually rediscover independently owned source structures;
2. viability context activates or inhibits declared mappings;
3. an accepted candidate atomically replaces the previous viable generation.

Consumers still execute immutable generated projections. They never discover
handlers or traverse the entire topology on a request path. This preserves
constant-time lookup and ensures a partially valid candidate cannot leak into
runtime.

## Vocabulary

`relation-packs/application-topology.json` defines structural relations for:

- containment: `topology:contains`, `topology:wraps`,
  `topology:rendered_in`, `topology:has_outlet`, and
  `topology:fills_outlet`;
- semantic linkage: `topology:implemented_by`;
- content and context: `topology:resolves_content`,
  `topology:hosts_provider`, `topology:provides_context`, and
  `topology:requires_context`;
- data and parameters: `topology:loads`, `topology:parameterized_by`,
  `topology:produces`, and `topology:consumes`;
- execution boundaries: `topology:hydrates`, `topology:guarded_by`, and
  `topology:fallback_for`.

The pack permits open entity kinds including applications, segments, pages,
containers, outlets, components, content references, contexts, providers,
loaders, middleware, fallbacks, and hydration boundaries. Domain packs may add
relations without changing the kernel.

## Closed-world constraints

The default `ConstraintRegistry` includes three application-topology gates:

### `topology:relation-totality`

Selects subjects dynamically by kind and optional exact attributes, then
requires a relation cardinality after contextual activation. Supported
cardinalities are `exactly-one`, `zero-or-one`, `one-or-more`, and `many`.

Reviewed exclusions are allowed only when `allowExcluded` is true. An excluded
entity must contain non-empty `topologyDisposition: "excluded"`,
`exclusionReason`, and `exclusionOwner` attributes. An entity cannot be both
excluded and mapped through the excluded relation. Exclusions may name an
`exclusionRelations` list, so a leaf can be excluded from semantic governance
without suppressing independently observed facts such as rendering or
hydration. An unscoped exclusion applies to every relation and is therefore
intentionally difficult to satisfy.

This is the principal completeness gate. Because selection is by kind, a newly
discovered page is governed immediately; no one must first add its identity to
a static constraint list.

### `topology:reachable`

Requires every selected structural entity to be reachable from a declared
application root through an active containment relation. Orphaned routes,
containers, outlets, and boundaries fail compilation.

### `topology:context-satisfied`

For every selected subject, resolves its required contexts from the nearest
rendering container outward. Exactly one provider must exist at the nearest
scope depth. Nested providers may intentionally shadow outer providers, while
missing or same-depth ambiguous providers fail.

## Mapping rules at scale

Viability declarations may name one mapping or use a selector:

```json
{
  "select": {
    "relations": ["topology:contains", "topology:wraps"],
    "provenanceStatuses": ["observed"]
  },
  "coverage": "total",
  "determinism": "deterministic",
  "reversibility": "irreversible"
}
```

Selector fields are ANDed and values within a field are ORed. Selectors can
filter by mapping identity, relation, source kind, target kind, and provenance
status. A selector matching no mapping is stale; overlapping rules are
ambiguous. Both conditions fail compilation. This keeps large policies small
without weakening the one-viability-declaration-per-mapping invariant.

## Next.js App Router discovery

The built-in `nextjs-app-router` adapter observes:

- route segments, route groups, dynamic and catch-all parameters, parallel
  outlets, and intercepted segments;
- pages, layouts, templates, loading/error/not-found/default boundaries;
- client entry points and their hydration boundaries;
- mounted JSX providers and the contexts they provide;
- explicit data-loading entry points: `fetch`, TanStack Query hooks, SWR hooks,
  `generateStaticParams`, and `generateMetadata`;
- route-handler HTTP methods, handlers, and endpoints.

Loader discovery is deliberately syntactic and conservative. It records the
load boundary and source location without guessing the remote resource, cache
policy, returned schema, or semantic purpose. Applications can overlay those
facts explicitly with `topology:produces`, `topology:consumes`, content, and
policy relations.

The adapter does not infer that a semantic route is equivalent to a page merely
because paths or names match. A consuming application owns that correspondence.
Likewise, provider discovery observes availability; application overlays own
which contexts a route actually requires.

Exact exclusions live in adapter configuration:

```json
{
  "id": "web-app",
  "adapter": "nextjs-app-router",
  "root": "src/app",
  "exclusions": [
    {
      "path": "src/app/legacy/page.tsx",
      "reason": "Migration tracked by WEB-42",
      "assertedBy": "team:web-platform",
      "relations": ["topology:implemented_by"]
    }
  ]
}
```

When `relations` is omitted, the adapter defaults it to
`topology:implemented_by`, the semantic-governance boundary. Missing,
duplicate, invalid, or inapplicable exclusions are diagnostics. The exclusion
is attached to the discovered leaf, so deleting or renaming the file makes the
exception stale instead of silently broadening it.

See the runnable [`examples/application-topology`](examples/application-topology)
project for a complete graph, viability policy, and runtime projection.
