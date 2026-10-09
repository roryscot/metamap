# First-release evaluation

Planning update, 2026-10-09: the user deferred review-time and comparative-benefit
studies and requested the capability sequence in [BUILD_PLAN.md](../BUILD_PLAN.md).
The expansion decisions below record the original empirical gate and remain
unchanged; that gate is no longer the prerequisite for the proposed capability
work. No new empirical advantage is claimed by the updated plan.

The new [capability corpus](capability-corpus.json) fixes functional expectations
for M0–M7. Its native binding cases are executable integration checks; later
milestone vectors remain design fixtures until their evaluators exist.
[Legacy compatibility pins](legacy-compatibility.json) preserve fourteen
schema/relation-pack byte identities and five compiled example identities from
`f571a3bb49781f56f24f7a2414ec665847edc847`. These are compatibility controls,
not additional runs of the historical empirical protocols.

`first-release-corpus.json` states the visible regression requirements used to
implement replay and comparison. All those cases were available during
development. They establish contract behavior, not an empirical advantage.

`seeder-inputs.json` pins the actual consumer input files by byte digest. The
context commit does not imply a clean consumer checkout. `seeder-protocol.json`
fixed nine consumer mutations, admission and runtime expectations, comparison
rules, and the expansion gate before the first consumer run. Fault types overlap
the regression cases; this is a bounded consumer trial, not a blind test over
unknown fault classes or a population sample.

## Results

| Measure                        | Direct baseline | Replay/comparison |
| ------------------------------ | --------------- | ----------------- |
| Correct admission decisions    | 9/9             | 9/9               |
| Missed required rejections     | 0/4             | 0/4               |
| False rejections               | 0/5             | 0/5               |
| Correct runtime change sets    | 5/5             | 5/5               |
| Producer-localization criteria | 3/4             | 3/4               |
| Median warm comparison, ms     | 5.23            | 58.39             |

The two methods receive identical graph, policy, packs, time, and projection
requirements. The direct baseline runs the existing compiler and projection
compiler plus stable-ID and runtime-entry diffs. This controls the checks while
testing the added archive/report layer; it is not an independent test that the
Metamap kernel beats a different graph implementation.

The strict producer-localization criterion fails for `topology-provider-removal`
in both methods. The mutation removes the root layout's `provides_context`
mapping. The kernel reports `TOPOLOGY_CONTEXT_PROVIDER_MISSING` on 21 dependent
routes rather than assigning an error to the changed layout container. The graph
diff still identifies the removed mapping. That distinction explains the failed
criterion without changing its predeclared target or scoring rule.

The initial report is preserved in `results/seeder-first-trial.json`. A
confirmation run with the same pins, mutations, expected outcomes, and score
rules is in `results/seeder-confirmation.json`; it adds the actual violation
subject lists. Between these runs, unrelated diagnostic-seed handling was fixed
and inhibited-mapping regression checks were added. The confirmation is a rerun,
not another independent held-out sample. Both runs give the same correctness
scores and fail the expansion gate. Reports record their compiler, protocol, and
script identities separately.

The protocol's `regressionFree` flag requires every stated correctness criterion
to pass. Its false value records the shared localization miss; it does not by
itself assert a regression relative to the baseline. The expansion gate is
**not satisfied** because no correctness/localization advantage was demonstrated.
The candidate is not promoted by this experiment.

Timing uses three warm comparisons per case and excludes bundle capture time.
The table reports the median of the per-case medians from the confirmation run.
These small, correlated cases and timing samples do not support population error
rates, uncertainty intervals, or general performance claims. Human review effort,
authenticated approval, source rediscovery, and independent kernel advantage
remain unmeasured. Replay/comparison provides a structured portable inspection
record here; reduced review effort remains a hypothesis.

## Reproduction

From this repository, after building:

```bash
npm run build
node evaluation/seeder-pilot.mjs /path/to/seeder/packages/metamaps /new/report.json
```

