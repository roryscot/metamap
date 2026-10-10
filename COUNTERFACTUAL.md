# Counterfactual comparison

Comparison reproduces two complete compiler evaluations and explains their
differences. The candidate is supplied explicitly; the tool never edits a graph,
rebinds a policy, repairs a waiver, or activates a generation.

```bash
metamap compare before.replay.json after.replay.json
```

An optional third path writes a new report file. Existing files are never
overwritten. The command exits 0 when both evaluations reproduce and the
candidate is admitted, 1 for an unverifiable input or an unadmitted candidate,
and 2 for incomplete usage. Policy admission remains distinct from authenticated
approval and activation.

## Report contents

- Exact before/after bundle identities and policy-admission flags.
- Changed graph, policy, context, time, relation packs, projection specifications,
  and diagnostic seed inputs, with content digests.
- Stable-ID graph changes and introduced/resolved compiler, projection, and
  path-tree issues.
- Activated/deactivated mappings when both compilations establish their state.
  A rejected compilation records unknown mapping state, not mass deactivation.
- Added, removed, or changed evidence records and subjects that lost or gained
  all recorded supporting evidence. Recorded support does not establish truth or
  satisfaction of a particular confidence requirement; constraint issues record
  the latter separately.
- Runtime subject and relation-slot differences, including exact authorization
  targets, when both static projections compile.
- Projection availability, generation/specification binding changes, and
  path-tree changes. A failed projection has no invented runtime entry delta.
- Impact paths in both graphs, following the declared dependency directions.

Changed context, evaluation time, mapping policies, or relation packs seed whole
mapping families conservatively. Projection-only changes seed the selected
runtime subjects. Changed diagnostic seed inputs include the explicitly named
subjects that are known in each graph. Impact paths are declared dependency propagation, not proof
of physical causation or a minimal affected set.

Impact starts with actual input changes and explicitly changed diagnostic seed
inputs. A failed consumer is not automatically treated as a changed input:
otherwise its one-node path would hide a path from the changed producer. For a
removed mapping, inspect the before graph's paths to the producer and failed
consumer. The original issue retains its compiler-assigned subject and causal
path; comparison does not invent an additional producer-rule violation. An
existing failure plus unrelated graph metadata does not establish a new
dependency origin. Conservative family seeding and one reported path per subject
still limit precision when several inputs change together.

Removing a required handler can reject the candidate and explain its dependency
paths while the active generation remains untouched. Changing an authorization
target can leave both candidates policy-admitted; the report still shows the
changed target. An admitted candidate is not thereby authorized for deployment.

## TypeScript API

```typescript
import {
  compareMetamapBundles,
  validateCounterfactualReport,
} from "@roryscot/metamap";

const result = compareMetamapBundles(beforeBundle, afterBundle);
if (result.status === "compared") {
  const validation = validateCounterfactualReport(result.report);
  const changedViews = result.report.projections;
}
```

An input that cannot reproduce returns a rejection identifying `before` or
`after`. A successfully reproduced rejected candidate can still be compared to
show its failures or a proposed recovery. Report digests protect content
identity, not authenticity.

## Semantic profile 2.0

Two reproduced replay 2.0 captures produce a comparison 2.0 report using the same
graph, issue, entry and impact comparison engine. Mixed profiles reject with
`COUNTERFACTUAL_VERSION_MISMATCH`. The new report additionally records added,
removed and changed derivations, assessments, uncertainty requirements, budgets
and source receipts. For each requested consumer view it compares the used
mapping closure, dependency records and risk summary only when both projections
exist. A missing projection yields `null` deltas and explicit unknown flags.

Captured proof references retain `premise -> proof -> result` paths after a
premise is removed. An invalid dependent consumer remains an effect of changed
inputs; it is not introduced as a new diagnostic origin. A reproduced rejection
can be compared, but it does not establish a replacement active mapping set.

Use `validateSemanticCounterfactualReport` and
`parseSemanticCounterfactualJson` for the new contract. JCS/SHA-256 covers the
full report except its own ID/digest, including `$schema` when present. The JSON
reader rejects duplicate decoded keys. A rehashed report cannot claim measured
projection deltas when a result is unknown. Content validation is separate from
reproducing captures, authentication, approval and activation.

Assessment/evidence, requirement and budget changes affect the bound generation,
proofs and projections. Known risk summaries are compared directly; a rejected
candidate retains an unknown delta rather than an assumed cost reduction.
Complete source lineage selects profile 3.0. Comparison does not search for or
apply repairs; bounded proposal search remains M5.

## Source profile 3.0

Two reproduced replay 3.0 captures produce a comparison 3.0 report. The same
semantic comparison engine adds `sourceCapture` input changes, before/after
source inspections and scoped source-component differences. Source receipts
retain content-addressed identities; the additional comparison identifies
changes by stable source ID, including configuration, adapter, revision, input,
shard and pack changes. See [PROVENANCE.md](PROVENANCE.md).

Use `validateSourceCounterfactualReport`, `parseSourceCounterfactualReport` or
`parseSourceCounterfactualJson`. Mixed 2.0/3.0 captures reject. A source-only
change can leave the explicitly supplied candidate and its projection unchanged;
the provenance report still exposes that source/candidate difference. It does
not substitute fresh facts, claim approval validity or establish current
authorization. Unknown rejected projection deltas remain `null`.

## Contract and evaluation

The legacy counterfactual report schema remains version 1.0.0. The explicit 2.0
report has a separate schema identity. Neither changes existing legacy graph,
generation or projection digests. Validation registers
all referenced schemas locally and fetches nothing implicitly.

`evaluation/first-release-corpus.json` fixes the acceptance requirements,
invalid changes and valid controls. These are visible regression cases, not a
held-out empirical trial. The test suite covers
missing and ambiguous handlers, changed authorization targets, lost evidence,
stable locator moves, metadata-only changes, missing declarations, lossy links,
context inhibition, lost authority, projection-only changes, and path collisions.
Those tests establish mechanisms; they do not establish superiority to a simpler
baseline or lower human review effort.
