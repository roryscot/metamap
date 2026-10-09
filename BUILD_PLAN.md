# Metamap build plan

The first release adds reproducible compiler replay and read-only comparison of
explicit candidate changes. The existing graph, viability, generation, and
projection contracts remain the foundation. Broader governance and domain work
depends on evidence from a software pilot.

## Scope and authority

`VISION.md` supplies the direction. `CONTRIBUTING.md` governs compatibility,
schema/model/validator agreement, deterministic adapters, and verification.
Source systems retain authority for their data; generated graphs and runtime
projections remain derived artifacts.

Structural viability means that the supplied graph satisfies the supplied
policy. Checking evidence records does not establish their truth or authenticate
their producers. Authorized activation additionally needs the consumer's
trusted permission and review boundary. Replay proves reproducibility of a
recorded evaluation, not truth or approval.

The first release excludes automatic repair or promotion, globally optimal
repair claims, distributed hosting, new domain packs, and a visual debugger.
Existing generation semantics and identifiers must not silently change.

## Build sequence

| Phase | Deliverable                                                                 | Acceptance gate                                                                                                                                      |
| ----- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Compatible contracts, fixed invalid changes and valid controls              | Independently stated expected outcomes; existing examples remain compatible                                                                          |
| 1     | Versioned replay bundle and capture/replay API and CLI                      | Exact inputs reproduce generations and projections; corruption and missing or incompatible executors fail explicitly                                 |
| 2     | Baseline/candidate comparison                                               | Report input, issue, evidence, mapping-state, and runtime-projection changes without writing sources or activation state                             |
| 3     | Pinned Seeder software pilot and an equivalent simpler baseline             | Report held-out missed faults, false rejections, localization, runtime, and review effort where measurable; expand only after a demonstrated benefit |
| 4     | Executable relation rules, then typed uncertainty and consumer risk budgets | Requested unsupported rules fail; evidence support stays distinct from entailment; required uncertainty and risk limits are enforced                 |
| 5     | Scoped authority acceptance and authenticated approval integration          | Agents cannot self-approve authority expansion; changed inputs invalidate approval; attribution is not authentication                                |
| 6     | Semantic debugging and declared-owner review workflows                      | Explanations link to inspectable inputs, rules, and decisions; unsupported conclusions remain unknown                                                |
| 7     | One scientific mapping integration                                          | Preserve source distinctions and demonstrate bounded benefit against the existing tooling                                                            |

Phases 0, 1, and 2 form the first release. Phase 3 gates expansion. The
software pilot must not receive weaker validation rules merely to make the
comparison pass. If the simpler baseline performs equivalently or better, record
that outcome and narrow the product claim before doing broader work.

## First implementation

Capture the exact graph, policy, relation-pack contents, explicit evaluation
time, context, changed subjects, and requested projection specifications in a
new sidecar contract. Bind it to the compiler source/distribution, dependency
contents, and runtime identity. Store the original compilation and projection
results so replay can reproduce rejection as well as success.

Use the existing compiler, projection compiler, path-tree compiler, and relation
registry. The first bundle version supports built-in constraint evaluators;
custom executors require a future identifiable, explicitly registered contract.
Bundles never name code to import or execute.

Source rediscovery is a separate operation. A compiler replay bundle preserves
the emitted graph and evidence records, not every referenced domain payload.
Content addresses detect changes; they do not authenticate the bundle author.

Comparison accepts two complete, explicit input bundles. It never silently
rebinds a policy, repairs a graph, changes a waiver, or promotes a generation.
Dependency paths describe the declared propagation model, not independently
demonstrated physical causation.

## Fixed evaluation requirements

Before evaluating the pilot, freeze the fixture revision, fault labels, valid
controls, baseline rules, metrics, and held-out split. Include missing and
ambiguous handlers, widened authorization linkage, lost evidence support,
changed authority, policy/context changes, pack changes, and benign moves that
preserve stable identity. Report denominators and uncertainty rather than only
an aggregate score.

