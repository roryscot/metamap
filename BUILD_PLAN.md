# Metamap build plan

Updated 2026-10-10. This is the current capability build plan for the seven
vision elements requested by the user. It supersedes the earlier sequencing
that made measured reviewer benefit a prerequisite for further capability work.
Review-time and comparative-benefit studies are deferred. Their existing
negative results remain recorded; no passing result or advantage is inferred.

The central product objective remains: **give networks and configurations stable
semantic names, explicit bindings, and checked generated structures, analogous
to the role of variables and bindings in a program.** Governance, uncertainty,
reasoning, repair proposals, and debugging extend that abstraction.

The user activated an implementation goal on 2026-10-09 covering M0–M8 and
P01–P17. Building and verifying these capabilities is now authorized. Milestones
remain planned until their acceptance checks pass; production deployment,
consumer activation, authority grants, production signing, and restricted-data
acquisition retain their separate authorization boundaries. M0's version and
digest decisions are recorded in [CONTRACTS.md](CONTRACTS.md). M0–M2 are locally
implemented and verified, including checked derivations through projection,
path-tree, replay and comparison. M3's P06/P07 typed execution and budget checks
are locally implemented and verified. P09 verifies authenticated invalidation
of old approvals; exercising that rejection at the actual protected write
boundary remains P10. Source capture/P08 is
locally implemented and verified, including exact source-bound replay,
read-only inspection and native consumer execution. P09's pure proposal and
authenticated approval layer is locally implemented and verified, including
the full package/regression gate. P10's governed interfaces and first Linux
protected promoter are implemented. Both local gates passed; the first
Linux run exposed a native fixture module-context error, undersized new-case
timers and blocked fixture RPC handling. Corrections and root-owned consumer
storage hardening pass both the local gate and exact-head Linux acceptance at
3ffb4cd. M4 is implemented and verified for the first root-owned Linux profile;
production deployment and consumer acceptance are separate. P11/M5 bounded repair
is implemented and verified at `26ec924`, including exact-head Linux CI. P12's
shared explanations are implemented and verified at `5008938`. P13's local
debugger has passed the complete local gate and actual browser acceptance;
exact-head Linux acceptance is in progress. M6–M8 and
separate Seeder adoption remain outstanding; the full goal is active.

## 1. Product outcome and controlling sources

After this plan is implemented, a consumer should be able to:

1. Refer to a stable operation, resource, or configuration identity while its
   physical implementation changes.
2. Generate consistent consumer bindings from independently owned sources,
   without maintaining a second handwritten registry.
3. Ask which declared rules justify a composed correspondence and inspect its
   complete derivation.
4. Declare tolerable uncertainty and semantic cost for its own context; reject
   bindings that exceed those limits.
5. Accept a candidate only through the consumer's trusted approval boundary,
   with approval bound to the exact artifacts being activated.
6. Inspect a failure, compare explicit alternatives, and receive bounded repair
   proposals without authorizing their application.
7. Apply these mechanisms to one public scientific mapping format while
   preserving the source's identities, distinctions, and assertions.

`VISION.md` controls the direction; `CONTRIBUTING.md` controls contract changes
and verification; this document controls the proposed sequence. `README.md`,
`ARCHITECTURE.md`, `VIABILITY.md`, `ROUTING.md`, `REPLAY.md`, and
`COUNTERFACTUAL.md` describe existing contracts. Consumer repositories retain
authority over their source data, correspondences, risk policy, trust roots,
review decisions, and deployment state.

The experiment protocols, scorers, and result files under `evaluation/` are
preserved evidence. The historical plan and completed-cycle notes at the end
remain history, not the current prerequisite for capability building.

## 2. Inspected baseline

