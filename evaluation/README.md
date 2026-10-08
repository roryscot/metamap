# First-release evaluation

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
