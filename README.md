# Metamap

Metamap is a language-neutral semantic linker. It describes references between
structures, their explicit correspondences, and authority over individual
facts, then compiles viable graph generations into static runtime projections.
It helps large systems replace duplicated cross-system enums and registries
without copying every source into one universal data model.

The governing rule is:

> One authority per fact and scope; many validated or generated projections.

The practical runtime rule is:

> Dynamic composition in the control plane; immutable generated structures in
> the data plane.

## What it provides

- Portable JSON schemas for graph documents, workspace configuration, and
  relation packs.
- Stable semantic identities separated from physical file and symbol locators.
- First-class, directional, potentially n-ary structural mappings.
- Canonical, delegated, and unresolved candidate authority at fact scope.
- Deterministic composition and validation of independently emitted shards.
- Content-addressed adapter caching, snapshots, stable-ID diffs, and drift
  reports.
- A runtime adapter registry for consumer-defined discovery without changes to
  the core package.
- Portable graph-shard ingestion so any language or service can participate in
  federation by emitting the JSON contract.
- Workspace-loaded relation packs, including a research vocabulary that keeps
  formal entailment, prediction, testing, support, and contradiction distinct.
- Context-dependent mapping activation and inhibition without changing the
  underlying identity graph.
- Executable constraints, first-class evidence, and exact expiring waivers.
- Fail-closed compilation into immutable viable generations with causal impact
  paths and atomic last-known-good activation.
- Cardinality-checked static projections that turn active semantic mappings
  into content-addressed JSON manifests or typed TypeScript lookup tables.
- A routing relation pack for commands, events, routes, handlers, schemas,
  authorization policies, endpoints, and workflow transitions.
- Read-only Prisma, TypeScript/Zod, JSON collection, legacy catalog, and
  portable Metamap shard adapters.
- A CLI and TypeScript API for generation, checking, traversal, diffing, and
  authority resolution.

Parsing remains language-specific at adapter boundaries. The graph, relation,
authority, configuration, and drift contracts are language-neutral, so other
implementations can emit or consume the same JSON documents.

## Quick start

Requires Node.js 20 or newer.

```bash
npm install
npm test
npm run example:generate
npm run example:check
npm run example:compile
npm run example:research
npm run example:routing
```

The runnable example under `examples/workspace/` maps a Zod `itemSchema` onto a
Prisma `Item` model and assigns persistence facts to Prisma.

For a consuming repository, install the tagged public archive:

```json
{
  "dependencies": {
    "@roryscot/metamap": "https://github.com/roryscot/metamap/archive/refs/tags/v0.4.0.tar.gz"
  }
}
```

Release tags include compiled `dist/` artifacts so public consumers do not need
Git credentials or an install-time TypeScript build.

Then create a `metamap.config.json` and run:

```bash
metamap generate metamap.config.json
metamap check metamap.config.json
```

Generation refuses to replace a baseline when discovery, correspondence, or
graph validation has errors. `check` never accepts changes; it compares current
discovery with the committed baseline and returns a nonzero status for governed
drift.

## CLI

```text
metamap validate <graph.json> [--relation-pack pack.json]...
metamap compile <graph.json> <policy.json> [output.json] [--context context.json] [--as-of timestamp] [--changed id]... [--relation-pack pack.json]...
metamap promote <graph.json> <policy.json> <current-generation.json> [--context context.json] [--as-of timestamp] [--changed id]... [--relation-pack pack.json]...
metamap impact <graph.json> <policy.json> <subject-id...> [--context context.json] [--as-of timestamp] [--relation-pack pack.json]...
metamap link <graph.json> <generation.json> <projection-spec.json> [output] [--format json|typescript] [--export name] [--relation-pack pack.json]...
metamap generate <metamap.config.json> [--no-cache]
metamap check <metamap.config.json> [--no-cache]
metamap diff <before.json> <after.json> [--relation-pack pack.json]...
metamap trace <graph.json> <entity-id> [incoming|outgoing|both] [depth] [relation] [--relation-pack pack.json]...
metamap authority <graph.json> <concept-id> <fact> [--relation-pack pack.json]...
metamap migrate-sources <sources-of-truth.json> [output.json]
```

