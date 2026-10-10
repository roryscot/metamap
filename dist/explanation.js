import { readFileSync } from "node:fs";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { canonicalDigest, canonicalJson, parseStrictJson, } from "./canonical.js";
import { compareMetamapBundles, } from "./counterfactual.js";
import { DERIVATION_ATTRIBUTE } from "./derivation-model.js";
import { governedChangeRequirements } from "./governance.js";
import { parseMetamapRepairReport } from "./repair.js";
import { replayMetamap } from "./replay.js";
import { relationPackDigest } from "./relation-pack.js";
import { parseSourceReplayBundle } from "./semantic-replay.js";
import { selectorMatches } from "./viability.js";
const Ajv2020 = Ajv2020Module.default;
const addFormats = addFormatsModule.default;
const ajv = addFormats(new Ajv2020({ allErrors: true, strict: true }));
const schema = (name) => JSON.parse(readFileSync(new URL("../schemas/" + name + ".schema.json", import.meta.url), "utf8"));
for (const name of [
    "metamap-graph",
    "metamap-viability",
    "metamap-generation",
    "relation-pack",
    "relation-pack-v2",
    "metamap-derivation",
    "metamap-viability-v2",
    "metamap-generation-v2",
    "metamap-projection-spec",
    "metamap-projection",
    "metamap-path-tree",
    "metamap-projection-spec-v2",
    "metamap-projection-v2",
    "metamap-path-tree-v2",
    "metamap-source-receipt",
    "metamap-snapshot",
    "metamap-replay",
    "metamap-replay-v2",
    "metamap-config",
    "metamap-source-capture",
    "metamap-source-inspection",
    "metamap-replay-v3",
    "metamap-counterfactual",
    "metamap-counterfactual-v2",
    "metamap-counterfactual-v3",
    "metamap-governance",
    "metamap-repair",
    "metamap-repair-request",
    "metamap-repair-result",
    "metamap-explanation",
    "metamap-explanation-request",
    "metamap-explanation-result",
])
    ajv.addSchema(schema(name));
