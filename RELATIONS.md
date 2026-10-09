# Executable relation laws and checked derivations

Relation pack 2.0.0 and viability policy 2.0.0 explicitly select executable
correspondence rules. Existing relation pack and policy 1.0.0 inputs retain
their behavior and digests. In particular, a legacy `transitive: true` flag
does not request an inference engine. Shard composition continues to merge
declarations; relation composition proposes a new correspondence.

## Supported operations

A pack names a finite set of `reverse` and `chain` laws. A reverse law has one
operand relation. A chain law has two ordered operand relations and a result
relation. A transitive relation requires an unconditional `R,R -> R` chain;
a symmetric or inverse declaration requires its corresponding reverse law.
New global declarations cannot be justified solely by a context-limited rule.
Imported definitions require an exact pack ID, version and content digest.
References outside the pack's own definitions and exact imports reject.

The engine handles binary, one-to-one assertions. It never splits an n-ary
mapping into several facts. Kind restrictions and optional context conditions
are checked against the actual endpoints. Missing required context keys are
unknown; a false condition rejects. Transform and invariant composition are
currently unsupported and reject explicitly. No scripts or arbitrary closure
are executed.

`composeCorrespondences(graph, request, registry)` is read-only. The request
supplies ordered premise IDs, a named law, the full context, existing proof
records, and explicit depth and unique derivation-count limits. It returns
`proposed`, `rejected`, `unsupported`, `unknown`, or `incomplete`. A proposal
includes an ordinary graph mapping and a content-addressed derivation sidecar.
The caller must explicitly include both in its candidate graph and policy.

The result means **application of a declared law**. It does not establish
scientific truth, identity, evidence support, authentication, or authority.
Reversing a relation preserves the named result relation rather than silently
turning it into equivalence. A chain never transfers ownership. The worst
premise lossiness survives; scalar confidence is not propagated. All six typed
uncertainty dimensions currently report unknown.

## Proof binding and admission

The mapping's `attributes["metamap:derivation"]` names its proof. A reference
alone is insufficient. A proof records:

- Ordered premise mapping values and their digests, with nested proof bindings.
- The rule and exact defining pack and import bindings.
- The complete context and its digest.
- The result mapping before its own proof back-reference.
- Complete nested mapping/proof dependencies, maximum depth, unique proof count,
  and conservative uncertainty summaries.

Proofs use JCS/SHA-256, excluding only their own `id` and `digest`. Their optional
`$schema` is covered when present. Referenced graph 2.0 mappings and legacy
packs retain their existing value-digest convention. See
[CONTRACTS.md](CONTRACTS.md) for the exact distinction.

`validateCorrespondenceDerivations` checks supplied claims and graph proof
references. Policy 2.0 compilation calls this same engine, reuses the existing
contextual compiler, and requires an active premise for each active derived
mapping. A derived declaration cannot improve a premise's partial coverage,
nondeterminism or irreversibility. Reversal requires a reversible declaration.
Proof, context, pack, dependency and semantic failures are nonwaivable.

The generation binds the original v2 policy, full registered pack values,
checked proofs and admitted dependency edges. Impact analysis includes
`premise -> proof -> result` paths, including invalidation after a premise is
removed. Active disjoint relations reject under an explicitly selected v2
profile. Alternatives may remain in the possible graph. A missing materialized
transitive edge is not itself inconsistent.

## Current integration boundary

The models and schemas reserve typed assessment, requirement and budget inputs
for M3. Nonempty requests reject with `TYPED_UNCERTAINTY_NOT_IMPLEMENTED` until
the evaluator exists; they are never ignored. An empty profile reports
`riskEvaluation: "not-evaluated"`.

V2 admission, projection, path-tree, replay and comparison use explicit version
dispatch. A projection spec names its consumer and an explicit `budget: null`
when no typed budget is evaluated. Non-null budgets remain unsupported until M3.
The projection binds the actual generation and spec, the unique used mapping
closure, exact proof bindings and uncertainty summaries. Shared premises appear
once; inactive and unused mappings do not enter the closure. A path tree binds
that actual v2 projection and spec while preserving the existing hydration rules.

Projection compilation rechecks captured pack values, proofs, active premises,
resolved declarations and dependency records against the supplied graph. A
content digest alone is not admission or authentication. Mixed generation/spec
versions reject. Use the explicit `parseSemanticProjectionSpec`,
`parseSemanticProjection` and `parseSemanticPathTree` readers for these artifacts;
their `Json` variants reject duplicate decoded keys. Legacy readers remain v1.

Replay captures the complete evaluation and recomputes it with the exact
installed executor. Comparison retains unknown states after rejection and
includes proof, assessment, requirement, budget and projection-dependency deltas.
See [REPLAY.md](REPLAY.md) and [COUNTERFACTUAL.md](COUNTERFACTUAL.md).

Both existing activation APIs and the CLI reject v2 promotion with
`PROTECTED_ACTIVATION_REQUIRED`. Protected promotion is M4; this increment does
not establish an authenticated governance boundary.

## Runnable dependency example

Run `npm run example:relations`. The example declares a consumer's dependency
on a service and the service's dependency on a schema, then proposes and checks
the consumer's dependency on that schema. It writes candidate graph, policy,
proposal, generation, projection, nested path tree and generated TypeScript under
`examples/relations/generated/`. It executes the generated consumer bindings and
path hydration, reproduces an admitted evaluation, and compares it with a
reproduced rejection after a premise is removed. Both generated TypeScript
modules are checked by the native compiler. Replay captures remain in memory
because their executor identities depend on the installed runtime.
The example performs no source or active-state replacement.

The CLI also supports:

```sh
metamap compose examples/relations/graph.json examples/relations/request.json proposal.json --relation-pack examples/relations/pack.json
metamap compile examples/relations/generated/graph.json examples/relations/generated/policy.json generation.json --context examples/relations/context.json --as-of 2026-10-09T00:00:00.000Z --relation-pack examples/relations/pack.json
metamap link examples/relations/generated/graph.json generation.json examples/relations/projection.json projection.json --relation-pack examples/relations/pack.json
metamap capture examples/relations/generated/graph.json examples/relations/generated/policy.json relations.replay.json --context examples/relations/context.json --as-of 2026-10-09T00:00:00.000Z --projection examples/relations/projection.json --relation-pack examples/relations/pack.json
metamap replay relations.replay.json
```

The context file contains the captured `{"environment":"example"}` context.
A rejected composition, compilation or link preserves an existing requested
output file. Capture and comparison require a new output path.

Scientific profiles must identify the rules they actually adopt. SKOS
`closeMatch` is not transitive and does not become `exactMatch` by chaining;
see the [W3C mapping-property definitions](https://www.w3.org/TR/skos-reference/#mapping).
No scientific profile or external data has been imported by this example.
