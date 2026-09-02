# Semantic routing example

This example replaces a hand-maintained command enum and dispatch registry
with a Metamap graph. The graph relates one stable command identity to its
handler, input schema, authorization policy, transport endpoint, and emitted
events.

The viability compiler first chooses the active mappings for a context. The
projection compiler then requires exactly one handler, schema, and policy and
at least one endpoint. It writes a content-addressed JSON manifest and a
dependency-free TypeScript lookup table.

Run:

```bash
npm run example:routing
```

Applications import `generated/command-router.ts` and use the generated
`CommandRoutesId` union rather than defining a second enum. Handler locators
remain references: an application-specific build plugin may turn those into
native imports without putting TypeScript semantics in the Metamap kernel.

Try removing the handler mapping, adding a second handler, or changing the
handler kind. Compilation fails instead of emitting a partially valid router.
