# Metamap viability

The relationship graph describes what structures exist and how they refer to
one another. A viability policy describes when those mappings may be expressed
and what must remain true. Keeping the layers separate allows one stable graph
to support multiple environments without embedding deployment state in its
identities.

The governing rule is:

> Variation is explicit; invalid composition never becomes an active
> generation.

## Compile lifecycle

`compileMetamap(graph, policy, options)` performs the following gate:

1. Validate the graph and policy portable schemas.
2. Verify the policy's graph identity, revision or digest.
3. Require exactly one viability declaration for every mapping.
4. Reject unknown lossiness and incompatible execution guarantees.
5. Require explicit causal impact direction for every relation kind.
6. Resolve context-dependent activation and inhibition.
7. Reject missing context keys instead of treating them as false.
8. Evaluate evidence and executable constraints.
9. Apply only exact, scoped, unexpired waivers to waivable issues.
10. Calculate causal impact using each relation's impact direction.
11. Emit a content-addressed generation only if no error remains.

A generation records its graph and policy digests, evaluation time, context,
active and inactive mappings, supporting evidence, and applied waivers. Given
identical explicit inputs, including `evaluatedAt`, compilation is
deterministic.

## Mapping declarations

Every graph mapping must have exactly one policy declaration:

```json
{
  "mapping": "urn:example:mapping:generated-api",
  "coverage": "total",
  "determinism": "deterministic",
  "reversibility": "irreversible",
  "applicability": {
    "when": {
      "key": "environment",
      "operator": "in",
      "values": ["staging", "production"]
    },
    "unless": {
      "key": "maintenance",
      "operator": "equals",
      "value": true
    }
  }
}
```

Large graphs may replace repeated mapping identifiers with selectors over IDs,
relations, source kinds, target kinds, or provenance statuses. Selectors are
closed-world rules: a selector matching nothing is stale, and two declarations
matching the same mapping are ambiguous. Both fail compilation. The resulting
generation always records the concrete active mapping identities.

Coverage, determinism, reversibility, and graph-level lossiness are assertions,
not guesses made by the compiler. A policy can require evidence for assertions
that need external verification.

Context expressions support `equals`, `not-equals`, `in`, `not-in`, `exists`,
and recursive `all`, `any`, and `not` expressions. Context values are JSON
primitives or arrays of primitives, keeping the contract portable.

## Core constraints

Constraint kinds use namespaced identifiers. The reference implementation
ships these fail-closed evaluators:

- `core:requires-evidence` — supporting evidence must exist for every active
  subject. Parameters: `minimumConfidence` and optional `kinds`.
- `core:requires-mapping` — every subject must participate in a matching active
  mapping. Parameters: optional `relation`, `target`, and `direction`.
- `core:forbids-mapping` — no matching active mapping may exist. It uses the
  same parameters as `core:requires-mapping`.
- `core:unique-target` — matching active mappings may resolve to at most one
  target. It uses the mapping parameters above.
- `core:requires-authority` — fact-scoped authority must resolve uniquely.
  Parameter: `fact`.
- `topology:relation-totality` — every dynamically selected structural entity
  satisfies a required relation cardinality or carries a valid reviewed
  exclusion.
- `topology:reachable` — every selected structural entity is reachable from a
  declared application root.
- `topology:context-satisfied` — every required context has exactly one nearest
  provider in the active rendering chain.

An unknown constraint kind is an error. Applications can register additional
`ConstraintEvaluator` functions with `ConstraintRegistry`; the JSON constraint
remains language-neutral while each implementation supplies the executable
semantics.

## Evidence and waivers

Evidence is a first-class record with stable identity, subjects, kind, result,
producer, optional confidence, locator, digest, and observation time.
Contradicting evidence rejects an expressed mapping. Evidence attached only to
an inhibited mapping does not invalidate the current context.

Waivers require exact issue codes and subjects, a reason, an asserter, and an
expiry timestamp. Only documented semantic and constraint issues are waivable.
Malformed graphs, broken references, policy mismatches, invalid contracts, and
expired waivers remain errors. A waiver that no longer matches an issue emits a
`STALE_WAIVER` warning.

## Impact and containment

Graph traversal direction and impact direction are intentionally different.
For example, `A core:depends_on B` traverses from A to B, but a change in B
propagates toward A. Relation packs express this using `impactDirection`:

```text
source-to-target | target-to-source | both | none
```

Impact paths include intervening mapping identifiers, producing causal traces
rather than a flat list of possibly affected nodes. Rejected compilation uses
those paths to report the quarantine boundary.

## Activation

`MetamapActivator` atomically swaps generations in memory. If a candidate is
rejected, `current` remains the last viable generation.

`promoteMetamapGeneration` provides the durable equivalent. It writes and
syncs a temporary file beside the target, then performs an atomic rename. A
rejected candidate performs no write.

```bash
metamap compile graph.json viability.json candidate.json \
  --context production.json --as-of 2026-09-02T00:00:00.000Z

metamap promote graph.json viability.json state/current.json \
  --context production.json --as-of 2026-09-02T00:00:00.000Z

metamap impact graph.json viability.json urn:example:database:user \
  --context production.json --as-of 2026-09-02T00:00:00.000Z
```

Use repeated `--changed <id>` flags with `compile` or `promote` to attach causal
paths to failures for a known change set.
