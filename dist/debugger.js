import { createHash } from "node:crypto";
import { canonicalDigest } from "./canonical.js";
import { parseMetamapExplanationReport } from "./explanation.js";
const styles = `
:root{color-scheme:light dark;font:16px/1.55 system-ui,sans-serif;background:#f4f5f7;color:#18202b}
body{margin:0}header,main,footer{max-width:1080px;margin:auto;padding:24px}header{padding-top:40px}
h1{font-size:clamp(1.6rem,4vw,2.4rem);line-height:1.2;margin:8px 0}h2{font-size:1.4rem;margin:0 0 12px}h3{font-size:1.1rem}
h1,h2,h3,p,li,td,th,summary,code{overflow-wrap:anywhere}a{color:#1255aa;text-underline-offset:3px}a:hover{text-decoration-thickness:2px}
a:focus-visible,summary:focus-visible,.table:focus-visible{outline:3px solid #ad5d00;outline-offset:4px;border-radius:2px}.skip{position:absolute;top:-80px}.skip:focus{top:8px;background:#fff;padding:8px}
nav{display:flex;flex-wrap:wrap;gap:8px 20px;margin:20px 0}section{background:#fff;border:1px solid #d9dfe6;border-radius:10px;padding:22px;margin:0 0 22px;scroll-margin-top:16px}
.identity,.muted{color:#536072;font-size:.9rem}.badge{display:inline-block;border:1px solid #8695a8;border-radius:20px;padding:3px 12px;margin:3px 8px 3px 0}.notice{border-left:4px solid #b86c00;padding:8px 14px;background:#fff5e6}
.table{overflow-x:auto}table{border-collapse:collapse;width:100%;text-align:left;font-size:.94rem}.wide{min-width:640px}.scroll-hint{display:none}th,td{padding:10px 12px;border-bottom:1px solid #d9dfe6;vertical-align:top}th{background:#f0f3f7}caption{text-align:left;font-weight:600;margin:0 0 8px}
details{margin:12px 0}summary{cursor:pointer;font-weight:600}pre{font:13px/1.5 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:32rem;overflow:auto;padding:14px;background:#f0f3f7;border-radius:6px}
article{border-top:1px solid #d9dfe6;padding-top:14px;margin-top:18px}code{font-size:.88em}footer{font-size:.9rem}.empty{font-style:italic;color:#536072}
@media(max-width:600px){header,main,footer{padding:16px}section{padding:16px}th,td{padding:8px}nav{gap:10px 16px}.scroll-hint{display:block}}
@media(prefers-color-scheme:dark){:root{background:#151a22;color:#e8edf5}section{background:#202733;border-color:#455163}a{color:#8cbfff}.identity,.muted,.empty{color:#bac5d4}th,pre{background:#2c3543}th,td,article{border-color:#455163}.notice{background:#3b2c1b}.skip:focus{background:#202733}}
`;
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const code = (value) => "<code>" + escape(value) + "</code>";
const evidence = (title, value) => "<details><summary>" +
    escape(title) +
    "</summary><pre>" +
    escape(JSON.stringify(value, null, 2)) +
    "</pre></details>";
const empty = (text) => '<p class="empty">' + escape(text) + "</p>";
const list = (values) => "<ul>" +
    values.map((value) => "<li>" + escape(value) + "</li>").join("") +
    "</ul>";