Baseline: package 0.7.1, branch `codex/metamap-replay-counterfactual`, commit
`f571a3bb49781f56f24f7a2414ec665847edc847`, in draft PR #1. The preceding
implementation cycle recorded 88 passing tests in 21 files and successful
[GitHub CI](https://github.com/roryscot/metamap/actions/runs/37933983555).
Those runtime checks were not rerun merely to write this plan.

| Vision element                                            | Observed implementation                                                                                           | Work still required                                                                                                                              |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Possible correspondence, admission, executable expression | `model.ts`, `viability.ts`, `projection.ts`, `path-tree.ts`: graphs, contextual generations, checked static views | Preserve this separation as stronger semantic and authorization checks are added; prove actual consumer bindings survive changes                 |
| Independent sources and scoped ownership                  | Adapters, shard composition, fact-scoped authority, narrowing delegation, conflict validation                     | Protect trusted authority acceptance from self-assertion; verify ownership and stable identity across consumer updates                           |
| Executable provenance and counterfactuals                 | Exact compiler replay, explicit before/candidate comparison, issue/evidence/runtime differences                   | Source receipts and derivation records; bounded repair proposal search; capture every new semantic input                                         |
| Relation composition laws                                 | Endpoint/cardinality/cycle checks, symmetric traversal, declared relation properties                              | Execute supported laws, validate derivations, and reject requested unsupported semantics; distinguish shard composition from logical composition |
| Typed uncertainty and risk budgets                        | Scalar confidence, lossiness, evidence requirements                                                               | Typed uncertainty dimensions, explicit propagation, consumer-specific limits and deterministic cost accounting                                   |
| Authenticated governance and AI boundaries                | Declared owners and evidence producers; viable candidates can be promoted by callers                              | Trusted grants, authenticated approvals, change scopes, freshness/revocation, protected activation and stale-base checks                         |
| Semantic debugger and scientific integration              | CLI diagnostics, traces, comparison reports, illustrative research federation                                     | Unified explanations, inspection workflow, one pinned SSSOM integration, provenance packaging                                                    |

The original consumer pilot still has its recorded 3/4 producer-issue result.
The supplemental path repair reaches 31/31 required failures and 11/11 producers
and ties equivalent direct checks. These facts remain unchanged. The milestones
below require functional correctness and honest explanations, rather than a
claim of superiority over those checks.

Seeder already consumes generated routing, permissions, navigation, and copy.
Its inspected Metamap package is pinned to v0.5.0. A dependency upgrade is a
separate consumer change with its own tests and activation decision.

## 3. Invariants for every milestone

- Stable semantic identity is separate from a path, address, label, or symbol.
- One authority owns each fact and scope; generated projections are derivatives.
- Discovery and connectivity never automatically establish identity or approval.
- Possible, admissible, authorized, and active are separately reported states.
- Existing callers and identical legacy inputs retain their documented behavior
  and output identities unless they explicitly select a new contract.
- Missing mandatory semantics, unresolved references, ambiguous bindings,
  unsupported laws, and stale artifacts fail explicitly.
- Evidence support, logical entailment, declared confidence, and authentication
  remain distinct. No confidence value proves a scientific assertion.
- Runtime parameters hydrate an accepted structure; they cannot introduce new
  mappings, owners, privileges, or relation laws.
- Replay never fetches sources, imports code named by a bundle, or grants
  deployment approval. Historical replay and current authorization use different
  notions of time.
- Reports and repair search are read-only. Approval and application are separate
  actions. A rejected or unauthorized candidate preserves the active manifest.
- New capabilities use the current registries, compiler, adapters, schemas, and
  CLI. No second graph engine, policy framework, universal ontology, hosted
  service, or unrestricted theorem prover is part of this plan.

## 4. Milestones and dependency order

| Milestone | Deliverable                                                     | Depends on                    | Observable completion                                                                                                                                                    |
| --------- | --------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M0        | Contract and compatibility decisions; fixed functional fixtures | Inspected baseline            | Each new semantic input has a versioned representation, a binding/digest rule, and positive and negative acceptance cases                                                |
| M1        | Complete stable-binding and ownership consumer slice            | M0                            | Two independently owned shards generate consumer configuration; changing an implementation preserves semantic references; missing or ambiguous bindings block generation |
| M2        | Executable relation laws and derivation records                 | M0, M1                        | Supported composition yields inspectable proofs; unsupported or invalid derivations cannot become admitted bindings                                                      |
| M3        | Typed uncertainty and consumer risk budgets                     | M2                            | The same graph can pass one declared consumer policy and fail a stricter one; propagated uncertainty and cost cannot silently improve                                    |
| M4        | Authenticated approval and protected activation                 | M1–M3                         | An agent can propose a viable change but cannot approve authority expansion or activate it without exact scoped approval                                                 |
| M5        | Bounded counterfactual repair proposals                         | M2, M3                        | Candidate repairs are compiled and ranked within explicit bounds; no source or activation writes occur; search limits remain visible                                     |
| M6        | Semantic debugger and owner review views                        | M2–M5                         | A reviewer can inspect the input, rule, derivation, risk, approval requirement, changed origin, and alternative for a disputed binding                                   |
| M7        | One public scientific mapping integration                       | M2, M3, provenance foundation | A pinned SSSOM fixture imports, generates a checked consumer view, and exports without collapsing mapping distinctions                                                   |
| M8        | Governed end-to-end release and consumer upgrade                | M1–M7                         | The documented lifecycle works from owned sources to an approved active manifest, with legacy compatibility and negative cases preserved                                 |

The first implementation increment is M0 followed by M1. M7's source/license
selection can be prepared before its reasoning integration. M6 may start with
existing read-only reports; its full acceptance requires the later explanations.

## 5. Shared contract and compatibility design

Use explicit version dispatch and immutable published schema identities. Do not
add mandatory fields to strict v1 documents or silently assign stronger meaning
to their existing descriptive fields. Proposed contract targets:

| Surface                                                                    | Proposed treatment                                                                                                                                   |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Graph 2.0 and stable entity/mapping IDs                                    | Retain for explicit graph facts; composition proposals become ordinary explicit mappings only after their derivations are supplied and checked       |
| Relation packs 1.0                                                         | Preserve current behavior; document which properties are descriptive versus enforced                                                                 |
| Relation packs 2.0                                                         | Add a closed, typed law vocabulary with result relations, operand roles, conditions, and derivation requirements                                     |
| Viability policy 2.0                                                       | Bind derivation records, typed uncertainty, semantic requirements, and consumer budget inputs; keep schema/model/validator/evaluator agreement       |
| Generation/projection 2.0                                                  | Bind all semantic inputs needed to interpret the result, including pack/rule contents, proof and risk summaries, and consumer budget identity        |
| Replay/comparison 2.0                                                      | Capture and compare every new input and result; retain explicit executor mismatch and unknown-state behavior                                         |
| Source receipt, derivation, change proposal, approval, activation manifest | Reuse snapshot/adapter inputs for source lineage where suitable; introduce versioned contracts only for missing bindings and distinct new operations |
| Consumer trust configuration                                               | Separate trusted local configuration, loaded by the promoter; never accepted from a graph, replay bundle, or proposal                                |

M0's [contract decision record](CONTRACTS.md) selects the version and binding
strategy. The table does not claim that those wire versions exist. A field may stay
in an existing sidecar if it does not change that sidecar's semantics and the
reader can reject unsupported versions safely. No duplicate risk evaluator or
authority model should be introduced to avoid a version change.

For each contract, define: required inputs; stable identifiers; exact bytes or
canonical values covered by its digest; referenced schemas; rejection codes;
legacy reader behavior; export paths; and an example accepted by the portable
schema and executable evaluator.

Legacy graph/generation/projection digests must remain unchanged for unchanged
legacy inputs. An old replay bundle still requires its recorded executor;
maintain an archived executable fixture instead of making the new executor
pretend to have the old fingerprint.

## 6. M0 — contracts, fixtures, and compatibility

**Deliverables**

1. A lifecycle decision table for discovered, declared, derived, admitted,
   approval-required, authorized, and active states. Compilation must not imply
   authorization; a projection is usable only through the selected consumer
   lifecycle.
2. A documented distinction between composition of shards and composition of
   relations, between incomplete knowledge and a violated constraint, and
   between recorded provenance and authenticated provenance.
3. Version decisions from section 5, migration examples, digest coverage, and
   strict unsupported-feature behavior.
4. Fixed fixtures covering a normal operation/configuration binding; a moved
   implementation; an ambiguous target; a legal narrowing delegation; an illegal
   authority expansion; allowed and forbidden relation chains; unknown
   uncertainty; a consumer budget boundary; stale approval; and a valid benign
   change. Expected outcomes are specified before implementing their checks.

**Acceptance**

- The table accounts for both existing activation entry points:
  `MetamapActivator.activate` and `promoteMetamapGeneration`.
- Every future API/CLI path has a defined read/write boundary and explicit
  unsupported or unknown outcome.
- Baseline examples and their digests are pinned. Newly stated expectations do
  not change the old experiment protocols or scoring.
- Contract review resolves versioning and semantic ambiguities before code
  depending on them is written. Acceptance checks are functional, not a
  reviewer-time benchmark.

Likely locations: `model.ts`, `viability-model.ts`, `projection.ts`,
`replay.ts`, `counterfactual.ts`, `schemas/`, `CONTRIBUTING.md`, and this plan.
M0's deliverables are design records and fixtures; it does not rewrite all those
modules in one change.

## 7. M1 — stable bindings and independently owned sources

**Build**

1. Reuse `AdapterRegistry`, portable shards, `composeMetamapDocuments`, explicit
   correspondences, fact-scoped authority resolution, and checked projections.
2. Extend the runnable software example to two independently owned source
   packages: one declares an operation and schema; the other declares its
   implementation and endpoint. A consumer owns the binding policy and imports
   generated configuration.
3. Produce a typed identity set and resolved handler/schema/endpoint slots.
   A small consumer-specific emitter translates a locator into a permitted
   native import or endpoint descriptor. The generic kernel continues to emit
   portable references; it never imports arbitrary locator code.
4. Exercise declaration updates, context-specific bindings, source moves,
   delegation narrowing, duplicate declarations, and conflict rejection.
5. Identify and remove the duplicated handwritten registry in the example
   after the generated path has equivalent functional checks. Preserve existing
   compatibility exports when upgrading an actual consumer.

**Acceptance**

- Moving a physical implementation changes its locator and generated binding
  while preserving its declared semantic ID and consumers' identity references.
- Deliberately replacing an implementation with a different entity uses a new
  identity unless the owning source explicitly preserves it. Name matching is
  not an identity migration strategy.
- Missing or ambiguous required handlers/endpoints, conflicting owners, widened
  delegation, and stale graph/generation bindings reject before output replacement.
- A new governed source leaf must be mapped or explicitly excluded under the
  consumer's coverage policy. Exclusions remain owned, scoped, and inspectable.
- Generation followed by a consumer call uses the generated binding, not a
  parallel manual map. Runtime parameters cannot alter that binding structure.
- Rejected discovery or compilation preserves the last accepted artifacts.

Likely locations: existing adapters, `composer.ts`, `correspondence.ts`,
`graph.ts`, `projection.ts`, `path-tree.ts`, and `examples/routing/`.
Actual Seeder adoption stays in Seeder's generator, configuration, and consumer
tests; the reusable package does not take ownership of Seeder's data.

## 8. M2 — executable relation laws

**Semantic contract**

Start with a closed set of deterministic operations: reverse an allowed
inverse/symmetric relation; apply an explicit binary chain
`A —R→ B —S→ C` to produce a declared result relation `T`; and validate a
claimed derivation. A transitivity declaration is a specifically permitted
`R + R -> R` rule. Each rule names its pack version, operand roles, conditions,
result relation, and handling of loss and uncertainty.

The first law engine supports binary operands. Existing n-ary graph mappings
remain supported as explicit facts, but requesting an unsupported n-ary
derivation rejects. It must never flatten a hyperedge into independent facts
merely to make a rule applicable.

**Build**

1. Add typed law definitions to the versioned relation-pack model, schema,
   parser, and registry. Validate referenced relations, compatible endpoint kinds,
   conflicting rule definitions, and unsupported operations when loading a pack.
2. Add a bounded `composeCorrespondences` API that consumes explicit mapping IDs,
   context, and registered laws. Return a mapping proposal plus a derivation,
   an explicit unsupported/unknown result, or a rejection.
3. A derivation records ordered premise IDs and digests, rule identity, pack
   digest, context requirements, resulting relation/endpoints, and propagated
   semantic attributes. Its ID is derived from that complete content.
4. Under the new policy profile, validate every requested composition claim
   against its premises. A derived proposal cannot enter a generation until it
   is explicitly included as a graph mapping and its proof is checked.
5. Carry derivation dependencies into replay, comparison, and impact analysis.
   Removing a premise invalidates the dependent claim and explains why.

**Acceptance**

- An allowed chain returns the expected result and exact premises; its reversed
  or unsupported counterpart fails.
- Symmetry or inverse conversion cannot become equivalence or transfer authority.
- No composition of evidential support, prediction, correlation, or ordinary
  reachability silently becomes logical entailment or identity.
- Missing a materialized transitive edge is not itself an inconsistency.
  Completeness is a separate, explicitly declared obligation.
- Changed premise, context, or pack invalidates a proof; inactive premises cannot
  support an active derived binding.
- Unknown mandatory laws fail rather than being ignored. Requested depth and
  derivation-count bounds produce an explicit incomplete result when exceeded.
- Legacy metadata and traversal retain legacy behavior until the new profile
  is selected.

For the scientific fixture, `skos:closeMatch` must not be treated as transitive
or promoted to `skos:exactMatch`; SKOS distinguishes those semantics.
[W3C SKOS mapping properties](https://www.w3.org/TR/skos-reference/#mapping).

Likely locations: `model.ts`, `relation-pack.ts`, `relations.ts`, `validator.ts`,
`constraints.ts`, `viability.ts`, `impact.ts`, and a focused relation-law module
with tests. Arbitrary scripts, general OWL reasoning, unbounded closure, and
automatic graph mutation are excluded.

## 9. M3 — typed uncertainty and correspondence risk budgets

**Uncertainty contract**

Represent uncertainty separately for identity, context applicability, provenance,
completeness, causal relevance, and conflicting authority. Each assessment names
the dimension, subject, declared status, supporting/contradicting evidence,
assessor, source revision, and optional measurement model. Missing information
is `unknown`, not zero uncertainty. `not-applicable` requires an explicit policy
reason. Existing scalar confidence remains available as its original assertion;
it is not automatically redistributed among the dimensions.

A consumer policy states which dimensions require evidence, which states are
allowed, and which conflicts require rejection or owner review. The graph
remains the same across consumers; admissible expressions can differ.

**Risk contract and build**

1. Use consumer-controlled risk rules to assign nonnegative integer semantic
   costs and classes to mappings. Classes can distinguish declared identity,
   inferred equivalence, directional narrowing, lossy translation, and
   authorization-related linkage. These are policy costs, not probabilities.
2. Define a budget over the concrete mapping dependencies used by each
   projection. Initially use the sum of costs of unique participating mapping
   IDs, plus explicit limits on lossy and inferred mappings. Shared dependencies
   are counted once; inactive or unused mappings are excluded.
3. Reject missing cost classification or incomplete dependencies when a budget
   requires them. Zero cost must be assigned by the consumer's rule, not supplied
   by an untrusted mapping author.
4. Propagate uncertainty conservatively through derivations. Evidence cannot
   become stronger because it was repeated or reached through another path.
   Confidence scores with incompatible models cannot be averaged or multiplied.
5. Bind budget rules, dependency closure, assessments, rule versions, costs, and
   totals into the new generation/projection results and replay inputs.

**Acceptance**

- Identical facts pass a tolerant context and fail a stricter declared context
  with a dimension-specific explanation.
- Tests fix behavior immediately below, at, and above a cost limit; equality
  with the declared maximum is allowed unless that policy says otherwise.
- Duplicate paths cannot double-count costs or manufacture extra confidence.
- An unknown dimension required by a consumer rejects; benign irrelevant
  uncertainty does not cause blanket rejection.
- Composition does not erase a premise's lossiness, provenance limits, or
  unresolved conflict.
- Changing a budget or uncertainty assessment changes the bound result and
  invalidates approval for the old result.
- Legacy consumers without the new policy keep their existing behavior; the
  debugger reports that no typed budget was evaluated.

Likely locations: `viability-model.ts`, `constraints.ts`, `viability.ts`,
`projection.ts`, relation laws, sidecar schemas, replay/comparison, and focused
uncertainty/risk tests. Calibrated scientific probabilities and universal
risk scoring are outside the initial contract.

## 10. Provenance foundation across M1–M7

1. Extend existing `MetamapSnapshot` and `AdapterResult.inputs` lineage instead
   of maintaining a second source inventory. Supply only missing receipt
   bindings: source identity/revision, byte digest, adapter identity/configuration
   digest, emitted shard digest, and authorized local locator. A receipt establishes
   content lineage; authentication is an additional verified property.
2. Pin every new relation law, derivation, uncertainty assessment, budget,
   projection specification, and compiler executor that affects an evaluation.
   Keep the existing prohibition on code or implicit network fetches named by
   replay inputs.
3. Capture provenance for rejected candidates as well as admitted ones. Record
   separate states for reproduced, supported by recorded evidence, authenticated,
   authorized now, and active.
4. When raw source bytes are unavailable, replay the captured emitted graph and
   report source rediscovery as unavailable. Do not claim source reconstruction.
5. Extend comparison to report lost premises, changed risk, changed owners,
   invalidated approval bindings, and changed consumer artifacts. Preserve
   unknown states after rejection.

Acceptance includes tampered source receipts, proof inputs, budget inputs,
compiler/runtime identity, and missing dependencies. Each must be detected;
none may be replaced with a convenient current version. Authentication and
authorization decisions remain visible even when deterministic replay succeeds.

## 11. M4 — authenticated governance and AI change boundaries

**Trust boundary**

Source attribution and fact ownership remain in the graph. Permission to accept
those declarations comes from consumer-controlled trust configuration outside
the candidate. That configuration binds trusted principal/key identities to
specific actions, facts, scopes, environments, and authority-grant rules. A
candidate cannot introduce its own trust root or promote its proposed owner
into an approver.

The first protected deployment model uses a dedicated promoter and externally
controlled trust/key configuration. An agent may write a proposal workspace but
cannot alter the promoter, its configuration, signing credentials, or active
state. A library-only check cannot prevent a caller with unrestricted write
access from bypassing it; the consumer integration must enforce that boundary.

**Build**

1. A change proposal records its exact baseline, candidate graph/policy,
   context, semantic inputs, generated projections, changed facts, and requested
   actions. It distinguishes implementation rebinding from authority expansion,
   policy relaxation, budget increases, new waivers, and trust-root changes.
2. A pure authorization evaluator checks the authenticated principal against
   trusted grants and the concrete delta. Graph-declared canonical status is
   insufficient. Proposals from agents remain unapproved.
3. Approval binds the whole candidate artifact manifest, baseline active digest,
   consumer/environment, requested action/scope, trust-policy revision, issue
   time, expiry, and deployment intent. No approval over labels or graph ID alone.
4. Use a fixed signing profile for the first implementation: Ed25519 signatures
   verified by Node's built-in crypto, with a domain-separated, versioned
   canonical payload. RFC 8785 provides locale-independent JSON canonicalization;
   do not silently replace the old locale-sensitive generation digest scheme.
   [Node crypto](https://nodejs.org/docs/latest-v20.x/api/crypto.html#cryptosignalgorithm-data-key-callback),
   [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html).
   Strict signed-input parsing rejects duplicate JSON member names, invalid
   Unicode, out-of-profile numbers, and unsupported fields/algorithms. Test
   published canonicalization vectors and signature verification independently
   of the implementation's own signer.
5. Load trusted keys and their action/scope grants from the promoter's protected
   configuration. Verify the signature, current grant, trust revision, expiry,
   revocation state, environment, and exact content. Never use a bundle's
   historical evaluation time to extend a current approval.
6. Extend both in-memory and persistent activation for the governed profile.
   Compile and verify all consumer artifacts before activation. Stage an
   immutable artifact directory, then atomically replace one active manifest
   pointer under a serialized promoter with an expected-baseline check.
7. Preserve legacy activation as an explicitly documented ungoverned lifecycle
   for existing consumers. A governed consumer accepts only a verified activation
   manifest and protects the state path from legacy or direct writes. Selecting
   legacy mode is not an authorized fallback from a failed governance check.

**Acceptance**

- A valid, in-scope approval activates the exact candidate. A viable unapproved
  candidate remains inspectable but cannot activate.
- Forged, unknown-key, wrong-principal, wrong-scope, wrong-environment, expired,
  revoked, or stale-trust approvals fail without modifying active state.
- Any changed graph, policy, law, evidence, budget, context, projection, or output
  invalidates approval. Swapping an output after review is detected at promotion.
- An agent cannot self-approve added canonical ownership, delegation widening,
  weaker constraints, a higher risk budget, new waivers, or trust changes.
- Stale-base deployment conflicts fail; an identical authorized retry is
  idempotent. Rollback is a separately authorized action, not replay of an old
  approval against a different baseline.
- Concurrent promotion attempts and crash-before-commit cases leave a complete
  old or new manifest, never a mixture. Document filesystem durability assumptions.
- Security failures are not waivable through ordinary viability waivers.
- Tests verify the consumer permission boundary as well as the verifier function.
  They distinguish preventing a new activation after revocation from the separate
  consumer policy for retiring an already active generation.

Likely locations: `activation.ts`, `viability.ts` activation class, `cli.ts`,
new approval/manifest schemas and focused governance module, plus a local
protected-promoter example. Production key ownership, grant configuration,
and deployment credentials are supplied by the consumer owner during adoption;
this plan does not create them or send approval requests to other people.

## 12. M5 — bounded counterfactual repair proposals

**Build**

1. Add a read-only search API accepting the rejected candidate, required
   projections, explicitly allowed edit templates/targets, protected facts,
   and finite limits for candidates, edit count, derivation depth, and elapsed
   search work. Its evaluation time remains explicit.
2. Initially support a small edit set: restoring an explicitly supplied missing
   mapping, selecting among supplied compatible targets, removing a duplicate
   mapping, and supplying an explicitly provided missing declaration. Do not
   discover arbitrary new semantic equivalences.
3. Each candidate contains its graph/policy patch and explicit binding updates;
   compile, project, capture, and compare that complete candidate. No hidden
   policy rebinding or source edits occur.
4. Rank structurally viable proposals by a declared deterministic order:
   protected changes excluded, then edited records, semantic cost, and stable
   proposal identity. Report remaining failures and required owner approvals.
5. Preserve edit provenance, constraint results, changed runtime slots, risk,
   and search coverage. Keep the original rejected bundle alongside proposals.

**Acceptance**

- A known missing-handler case proposes the supplied legal restoration; an
  equally small but incompatible or unauthorized target is rejected.
- Repair search cannot remove constraints, relax budgets, create evidence,
  change trust roots, widen authority, or invent waivers to obtain a pass.
- `viable`, `approval-required`, and `authorized` remain distinct. Search never
  creates approval or applies a patch.
- Exhaustion returns `incomplete`; no viable candidate found within bounds is
  different from proving that no repair exists.
- A lowest-ranked proposal is called minimal only within the fully explored,
  stated finite candidate set and cost order. No global optimality claim.
- Input objects, source files, existing output files, and active state remain
  unchanged, including on interruption or rejection.

Likely locations: `counterfactual.ts`, a small repair-search module and report
schema, `replay.ts`, `cli.ts`, and regression examples. Search uses the existing
compiler; it does not introduce a parallel solver or automatic repair service.

## 13. M6 — semantic debugger and owner review workflow

**Build in two increments**

First, a shared structured explanation API and CLI inspection command. Then a
read-only local HTML view emitted from those same reports, without a new web
application framework or hosted service.

For a selected subject, show: stable identity and locators; owned facts and
delegation; raw source receipts; asserted versus derived relationships; rule
premises and intermediate results; uncertainty dimensions and risk charges;
admission/projection issues; approval requirements; before/after runtime
bindings; and available repair proposals.

The interface begins with the consumer's operation/configuration identity.
Technical digests and executor details are expandable evidence, not the primary
navigation. An unresolved or unavailable result is displayed as such.

**Acceptance**

- A user can start at a failed generated binding and reach its governing input,
  rule, owner, and actual changed origin without inspecting unrelated records.
- Composition can be inspected step by step; information loss, unsupported
  inference, and conflicting evidence remain visible.
- The view distinguishes compiler-assigned issue subjects from input change
  origins. It preserves the original 3/4 pilot outcome rather than rewriting it.
- Multiple origins do not masquerade as one uniquely proven cause. The current
  single-path/conservative-seeding limitation is displayed until a versioned
  multi-origin explanation is implemented and verified.
- Alternative proposals can be compared without accepting or applying them.
  Owner references are displayed; no messages or approval requests are sent
  automatically.
- Untrusted labels, locators, and evidence text are escaped. Local inspection
  does not fetch URLs or execute scripts named by an input.
- CLI and HTML are consistent views of the same report. Keyboard access,
  readable layout, and empty/rejected/unknown states are verified in the browser.

Likely locations: report/impact/derivation APIs, `cli.ts`, existing replay and
comparison reports, and a focused static report renderer. A remote collaboration
portal, visual graph editor, and automatic source modification are excluded.

## 14. M7 — one scientific mapping integration

**Selected scope**

Implement a read-only SSSOM 1.0 TSV adapter and a checked consumer projection.
Use a small schema fixture plus a licensed, pinned subset of a public mapping
set. The first data candidate is Mapping Commons' mouse/human phenotype mappings;
the source-selection task must verify the chosen revision, license, applicable
format version, provenance, and subset rules before bundling bytes. Its suitability
and license have not been accepted by writing this plan.

Preserve subject/object identifiers, mapping predicate, justification,
set metadata, per-record metadata, and distinctions among repeated assertions.
SSSOM permits multiple records with the same core fields and requires contextual
identifier resolution; those records must not be deduplicated merely by endpoint
pair. [SSSOM data model](https://mapping-commons.github.io/sssom/1.0/spec-model/).

**Build**

1. Fingerprint the exact TSV bytes, declared metadata, format/schema version,
   and adapter configuration. Use a local input path; remote acquisition is an
   explicit preparation step, never an implicit import or replay action.
2. Preserve raw records and dataset ownership. Derive stable assertion IDs from
   source record IDs when available; otherwise document a content-addressed
   occurrence strategy that preserves distinct records without claiming continuity
   across changed source assertions.
3. Respect inherited set metadata and explicit CURIE expansion. Keep original
   identifiers/predicates in provenance; use an explicit lookup for internal
   relation names instead of inferring equivalence or case-folding identifiers.
4. Handle literal and unmapped records explicitly or reject them as unsupported
   by the selected profile. Never create a false ontology identity to fill a
   required reference. Preserve arbitrary predicates as uninterpreted assertions;
   activation requires explicitly supported semantics.
5. Keep exact, close, broad, narrow, and related mappings distinct. Only apply
   composition rules justified by the selected standard/profile. Unknown
   justification or confidence-model scope remains unknown.
   Use normative SKOS semantics by default. SSSOM's chaining guide includes
   pragmatic broad/narrow chaining defaults that it acknowledges are not SKOS
   transitivity. Such additional assumptions require a named consumer profile;
   they cannot be reported as formal entailment under the default profile.
   [SSSOM chaining caveat](https://mapping-commons.github.io/sssom/1.0/chaining-rules/),
   [SKOS mapping semantics](https://www.w3.org/TR/skos-reference/#mapping).
6. Export the supported TSV profile and a loss report. Require semantic field
   round-trip preservation, not identical whitespace. Unsupported data must be
   retained or rejected explicitly, never silently discarded.
   [SSSOM TSV](https://mapping-commons.github.io/sssom/1.0/spec-formats-tsv/),
   [SSSOM chaining rules](https://mapping-commons.github.io/sssom/1.0/chaining-rules/).
7. Package the fixture, source receipts, compiler replay, derivations, and output
   references in a bounded RO-Crate 1.2 export. Validate against that declared
   profile; missing external payloads remain references, not purported embedded
   evidence. [RO-Crate 1.2](https://www.researchobject.org/ro-crate/specification/1.2/index.html).

**Acceptance**

- A licensed public fixture produces a consumer lookup keyed by original
  semantic identities, with policy-approved target mappings and inspectable
  justifications.
- Distinct assertions/justifications survive import, comparison, and export.
  Prefix collisions, unknown prefixes, reversed directional mappings, missing
  mandatory supported fields, and unsupported constructs have explicit outcomes.
- A close-match chain does not become exact identity; evidential support does
  not become formal entailment; an imported source does not become a trusted
  approving authority.
- Stricter consumer uncertainty/budget policy rejects an otherwise structurally
  valid binding. Original source data remains unchanged.
- Source revision changes invalidate the relevant receipt, derivation, replay
  identity, and approval binding; stable ontology entity IDs remain stable.
- Tests cover format boundaries independently of the adapter's own output.
  The example claims faithful binding/provenance behavior, not scientific truth
  or improved research outcomes.

Likely locations: `src/adapters/`, adapter registry/config schema, one mapping
relation pack, and `examples/scientific-mapping/`. SSSOM's authoritative schema
and a pinned independent parser/checker should be used for format conformance.
SBOL design workflows, biomedical decision support, universal ontology merging,
and a second scientific domain are deferred.

## 15. M8 — release, adoption, and whole-system acceptance

Build one documented walkthrough with two source owners and one consumer:

`owned sources -> explicit bindings -> checked derivation -> uncertainty/risk
evaluation -> viable generation -> reviewed artifact manifest -> authenticated
approval -> protected activation -> static consumer execution`.

Replay, debugging, and repair proposal inspection operate alongside that
lifecycle without changing active state.

Required end-to-end scenarios:

| Scenario                                    | Required result                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Physical implementation move                | Semantic references survive; generated bindings reflect the move; previous approval does not cover changed artifact bytes |
| Missing/ambiguous binding                   | Compilation or projection fails; active artifacts remain intact                                                           |
| Allowed composition and forbidden inference | The allowed result has checked premises; the forbidden inference cannot become an admitted runtime binding                |
| Strict versus tolerant consumer             | Shared facts remain owned; each consumer's declared uncertainty/budget determines its accepted expression                 |
| Viable AI-proposed authority expansion      | Proposal is visible but requires the designated trusted approval; no self-approval or activation                          |
| Stale or tampered approval/output           | Promotion fails; no partial replacement                                                                                   |
| Bounded repair                              | Valid alternatives are reported with limits and owner requirements; no source edits                                       |
| Scientific mapping                          | Original distinctions and IDs survive a checked consumer projection and export                                            |
| Legacy consumer                             | Unchanged legacy inputs preserve behavior and IDs; governed adoption is explicit                                          |

Release work includes export declarations, compiled `dist/` artifacts, versioned
schemas, reproducible examples, package contents, migration/operations docs,
CI, and rollback procedure. Upgrade Seeder in its own reviewed change and run
its route/topology checks plus consuming application tests before adoption.
Tagging, publication, merging, and consumer activation are later authorized
actions; a plan or successful test run alone does not perform them.

Completion means these behaviors are implemented, verified, and documented.
Activation is reported separately for each consumer. Reviewer-time studies,
population reliability claims, and independent kernel superiority are not
requirements of this capability release.

## 16. Suggested implementation changes

These are bounded change sets, not scheduled jobs. Each finishes with its own
acceptance evidence before the next dependent set begins.

| Change | Scope                                                                     | Required evidence                                                                               |
| ------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| P01    | M0 lifecycle, version/digest decisions, fixed fixtures                    | Compatible accepted/rejected examples; explicit unresolved decisions                            |
| P02    | M1 two-source binding example and consumer-specific emitter               | Actual consumer call plus moved, missing, ambiguous, conflicting-owner cases                    |
| P03    | M2 typed pack law contracts and registry validation                       | Portable schema/evaluator agreement; unsupported-rule rejection                                 |
| P04    | M2 composition/proof validation and impact dependencies                   | Allowed/forbidden chains; changed premise invalidation                                          |
| P05    | New semantic inputs bound into generation, projection, replay, comparison | Tamper/missing-input checks; legacy golden outputs unchanged                                    |
| P06    | M3 typed uncertainty assessments and propagation                          | Required unknowns, conflicting evidence, compatible/incompatible measurement models             |
| P07    | M3 per-consumer risk accounting and budget checks                         | Boundary values, shared dependencies, inactive mappings, missing costs                          |
| P08    | Source receipts and provenance inspection                                 | Source/adapter/config changes detected; no implicit fetching                                    |
| P09    | M4 trusted grants, proposal delta, signing payload and verifier           | Forgery, wrong scope, self-appointed owner, expiry, revocation, stale content                   |
| P10    | M4 protected promoter and atomic activation manifest                      | Both activation interfaces, actual write boundary, concurrent/stale-base and interruption cases |
| P11    | M5 bounded repair API/report                                              | Legal and forbidden proposals; no writes; honest exhaustion/minimality                          |
| P12    | M6 shared explanation API and CLI                                         | Rule/input/owner/risk/approval trace; actual changed origins and unknown states                 |
| P13    | M6 local read-only debugger view                                          | Browser checks for navigation, keyboard, escaping, rejected/unknown states                      |
| P14    | M7 source selection, SSSOM adapter and loss-aware round trip              | Verified license/pins; independent format check; duplicate/directional/prefix cases             |
| P15    | M7 scientific consumer projection and RO-Crate export                     | Preserved distinctions; strict policy rejection; declared-profile validation                    |
| P16    | M8 full lifecycle example, packaging and migration docs                   | Whole-system scenarios, native checks, reproducible package and rollback guidance               |
| P17    | Separate Seeder dependency/consumer adoption                              | Repository-native route/topology checks and application tests; explicit activation decision     |

P05 starts with M2 inputs and extends when M3/M4 inputs land; it does not postpone
replay completeness until the end. Every feature's first change must include the
capture and rejection behavior needed for its newly mandatory inputs.

## 17. Verification and reporting

For each implementation change, first run its targeted meaningful tests. Contract
or behavior changes then run the repository-native gate:

```bash
npm run format:check
npm run typecheck
npm test
npm run build
npm run validate:example
npm run example:generate
npm run example:check
npm run example:compile
npm run example:research
npm run example:routing
npm run example:path-tree
npm run example:topology
npm run example:replay
npm pack --dry-run
git diff --check
```

Regenerate existing fixtures and verify no unintended differences:

```bash
git diff --exit-code -- examples/workspace/generated examples/research/generated examples/routing/generated examples/path-tree/generated examples/application-topology/generated examples/example-generation.json
```

New-version examples receive intentionally reviewed fixtures, their own
reproduction commands, and CI coverage. An intentional fixture change is
reviewed with its contract/migration decision; it is never hidden by updating
goldens solely to turn a failing check green.

Verify new schema exports and packaged files using the package dry-run. Verify
M6 in the browser when its UI exists. Consumer tests and external-format
validation are separate from the reusable package's native suite.

Reports name the actual commands, exit codes, tested revisions, and remaining
unknowns. Distinguish planned, implemented, verified, reviewed/accepted, released,
and active. Preserve failed evaluations and their original criteria. No benchmark
advantage or measured time saving is required or implied by passing these gates.

For MetaMap, use the user's configured Rory identity through normal `git` and
`gh` commands. The user's replacement instructions reserve AveLyra and the
`ghave`/`gitave` functions for 9/11 conspiracy-related public material. Before
a public push, verify the destination, authenticated account,
and author/committer metadata of every newly published agent-created commit.
Keep credentials and private keys out of output and records. Existing published
history is not rewritten by this plan; any later authorized rewrite requires
exact-commit force-with-lease protection. Private repositories follow their own
authorized identity.

The planning-only edit used formatting, document references, plan coverage,
and preservation of source/evaluation files. Runtime implementation checks now
apply to each completed increment. Executed M0/M1 and M2 foundation checks are
recorded below; outstanding milestone acceptance checks remain unrun.

## 18. Decisions, dependencies, and principal risks

| Item                    | Proposed default / resolution point                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial consumer        | Use existing software routing/configuration surfaces and a self-contained two-owner example; review the actual Seeder upgrade separately                |
| Initial reasoning scope | Binary inverse/symmetry and explicit finite chain rules; unsupported n-ary or arbitrary reasoning fails                                                 |
| Risk meaning            | Consumer-defined ordinal costs and typed requirements; no invented universal probability model                                                          |
| Trust deployment        | Protected dedicated promoter; grants and signing credentials controlled outside the proposal workspace                                                  |
| Approval identity       | Exact versioned artifact manifest, action/scope, baseline and consumer/environment; current trusted clock and grant state                               |
| Scientific scope        | SSSOM 1.0 TSV profile plus one licensed, pinned public subset; verify license/schema/sample suitability before ingestion                                |
| Debugger surface        | Shared structured report and CLI first, then read-only local HTML                                                                                       |
| Review-time metrics     | Deferred by user direction; old empirical scores remain preserved evidence                                                                              |
| Timing                  | Sequence by dependencies and acceptance, not unsupported calendar estimates; governance integration and contract migration have the highest uncertainty |

The strongest architectural objection is that stable IDs and signed reports
alone do not ensure that consumers use the bindings or respect approvals.
M1 must demonstrate actual generated consumer execution; M4 must demonstrate
the protected state boundary. Otherwise the system would document relationships
and permission without enforcing them.

Other risks are scope growth into unrestricted reasoning, treating supplied
evidence as truth, inconsistent new input binding across compiler/projection/
replay, and silently breaking legacy behavior. The closed law vocabulary,
consumer-defined budgets, explicit unknown states, version dispatch, and
preserved legacy fixtures address those risks with observable checks.

The current executable job is P13: finish exact-head Linux acceptance for the
locally verified HTML view of P12's shared explanations. P14/P15 follow with the
pinned licensed scientific integration. Every added
semantic input must extend capture and comparison in the same increment.
Governance or scientific work
must resolve its actual trusted keys, owner grants, source/license, and consumer
environment before crossing its activation or ingestion boundary.

### Active implementation goal

- Activated: 2026-10-09, with no user-specified token budget.
- Scope: all capability milestones M0–M8 and implementation changes P01–P17.
- Current work: P13 local debugger verification, after P12's exact-head Linux
  acceptance at `5008938`. P08–P12 are pushed and verified; protected activation
  is verified for the first root-owned Linux profile.
- Identity instruction supersession: the user's 2026-10-09 replacement
  instructions govern over the goal's earlier AveLyra wording; MetaMap uses Rory.
- Locally implemented and verified: M0–M2 and M3/P06-P07 typed execution,
  including P03/P04 law admission and the M2/M3 portions of P05 downstream
  bindings. P05 continues as later semantic
  inputs land. Human acceptance, release and production activation are not
  inferred. P08 is locally implemented and verified. M4/P09-P10 also verifies
  exact authenticated invalidation at the protected write boundary and actual
  independent proposer/consumer permissions. M5/P11 is implemented and verified
  for the finite supplied-edit profile. M6–M8 remain outstanding.
- Functional acceptance, compatibility, and authorization checks govern progress;
  deferred review-time metrics do not block implementation.
- Goal completion requires the full scoped build and verification, not merely
  finishing the first consumer slice. Production activation is reported separately.

### M0/M1 implementation increment, 2026-10-09

- M0: [CONTRACTS.md](CONTRACTS.md) fixes the lifecycle/read-write boundaries,
  version dispatch, legacy digest preservation, JCS/Ed25519 target profiles,
  semantic input coverage and migration rules. The visible
  [capability corpus](evaluation/capability-corpus.json) states 22 binding cases
  and 12 later-milestone design vectors. Later vectors are not runtime results.
- Compatibility: [legacy pins](evaluation/legacy-compatibility.json) bind 14
  existing schema/relation-pack byte identities and five native example input,
  generation and projection identities to baseline `f571a3b`. Six new regression
  tests enforce them; existing schemas and outputs are unchanged.
- M1: [the native consumer example](examples/routing/bindings/README.md) composes
  contract and service-owned shards with an explicit consumer overlay. It
  generates an operation identity union, captures checked code bytes and native
  imports, dispatches an actual request, and chooses production/development
  endpoints from declared context. Existing adapters, snapshots, composition,
  viability and projection contracts are reused.
- The 25 consumer tests cover the fixed cases, byte receipts/source preservation,
  captured-code tampering, and generation without executing source code. A
  negative byte-drift case exposed mutable external native imports; captured
  code copies fixed the behavior without weakening the expectation that the
  previous accepted consumer remains callable.
- Validation passed: `npm run format:check`, `npm run typecheck`, `npm test`
  (119 tests in 23 files), `npm run build`, `npm run validate:example`, every
  existing example script, `npm run example:bindings` (including generated
  identity type checking), `npm pack --dry-run --json`, and `git diff --check`.
  The package dry-run initially included the example discovery cache; a local
  `.npmignore` excludes it, and the repeated inspection passed. Regenerating all
  existing examples leaves their tracked outputs and legacy schemas unchanged.
- This is an admitted, runnable, legacy-ungoverned consumer example. Native
  copying does not create an authenticated approval boundary or a multi-file
  activation transaction. Direct filesystem writers remain able to bypass it.
  M4 must enforce the external promoter and artifact permissions; M8 must verify
  separate Seeder adoption. Comparative-benefit metrics remain deferred.

### M2 P03/P04 foundation increment, 2026-10-09

- [RELATIONS.md](RELATIONS.md) documents the explicit pack 2.0.0 law profile,
  bounded composition request/result and proof 1.0.0 sidecars, and policy and
  generation 2.0.0 admission contracts. Models, portable schemas, parsers,
  package exports, CLI commands and a runnable dependency example are aligned.
- The existing relation registry validates exact imported packs, operand/result
  references, compatible kinds, unique laws and executable property claims.
  Registered v2 values are copied and frozen; legacy import drift invalidates
  their dependents. Invalid registration no longer leaves partial definitions.
- Composition supports explicit binary reverse/chain laws and returns a
  proposal only. It never flattens n-ary mappings, composes unsupported transforms,
  transfers authority or converts scalar confidence into evidence strength.
  Full-context, premise, pack, dependency, depth/count and content bindings are
  checked by the same proof engine during v2 admission.
- V2 admission reuses the contextual compiler and declaration selector engine.
  An active derived mapping requires active premises; coverage, determinism and
  reversibility cannot improve through composition. Reversal requires a
  reversible premise. Active disjoint relations reject; absent materialized
  transitive edges are not treated as inconsistent. Impact includes captured
  `premise -> proof -> result` dependencies after a premise is removed.
- New values use JCS, including its numeric-zero semantics. Review identified
  a potential mismatch between hashing canonical JSON and evaluating its raw
  negative-zero representation; canonical evaluation and regression checks now
  align them. Programmatic legacy optional fields preserve their original
  digest convention without executing getters during materialization.
- Validation passed: `npm run format:check`, `npm run typecheck`, `npm test`
  (190 tests in 27 files), `npm run build`, `npm run validate:example`, every
  existing example script, `npm run example:relations`, five CLI acceptance
  cases, `npm pack --dry-run --json`, and `git diff --check`. The new 71 tests
  cover canonicalization, pack contracts, derivations and admission. Frozen
  legacy schema/pack bytes and native output identities still pass; existing
  tracked examples remain unchanged. The package inspection includes the new
  schemas and generated example and excludes caches and evaluation/work files.
- Initial checks found a missing strict-schema type declaration, a conditional
  schema requirement declaration, fixture namespace errors and test union
  typing errors. These were corrected; no legacy pins, experimental scorers,
  acceptance vectors or recorded negative results were changed.
- This increment does not complete M2. P05 must add v2 projection, replay and
  comparison binding. Typed assessment/budget members are reserved strict
  contracts; nonempty inputs explicitly reject until M3 implements their
  evaluator. Both existing activation APIs and the CLI reject v2 promotion
  pending M4's protected boundary. No release, merge or production activation
  has occurred; the full M0–M8 goal remains active.

### M2 P05 downstream binding increment, 2026-10-09

- The public projection, path-tree, capture, replay and comparison APIs dispatch
  explicitly to the v2 profile. New portable schemas and strict JSON readers
  have separate identities; mixed profiles and duplicate decoded keys reject.
  Existing v1 algorithms, schema bytes and compiled identities are preserved.
- Projection spec 2.0 names the consumer and an explicit nullable budget.
  Projection 2.0 binds the actual generation/spec, exact used mapping closure,
  proof bindings and conservative uncertainty summary. Shared dependencies are
  unique; unused and inactive mappings are excluded. Captured packs, proofs,
  declarations and dependency records are rechecked against the supplied graph.
- Path tree 2.0 binds the actual projection/spec and reuses the existing tree and
  hydration algorithms. The dependency example executes both emitted native
  modules and checks their TypeScript; parameters hydrate paths without changing
  the accepted binding structure.
- Replay 2.0 captures all currently executable semantic inputs and outputs,
  including proofs, full pack values, context/time and consumer specs. It requires
  the exact installed executor and recomputes expected outputs even after a
  tampered capture is rehashed. Reproduced compilation/projection rejection
  remains separate from admission, approval and activation.
- Comparison 2.0 reuses the existing graph, issue, entry and impact engine, adding
  semantic record and consumer-dependency/risk deltas. Removing a premise retains
  its captured proof path. Unknown generation/projection states produce no
  invented deactivations or measured dependency/risk change.
- Validation passed: the complete 20-command gate, including formatting,
  typecheck, `npm test` (218 tests in 30 files, 28 new behavioral tests), build,
  every existing example, the extended native dependency example, the previous
  five CLI cases, 19 new CLI cases plus their native TypeScript check, package
  inspection and diff checks. All 20 previously published schema/pack files,
  frozen legacy inputs/results and original evaluation files remain unchanged.
  The package contains new public contracts/modules/examples and excludes caches,
  work files and evaluation records.
- Review and initial checks corrected malformed-input error-code compatibility,
  the new report's `$schema` contract, fixture law/target-kind alignment and
  immutable pack typing. A projection now rejects omitted or duplicated captured
  declarations even when its supplied generation has a recomputed content hash.
- M2's scoped acceptance is verified. Typed assessment/budget execution remains
  M3; nonempty or non-null requests reject explicitly. Source-receipt/snapshot
  fields reserve P08 capture; requested lineage rejects until that work exists.
  Both legacy promoters continue to block v2. M3–M8, protected governance and
  separate Seeder adoption remain outstanding. No release, merge or production
  activation has occurred; the full goal remains active.

### M3 P06/P07 typed uncertainty and budgets, 2026-10-09

- [UNCERTAINTY.md](UNCERTAINTY.md) documents executable assessments for identity,
  context, provenance, completeness, causal relevance and conflicting authority.
  Mapping/entity/authority scope, declared source revision, evidence dimension
  and complete evidence-record values are checked. Existing schema bytes remain
  immutable; the reserved v2 members now execute through the existing compiler.
- The bounded proof engine conservatively combines applicable assessment and
  premise summaries, including nested proofs. Contradiction and unknown survive;
  different named models yield unknown, and scalar confidence is never averaged
  or redistributed. Every contributing record is bound; repeated paths neither
  strengthen evidence nor duplicate it. Direct support cannot erase a weaker
  premise. Lossiness, inference and ownership boundaries are preserved.
- Consumer requirements use the existing selector implementation, apply to
  matched active mappings and give dimension-specific rejection. Required
  evidence must exist on each contributing assessment. Not-applicable reasons
  require a permitted consumer exemption. Typed evidence is interpreted within
  its declared dimension; other evidence and explicit constraints retain their
  existing checks. Typed requirements cannot be waived through legacy waivers.
- Budgets classify every unique used mapping and transitive checked premise
  exactly once, including explicit zero cost. Missing/overlapping classification,
  wrong consumer, null-budget bypass, unsafe totals and exceeded total/lossy/
  inferred maxima reject. Equality is allowed; shared dependencies count once;
  unused and inactive mappings are excluded. Unevaluated risk retains null cost.
- Generation binds original policy values, assessments, requirements, budgets
  and summaries. Because it does not embed full evidence records, any typed
  projection requires the exact original policy (`semanticPolicy`, CLI
  `link --policy`) and a complete recompile at captured context/time. Missing,
  substituted and hash-consistent forged inputs reject. P05's replay/comparison
  integration captures and recomputes all new inputs, preserves rejection and
  reports unknown projection deltas without inventing cost improvement.
- The [native typed example](examples/uncertainty/build.mjs) executes generated
  bindings and hydration. The same graph passes its tolerant identity policy
  and fails a stricter completeness policy. Fixed costs 2 + 3 + explicit 0 fail
  limit 4 and pass limits 5 and 6; duplicate paths retain total 5. A normal CI
  test reproduces its committed fixtures and type-checks/executes emitted ESM.
- Local verification passed the complete 22-command gate: formatting,
  typecheck, `npm test` (277 tests in 34 files, 59 new behavioral tests), build,
  all existing examples, `example:uncertainty`, 45 CLI cases (21 new), generated
  native TypeScript checks/execution, package inspection and diff checks. All
  27 previously published schema/pack byte identities, prior tracked examples,
  legacy pins and original evaluation files are unchanged. Regenerated typed
  example bytes are stable; private caches/work/evaluation files are excluded
  from the package. No rendered UI was changed; browser acceptance remains M6.
- Initial checks corrected fixture authority/readonly-law typing, reversible
  declarations on intentionally lossy fixtures, formatting, a missing legacy
  graph binding in a new negative test and the local verifier's JSON-lines
  reporting parser. Acceptance vectors, constraints, schema bytes and original
  experimental results were not weakened or rewritten.
- P06/P07's executable capability checks are verified. Changed assessment and
  budget inputs demonstrably change bound generations/projections/proofs;
  authenticated rejection of an approval for the previous result still requires
  M4's verifier and remains outstanding. Both legacy promoters continue to
  reject v2. P08 source lineage and M4–M8, including Seeder adoption, remain
  outstanding. No release, merge or production activation has occurred.

---

### P08 complete source provenance, 2026-10-10

- Added [PROVENANCE.md](PROVENANCE.md), source-capture/inspection 1.0 and explicit
  replay/comparison 3.0. Policy, generation, projection and path tree remain 2.0;
  all 27 previously published schema/pack byte identities remain unchanged.
  Replay 2.0 still rejects partial source lineage rather than ignoring it.
- Captures reuse full configuration and ordered `AdapterResult` records, exact
  source pack values and the source-composed graph. The existing workspace
  assembler/materializer reconstructs the graph offline. Derived snapshot and
  receipt bindings cover source identity/revision, adapter, source configuration,
  input byte digests and emitted shard values. Rehashed wrong receipts or old
  snapshot bindings cannot match those complete captured records.
- Source/candidate graph bindings are separate. Explicit candidate overlays are
  reported without receiving source attribution. Accepted and rejected
  evaluations preserve provenance, exact executor/runtime/dependencies, checked
  proofs, typed requirements, budgets and consumer outcomes. Rejection retains
  unknown expression/risk deltas. Source-component comparison records workspace
  or source scope and exact before/after digests.
- Added `sources`, `provenance` and `capture --source-capture`. Offline inspection
  performs no source reads or named-code execution. Explicit current inspection
  selects its own local config and permitted roots; checks lexical/resolved
  paths and symlink escapes; runs installed built-in adapters without cache
  reads/writes; checks raw input byte hashes; and reports changed/unavailable
  sources. Captured custom outputs can be inspected offline but cannot install
  or execute code named by a capture.
- Added an explicit portable pack-reference profile in the shared workspace
  assembly. Legacy default output retains its bytes; capture uses `repo:` plus
  the encoded configured pack path. Executable configured packs cannot replace
  a conflicting/missing explicit shard digest. An exact imported core reference
  is preserved through generated correspondence declarations. Legacy shards
  with non-portable relative pack URIs need an explicit migration before complete
  capture. Current directory inspection is conservative and does not lock another
  filesystem writer.
- [The two-source example](examples/provenance/README.md) emits complete source
  records and checked native consumer bindings. It reproduces accepted/rejected
  replay, strict-policy failure, rehashed receipt rejection, separate current
  inspection and native hydrated paths. Original source files/caches remain
  unchanged. Executor-specific replay bundles are disposable rather than
  committed as false stable fixtures.
- Local verification passed all 23 commands: `npm run format:check`,
  `npm run typecheck`, `npm test`, `npm run build`, `validate:example`, all twelve
  existing/new example commands, the three existing CLI drivers, package dry-run
  inspection, diff whitespace and preserved-file checks. **348 tests / 38 files**
  include **71 new behavioral tests**, ten real packaged-command scenarios,
  generated TypeScript type-check/runtime execution in normal CI, committed
  source-capture reproduction and a legacy research-workspace portable capture.
  All 45 prior CLI cases and three native helpers passed. The new example's 17
  generated files regenerate byte-for-byte. The package contains 358 files,
  includes all new public surfaces/examples and excludes private caches, work
  files and evaluation records. Prior examples and original evaluation files
  remain unchanged.
- Evidence is local implementation/verification, not human acceptance, release,
  authentication or production activation. The inspection reports recorded
  bindings, unavailable offline raw rediscovery, and authentication/current
  authorization/active state as not evaluated. Whole-record replacement can
  produce a different internally consistent capture; P09/P10 must bind it to
  external trusted grants and signed approval. Both legacy promoters still
  block v2. M4–M8 and the separate Seeder adoption remain outstanding; the full
  goal is active. Deferred comparative-benefit measurements remain deferred.

### P09 exact proposals and authenticated approvals, 2026-10-10

- Added [GOVERNANCE.md](GOVERNANCE.md), pure governance SDK/model exports and five
  new 1.0 schema identities: closed vocabulary, external trusted consumer
  configuration, generated byte manifests, unapproved proposals and approval
  envelopes. All 31 previously published schema/pack byte identities are
  unchanged, including P08's source capture and replay/comparison 3.0.
- Proposals bind the complete admitted source-bound replay, exact protected
  baseline manifest/replay, consumer/environment, deployment intent, proposer
  attribution, full trust revision/digest, computed action/fact requirements
  and complete recomputed consumer artifact inventory. All selected projections
  must belong to the named consumer. JSON and native TypeScript output use the
  existing emitters and fixed filenames; missing, extra or swapped bytes reject.
- Approval uses Ed25519 over the complete JCS UTF-8 payload with fixed
  `urn:metamap:approval:1` domain. The envelope binds payload and external
  signature. Strict parsing rejects unsupported fields/algorithms, duplicate and
  escaped duplicate member names, invalid Unicode, accessors, non-JSON values,
  invalid times and noncanonical crypto encodings. Only exact Ed25519 public
  SPKI DER and 64-byte signatures are supported; the library accepts no private
  keys and implements no signer.
- Verification uses separately supplied current protected baseline, external
  principal/key/grant configuration and current trusted clock. It checks the
  full trust digest as well as revision, exact candidate/manifest/delta,
  principal/key binding, signature, current validity, revocation, environment
  and every action/fact scope. It cannot combine a grant's action with an
  unrelated grant's fact. Key/grant intervals cover the complete signed
  approval interval; historical replay time cannot extend approval.
- Bootstrap, rollback, authority, policy, waiver, budget and law changes require
  the authenticated external owner role plus matching grants. Graph-declared
  ownership, agent/service wildcard grants and ordinary viability waivers
  cannot bypass this. Scoped ordinary implementation rebinding can be
  explicitly granted to an agent. Policy classification is conservative and
  may require owner approval for tightening as well as relaxation. Trust-root
  mutations remain outside ordinary candidate records and under external owner
  control.
- Local verification passed all **24 commands**, including format/type/build,
  **407 tests / 40 files**, thirteen example commands, the three prior command
  drivers, package/diff/preservation checks. **59 new behavioral tests** cover
  the published RFC 8032 verification vector, independent WebCrypto signing,
  forgery, scope/clock/revocation, stale baseline/trust, self-appointed ownership,
  output inventory and valid graph/law/evidence/assessment/budget/context/
  projection/source changes invalidating old approval. The new synthetic
  example is also tested in normal CI and type-checks/executes the exact reviewed
  native lookup/path helper bytes through public root/subpath exports.
- All 45 prior command cases and three native helpers passed. The 17 P08 source
  example outputs regenerate identically; all prior examples and original
  evaluation files remain unchanged. Package inspection finds 374 public files,
  includes the governance surfaces and excludes work/evaluation/private caches.
  Initial fixture duplicate-scope and invalid assessment-revision failures were
  corrected without relaxing validation; invalid revision remains a regression
  check. The example's mistaken slot assertion was corrected to the existing
  two-dependency contract, then native verification passed.
- This increment verifies the pure proposal/approval layer, not protected
  activation or actual state permissions. P10 must connect both activation
  interfaces to externally protected current state/configuration, serialize
  stale-base checks, test idempotent retry and separately approved rollback,
  stage complete immutable artifacts and atomically replace one manifest.
  Both legacy promoters still block v2. No production signing, release, merge,
  consumer activation or human acceptance is inferred. M4/P10, M5–M8 and separate
  Seeder adoption remain outstanding; the full goal is active.

### P10 — protected activation, verified first Linux profile

- Both existing activation interfaces now dispatch governed requests through the
  shared P09 evaluator. The host supplies current trust and clock; the request
  cannot supply either. A governed memory instance rejects the legacy overload.
  Legacy APIs still reject v2. Complete immutable manifests bind candidate,
  approved bytes, historical external trust, baseline and trusted decision time.
- The first persistent profile uses a root-controlled Linux promoter with
  disjoint protected paths, regular no-follow files without hard links, private
  kernel locking, immutable directories/manifests, byte/inventory rechecks,
  current pre-commit authorization, and one atomic pointer. A fixed stdin wrapper
  is supplied; no production configuration, credentials or installation is made.
- Exact authorized retries preserve current state. Fresh owner approval is
  required for rollback. Revocation prevents new activation without retiring
  current state. Post-pointer sync/response failure reports indeterminate.
  No discovered orphan or repair candidate is automatically applied.
- The 19 portable lifecycle tests pass, including stale-base and fresh rollback.
  Three portable transport/unsupported-platform checks pass locally. The Linux
  tests are included in normal npm test and require actual separate UID writes,
  native consumer execution, concurrency and real SIGKILL recovery at five phases.
  Linux acceptance is recorded separately below. Initial new fixture
  locator and per-test timeout failures were corrected without relaxing semantic
  validation or acceptance assertions. Type/build checks pass.
- The initial full local 24-command regression gate passed: 429 tests / 42 files with
  16 Linux cases skipped, 13 example commands, 45 previous command cases and three
  native helpers, format/type/build, package and preservation checks. The package
  contains 388 public files and excludes test/work/private fixture storage.
  All 36 previously published schema/pack files, prior examples and original
  evaluation files remain unchanged; the 17 source example outputs are byte-stable.
  The additional Linux fixture privilege probe is covered by format/JavaScript
  checks and awaits actual CI execution along with the transaction cases.
- First Linux CI at b5215f7 failed: 435 tests passed, nine failed, one skipped,
  with three fixture RPC errors. All five real SIGKILL phases passed, but the
  native consumer failed because its trusted application module context was
  absent. Four memory and four remaining Linux failures were timer overruns;
  synchronous fixture subprocess calls also blocked the test worker's RPC.
  This run does not establish M4 acceptance or the unexecuted permission probe.
- The test host now supplies the trusted ESM application metadata and uses
  asynchronous subprocess transport. Only the new large scenario timers are
  sized for observed CI work; authorization/byte/permission assertions and
  approval validity windows remain unchanged. A temporary timer-edit syntax
  error was caught and corrected before publication.
- Consumer ownership review found that a reading UID may also be the proposer
  UID. The first filesystem profile now requires root-owned trust/state and
  descendants; reading UID ownership cannot become a trust root. A new separate
  account case rejects a proposer-owned pointer even with unchanged valid bytes.
  Other service-owner profiles require separate design/acceptance.
- The corrected full local 24-command gate passed: 429 tests / 42 files,
  including the 19 memory and three transport/platform tests. Seventeen Linux
  cases remain skipped locally. All 39 now-published schema/pack files and
  prior examples/evaluation records are preserved; the 17 source outputs are
  byte-stable. Thirteen examples, 45 command cases, three native helpers and
  the 388-file package inspection also pass.
- Exact-head [Linux CI at 3ffb4cd](https://github.com/roryscot/metamap/actions/runs/38031196431)
  passed: 445 tests / 42 files, one unsupported-platform skip and zero unhandled
  errors. The separate unprivileged UID exercised all 24 denied operations,
  writable proposal storage and the protected native consumer. The proposer-owned
  valid-pointer regression passed, as did concurrent/stale-base cases, all five
  actual SIGKILL phases, fresh rollback and indeterminate response handling.
  M4 is implemented and verified for this first root-owned Linux profile;
  this is synthetic acceptance, not production installation or owner acceptance.
  M5–M8 and separate Seeder
  adoption remain outstanding; the full goal stays active.

### P11 — bounded read-only repair, verified supplied-edit profile

- New request/result 1.0 contracts bind a verified rejected replay3, required
  consumer projections, four explicit supplied edit kinds, allowed/protected
  facts, finite candidate/edit/depth/time bounds and declared ordinal costs.
  Source/policy requirements are preserved; graph-reference updates are explicit
  in whole returned patches. Scope declarations never establish authorization.
- The existing compiler/projector, capture/comparison and governance classifier
  evaluate each candidate. Reports retain blocked and rejected attempts,
  remaining failures, source/risk/runtime differences and required approval
  actions. Every viable repair remains approval-required; none is applied.
- Exact decimal finite-space counts, cooperative cancellation and elapsed
  stops distinguish incomplete search from absence of a viable supplied repair.
  Rank uses changed editable records, summed supplied costs and stable identity.
  Minimum claims require the full supplied space; parsing recomputes candidates,
  patch/outputs, classification, rank and coverage even after rehashing.
- The strict new repair command creates only a new explicitly requested report;
  it preserves existing files and exposes no apply/sign/trust/clock option.
  The synthetic example restores the missing declared network provider, retains
  proof/risk checks, executes native generated provider bindings and paths, and
  checks actual command rejection and search limits.
- The initial focused checks exposed a missing registered legacy issue schema
  and a duplicate fixture whose distinct IDs legitimately deduplicated to one
  projected target. Registration and an actually rejected duplicate-ID fixture
  were corrected without changing existing projection semantics. The corrected
  35 API checks and native/command workflow pass, including retained proof rejection
  and ten actual command cases; type/build checks pass.
- The full local 25-command gate passed: 465 tests / 44 files, with 17 Linux
  permission cases explicitly skipped on this Mac. Fourteen examples, 45 previous
  command cases, the ten new repair cases and native workflows pass. All 39
  published schema/pack files, prior examples and original evaluation records
  remain unchanged; the 17 source outputs are byte-stable. The 401-file public
  package contains the new SDK/contracts/example and excludes private test/work
  storage. Exact-head [Linux CI at26ec924](https://github.com/roryscot/metamap/actions/runs/38034024320)
  passed: 481 tests / 44 files, one unsupported-platform skip and zero unhandled
  errors. The 35 repair API checks and new command/native workflow passed, as did
  the independent UID boundary (24 denied operations) and all five actual SIGKILL
  recovery phases. M5 is implemented and verified for this finite supplied-edit
  profile. M6–M8 and separate Seeder adoption remain outstanding; the full goal
  stays active. No human acceptance, release or production activation is inferred.

### P12 — shared explanation API and command, implemented and verified

- New request/report 1.0 contracts bind complete source-bound captures, a stable
  consumer/operation or mapping selection, optional matched before capture and
  verified supplied repair report. The report uses existing replay, compiler,
  comparison and governance classifiers; no additional reasoner is introduced.
- Focused navigation retains incident bindings and recorded proof premises,
  literal locators, captured shard/receipt links, fact-scoped owner/delegation
  declarations, actual slots and path-tree results, uncertainty/evidence/models,
  whole-projection risk charges and original issue subjects. Focus truncation,
  missing/duplicate records and unavailable checks remain explicit.
- Checked proof status requires the exact verified viable generation; recorded
  proofs in rejected captures remain recorded. Exact pack digest is required for
  a rule match. Before/current input changes remain separate from assigned issue
  subjects and declared dependency paths. Duplicate identities prevent an
  ambiguous comparison, and the existing one-path/conservative-seeding limit
  and unestablished unique cause are disclosed.
- Ownership and captures do not establish authenticated current grants or active
  state. Existing classification supplies approval requirements, while supplied
  alternatives retain blocked/rejected outcomes, coverage and finite minimum
  limits. No source write, approval, activation or owner message occurs.
- The first focused run caught an unavailable uncertainty schema that still
  required six checked dimensions, frozen proof fixture mutation and an unchanged
  zero-cost tampering fixture. The new contract and fixtures were corrected.
  A test assumption about the missing premise's issue subject was replaced with
  exact original-issue preservation plus a separate real downstream slot failure.
  All 28 API tests and the distribution-backed workflow pass, including ten
  actual command cases; type/build checks pass.
- The full local 26-command gate passed: 494 tests / 46 files, with 17 Linux
  permission cases skipped on this Mac. Fifteen examples, 45 previous command
  cases, ten repair and ten explanation command cases, and native workflows
  pass. All 42 published schema/pack files, prior examples and original evaluation
  records are preserved; 17 source outputs are byte-stable. The public package
  contains 414 files and excludes private tests/work/cache.
- Exact-head [Linux CI at 5008938](https://github.com/roryscot/metamap/actions/runs/38035906204)
  succeeded: 510 tests / 46 files, one off-profile skip and no unhandled errors.
  The 28 explanation API tests and distribution-backed workflow passed alongside
  the actual 24-operation proposer UID denial probe and all five SIGKILL recovery
  phases. All 45 published schema/pack files are now immutable. P12 is implemented
  and verified. M6 requires P13's complete gate; no human acceptance, release or
  production activation is inferred.

### P13 — local semantic debugger, verification in progress

- The public static renderer reproduces explanation report1 before displaying
  the same bindings, captured inputs/owners/sources, exact rules and premises,
  uncertainty/risk, original issues, input changes and supplied alternatives.
  The new `inspect` command accepts a bare report or the closed saved `explain`
  result, preserves existing files and creates only explicitly named new output.
  No new schema, dependency, framework or reasoning engine is introduced.
- All input text is escaped. URLs remain literal text; generated links are
  internal. A fixed stylesheet is hash-bound in a restrictive content security
  policy. Native links/disclosures and named keyboard-scrollable table regions
  expose the records without scripts, fetching, approval or activation.
- Focused type/build checks and seven tests in two files passed. The public
  example checks twelve scenarios and eleven actual command cases, preserving
  source/input/existing output bytes. An initial result-unwrapping type error was
  corrected before these checks; strict JSON and report verification remain.
- Actual Codex in-app browser acceptance passed 39 checks: twelve states in
  default desktop and 375×812 narrow views; section navigation; skip-link focus;
  keyboard proof disclosure and table scrolling; independent changed origins;
  legal, blocked and rejected alternatives; and visible conflicting evidence.
  Screenshots were inspected. The initial long-label heading overflow was fixed;
  cramped narrow tables were changed to local horizontal scrolling. All profiles
  were rerun. No input external HTTP request or executable input node occurred;
  the browser tool's own local extension injection was recorded separately.
  Temporary viewport/tracing state was restored and the loopback server stopped.
- The full local 27-command gate passed: 501 tests / 48 files with 17 Linux
  cases skipped on this Mac, sixteen examples, 45 previous command cases, ten
  repair, ten explanation and eleven inspection command cases, plus native
  workflows. Format/type/build, package inspection (420 public files), all 45
  published schema/pack pins, 17 source outputs and original evaluation/example
  preservation passed. Exact-head Linux CI remains pending.
- Browser success is acceptance of this synthetic local profile, not
  human review, authenticated current approval, unique causation, scientific
  truth, benefit superiority or production activation. M7/M8 and separate tested
  Seeder adoption remain outstanding; the full goal stays active.

## 19. Historical first release and localization cycle

The text below preserves the prior plan and completed-cycle records. Its
measurement-dependent expansion gate was not met. The user subsequently deferred
those metrics and requested capability building; sections 1–18 now govern the
proposed sequence. The original protocols, scorers, and reports remain unchanged.

The first release adds reproducible compiler replay and read-only comparison of
explicit candidate changes. The existing graph, viability, generation, and
projection contracts remain the foundation. Broader governance and domain work
depends on evidence from a software pilot.

### Scope and authority

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

### Build sequence

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

### First implementation

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

### Fixed evaluation requirements

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

### Verification

Each contract change includes version/compatibility decisions, matching portable
schemas and TypeScript models/validators, valid and invalid tests, and updated
examples and documentation. Preserve the prior graph/generation digests for
identical inputs.

Run `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`,
the affected example commands, and `npm pack --dry-run`. Check regenerated
outputs against committed fixtures. Run `example:topology` whenever topology
behavior is involved.

### Progress

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

### Localization continuation

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
unchanged original pilot still meets only 3/4 producer-issue criteria and returns
exit status `1`. Its expansion gate remains unmet. Package 0.7.1 preserves all
portable contracts. Native tests pass (88 tests in 21 files) and type checking
passes; formatting, build, all native examples, generated-output consistency,
and package dry-run also pass. The protocol, script, and current executor
identities match the stored localization experiment. The original pilot's
protocol, scorer, and first two reports are unchanged. The implementation fix
was pushed on the same branch as commit `95bf738`.