The input directory must contain the exact pinned files, and the output path must
not exist. The script verifies the pins before and after evaluation and never
writes consumer inputs. It prepares the topology projection with the semantic
route IDs exactly as the pinned consumer generator does; applying the raw
projection template to all topology routes would test a different consumer.

Exit 1 with an output report records an unmet strict correctness criterion; it
must not be relabeled a passing evaluation. A pin or fixture failure aborts
before a complete report. Runtime timings can vary; the stored environment
identity and observed denominators bound the result.

The next useful experiment is a separately designed review study measuring
whether archived evaluations and structured reports reduce reviewer effort or
improve producer localization. Preserve these cases as regression controls and
predeclare new tasks and scoring rules. Broader governance, uncertainty, debugging,
and domain work remains gated by `BUILD_PLAN.md`.

## Localization repair, 2026-10-09

Inspection found a comparison bug: error subjects were added to the initial
impact seeds, giving them one-node paths before traversal from changed records.
Package 0.7.1 removes that automatic seeding. Captured compiler issues and their
subjects remain unchanged; the before graph now preserves the declared path
from the removed provider mapping to its producer and failed consumers.

`localization-protocol.json` was frozen before the implementation change, with
digest `sha256:18672be672f0221dc220a66b3c892743ff30648111fb0f215ab3bd3eaa3a6847`.
It fixes 13 cases: the known root-layout failure, ten new provider-context
removals, and two valid controls. The ten mutations use known fault classes on
additional consumer data. They are not a blind sample of unseen fault types.
The new link metric requires an actual changed mapping as the first path record,
the producer or failed consumer as its last record, and the required compiler
error on the independently specified consumer. It does not substitute a new
producer-rule violation for the original compiler subject.

| Measure                       | Prior report | Repaired report | Direct checks |
| ----------------------------- | ------------ | --------------- | ------------- |
| Correct admission decisions   | 13/13        | 13/13           | 13/13         |
| Connected required failures   | 0/31         | 31/31           | 31/31         |
| Connected producers           | 1/11         | 11/11           | 11/11         |
| Valid controls without faults | 2/2          | 2/2             | 2/2           |

The prior distribution comes from commit `51a63c9`; the report records both
executor identities. Direct checks receive the same facts, compiler rules,
projection selection, and declared dependency information and compile impact
with each changed graph record separately. All 13 original compilation and
projection output pairs match exactly between the prior and current executors.
`results/localization-0.7.1.json` preserves the paths, gold subjects, per-case
scores, and identities. The mechanism test exits 0.

The original pilot was rerun without editing its protocol or scorer. It retains
9/9 admission decisions, 5/5 runtime-change sets, and **3/4** producer-issue
localization in both methods. It exits 1, as recorded in
`results/seeder-0.7.1.json`. The new dependency-path result must not be presented
as a pass under the earlier producer-issue criterion. Both harnesses ran on the
same host during this continuation; their timing samples do not establish a
performance change from the prior run.

The repair improves the report's explanation over its prior behavior. It ties
equivalent direct checks, so the expansion gate remains **not satisfied**. Human
review effort and independent kernel advantage remain unmeasured. Paths follow
declared dependency directions and can include conservative family seeds; they
do not prove physical causation, unique responsibility, or minimal affected sets.

To reproduce this supplemental comparison from the repository:

```bash
npm run build
git archive --format=tar --output=/new/prior.tar 51a63c9
mkdir /new/prior
tar -xf /new/prior.tar -C /new/prior
ln -s /absolute/path/to/metamap/node_modules /new/prior/node_modules
node evaluation/localization-pilot.mjs /path/to/seeder/packages/metamaps /new/prior /new/localization-report.json
```

Use new scratch paths. The source pins and frozen protocol must match, and
existing output reports are not overwritten. This executes the prior compiler
on fresh captured inputs with the current runtime dependencies; it does not
silently replay an old bundle with a newer executor.
