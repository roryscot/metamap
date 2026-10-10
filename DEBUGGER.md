# Captured semantic explanations

The explanation API follows a stable consumer operation or mapping through its
captured bindings, declared owners, sources, rule premises, uncertainty, risk
and check results. It uses the same compiler, replay, comparison and repair
evaluators as admission. It does not load a provider or execute code named in
an input.

The structured report, command and local HTML view share one verified report.
The HTML uses ordinary links, disclosure controls and scrollable tables; it
does not require JavaScript or a hosted application.

## Create and inspect an explanation

```typescript
import {
  createMetamapExplanationRequest,
  explainMetamap,
  parseMetamapExplanationReport,
} from "@roryscot/metamap";

const request = createMetamapExplanationRequest(currentCapture, {
  consumer: "urn:example:network-consumer",
  selection: {
    kind: "entity",
    id: "urn:example:consumer",
    projection: "urn:example:projection",
  },
  before: earlierCapture,
  repairs: suppliedRepairReport,
  limits: { maximumSubjects: 128, maximumMappings: 128 },
});
const result = explainMetamap(request);
if (result.status === "explained") {
  const report = parseMetamapExplanationReport(result.report);
  console.log(report.projections, report.issues, report.comparison);
}
```

`before` and `repairs` are optional. `projection: null` inspects all captured
projections belonging to the consumer. The selection uses a literal stable ID
and record kind; labels and locators never establish identity. Missing and
duplicate records are retained as explicit `missing` and `ambiguous` states.
The consumer and any explicitly selected projection must exist in the capture.

All captures require source-bound replay 3.0 and successful reproduction by the
currently installed executor. That reproduction may faithfully reproduce a
rejected admission or projection; rejection is useful debugger input. An older
executor capture is not silently recaptured or impersonated. A supplied before
capture must identify the same graph namespace and consumer. A repair report
must bind the exact current capture and selected consumer, and pass its existing
candidate/coverage verification.

```text
metamap explain explanation-request.json
metamap explain explanation-request.json new-report.json
npm run example:explain
```

The command returns the same `{ status, report }` result as the public API. It
accepts strict UTF-8 JSON with no duplicate keys. Exit `0` means the inspection
was produced, including explicit rejected, missing or ambiguous states; `1`
means invalid input or output failure, and `2` means incorrect positional usage.
Only an explicitly named new report file is created, using exclusive creation.
Existing files, captured source records, input requests and active state are
preserved. There are no apply, trust, signing, clock or provider-loading options.
The synthetic example checks public API/subpath agreement, the actual command,
the removed provider origin and unchanged original source bytes. An optional
example argument names a new file for the structured report.

## Open the local inspection view

```text
metamap explain explanation-request.json new-report.json
metamap inspect new-report.json new-view.html
npm run example:debugger
```

Open `new-view.html` locally. `inspect` accepts either the bare verified report
or the exact closed `{ status: "explained", report }` result saved by `explain`.
It reproduces the report before rendering; a rehashed forged report is rejected.
Without an output path it writes HTML to standard output. Input size, strict
UTF-8/JSON handling, exclusive output creation and exit codes match `explain`.
Unknown options, including approval or application options, fail.

The public renderer accepts a bare report:

```typescript
import { renderMetamapExplanationHtml } from "@roryscot/metamap/debugger";

if (result.status === "explained") {
  const html = renderMetamapExplanationHtml(result.report);
}
```

Start at the selected operation, then follow Bindings, Inputs, Owners, Sources,
Rules, Risk, Changes and Alternatives. Rule premises link back to their recorded
mappings. Before/current origins and original issue subjects remain separate.
The evidence disclosures contain the complete report and exact executor identity.
Missing, ambiguous, rejected, empty and truncated states remain visible.

Use Tab and Enter for links and disclosures. Wide tables have a named focusable
region; arrow keys scroll their columns within the page on narrow screens.
Locators, labels and evidence are escaped literal text. No supplied URL becomes
a link, image, script or other resource. A content security policy permits only
the renderer's fixed, hash-bound stylesheet. This is passive inspection: no
source fetching, provider execution, owner message, approval or activation.

The debugger example checks twelve public scenarios and eleven actual command
cases, including direct consumption of saved explanation results. An optional
argument names a **new directory** for HTML and bare JSON reports; its default
temporary directory is removed. The example performs API/command checks only;
the build plan records separate actual browser acceptance.

## Read the report

- `selection`, `subjects` and `mappings` retain the actual records and occurrence
  counts. Navigation includes the operation's incident bindings and their
  recorded proof premises. Limits are 1–256 subjects and mappings; omitted
  counts and `truncated` remain visible. Full captured inputs are still bound
  in the request, and focus limits do not discard check failures.
- `projections` shows actual selected entries and slots, generation/projection
  failures and path-tree results. Risk charges describe the **whole projection**,
  including unique checked premise dependencies. They are ordinal consumer
  costs, not probabilities. A rejected projection has no invented runtime entry
  or risk total; its original issues and recorded budget remain inspectable.
- `mappings` separates asserted and derived records, activity and effective
  declaration availability. A proof is `checked` only when the verified viable
  generation includes that exact proof. A rejected generation exposes recorded
  proofs, premises, context and uncertainty evidence without calling them
  checked. Rule matches require the exact pack identity, version and digest.
- `ownership` exposes fact-scoped declarations and their captured delegation
  parents. These are declared ownership records, without authentication or
  inferred grants. `sources` links exact captured shard membership to source
  receipts. Membership does not independently establish scientific truth or
  the producer's identity; receipts contain fingerprints, not raw source bytes.
- `issues` retains original compilation, projection and path-tree issue subjects
  and causal paths, with selection/dependency/other/global relevance. A subject
  assigned by a check is not relabeled as the producer that changed.
- `comparison` uses the existing before/current comparison, including actual
  graph, policy, source-component and runtime-binding differences. Duplicate
  graph record identities make comparison unavailable instead of silently
  selecting the last occurrence. No before capture means no inferred changes.
- `approval` classifies the complete candidate delta when two unambiguous
  captures are available. A viable consumer still requires independent current
  trust and approval at protected activation. Rejected or unknown consumer
  results remain unavailable. The report never establishes current authority
  or activation from its supplied records.
- `alternatives` references all verified supplied repair attempts; their full
  blocked/evaluated results, remaining failures, requirements, rank, coverage
  and finite minimum limits remain in `request.repairs`. Viable alternatives
  require approval. Inspection never applies them or sends an owner a message.

Request/report 1.0 have separate closed schema identities and JCS content
addresses. Report parsing reproduces every derived field, including focused
records, rule status, source links, risk, changes and approval requirements.
Changing a report and recalculating its digest cannot change what its inputs
actually explain. Request and report validation have a 64 MiB serialized limit;
this is an input size limit, not a real-time execution guarantee.

## Interpretation limits

The strongest limit is that a caller can supply a different internally
consistent captured baseline. Successful replay authenticates neither that
baseline nor the source owner. Only independent current consumer trust and
protected activation can establish the authorized deployed state.

The existing impact engine retains one path per subject and conservatively seeds
policy/source/context changes. The report preserves all observed input changes
and explicitly states that a unique cause is not established; it does not claim
to enumerate every possible causal origin. Recorded dependencies explain the
configured checks, not domain truth. The original 3/4 producer-localization pilot
and later direct-baseline tie remain unchanged. Deferred review-time or benefit
metrics are not prerequisites and are not claimed as passing.
