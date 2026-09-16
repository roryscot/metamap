# Changelog

## 0.6.0

- Explain the kernel as a versioned persistent hypergraph of correspondences
  whose validated generations materialize into static runtime views.
- License the kernel, schemas, relation packs, CLI, and built-in adapters under
  Apache-2.0. Consuming graphs and policies remain owned by their repositories.
- Compile nested path-tree projections from viable graph generations, restoring
  the original `_` path-map DX as an immutable generated artifact.
- Fail closed on missing path attributes, colliding paths, reserved `_`/`$`
  segments, and undeclared path-tree specifications.
- Add `metamap link --format path-tree` and `--format path-tree-typescript`
  with a dependency-free hydrate helper for `:param`, `*param`, and optional
  `*param?` templates. Catch-all values may contain `/`; singular params may
  not.
- Leave unrelated ancestor utilities (HTML escaping, HTTP status maps, React
  keys, CSS helpers) out of the kernel.

## 0.5.0

- Restore and formalize Metamap's original exhaustive application-routing
  invariant: every discovered leaf is mapped, explicitly excluded with
  provenance, or rejected.
- Add the `application-topology` relation pack for route implementations,
  containers, outlets, content, contexts, data, parameters, middleware,
  fallbacks, and hydration.
- Add dynamic totality, reachability, and context-dominance constraints.
- Add closed-world mapping selectors so enormous graphs do not require one
  repeated viability record per generated mapping.
- Add deterministic Next.js App Router discovery for rendering structure,
  providers, loader entry points, route handlers, exact reviewed exclusions,
  and stale-exclusion detection.
- Add a runnable end-to-end application-topology example and generated static
  projections.

## 0.4.0

- Reframe Metamap as a language-neutral semantic linker with a dynamic control
  plane and immutable generated runtime structures.
- Add a generic, fail-closed static projection compiler bound to exact graph,
  viability-generation, and projection-specification digests.
- Enforce projection selection, relation registration, runtime cardinality,
  target kinds, active mappings, and lossless-by-default linkage.
- Add `metamap link` with content-addressed JSON and typed, dependency-free
  TypeScript output.
- Add portable projection-specification and projection schemas plus runtime
  parsing and integrity validation.
- Add a routing relation pack and an end-to-end command-routing example that
  replaces a duplicated enum and registry with a generated lookup table.

## 0.3.0

- Replace the hard-coded workspace adapter switch with an extensible runtime
  `AdapterRegistry` while retaining a fresh default registry per workspace.
- Open adapter-owned source configuration and structure kinds without weakening
  the validated workspace envelope.
- Add the `metamap-shard` adapter for content-addressed ingestion of portable
  graph documents emitted by any language or service.
- Load portable domain relation packs from workspace configuration and support
  repeatable `--relation-pack` options in direct graph commands.
- Add the `research` relation pack, keeping assumptions, entailment,
  prediction, testing, evidential support, contradiction, competition, scope,
  recovery, and refinement semantically distinct.
- Add a fail-closed Research Machine-style federation and viability example.
- Remove array-shifting from graph and impact breadth-first traversal so large
  traversals remain linear.

## 0.2.0

- Add the language-neutral viability policy and generation contracts.
- Add context-dependent mapping activation and inhibition.
- Add strict mapping declarations for coverage, determinism, reversibility,
  and explicit graph-level lossiness.
- Add first-class evidence, executable core constraints, and scoped expiring
  waivers.
- Add causal blast-radius analysis with relation-specific impact direction.
- Add deterministic content-addressed generation compilation.
- Add in-memory and durable fail-closed activation that retain the last viable
  generation after rejection.
- Add `compile`, `impact`, and `promote` CLI commands.

## 0.1.1

- Include compiled distribution files in release archives for direct HTTPS
  installation.

## 0.1.0

- Initial relationship graph, authority, adapters, workspace validation, and
  CLI release.