export class MetamapExplanationError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "MetamapExplanationError";
    }
}
function fail(code, message) {
    throw new MetamapExplanationError(code, message);
}
const equal = (a, b) => canonicalJson(a) === canonicalJson(b);
const clone = (value) => JSON.parse(canonicalJson(value));
const sortText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const unique = (ids) => [...new Set(ids)].sort(sortText);
const state = (count) => count === 0 ? "missing" : count === 1 ? "known" : "ambiguous";
function freeze(value) {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
}
function checked(value, name) {
    const text = canonicalJson(value);
    if (Buffer.byteLength(text, "utf8") > 64 * 1024 * 1024)
        fail("EXPLANATION_SIZE_LIMIT", "Explanation input exceeds 64 MiB");
    const validate = ajv.getSchema(schema(name).$id);
    if (!validate(value))
        fail("EXPLANATION_INVALID_SHAPE", name +
            ": " +
            (validate.errors ?? [])
                .map((item) => (item.instancePath || "$") + " " + item.message)
                .join("; "));
    return JSON.parse(text);
}
export function metamapExplanationDigest(value) {
    canonicalJson(value);
    if (typeof value !== "object" || value === null || Array.isArray(value))
        fail("EXPLANATION_INVALID_SHAPE", "Expected an explanation object");
    return canonicalDigest(Object.fromEntries(Object.entries(value).filter(([key]) => key !== "id" && key !== "digest")));
}
function addressed(content, kind) {
    const digest = canonicalDigest(content);
    return {
        ...content,
        id: "urn:metamap:" + kind + ":" + digest.slice(7),
        digest,
    };
}
function checkAddress(value, kind) {
    const digest = metamapExplanationDigest(value);
    if (value.digest !== digest ||
        value.id !== "urn:metamap:" + kind + ":" + digest.slice(7))
        fail("EXPLANATION_CONTENT_MISMATCH", "Explanation address does not bind its complete content");
}
function verifiedCapture(value) {
    const capture = parseSourceReplayBundle(value);
    const result = replayMetamap(capture);
    if (result.status !== "verified")
        fail("EXPLANATION_REPLAY_REJECTED", result.issues
            .map((issue) => issue.code + ": " + issue.message)
            .join("; "));
    return capture;
}
export function parseMetamapExplanationRequest(value) {
    const request = checked(value, "metamap-explanation-request");
    checkAddress(request, "explanation-request");
    verifiedCapture(request.capture);
    const { graph, projections } = request.capture.inputs;
    if (!projections.some((spec) => spec.consumer === request.consumer))
        fail("EXPLANATION_UNKNOWN_CONSUMER", "Consumer has no captured projection");
    if (request.selection.projection !== null &&
        !projections.some((spec) => spec.id === request.selection.projection &&
            spec.consumer === request.consumer))
        fail("EXPLANATION_PROJECTION_MISMATCH", "Selected projection does not belong to the captured consumer");
    if (request.before) {
        verifiedCapture(request.before);
        if (request.before.inputs.graph.id !== graph.id ||
            request.before.inputs.graph.namespace !== graph.namespace ||
            !request.before.inputs.projections.some((spec) => spec.consumer === request.consumer))
            fail("EXPLANATION_BASELINE_MISMATCH", "Before capture is a different graph or consumer");
    }
    if (request.repairs) {
        parseMetamapRepairReport(request.repairs);
        if (!equal(request.repairs.request.baseline, request.capture) ||
            request.repairs.request.consumer !== request.consumer)
            fail("EXPLANATION_REPAIR_MISMATCH", "Repairs must refer to the exact selected current capture and consumer");
    }
    return freeze(request);
}
export function parseMetamapExplanationRequestJson(text) {
    return parseMetamapExplanationRequest(parseStrictJson(text));
}
export function createMetamapExplanationRequest(capture, options) {
    return parseMetamapExplanationRequest(addressed({
        schemaVersion: "1.0.0",
        capture,
        before: options.before ?? null,
        repairs: options.repairs ?? null,
        consumer: options.consumer,
        selection: options.selection,
        limits: options.limits ?? {
            maximumSubjects: 128,
            maximumMappings: 128,
        },
    }, "explanation-request"));
}
function duplicateGraphIds(graph) {
    return unique([graph.entities, graph.mappings, graph.authorities].flatMap((records) => records
        .map((record) => record.id)
        .filter((id, index, ids) => ids.indexOf(id) !== index)));
}
function view(request) {
    const capture = request.capture;
    const { graph, policy } = capture.inputs;
    const before = request.before;
    const oldGraph = before?.inputs.graph;
    const compilation = capture.expected.compilation;
    const generation = compilation.status === "viable" ? compilation.generation : null;
    const selected = request.selection.id;
    const selectedRecords = (request.selection.kind === "entity" ? graph.entities : graph.mappings).filter((record) => record.id === selected);
    const mappingIds = new Set();
    const subjectIds = new Set();
    if (request.selection.kind === "entity")
        subjectIds.add(selected);
    else
        mappingIds.add(selected);
    // Only incident bindings and their recorded proof dependencies are followed.
    // This is navigation over captured records, not a new causal inference engine.
    if (request.selection.kind === "entity")
        for (const document of [graph, oldGraph])
            for (const mapping of document?.mappings ?? [])
                if ([...mapping.sources, ...mapping.targets].includes(selected))
                    mappingIds.add(mapping.id);
    const allProofs = [
        ...policy.derivations,
        ...(before?.inputs.policy.derivations ?? []),
    ];
    let changed = true;
    while (changed) {
        changed = false;
        for (const proof of allProofs)
            if (mappingIds.has(proof.result.id))
                for (const premise of proof.premises)
                    if (!mappingIds.has(premise.mapping)) {
                        mappingIds.add(premise.mapping);
                        changed = true;
                    }
    }
    const allMappingIds = unique(mappingIds);
    const focusedMappings = allMappingIds.slice(0, request.limits.maximumMappings);
    if (request.selection.kind === "mapping" &&
        !focusedMappings.includes(selected)) {
        focusedMappings[focusedMappings.length - 1] = selected;
        focusedMappings.sort(sortText);
    }
    for (const document of [graph, oldGraph])
        for (const mapping of document?.mappings ?? [])
            if (focusedMappings.includes(mapping.id))
                for (const id of [...mapping.sources, ...mapping.targets])
                    subjectIds.add(id);
    const allSubjectIds = unique(subjectIds);
    const focusedSubjects = allSubjectIds.slice(0, request.limits.maximumSubjects);
    // Keep the explicitly selected entity even when the focus limit is small.
    if (request.selection.kind === "entity" &&
        !focusedSubjects.includes(selected)) {
        focusedSubjects[focusedSubjects.length - 1] = selected;
        focusedSubjects.sort(sortText);
    }
    const focus = new Set([...focusedSubjects, ...focusedMappings]);
    const entityKinds = new Map(graph.entities
        .filter((entity) => graph.entities.filter((other) => other.id === entity.id).length === 1)
        .map((entity) => [entity.id, entity.kind]));
    const projections = capture.inputs.projections
        .filter((spec) => spec.consumer === request.consumer &&
        (request.selection.projection === null ||
            spec.id === request.selection.projection))
        .map((spec) => {
        const evaluated = capture.expected.projections.find((output) => output.specId === spec.id);
        return {
            spec,
            status: compilation.status === "rejected"
                ? "generation-rejected"
                : evaluated?.result.status === "projected"
                    ? "projected"
                    : "rejected",
            entries: evaluated?.result.status === "projected"
                ? evaluated.result.projection.entries.filter((entry) => request.selection.kind === "entity"
                    ? entry.subject.id === selected
                    : entry.slots.some((slot) => slot.mappings.includes(selected)))
                : [],
            risk: evaluated?.result.status === "projected"
                ? evaluated.result.projection.semantic.risk
                : null,
            riskScope: "whole-projection",
            pathTree: evaluated?.pathTree ?? null,
        };
    });
    const mappings = focusedMappings.map((id) => {
        const current = graph.mappings.filter((mapping) => mapping.id === id);
        const previous = oldGraph?.mappings.filter((mapping) => mapping.id === id) ?? [];
        const proofs = policy.derivations.filter((proof) => proof.result.id === id);
        const declarations = policy.mappings.filter((declaration) => "mapping" in declaration
            ? declaration.mapping === id
            : current.some((mapping) => selectorMatches(mapping, declaration.select, entityKinds)));
        const derived = current.map((mapping) => mapping.attributes?.[DERIVATION_ATTRIBUTE] !== undefined);
        const assessments = policy.assessments.filter((assessment) => assessment.subject === id);
        const evidenceIds = new Set([
            ...assessments.flatMap((assessment) => assessment.evidence),
            ...proofs.flatMap((proof) => proof.uncertainty.flatMap((dimension) => dimension.evidence)),
        ]);
        return {
            id,
            state: state(current.length),
            current,
            before: previous,
            interpretation: !current.length
                ? "unavailable"
                : derived.every(Boolean)
                    ? "derived"
                    : derived.every((value) => !value)
                        ? "asserted"
                        : "mixed",
            activity: generation && current.length === 1
                ? generation.activeMappings.includes(id)
                    ? "active"
                    : "inactive"
                : "unavailable",
            declarationState: state(declarations.length),
            declarations,
            proofs: proofs.map((record) => ({
                record,
                validation: generation &&
                    generation.semantic.derivations.some((checked) => equal(checked, record))
                    ? "checked"
                    : "recorded",
                rules: capture.inputs.relationPacks
                    .filter((pack) => pack.id === record.rule.pack.id &&
                    pack.version === record.rule.pack.version &&
                    relationPackDigest(pack) === record.rule.pack.digest &&
                    pack.schemaVersion === "2.0.0")
                    .flatMap((pack) => pack.schemaVersion === "2.0.0"
                    ? pack.laws.filter((law) => law.id === record.rule.id)
                    : []),
            })),
            dependencies: generation?.semantic.dependencies.filter((dependency) => dependency.mapping === id) ?? [],
            uncertainty: {
                validation: generation && current.length === 1 ? "checked" : "unavailable",
                dimensions: generation?.semantic.uncertainty.find((item) => item.mapping === id)
                    ?.dimensions ?? [],
            },
            assessments,
            evidence: policy.evidence.filter((record) => evidenceIds.has(record.id) || record.subjects.includes(id)),
            riskCharges: projections.flatMap((projection) => (projection.risk?.classifications ?? [])
                .filter((charge) => charge.mapping === id)
                .map((charge) => ({
                projection: projection.spec.id,
                classification: charge.classification,
                cost: charge.cost,
            }))),
        };
    });
    const owners = graph.authorities.filter((declaration) => focus.has(declaration.concept) || focus.has(declaration.id));
    let ownerChanged = true;
    while (ownerChanged) {
        ownerChanged = false;
        for (const declaration of [...owners])
            if (declaration.mode === "delegated")
                for (const parent of graph.authorities.filter((record) => record.id === declaration.delegatedFrom))
                    if (!owners.includes(parent)) {
                        owners.push(parent);
                        ownerChanged = true;
                    }
    }
    const sourceFocus = new Set([
        ...focus,
        ...owners.flatMap((owner) => [owner.id, owner.source, owner.concept]),
    ]);
    const sources = [];
    for (const [side, bundle] of [
        ["current", capture],
        ["before", before],
    ]) {
        if (!bundle)
            continue;
        for (const adapter of bundle.inputs.sourceCapture.adapters) {
            const records = [];
            for (const kind of ["entity", "mapping", "authority"]) {
                const key = kind === "entity"
                    ? "entities"
                    : kind === "mapping"
                        ? "mappings"
                        : "authorities";
                for (const id of unique(adapter.document[key]
                    .filter((record) => sourceFocus.has(record.id))
                    .map((record) => record.id))) {
                    const supplied = adapter.document[key].filter((record) => record.id === id);
                    const evaluated = bundle.inputs.graph[key].filter((record) => record.id === id);
                    records.push({
                        kind,
                        id,
                        state: supplied.length > 1 || evaluated.length > 1
                            ? "ambiguous"
                            : !evaluated.length
                                ? "missing"
                                : equal(supplied[0], evaluated[0])
                                    ? "identical"
                                    : "candidate-differs",
                    });
                }
            }
            if (records.length)
                for (const receipt of bundle.inputs.sourceReceipts.filter((receipt) => receipt.source === adapter.sourceId))
                    sources.push({ side, source: adapter.sourceId, receipt, records });
        }
    }
    const issues = compilation.issues.map((issue) => ({
        stage: "compilation",
        issue,
    }));
    for (const spec of projections) {
        const output = capture.expected.projections.find((item) => item.specId === spec.spec.id);
        for (const issue of output?.result.issues ?? [])
            issues.push({ stage: "projection", specId: spec.spec.id, issue });
        for (const issue of output?.pathTree?.issues ?? [])
            issues.push({ stage: "path-tree", specId: spec.spec.id, issue });
    }
    let comparison = {
        status: "unavailable",
        reason: "No before capture was supplied",
        report: null,
    };
    let requirements = [];
    if (before) {
        const duplicates = unique([
            ...duplicateGraphIds(graph),
            ...duplicateGraphIds(before.inputs.graph),
        ]);
        if (duplicates.length)
            comparison = {
                status: "unavailable",
                reason: "Duplicate record identities prevent an unambiguous before/after comparison: " +
                    duplicates.join(", "),
                report: null,
            };
        else {
            const result = compareMetamapBundles(before, capture);
            if (result.status !== "compared")
                fail("EXPLANATION_COMPARISON_REJECTED", result.issues.map((issue) => issue.message).join("; "));
            comparison = {
                status: "compared",
                reason: "Differences in the supplied verified captures; a unique cause is not established",
                report: result.report,
            };
            requirements = governedChangeRequirements(before, capture, request.consumer);
        }
    }
    return {
        schemaVersion: "1.0.0",
        request,
        selection: {
            state: state(selectedRecords.length),
            occurrences: selectedRecords.length,
        },
        admission: compilation.status,
        subjects: focusedSubjects.map((id) => {
            const current = graph.entities.filter((entity) => entity.id === id);
            return {
                id,
                state: state(current.length),
                current,
                before: oldGraph?.entities.filter((entity) => entity.id === id) ?? [],
            };
        }),
        mappings,
        ownership: {
            interpretation: "declared-fact-ownership",
            authentication: "not-evaluated",
            declarations: owners,
        },
        sources,
        sourceInspection: capture.expected.sourceInspection,
        projections,
        issues: issues.map((entry) => ({
            ...entry,
            relevance: !entry.issue.subjectId
                ? "global"
                : entry.issue.subjectId === selected
                    ? "selection"
                    : focus.has(entry.issue.subjectId)
                        ? "dependency"
                        : "other",
        })),
        navigation: {
            subjectIds: focusedSubjects,
            mappingIds: focusedMappings,
            omittedSubjects: allSubjectIds.length - focusedSubjects.length,
            omittedMappings: allMappingIds.length - focusedMappings.length,
            status: allSubjectIds.length > focusedSubjects.length ||
                allMappingIds.length > focusedMappings.length
                ? "truncated"
                : "complete",
        },
        comparison,
        approval: {
            status: comparison.status === "compared" &&
                compilation.status === "viable" &&
                selectedRecords.length === 1 &&
                capture.inputs.projections
                    .filter((spec) => spec.consumer === request.consumer)
                    .every((spec) => {
                    const output = capture.expected.projections.find((item) => item.specId === spec.id);
                    return (output?.result.status === "projected" &&
                        (!spec.pathTree || output.pathTree?.status === "projected"));
                })
                ? "approval-required"
                : "unavailable",
            requirements,
            currentAuthority: "not-evaluated",
            active: "not-evaluated",
            reason: "Captured checks and declared owners do not authenticate current authority; activation requires independent current trust, approval and protected state verification",
        },
        alternatives: {
            status: request.repairs ? "verified" : "not-supplied",
            attempts: request.repairs?.attempts.map((attempt) => attempt.id) ?? [],
            applied: false,
        },
        causality: {
            interpretation: "declared-dependency-propagation",
            uniqueCause: "not-established",
            limitations: [
                "Impact retains one path per subject; additional possible origins are not enumerated",
                "Conservative impact seeds can include policy, source and context changes; an issue subject is not an input change origin",
                "Recorded dependencies and input differences do not prove domain truth or a unique cause",
                "Raw source bytes are not captured; rediscovery, authentication and active state are not evaluated",
                "A recorded derivation in a rejected generation is not reported as checked",
                "Risk charges describe the whole consumer projection, not a probability of correctness",
            ],
        },
    };
}
export function explainMetamap(value) {
    try {
        const request = parseMetamapExplanationRequest(value);
        const report = addressed(view(request), "explanation");
        checked(report, "metamap-explanation-result");
        return { status: "explained", report: freeze(clone(report)) };
    }
    catch (error) {
        return {
            status: "rejected",
            issues: [
                {
                    code: error instanceof MetamapExplanationError
                        ? error.code
                        : "EXPLANATION_INPUT_REJECTED",
                    message: error instanceof Error
                        ? error.message
                        : "Unable to explain captured checks",
                },
            ],
        };
    }
}
export function parseMetamapExplanationReport(value) {
    const report = checked(value, "metamap-explanation-result");
    checkAddress(report, "explanation");
    const request = parseMetamapExplanationRequest(report.request);
    const expected = addressed(view(request), "explanation");
    if (!equal(report, expected))
        fail("EXPLANATION_RESULT_MISMATCH", "Explanation differs from its verified inputs and shared evaluators");
    return freeze(report);
}
export function parseMetamapExplanationReportJson(text) {
    return parseMetamapExplanationReport(parseStrictJson(text));
}
//# sourceMappingURL=explanation.js.map