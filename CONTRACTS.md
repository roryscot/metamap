# Capability contract decisions

Decision record for M0 of [BUILD_PLAN.md](BUILD_PLAN.md), dated 2026-10-09.
The plan controls scope and sequence; this record controls the new wire
contracts and their compatibility boundaries. Decisions below authorize
implementation under the active build goal. A decided version is not an
implemented or released version. Published schemas remain immutable.

## Lifecycle and operation boundaries

| State             | Evidence required                                                            | What it permits                                           |
| ----------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| Discovered        | Adapter result and its byte inputs                                           | Inspection of an emitted shard                            |
| Declared          | Explicit graph entity, mapping, or authority                                 | Structural validation; no inferred identity or permission |
| Derived           | Explicit mapping proposal and checked premises/rule                          | Inspection and explicit inclusion in a candidate graph    |
| Admitted          | Successful context, semantic, evidence, and consumer-budget evaluation       | Checked projection generation                             |
| Approval required | Candidate actions evaluated against external consumer grants                 | Request for the named authorized principal's decision     |
| Authorized        | Exact signed artifact manifest, fresh trusted grant, matching base and scope | One protected promotion attempt                           |
| Active            | Successful serialized base comparison and manifest-pointer replacement       | Consumer reads from that immutable artifact set           |

Admission is not authorization. Source attribution is not authentication.
Discovery does not validate the underlying scientific claim. Incomplete
knowledge is reported as unknown; a violated requirement is rejected.
Shard composition merges compatible declarations. Relation composition derives
a new correspondence using a named executable law; it does not merge owners.

| Operation                  | Reads                                                             | Writes                                                           | Failure / unsupported result                                                                               |
| -------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Discover                   | Authorized local source/configuration                             | Adapter cache; explicit generation command's requested outputs   | Existing discovery errors; no accepted consumer output replacement on rejection                            |
| Compile / project          | Captured graph, policy, context, packs, semantic sidecars         | Returned immutable results; explicitly requested candidate files | Rejected with structured issues; no activation                                                             |
| Compose correspondences    | Named premises and laws, declared bounds/context                  | Returned proposals and proof records only                        | Rejected, unsupported, or incomplete; no graph mutation                                                    |
| Capture / replay / compare | Captured inputs, pinned executor                                  | Requested reports/bundle only                                    | Executor mismatch, invalid capture, or unknown result; no fetch, named-code import, approval, or promotion |
| Repair search              | Explicit baseline and allowed edit templates/targets              | Returned candidate proposals only                                | Bounds/incomplete status; no edit application                                                              |
| Explain / debugger         | Captured evaluations and proposals                                | Requested report or read-only local viewer                       | Explicit missing/unknown fields; no mutation controls                                                      |
| Approve                    | Exact candidate manifest and external grants                      | Signed approval supplied by an authorized principal              | Reject missing scope, key, grant, current validity or exact binding                                        |
| Promote                    | Candidate files, approval, trusted grants, current active pointer | Immutable artifact set and one active manifest pointer           | Reject before pointer replacement; stale-base comparison serialized                                        |
| Scientific import / export | Licensed pinned local mapping bytes and format profile            | Requested candidate shard or loss-aware export                   | Unsupported profile/value, preserved distinction, or explicit loss report                                  |

Both `MetamapActivator.activate` and `promoteMetamapGeneration` must dispatch
between a documented legacy ungoverned mode and a protected mode. A governed
consumer selects protected mode in externally controlled configuration; a
candidate cannot change that selection. The existing entry points retain their
v1 behavior until protected mode is implemented and deliberately selected.
OS/service permissions must prevent proposal writers from changing the
promoter, trust configuration, signing keys, or active state. Cryptographic
verification inside a process with unrestricted write access is insufficient.

## Version dispatch and content binding