## TypeScript API

```typescript
import {
  MetamapActivator,
  MetamapGraph,
  compileMetamap,
  compileProjection,
  composeMetamapDocuments,
  emitTypeScriptProjection,
  validateMetamapDocument,
} from "@roryscot/metamap";

const validation = validateMetamapDocument(document);
const graph = new MetamapGraph(document);

const impact = graph.trace("urn:example:concept:item", {
  direction: "both",
  maxDepth: 3,
});

const authority = graph.resolveAuthority("urn:example:concept:item", "type");

const compiled = compileMetamap(document, viabilityPolicy, {
  context: { environment: "production" },
  evaluatedAt: new Date().toISOString(),
});

const activator = new MetamapActivator();
const activation = activator.activate(document, viabilityPolicy, {
  context: { environment: "production" },
});

if (compiled.status === "viable") {
  const linked = compileProjection(
    document,
    compiled.generation,
    projectionSpec,
  );
  if (linked.status === "projected") {
    const source = emitTypeScriptProjection(linked.projection, {
      exportName: "commandRoutes",
    });
  }
}
```

## Replacing enums and routing registries

Use Metamap for open, cross-boundary identities and relationships: commands,
events, handlers, schemas, permissions, endpoints, plugin capabilities, and
workflow transitions. Keep native enums and data structures for closed local
values and hot-path computation.

A projection specification selects semantic subjects and names relation slots
with explicit cardinality. `metamap link` resolves only mappings active in the
provided viable generation. It rejects stale generations, missing or ambiguous
required targets, wrong target kinds, unknown relations, and lossy links unless
the slot explicitly permits them.

```bash
metamap compile graph.json viability.json generation.json \
  --relation-pack relation-packs/routing.json
metamap link graph.json generation.json projection.json command-router.ts \
  --format typescript --export commandRoutes \
  --relation-pack relation-packs/routing.json
```

The generated object keys become a TypeScript identity union, so consumers do
not maintain a second enum. The runtime performs a constant-time lookup and
never traverses the graph. See [ROUTING.md](ROUTING.md) and the runnable
[`examples/routing`](examples/routing) project.

## Extending discovery and relations

`metamap.config.json` accepts adapter-defined source fields and open structure
kinds. Register a consumer adapter through the TypeScript API while preserving
the built-ins:

```typescript
import {
  createDefaultAdapterRegistry,
  discoverWorkspace,
} from "@roryscot/metamap";

const adapters = createDefaultAdapterRegistry().register(myAdapter);
const discovery = await discoverWorkspace(loadedConfig, {
  adapterRegistry: adapters,
});
```

Adapters in other languages do not need to run inside Node. Emit a document
matching `schemas/metamap-graph.schema.json`, then ingest it with the
`metamap-shard` adapter. Fingerprints and cache keys still cover the complete
portable shard.

Workspace configuration can load domain relations without modifying the core:

```json
{
  "relationPacks": ["relation-packs/research.json"],
  "sources": [
    {
      "id": "research-machine",
      "adapter": "metamap-shard",
      "path": "generated/research.graph.json"
    }
  ]
}
```

Pass repeatable `--relation-pack` options when directly validating, tracing, or
compiling a graph that uses non-core relations. The runnable
`examples/research/` workspace demonstrates a Research Machine-style claim
shard and compiles it only to the explicitly named `research-state` viability
level; that does not imply formal or empirical truth.

The graph describes stable relationships. A separate viability policy declares
which mappings may be expressed in a context and the guarantees, evidence, and
constraints required before activation. See [VIABILITY.md](VIABILITY.md) for
the complete fail-fast model and portable contracts.

## Design boundaries

Metamap records identity, relationship, authority, provenance, and structural
facts needed for validation. It deliberately does not:

- store arbitrary referenced domain data;
- infer equivalence from matching names;
- choose authority merely because a file exists;
- rewrite source files from inferred relationships;
- require every system to share one hierarchy or implementation language.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the model and scale strategy and
[CONTRIBUTING.md](CONTRIBUTING.md) for development instructions. Release notes
are in [CHANGELOG.md](CHANGELOG.md).