The simpler baseline receives the same facts, policy requirements, and labeled
changes. Comparing Metamap against a baseline that lacks its required checks
would not establish a useful advantage. Human review effort must remain
unmeasured until a real review study is performed.

## Verification

Each contract change includes version/compatibility decisions, matching portable
schemas and TypeScript models/validators, valid and invalid tests, and updated
examples and documentation. Preserve the prior graph/generation digests for
identical inputs.

Run `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`,
the affected example commands, and `npm pack --dry-run`. Check regenerated
outputs against committed fixtures. Run `example:topology` whenever topology
behavior is involved.

## Progress

- Starting baseline: package 0.6.0 at commit `2526ab5`; 62 tests and type checking
  passed in the preceding audit.
- Implementation branch: `codex/metamap-replay-counterfactual`.
- Commit `51a63c9` was pushed to that branch on 2026-10-09 at the user's request.
- Phases 0–2 are implemented locally: versioned replay and comparison sidecars,
  capture/replay/compare CLI commands, immutable API outputs, and a fixed visible
  regression corpus. Existing kernel contracts remain unchanged.
- Phase 3 has been evaluated against pinned Seeder routing and topology inputs.
  Both paths made 9/9 correct admission decisions, found 5/5 expected runtime
  change sets, and met 3/4 producer-localization criteria. There were no false
  rejections or missed required rejections. The direct baseline shares the
  existing kernel; this trial does not establish independent kernel superiority.
- The expansion gate is **not satisfied**. The new layer matched the direct
  baseline's correctness and took longer. Phases 4–7 remain conditional future
  work; this release makes a reproducibility and inspection claim, not a
  correctness or review-effort advantage.
- Native verification passed: 86 tests in 21 files, type checking, build, formatting,
  all example commands including topology and replay, and unchanged generated
  example outputs. Package dry-run verified 205 public files and the new exports
  and schemas using a task-local cache after the global npm cache denied writes.
- The pilot protocol, results, limitations, and reproduction instructions are
  recorded in `evaluation/README.md`. New code is neither published nor activated
  in consumers.

## Localization continuation

The user selected producer localization and reevaluation for the next cycle.
Trace inspection found that comparison included failing subjects as initial
impact seeds. Those subjects acquired one-node paths before traversal, masking
paths from the actual changed mapping. The compiler's rejection and constraint
subjects are correct and must remain unchanged.

Scope: fix comparison impact seed selection using the existing contracts and
compiler; preserve the recorded compiler issues, admission decisions, immutable
inputs, and original failed pilot. No new relation laws, constraints, approval
rules, automatic repair, or activation are part of this continuation.

Acceptance: a removed provider mapping retains a declared path to its producer
and failed consumers in the before graph; failing subjects are not fabricated
as input changes. Valid metadata and equivalent-provider controls introduce no
faults. Inhibited mappings remain excluded. Existing schemas and generated
fixtures stay compatible. The known regression must fail with the prior report
and pass the new dependency-link criterion.

`evaluation/localization-protocol.json` fixes 13 consumer cases and scoring
before implementation: the known root-layout failure, ten new provider removals,
and two valid controls. Compare the prior distribution, current report, and
equivalent direct checks. New dependency-link metrics do not replace the original
producer-issue criterion. A tie with equivalent direct checks keeps expansion
gated; human review effort remains unmeasured.

The continuation's dependency-link evaluation passed: 31/31 required failures
and 11/11 producers connected to their changed mapping origins, versus 0/31 and
1/11 in the prior report. Equivalent direct checks match the repaired report.
All 13 compiler-output pairs are preserved, and both valid controls pass. The
unchanged original pilot still meets only 3/4 producer-issue criteria and exits

1. Its expansion gate remains unmet. Package 0.7.1 preserves all portable
contracts. Native tests pass (88 tests in 21 files) and type checking passes;
formatting, build, all native examples, generated-output consistency, and package
dry-run also pass. The protocol, script, and current executor identities match
the stored localization experiment. The original pilot's protocol, scorer, and
first two reports are unchanged.
