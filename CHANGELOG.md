# Changelog

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