function table(caption, headings, rows) {
    if (!rows.length)
        return empty("No " + caption.toLowerCase() + " are available in this report.");
    const wide = headings.length >= 3;
    return ((wide
        ? '<p class="scroll-hint muted">Scroll horizontally to see all columns. Keyboard: focus the table, then use the arrow keys.</p>'
        : "") +
        '<div class="table"' +
        (wide
            ? ' tabindex="0" role="region" aria-label="' +
                escape(caption) +
                ' scrollable table"'
            : "") +
        "><table" +
        (wide ? ' class="wide"' : "") +
        "><caption>" +
        escape(caption) +
        "</caption><thead><tr>" +
        headings
            .map((heading) => '<th scope="col">' + escape(heading) + "</th>")
            .join("") +
        "</tr></thead><tbody>" +
        rows
            .map((row) => "<tr>" +
            row.map((cell) => "<td>" + cell + "</td>").join("") +
            "</tr>")
            .join("") +
        "</tbody></table></div>");
}
const recordAnchor = (kind, id) => kind + "-" + canonicalDigest({ id }).slice(7);
/** Static view of the shared verified report. Input URLs and scripts are text only. */
export function renderMetamapExplanationHtml(value) {
    const report = parseMetamapExplanationReport(value);
    const { request } = report;
    const selected = report.subjects.find((subject) => subject.id === request.selection.id);
    const label = report.selection.state === "known" && request.selection.kind === "entity"
        ? (selected?.current[0]?.label ?? request.selection.id)
        : request.selection.id;
    const link = (id) => report.navigation.mappingIds.includes(id)
        ? '<a href="#' + recordAnchor("mapping", id) + '">' + escape(id) + "</a>"
        : report.navigation.subjectIds.includes(id)
            ? '<a href="#' + recordAnchor("entity", id) + '">' + escape(id) + "</a>"
            : code(id);
    const section = (id, title, body) => '<section id="' +
        id +
        '" aria-labelledby="' +
        id +
        '-title"><h2 id="' +
        id +
        '-title">' +
        title +
        "</h2>" +
        body +
        "</section>";
    const sections = [];
    sections.push(section("bindings", "Runtime bindings", report.projections
        .map((projection) => "<h3>" +
        escape(projection.spec.id) +
        "</h3><p>Result: " +
        code(projection.status) +
        ".</p>" +
        (projection.entries.length
            ? table("Selected runtime slots", ["Operation", "Slot", "Targets", "Mappings"], projection.entries.flatMap((entry) => entry.slots.map((slot) => [
                link(entry.subject.id),
                escape(slot.name),
                slot.targets
                    .map((target) => escape(target.label ?? target.id) +
                    "<br>" +
                    code(target.id))
                    .join("<br>"),
                slot.mappings.map(link).join("<br>"),
            ])))
            : empty("No runtime entries are available for this selection; inspect its selection state and check failures.")) +
        (projection.pathTree
            ? "<p>Path-tree result: " +
                code(projection.pathTree.status) +
                ".</p>" +
                evidence("Captured path-tree result", projection.pathTree)
            : empty("No path tree was requested or produced.")))
        .join("")));
    sections.push(section("failures", "Check failures and warnings", table("Original check issues", ["Stage", "Check", "Assigned subject", "Message", "Relevance"], report.issues.map((entry) => [
        escape(entry.stage),
        code(entry.issue.code),
        entry.issue.subjectId ? link(entry.issue.subjectId) : "Global",
        escape(entry.issue.message),
        escape(entry.relevance),
    ])) +
        "<p>These are the original issue subjects. Observed input changes appear separately below.</p>" +
        evidence("Original issues and recorded causal paths", report.issues)));
    sections.push(section("inputs", "Governing inputs", "<p>Focus: " +
        code(report.navigation.status) +
        "; omitted subjects " +
        report.navigation.omittedSubjects +
        ", omitted mappings " +
        report.navigation.omittedMappings +
        ".</p>" +
        report.subjects
            .map((subject) => '<article id="' +
            recordAnchor("entity", subject.id) +
            '"><h3>' +
            escape(subject.state === "known"
                ? (subject.current[0].label ?? subject.id)
                : subject.id) +
            '</h3><p class="identity">' +
            code(subject.id) +
            "</p><p>Record state: " +
            code(subject.state) +
            "; current occurrences: " +
            subject.current.length +
            ".</p>" +
            evidence("Current entity records and literal locators", subject.current) +
            evidence("Before entity records", subject.before) +
            "</article>")
            .join("") +
        report.mappings
            .map((mapping) => '<article id="' +
            recordAnchor("mapping", mapping.id) +
            '"><h3>' +
            escape(mapping.id) +
            "</h3><p>" +
            code(mapping.state) +
            " · " +
            code(mapping.interpretation) +
            " · activity " +
            code(mapping.activity) +
            " · declaration " +
            code(mapping.declarationState) +
            ".</p>" +
            table("Mapping endpoints", ["Relation", "Sources", "Targets", "Information loss"], mapping.current.map((record) => [
                code(record.relation),
                record.sources.map(link).join("<br>"),
                record.targets.map(link).join("<br>"),
                escape(record.lossiness),
            ])) +
            evidence("Current mapping records", mapping.current) +
            evidence("Before mapping records", mapping.before) +
            evidence("Recorded applicability and declarations", mapping.declarations) +
            "</article>")
            .join("")));
    sections.push(section("owners", "Declared owners", "<p>Fact-scoped ownership and delegation are captured declarations. Current authenticated authority is unavailable.</p>" +
        table("Owner declarations", ["Concept", "Facts", "Source", "Mode", "Delegated from"], report.ownership.declarations.map((owner) => [
            link(owner.concept),
            owner.facts.map(escape).join("<br>"),
            link(owner.source),
            escape(owner.mode),
            owner.mode === "delegated" ? code(owner.delegatedFrom) : "—",
        ])) +
        evidence("Complete declared owner records", report.ownership)));
    sections.push(section("sources", "Captured sources", "<p>Membership links a recorded shard to its receipt. Raw bytes and current rediscovery are unavailable; no source URL is fetched.</p>" +
        (report.sources.length
            ? ""
            : empty("No captured source membership is available for this selection.")) +
        report.sources
            .map((source) => "<article><h3>" +
            escape(source.source) +
            " · " +
            escape(source.side) +
            "</h3>" +
            table("Captured record membership", ["Kind", "Record", "Match to evaluated record"], source.records.map((record) => [
                escape(record.kind),
                link(record.id),
                escape(record.state),
            ])) +
            evidence("Source receipt and input fingerprints", source.receipt) +
            evidence("Exact captured adapter and shard records", (source.side === "current"
                ? request.capture
                : request.before)?.inputs.sourceCapture.adapters.filter((adapter) => adapter.sourceId === source.source) ?? []) +
            "</article>")
            .join("") +
        evidence("Source inspection status", report.sourceInspection)));
    sections.push(section("rules", "Rules and derivations", "<p>A proof in a rejected generation remains recorded. A checked proof binds the exact verified viable generation. The rule is an application of a declared law, without inferred authority.</p>" +
        (report.mappings.some((mapping) => mapping.proofs.length)
            ? ""
            : empty("No derivations are recorded in this focused selection.")) +
        report.mappings
            .flatMap((mapping) => mapping.proofs.map((proof) => "<article><h3>" +
            escape(mapping.id) +
            "</h3><p>Proof validation: " +
            code(proof.validation) +
            ". Result relation: " +
            code(proof.record.result.relation) +
            "; information loss: " +
            escape(proof.record.result.lossiness) +
            ".</p>" +
            (proof.rules.length
                ? table("Exact bound laws", ["Rule", "Operation", "Operands", "Result relation"], proof.rules.map((rule) => [
                    code(rule.id),
                    escape(rule.operation),
                    rule.operands.map(code).join("<br>"),
                    code(rule.resultRelation),
                ]))
                : empty("No exact pack/law match is available for this recorded proof.")) +
            table("Ordered premises", ["Step", "Mapping"], proof.record.premises.map((premise, index) => [
                String(index + 1),
                link(premise.mapping),
            ])) +
            evidence("Recorded proof context and intermediate result", proof.record) +
            evidence("Checked dependency records", mapping.dependencies) +
            "</article>"))
            .join("")));
    sections.push(section("risk", "Uncertainty and consumer risk", "<p>Risk costs apply to the whole projection, including premise dependencies. They are consumer-defined ordinal costs, not probabilities of correctness.</p>" +
        report.projections
            .map((projection) => "<h3>" +
            escape(projection.spec.id) +
            "</h3>" +
            (projection.risk
                ? "<p>Risk evaluation: " +
                    code(projection.risk.status) +
                    "; total cost: " +
                    escape(projection.risk.totalCost ?? "unavailable") +
                    ".</p>" +
                    table("Whole-projection risk charges", ["Mapping", "Classification", "Cost"], projection.risk.classifications.map((charge) => [
                        link(charge.mapping),
                        escape(charge.classification),
                        String(charge.cost),
                    ])) +
                    evidence("Captured risk summary", projection.risk)
                : empty("Risk total is unavailable for this rejected or missing projection.")) +
            evidence("Recorded consumer budgets", request.capture.inputs.policy.riskBudgets.filter((budget) => budget.consumer === request.consumer)))
            .join("") +
        report.mappings
            .map((mapping) => "<article><h3>" +
            escape(mapping.id) +
            "</h3><p>Uncertainty validation: " +
            code(mapping.uncertainty.validation) +
            ".</p>" +
            table("Typed uncertainty dimensions", ["Dimension", "State", "Evidence", "Measurement models"], mapping.uncertainty.dimensions.map((dimension) => [
                escape(dimension.dimension),
                escape(dimension.status),
                dimension.evidence.map(code).join("<br>"),
                dimension.measurementModels.map(code).join("<br>"),
            ])) +
            evidence("Recorded assessments and measurement models", mapping.assessments) +
            evidence("Recorded supporting or conflicting evidence", mapping.evidence) +
            "</article>")
            .join("")));
    const comparison = report.comparison.report;
    sections.push(section("changes", "Observed input changes", "<p>" +
        escape(report.comparison.reason) +
        '</p><p class="notice">A unique cause is not established. The impact engine retains one path per subject and conservatively seeds some changes.</p>' +
        (comparison
            ? table("Graph input changes", ["Record kind", "Input identity", "Change", "Properties"], comparison.graph.changes.map((change) => [
                escape(change.kind),
                link(change.id),
                escape(change.change),
                (change.changedProperties ?? []).map(escape).join(", "),
            ])) +
                table("Source component changes", ["Scope", "Source", "Component"], comparison.provenance.changes.map((change) => [
                    escape(change.scope),
                    code(change.subject),
                    escape(change.component),
                ])) +
                table("Before and current binding states", ["Projection", "Before", "Current", "Bindings changed"], comparison.projections.map((projection) => [
                    code(projection.specId),
                    escape(projection.before),
                    escape(projection.after),
                    String(projection.bindingsChanged),
                ])) +
                evidence("Before/current slot values and changes", comparison.projections) +
                evidence("All captured input changes and content bindings", comparison.inputChanges) +
                evidence("Recorded dependency propagation paths", comparison.impact)
            : empty("A verified before/current comparison is unavailable."))));
    sections.push(section("approval", "Approval requirements", "<p>Status: " +
        code(report.approval.status) +
        ". " +
        escape(report.approval.reason) +
        "</p>" +
        table("Required candidate actions", ["Action", "Subject", "Fact"], report.approval.requirements.map((requirement) => [
            escape(requirement.action),
            link(requirement.subject),
            code(requirement.fact),
        ])) +
        "<p>Current authenticated authority and deployed state are not evaluated. This view cannot approve or activate a change.</p>"));
    const repairs = request.repairs;
    sections.push(section("alternatives", "Supplied alternatives", repairs
        ? "<p>Search: " +
            code(repairs.status) +
            "; attempted " +
            repairs.coverage.attempted +
            " of " +
            escape(repairs.coverage.totalCombinations) +
            "; unexamined " +
            escape(repairs.coverage.unexamined) +
            ".</p><p>Minimum claim: " +
            code(repairs.minimality.status) +
            "; global minimum is not established. No alternative is applied.</p>" +
            repairs.attempts
                .map((attempt) => "<article><h3>" +
                escape(attempt.edits.join(" + ")) +
                "</h3><p>" +
                (attempt.status === "blocked"
                    ? "Blocked by proposal boundaries."
                    : attempt.viable
                        ? "Viable candidate; approval required."
                        : "Evaluated and rejected for this consumer.") +
                "</p>" +
                (attempt.status === "blocked"
                    ? list(attempt.issues.map((issue) => issue.code + ": " + issue.message))
                    : "<p>Declared rank: " +
                        attempt.rank.editedRecords +
                        " edited records, ordinal cost " +
                        attempt.rank.semanticCost +
                        ".</p>" +
                        list(attempt.remainingFailures.map((failure) => failure.issue.code + ": " + failure.issue.message)) +
                        evidence("Candidate binding changes, risk and original failures", attempt.comparison) +
                        evidence("Candidate graph/policy patch and explicit binding updates", attempt.patch) +
                        evidence("Required candidate approval actions", attempt.requirements)) +
                "</article>")
                .join("") +
            evidence("Finite search coverage and minimum limitations", {
                coverage: repairs.coverage,
                minimality: repairs.minimality,
                ranking: repairs.request.ranking,
            })
        : empty("No verified repair alternatives were supplied.")));
    sections.push(section("limits", "Interpretation and evidence", list(report.causality.limitations) +
        "<p>Replay reproduces the supplied checks. It does not authenticate a caller-supplied baseline or establish domain truth.</p>" +
        evidence("Report identity and captured executor", {
            id: report.id,
            digest: report.digest,
            compiler: request.capture.compiler,
        }) +
        evidence("Complete shared structured report", report)));
    const styleHash = createHash("sha256")
        .update(styles, "utf8")
        .digest("base64");
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;sha256-' +
        styleHash +
        '&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"><title>MetaMap inspection · ' +
        escape(label) +
        "</title><style>" +
        styles +
        '</style></head><body><a class="skip" href="#main">Skip to inspection</a><header><p class="muted">METAMAP · CAPTURED INSPECTION</p><h1>' +
        escape(label) +
        '</h1><p class="identity">Consumer ' +
        code(request.consumer) +
        "<br>" +
        code(request.selection.id) +
        '</p><span class="badge">Admission: ' +
        escape(report.admission) +
        '</span><span class="badge">Selection: ' +
        escape(report.selection.state) +
        '</span><p>Captured checks · read-only inspection · current authority unavailable</p><nav aria-label="Inspection sections">' +
        [
            ["bindings", "Bindings"],
            ["failures", "Failures"],
            ["inputs", "Inputs"],
            ["owners", "Owners"],
            ["sources", "Sources"],
            ["rules", "Rules"],
            ["risk", "Risk"],
            ["changes", "Changes"],
            ["approval", "Approval"],
            ["alternatives", "Alternatives"],
            ["limits", "Evidence and limits"],
        ]
            .map(([id, name]) => '<a href="#' + id + '">' + name + "</a>")
            .join("") +
        '</nav></header><main id="main" tabindex="-1">' +
        sections.join("") +
        "</main><footer>Local report. No source fetching, approval or activation is performed.</footer></body></html>\n");
}
//# sourceMappingURL=debugger.js.map