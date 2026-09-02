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
```

The runnable example under `examples/workspace/` maps a Zod `itemSchema` onto a
Prisma `Item` model and assigns persistence facts to Prisma.

For a consuming repository, install the tagged Git repository:

```json
{
  "dependencies": {
    "@roryscot/metamap": "git+https://github.com/roryscot/metamap.git#v0.1.0"
  }
}
```

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
  MetamapGraph,
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
```

## Design boundaries

Metamap records identity, relationship, authority, provenance, and structural
facts needed for validation. It deliberately does not:

- store arbitrary referenced domain data;
- infer equivalence from matching names;
- choose authority merely because a file exists;
- rewrite source files from inferred relationships;
- require every system to share one hierarchy or implementation language.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the model and scale strategy and
[CONTRIBUTING.md](CONTRIBUTING.md) for development instructions.