Graph 2.0.0, configuration 1.0.0, relation pack 1.0.0, policy/generation 1.0.0,
projection spec/result 1.0.0, and replay/comparison 1.0.0 remain unchanged.
Descriptive `transitive`, `inverse`, and `composesWith` fields in legacy packs
do not gain entailment behavior. Legacy symmetric traversal retains its behavior.

New documents are strict, with matching TypeScript model, portable schema,
parser, executable validation, explicit package export, and valid/invalid
fixtures introduced together. Readers reject unknown versions and mandatory
operations. No reader substitutes current inputs for pinned missing inputs.

| New surface                            | Version      | Required semantic content and digest coverage                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relation pack                          | 2.0.0        | Existing relation definitions plus typed `laws`: unique rule ID, `reverse` or `chain`, ordered operand relations, result relation, context condition, binary endpoint/kind conditions. Every pack byte value, including rules and version, is bound. Transitivity is an explicit `R,R -> R` chain. No arbitrary scripts.                           |
| Derivation                             | 1.0.0        | Ordered premise mapping IDs and value digests, result mapping value, rule ID, pack ID/version/digest, context and its digest, premise proof dependencies, conservative loss/uncertainty summary. Content-addressed ID and digest omit only their own fields. Authority is never derived.                                                           |
| Viability policy                       | 2.0.0        | Existing v1 requirements plus explicit derivations, typed assessments, consumer semantic requirements, and risk rules/budget. All are in the policy digest. A proof-backed mapping is explicit in graph 2.0.0 with inferred provenance and a proof reference in its attributes; that reference alone is insufficient.                              |
| Uncertainty assessment (policy member) | policy 2.0.0 | Subject, dimension, status (`supported`, `contradicted`, `unknown`, `not-applicable`), evidence IDs, assessor, source revision, optional named measurement model, and required reason for not-applicable. Missing assessment means unknown. Dimension names: identity, context, provenance, completeness, causal-relevance, conflicting-authority. |
| Consumer risk budget (policy member)   | policy 2.0.0 | Consumer-owned mapping classifications, nonnegative safe-integer costs, maximum total cost and optional lossy/inferred limits; classification/dependency completeness requirements. Sum over unique used mapping IDs including proof closure; equality at maximum is allowed. Costs are ordinal policy choices, not probabilities.                 |
| Generation                             | 2.0.0        | Legacy graph/policy/context/evaluation binding plus exact pack values/digests, checked derivations, assessment/requirement results, complete admitted dependency graph and risk policy identity. It records admission, never present-time approval.                                                                                                |
| Projection spec / result               | 2.0.0        | Existing selection/slots plus named consumer budget. Result binds generation, graph, spec, selected entries, unique used dependency closure, classifications, costs, totals, and uncertainty results. Unused/inactive mappings are excluded.                                                                                                       |
| Replay / comparison                    | 2.0.0        | Capture every v2 input, resulting admission/projection or rejection, source snapshot/receipts when available, and exact executor/runtime/schema/dependency identity. Compare proof, owner, risk and consumer-artifact changes; approval freshness remains a separate current-time evaluation.                                                      |
| Change proposal                        | 1.0.0        | Exact base manifest identity, consumer/environment, requested actions and fact scopes, graph/policy/context/pack/proof/budget bindings, generated artifact byte manifest and change classification. Authority expansion, policy relaxation, new waivers, budget increases and trust changes are explicit actions.                                  |
| Signed approval                        | 1.0.0        | Exact proposal/artifact manifest digest, action and fact scopes, base, consumer/environment, trusted grant revision, principal/key ID, issuance/expiry, signature profile and signature. Candidate-supplied keys/grants never establish trust.                                                                                                     |
| Activation manifest                    | 1.0.0        | Exact immutable artifact paths and byte digests, graph/policy/generation/projection/proposal bindings, accepted approval IDs, expected previous manifest, consumer/environment and activation time. One atomic pointer identifies the complete set.                                                                                                |
| Trusted consumer configuration         | 1.0.0        | External principals/keys, scoped grants, revocation revision, mode, consumer/environment and permitted promoter locations. It is never accepted from proposals, graphs, replay or discovery.                                                                                                                                                       |
| Bounded repair request / result        | 1.0.0        | Baseline evaluation identity, exact permitted templates/targets, depth/candidate/time bounds, attempted candidate digests, compiled outcomes, deterministic rank, unexamined/bounded status and required approval actions. No source/active-state writes.                                                                                          |

