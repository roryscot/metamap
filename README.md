# Metamap

Metamap is a language-neutral graph for describing references between
structures, their explicit correspondences, and authority over individual
facts. It helps large systems detect structural drift without copying every
source into one universal data model.

The governing rule is:

> One authority per fact and scope; many validated or generated projections.

## What it provides

- Portable JSON schemas for graph documents, workspace configuration, and
  relation packs.
- Stable semantic identities separated from physical file and symbol locators.
- First-class, directional, potentially n-ary structural mappings.
- Canonical, delegated, and unresolved candidate authority at fact scope.
- Deterministic composition and validation of independently emitted shards.
- Content-addressed adapter caching, snapshots, stable-ID diffs, and drift
  reports.
- Context-dependent mapping activation and inhibition without changing the
  underlying identity graph.
- Executable constraints, first-class evidence, and exact expiring waivers.
- Fail-closed compilation into immutable viable generations with causal impact
  paths and atomic last-known-good activation.
- Read-only Prisma, TypeScript/Zod, JSON collection, and legacy catalog
  adapters.
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
```

The runnable example under `examples/workspace/` maps a Zod `itemSchema` onto a
Prisma `Item` model and assigns persistence facts to Prisma.

For a consuming repository, install the tagged public archive:

```json
{
  "dependencies": {
    "@roryscot/metamap": "https://github.com/roryscot/metamap/archive/refs/tags/v0.2.0.tar.gz"
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
metamap validate <graph.json>
metamap compile <graph.json> <policy.json> [output.json] [--context context.json] [--as-of timestamp] [--changed id]...
metamap promote <graph.json> <policy.json> <current-generation.json> [--context context.json] [--as-of timestamp] [--changed id]...
metamap impact <graph.json> <policy.json> <subject-id...> [--context context.json] [--as-of timestamp]
metamap generate <metamap.config.json> [--no-cache]
metamap check <metamap.config.json> [--no-cache]
metamap diff <before.json> <after.json>
metamap trace <graph.json> <entity-id> [incoming|outgoing|both] [depth] [relation]
metamap authority <graph.json> <concept-id> <fact>
metamap migrate-sources <sources-of-truth.json> [output.json]
```

## TypeScript API

```typescript
import {
  MetamapActivator,
  MetamapGraph,
  compileMetamap,
  composeMetamapDocuments,
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
```

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
