# Bounded repair proposals

Repair search proposes explicit changes to a failed consumer configuration. It
uses the existing compiler, projection, source-bound replay and comparison
engines. It never writes source data, signs an approval or changes active state.
A viable proposal still requires the consumer's external approval boundary.

The first request/result profile is 1.0.0 and requires a complete source-bound
replay 3.0. The capture must reproduce with the installed executor and contain
either failed admission or a failed required consumer projection. Earlier replay
profiles need an explicit fresh complete capture; lineage is not guessed.

## Supplying the search space

`createMetamapRepairRequest` takes the rejected baseline and explicit options:

- The consumer and required projection IDs already captured for that consumer.
- A finite list of supplied edit templates, each with a unique stable ID and
  a nonnegative safe-integer ordinal semantic cost.
- Allowed and protected subject/fact scopes. These limit proposals; they do not
  authenticate ownership or grant permission to activate anything.
- Finite candidate, edit-count, derivation-depth and elapsed-work bounds.

Only four edit kinds are supported:

| Kind                 | Permitted change                                                                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `restore-mapping`    | Append a full supplied mapping whose identity is absent.                                                                                                                                              |
| `select-target`      | Replace the one target of a captured binary mapping with a supplied captured entity. The original index and legacy record digest must match.                                                          |
| `remove-duplicate`   | Remove an indexed mapping only when its full value equals an explicitly retained mapping apart from identity. Both original digests must match; the retained record cannot change in the same subset. |
| `supply-declaration` | Append a full supplied, single-mapping viability declaration only when no effective direct or selector declaration exists. The mapping must exist in the baseline or be restored by the same subset.  |

Missing entities, arbitrary equivalences and new proofs are not discovered.
Supplied records retain their supplied attribution; search does not establish
their truth. Changing a premise without its exact valid proof rejects through
the existing compiler.

Allowed facts use the existing governance vocabulary, such as `mapping.record`,
`mapping.targets`, `policy.mappings` and `policy.graph`. A wildcard subject/fact
matches all supplied candidates. `mapping.record` covers a complete mapping.
Protecting any mapping property also blocks adding/removing that complete record.
Every graph edit additionally needs an allowed, unprotected `policy.graph` fact
for the captured policy: its exact graph digest update is explicit in the patch.

Authority declarations, entities, graph identity, constraints, evidence,
assessments, uncertainty requirements, budgets/classifications, waivers,
derivations, law packs, source capture, context, evaluation time and projection
specifications remain unchanged. A missing declaration may be supplied, but an
existing declaration cannot be replaced or weakened. Policy changes retain the
existing governance classifier's conservative owner-review requirements.

## Results and bounds

`searchMetamapRepairs(request, { signal })` asynchronously explores nonempty
subsets of the supplied edit list. It visits increasing edit counts and then
code-unit edit-ID order, without allocating the whole combination space.
Conflicting, stale, out-of-scope and protected subsets are recorded as blocked
attempts; they count toward the candidate bound. Every evaluated attempt contains
the complete graph/policy patch, explicit binding updates, replay 3.0,
counterfactual 3.0, actual remaining failures and required approval actions.

`admitted` reports graph compilation; `viable` additionally requires every named
consumer projection and requested path tree to pass. A viable attempt has
authorization `approval-required`; a failed attempt has `unavailable`. Search
never reports an attempt as authorized or active. `applied` is always false.

Viable proposals rank by changed editable records, summed supplied semantic cost
and stable proposal identity. Mechanical graph-digest updates do not count as
additional edited records. Costs are declared ordinal choices, not probabilities
or measured benefits; actual consumer risk results remain in the captured outputs.
Cost overflow blocks a subset instead of wrapping or dropping a charge.

The report counts all nonempty supplied subsets using exact decimal integers.
It separately counts attempted and unexamined combinations, including those
excluded by the edit limit. Candidate, edit, elapsed and cancellation limits
produce `incomplete` when combinations remain. An unsupported depth bound rejects
before search: the captured policy's declared maximum depth must fit the request;
search never silently changes it.

Cancellation and elapsed deadlines are checked between complete synchronous
validation/compiler/replay steps. A started step can overrun the deadline; the
observed elapsed work is reported. This is a cooperative search bound, not a
hard real-time deadline. No further candidate starts after a checked stop.

A minimum claim is allowed only after the entire supplied finite space has been
examined. It means first under the declared rank order in that space. Incomplete
search makes no minimum claim, even if it found a viable proposal. No viable
candidate in the supplied space does not prove that no repair exists elsewhere.

`parseMetamapRepairRequest[Json]` verifies strict shape, content address, baseline
replay and explicit scope/order/bounds. `parseMetamapRepairReport[Json]` recomputes
each exact candidate prefix, patch, replay/comparison, requirements, rank,
coverage and minimum claim. Rehashing changed outputs cannot bypass these checks.
Elapsed work and cancellation remain observations of that run, not cryptographic
proofs of scheduling.

## Command and example

```text
metamap repair repair-request.json [new-report.json]
npm run example:repair
```

The command reads only its explicit request and installed SDK data. It accepts
strict UTF-8/JSON, refuses requests above 64 MiB before parsing, and has no apply,
sign, trust, provider-loading or clock override option. An output path creates a
new report file exclusively; existing files are preserved. Invalid requests do
not create it. Without an output path, the result is written to stdout. Exit 0
means complete search with a viable proposal; 1 means rejection or a complete
space without a viable proposal; 2 means missing/extra positional arguments; 3
means incomplete search. SIGINT requests cooperative cancellation.

The synthetic example removes an explicitly declared provider correspondence
from the existing two-source network fixture, supplies its exact restoration,
checks its retained derivation/risk, executes the generated native consumer and
path tree, and exercises the actual command against tampering, bounds and
existing-file protection. Temporary artifacts are removed. No production key,
approval or active state is used. Original source/evaluation files are preserved.

Repair itself does not authenticate a supplied baseline or its proposal scopes.
An adversary can supply a different internally consistent baseline. Activation
must still compare against actual protected state and require exact current
external approval as described in [GOVERNANCE.md](GOVERNANCE.md) and
[ACTIVATION.md](ACTIVATION.md).