Source lineage extends `MetamapSnapshot.sources` and `AdapterResult.inputs`;
there is no second source inventory. A v2 replay receipt binds the existing
source ID, source revision, adapter ID/version, adapter configuration digest,
byte inputs, and emitted shard digest. Available local locators are checked
against the consumer's permitted roots. A byte receipt is not authentication.
Unavailable raw bytes permit graph replay, with source rediscovery explicitly
unavailable.

Existing v1 value digests continue to use `stableJson`, including its locale
key ordering and trailing newline. New v2 values and new 1.0 sidecars use
RFC 8785 JSON Canonicalization Scheme (JCS), UTF-8, SHA-256, and the
`sha256:` prefix. A reference retains the referenced component's convention:
graph 2.0.0 documents, their explicit mappings, and imported relation packs
1.0.0 retain `valueDigest`, including when referenced from a new document.
A derivation's digest covers its complete JCS value except `id` and `digest`;
its optional `$schema` is covered when present. Its result excludes its own
`metamap:derivation` back-reference, preventing a digest cycle. A composition
request binds the full context; missing required keys are unknown, and a
changed context invalidates a captured proof. Depth counts the longest proof
chain; derivation count counts unique proof records in its dependency closure.
Both are explicitly bounded. Limits also bound proof validation work.
New-profile evaluation uses the canonical JSON value, so ECMAScript negative
zero is evaluated as the serialized zero. Existing programmatic graph values
may omit optional object fields with `undefined`; their reference digest still
omits those fields. Materialization checks data descriptors before copying and
does not run getters or `toJSON`. New policy and sidecar values reject undefined.
Signing uses Ed25519 over JCS UTF-8 bytes of the approval
payload excluding `signature`. Untrusted duplicate JSON keys, invalid Unicode,
nonfinite numbers and unsupported payload fields reject before verification.
Unicode is not normalized. The current trusted clock, not captured `as-of`,
controls expiry and revocation. These algorithms require executable conformance
and tampering tests in M2–M4; they are design decisions here.

## P05 projection and replay bindings

Projection spec 2.0.0 names a consumer and an explicit `budget` ID or `null`.
Null means that no typed budget was evaluated, not a zero cost. A consumer with
a declared budget must select a matching budget; opting out cannot bypass that
consumer's policy. Non-null budgets select the consumer's executable cost rules.
The result binds the exact generation/spec, unique used mapping dependency
closure, proof bindings, and a risk summary. Unused and inactive mappings are
excluded. The existing cardinality/kind selection algorithm remains shared.

Path-tree 2.0.0 is necessary because its projection and specification use new
digest conventions. It retains the existing tree structure and hydration
algorithm; it binds the actual v2 projection and spec, not internal legacy views.
Mixed wire versions reject. Existing 1.0.0 path-tree bytes are unchanged.

Replay 2.0.0 captures the full v2 policy, all registered pack values in dependency
order, exact graph/context/time, selected projection specs, expected outcomes
and installed executor identity. Its input contract reserves the existing
`MetamapSnapshot` value and source-receipt 1.0.0 records for P08; requested source
capture fails explicitly until implemented. Missing raw source bytes never
cause a fetch. Source receipts bind source/revision, adapter/version,
configuration, existing adapter input bytes and emitted shard, without granting
authentication. A verified rejection remains rejected and returns no projection.

Comparison 2.0.0 reuses the existing issue, evidence and consumer-entry diff
logic. It additionally binds proof, assessment, requirement, budget and lineage
changes, with dependency impact on both captured graphs. Derived activation
changes are unknown after a rejected generation; errors are effects rather than
automatically asserted change origins. All new content addresses cover the
entire JCS value except their own `id` and `digest`, including `$schema` when
present. No comparison or replay operation authorizes activation.

