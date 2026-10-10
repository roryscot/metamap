# Typed uncertainty and consumer correspondence budgets

Policy 2.0 lets a consumer choose which recorded uncertainty it accepts and the
semantic costs it permits in a generated binding. The graph keeps its possible
correspondences; the compiler checks the consumer's declared requirements, and
the linker evaluates costs over the mappings actually used. These are recorded
assessments and policy costs, not calibrated probabilities or authenticated
evidence. Legacy policy/generation/projection 1.0 behavior remains unchanged.

## Assessment and evidence

The six dimensions are `identity`, `context`, `provenance`, `completeness`,
`causal-relevance` and `conflicting-authority`. Each assessment names its subject,
dimension, status, evidence IDs, assessor and source revision. Its optional
measurement-model ID names a declared model; no numeric confidence is combined.
`not-applicable` requires an explicit reason and a consumer that permits that
state. Missing information is `unknown`.

```json
{
  "id": "urn:assessment:binding-identity",
  "subject": "urn:mapping:operation-handler",
  "dimension": "identity",
  "status": "supported",
  "evidence": ["urn:evidence:binding-identity"],
  "assessor": "service-owner",
  "sourceRevision": "owned-source-2"
}
```

An evidence record uses the existing `EvidenceRecord` contract, has
`kind: "uncertainty:identity"` for this dimension and must include the assessed
subject in `subjects`. The recorded result is `supports`, `contradicts` or
`inconclusive`. Full record values are JCS-bound dependencies. An optional
evidence `digest` still describes its referenced artifact; it is not a shortcut
for hashing the full record.

Subjects may be graph mappings, entities or authorities. An entity assessment
constrains incident mappings; an authority assessment constrains mappings
touching its concept. A declared subject `provenance.sourceRevision` takes
precedence over the containing graph revision. If neither exists, the assessment
still binds its recorded revision but no current-source freshness is established.
Unknown subjects, duplicate identities, missing evidence and wrong dimension,
scope or known revision reject. Source receipts and authentication are separate
later boundaries.

Contradiction dominates unknown, which dominates support. A supported assessment
with inconclusive evidence becomes unknown. Derived results conservatively
combine their premise summaries with applicable direct assessments. Direct
support cannot erase an unknown or contradicted premise. Multiple different
named measurement models yield unknown unless contradiction already applies.
Repeated assessment/evidence IDs appear once and cannot strengthen support.

Evidence referenced by valid typed assessments is interpreted in that dimension.
Unreferenced evidence retains the existing generic contradiction checks. Explicit
constraints still see every record and may reject independently. No consumer
requirement is waived through the existing generic waiver mechanism.

## Consumer requirements

```json
{
  "id": "urn:requirement:binding-identity",
  "select": { "ids": ["urn:mapping:operation-handler"] },
  "dimension": "identity",
  "allowedStates": ["supported"],
  "requireEvidence": true
}
```

Selectors share viability declaration semantics. They must reference existing
mappings and match at least one; requirements apply to matched active mappings.
An unallowed state yields a dimension-specific issue. With `requireEvidence`,
every contributing assessment must reference evidence; support from another
path cannot conceal an unsupported contributor. Contributing not-applicable
assessments require an explicitly permitted exemption even when the combined
state is supported. Unrequired dimensions remain visible without automatically
rejecting a consumer.

## Costs and budgets

Each `ConsumerRiskBudget` names its consumer, classification rules, maximum
total cost and optional maximum lossy/inferred mapping counts. Costs are
nonnegative safe integers selected by the consumer. Classification selectors
share the existing mapping selector implementation.

For a concrete projection, the linker starts with the mappings in selected
slots and includes every checked derivation premise transitively. Each unique
mapping must match exactly one classification, including an explicit zero-cost
rule when intended. Overlapping classes reject instead of choosing a cheaper
one. Inactive and unused mappings are excluded; repeated paths count once.
Integer overflow rejects. Equality with any declared maximum is allowed.

The projection specification selects the budget by ID. It must belong to the
named consumer. `budget: null` is permitted only when that consumer has no
declared budget; its result is `not-evaluated`, with `totalCost: null` and no
classifications. Generation records budget availability; only the concrete
projection records an evaluated total and bound budget digest.

## Compile, link and reproduce

Generation 2.0 stores typed assessment/requirement/budget inputs and summaries
and binds the complete original policy. It does not embed full evidence record
values. Linking a generation with any typed input therefore requires the full
policy; the linker checks its exact binding and recompiles at captured context
and time before expressing the binding.

```typescript
const compilation = compileMetamap(graph, policy, options);
if (compilation.status === "viable") {
  const result = compileProjection(graph, compilation.generation, spec, {
    relationRegistry,
    semanticPolicy: policy,
  });
}
```

```bash
metamap link graph.json generation.json spec.json bindings.ts \
  --policy policy.json --relation-pack pack.json --format typescript
```

Replay 2.0 supplies its captured full policy/evidence and recomputes requirements,
proof dependencies, costs and generated outputs. Comparison records input and
risk changes when both views exist. A reproduced rejection yields unknown
projection deltas, not an inferred zero cost. Hash validation alone does not
authenticate a result or grant activation approval. Both existing promoters
continue to reject v2 pending protected governance.

Run `npm run example:uncertainty` for a generated native consumer and path tree.
It exercises the same graph under tolerant and strict policies, costs immediately
below/at/above the limit, repeated dependencies, exact replay and a rejected
counterfactual. Its outputs are under `examples/uncertainty/generated/`.
