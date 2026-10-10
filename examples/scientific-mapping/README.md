# Licensed scientific mapping walkthrough

See [SCIENTIFIC_MAPPING.md](../../SCIENTIFIC_MAPPING.md) for the bounded format,
identity, relation, uncertainty and provenance contracts.

```bash
npm run example:scientific-source
npm run example:scientific
```

To retain concrete review artifacts after building, choose new directories:

```bash
node examples/scientific-mapping/source.mjs /tmp/new-metamap-source
node examples/scientific-mapping/consumer.mjs /tmp/new-metamap-consumer
```

The source example imports the pinned seven-record TSV, captures all inputs,
exports with a loss report and executes the read-only commands. Raw unknown
lossiness rejects admission. The consumer explicitly selects a lossy exploratory
candidate, keeps all five relation categories and seven assertions, and imports
the generated TypeScript lookup keyed by expanded ontology identities.

Two narrow assertions sharing a core tuple retain different IDs and metadata.
A supported-identity requirement and budget17 both reject. A validated normative
inverse proof remains inactive because approximate irreversible bindings cannot
execute in reverse. A changed premise invalidates its proof. The crate bundles
checked artifacts and supplied source bytes; missing raw payloads and the full
producer source are visibly external references.

The fixture manifest preserves the CC BY4.0 license, producer creators, pin,
seven-of1564 selection, original indices and cross-species limitation. Do not
replace the source or claim biological identity, scientific truth, current
authorization, activation or a measured advantage based on this walkthrough.
