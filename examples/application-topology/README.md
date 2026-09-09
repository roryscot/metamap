# Application topology example

This example maps one semantic route onto its framework page, nearest rendering
container, independently authoritative content, required context, and client
hydration boundary.

The policy uses a selector for all declared mappings and dynamic topology
constraints. Adding a discovered page without a semantic route, removing the
session provider, making the client page unhydrated, or detaching a structural
leaf from the application causes compilation to fail.

Run `npm run example:topology`. The command produces content-addressed JSON and
TypeScript projections under `generated/`.
