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

## Contract and evaluation

The counterfactual report schema is version 1.0.0. It adds an opt-in sidecar
without changing existing graph or generation contracts. Validation registers
all referenced schemas locally and fetches nothing implicitly.

`evaluation/first-release-corpus.json` fixes the acceptance requirements,
invalid changes and valid controls. These are visible regression cases, not a
held-out empirical trial. The test suite covers
missing and ambiguous handlers, changed authorization targets, lost evidence,
stable locator moves, metadata-only changes, missing declarations, lossy links,
context inhibition, lost authority, projection-only changes, and path collisions.
Those tests establish mechanisms; they do not establish superiority to a simpler
baseline or lower human review effort.