## M3 uncertainty and budget evaluation decisions

P06/P07 implement the reserved members of policy/generation/projection 2.0;
published schemas retain their byte identities. Assessments may name a graph
mapping, entity or authority. Entity assessments constrain incident mappings;
authority assessments constrain mappings touching the authority's concept.
Assessment revisions match a declared subject source revision when available,
otherwise the graph revision when available. These remain declared revision
bindings, not source authentication or raw-byte rediscovery.

An assessment explicitly binds its dimension to evidence of kind
`uncertainty:<dimension>`, scoped to the assessed subject. A referenced record's
full value is bound using JCS; its optional `digest` continues to describe the
referenced evidence artifact. Unsupported subject/evidence references, duplicate
record identities and mismatched dimensions/revisions reject. Evidence and
assessor attribution remain recorded claims; neither is authenticated by M3.
Evidence explicitly referenced by a valid assessment is evaluated within its
dimension. Other evidence retains the existing contradiction behavior, and
explicit legacy constraints still see all evidence. A typed requirement cannot
be waived through a legacy waiver.

Contradiction dominates unknown; unknown dominates support. A reasoned
not-applicable assessment can remove that dimension from consideration only
where the consumer explicitly permits that state. Combining different named
measurement models yields unknown unless contradiction already applies. No
confidence scores are averaged, multiplied or converted into dimension states.
Repeated evidence is counted once and cannot strengthen a summary. A derived
claim combines its premises and applicable direct assessments conservatively;
direct support cannot erase an unknown or contradicted premise.

Proof dependency bindings include all contributing assessment and evidence
values, alongside existing mapping/proof dependencies. Requirements use the
existing mapping selector semantics, apply to active mappings and fail with a
dimension-specific explanation. `requireEvidence` checks each contributing
assessment; an unsupported assertion cannot borrow another path's evidence.

Generation 2.0 binds the original policy and stores assessment/requirement/risk
inputs and evaluated summaries. It does not embed full evidence records. A
projection with assessments, requirements or budgets therefore requires
`semanticPolicy` in its compile
options (CLI `link --policy`), checks the exact policy binding and recompiles
with the captured context/time. Replay supplies its captured full policy. Missing
or stale policy/evidence rejects instead of trusting a recomputed generation hash.

Consumer budgets classify each unique mapping in the concrete projection proof
closure exactly once. Missing or overlapping classification rejects; even zero
cost must be explicitly assigned by the consumer. Costs and totals are safe
nonnegative integers; overflow rejects. Equality at each maximum is allowed.
A selected budget must belong to the named consumer. `budget: null` rejects
when that consumer has a declared budget; otherwise it remains not-evaluated,
with a null total. Unused and inactive mappings are excluded from accounting.

## Migration and fixed acceptance inputs

A v1 graph/policy continues through the existing compiler unchanged. A consumer
opts into v2 policy and pack schemas, supplies typed assessments and its own
requirements/cost rules, and explicitly includes any derived mapping and proof.
An old descriptive `transitive: true` does not migrate into a chain rule by
implication. Governance mode is selected separately by the trusted consumer.
Replay v1 always requires its exact recorded executor; a new executable must
not impersonate that executor to pass compatibility tests.

[The capability corpus](evaluation/capability-corpus.json) states independent
functional expectations before the corresponding features are implemented.
It is visible acceptance material, not a blinded empirical benefit study.
Its M1 cases are runnable consumer changes. Later milestone vectors are design
fixtures until their own executable checks exist. The legacy compatibility
manifest pins current example input/output values and schema bytes; new code
must preserve those legacy outputs. A schema/convention change requires a
new version and explicit migration, not updating the pins to get a pass.

Normative signing reference: [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html).
Scientific relation profiles will cite their normative source and never import
pragmatic toolkit chaining as an unstated SKOS law.
