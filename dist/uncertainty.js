import { readFileSync } from "node:fs";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { canonicalDigest, canonicalJson } from "./canonical.js";
import { DERIVATION_ATTRIBUTE, UNCERTAINTY_DIMENSIONS, } from "./derivation-model.js";
import { selectorMatches } from "./viability.js";
export const emptyUncertaintyInputs = Object.freeze({
    assessments: Object.freeze([]),
    evidence: Object.freeze([]),
});
const Ajv2020 = Ajv2020Module.default;
const addFormats = addFormatsModule.default;
const ajv = addFormats(new Ajv2020({ allErrors: true, strict: true }));
const schema = (name) => JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), "utf8"));
for (const name of [
    "metamap-graph",
    "metamap-viability",
    "metamap-derivation",
    "metamap-viability-v2",
])
    ajv.addSchema(schema(name));
const validateInputShape = ajv.compile({
    type: "object",
    additionalProperties: false,
    required: ["assessments", "evidence"],
    properties: {
        assessments: {
            type: "array",
            items: {
                $ref: `${schema("metamap-viability-v2").$id}#/$defs/assessment`,
            },
        },
        evidence: {
            type: "array",
            items: {
                $ref: `${schema("metamap-viability").$id}#/$defs/evidence`,
            },
        },
    },
});
const issue = (code, message, subjectId) => ({ code, message, ...(subjectId ? { subjectId } : {}) });
/** Checks recorded claims and their scope; it does not authenticate evidence. */
export function validateUncertaintyInputs(graph, inputs, prospectiveSubject, proofIds = []) {
    try {
        canonicalJson(inputs);
        if (!validateInputShape(inputs))
            return (validateInputShape.errors ?? []).map((error) => ({
                code: "INVALID_UNCERTAINTY_INPUT",
                message: error.message ?? "Invalid typed input",
                path: error.instancePath || "$",
            }));
        const subjects = new Map([
            ...graph.entities.map((entity) => [
                entity.id,
                entity.provenance?.sourceRevision ?? graph.revision,
            ]),
            ...graph.mappings.map((mapping) => [
                mapping.id,
                mapping.provenance.sourceRevision ?? graph.revision,
            ]),
            ...graph.authorities.map((authority) => [
                authority.id,
                authority.provenance.sourceRevision ?? graph.revision,
            ]),
            ...(prospectiveSubject
                ? [[prospectiveSubject, graph.revision]]
                : []),
        ]);
        const identities = new Set([...subjects.keys(), ...proofIds]);
        const issues = [];
        for (const id of proofIds)
            if (subjects.has(id))
                issues.push(issue("DUPLICATE_DERIVATION_ID", "Proof identity must be distinct from graph subject identities", id));
        for (const record of [...inputs.assessments, ...inputs.evidence]) {
            if (identities.has(record.id))
                issues.push(issue("DUPLICATE_UNCERTAINTY_ID", "Assessment and evidence identities must be unique and distinct from graph/proof identities", record.id));
            identities.add(record.id);
        }
        const evidence = new Map(inputs.evidence.map((entry) => [entry.id, entry]));
        for (const record of inputs.evidence)
            for (const subject of record.subjects)
                if (!subjects.has(subject))
                    issues.push(issue("UNKNOWN_UNCERTAINTY_EVIDENCE_SUBJECT", "Evidence references an unavailable graph subject", record.id));
        for (const assessment of inputs.assessments) {
            if (!subjects.has(assessment.subject))
                issues.push(issue("UNKNOWN_ASSESSMENT_SUBJECT", "An assessment must name an available graph subject or explicit prospective result", assessment.id));
            const revision = subjects.get(assessment.subject);
            if (revision !== undefined && assessment.sourceRevision !== revision)
                issues.push(issue("ASSESSMENT_REVISION_MISMATCH", `Assessment revision ${assessment.sourceRevision} differs from declared subject revision ${revision}`, assessment.id));
            for (const reference of assessment.evidence) {
                const record = evidence.get(reference);
                if (!record)
                    issues.push(issue("MISSING_UNCERTAINTY_EVIDENCE", "Referenced typed evidence is unavailable", assessment.id));
                else if (!record.subjects.includes(assessment.subject))
                    issues.push(issue("UNCERTAINTY_EVIDENCE_SCOPE_MISMATCH", "Evidence does not cover its assessed subject", assessment.id));
                else if (record.kind !== `uncertainty:${assessment.dimension}`)
                    issues.push(issue("UNCERTAINTY_EVIDENCE_DIMENSION_MISMATCH", "Evidence kind must name its assessed uncertainty dimension", assessment.id));
            }
        }
        return issues;
    }
    catch (error) {
        return [
            issue("INVALID_UNCERTAINTY_INPUT", error instanceof Error ? error.message : "Invalid typed input"),
        ];
    }
}
const unique = (values) => [...new Set(values)].sort();
export function unknownDimension(dimension) {
    return {
        dimension,
        status: "unknown",
        evidence: [],
        assessments: [],
        measurementModels: [],
        sourceRevisions: [],
    };
}
/** A qualitative meet, never an arithmetic confidence combination. */
export function combineUncertainty(dimension, values) {
    if (!values.length)
        return unknownDimension(dimension);
    const measurementModels = unique(values.flatMap((value) => value.measurementModels));
    const states = values.map((value) => value.status);
    const status = states.includes("contradicted")
        ? "contradicted"
        : states.includes("unknown")
            ? "unknown"
            : measurementModels.length > 1
                ? "unknown"
                : states.every((state) => state === "not-applicable")
                    ? "not-applicable"
                    : "supported";
    return {
        dimension,
        status,
        evidence: unique(values.flatMap((value) => value.evidence)),
        assessments: unique(values.flatMap((value) => value.assessments)),
        measurementModels,
        sourceRevisions: unique(values.flatMap((value) => value.sourceRevisions)),
    };
}
function assessed(assessment, evidence) {
    const results = assessment.evidence.map((id) => evidence.get(id).result);
    const status = results.includes("contradicts")
        ? "contradicted"
        : assessment.status === "supported" && results.includes("inconclusive")
            ? "unknown"
            : assessment.status;
    return {
        dimension: assessment.dimension,
        status,
        evidence: [...assessment.evidence],
        assessments: [assessment.id],
        measurementModels: assessment.measurementModel
            ? [assessment.measurementModel]
            : [],
        sourceRevisions: [assessment.sourceRevision],
    };
}
function applicableSubjects(graph, mapping) {
    const endpoints = new Set([...mapping.sources, ...mapping.targets]);
    return new Set([
        mapping.id,
        ...endpoints,
        ...graph.authorities
            .filter((authority) => authority.concept === mapping.id || endpoints.has(authority.concept))
            .map((authority) => authority.id),
    ]);
}
export function mappingUncertainty(graph, mapping, inputs, premises = []) {
    const subjects = applicableSubjects(graph, mapping);
    const assessments = inputs.assessments.filter((assessment) => subjects.has(assessment.subject));
    const evidence = new Map(inputs.evidence.map((entry) => [entry.id, entry]));
    return UNCERTAINTY_DIMENSIONS.map((dimension) => combineUncertainty(dimension, [
        ...premises.map((summary) => summary.find((entry) => entry.dimension === dimension) ??
            unknownDimension(dimension)),
        ...assessments
            .filter((assessment) => assessment.dimension === dimension)
            .map((assessment) => assessed(assessment, evidence)),
    ]));
}
export function uncertaintyDependencies(summary, inputs) {
    const records = new Map([...inputs.assessments, ...inputs.evidence].map((record) => [
        record.id,
        record,
    ]));
    const ids = unique(summary.flatMap((dimension) => [
        ...dimension.assessments,
        ...dimension.evidence,
    ]));
    return ids.map((id) => ({ id, digest: canonicalDigest(records.get(id)) }));
}
export function graphUncertainty(graph, proofs, inputs) {
    const byId = new Map(proofs.map((proof) => [proof.id, proof]));
    return graph.mappings.map((mapping) => {
        const reference = mapping.attributes?.[DERIVATION_ATTRIBUTE];
        return {
            mapping: mapping.id,
            dimensions: typeof reference === "string" && byId.has(reference)
                ? byId.get(reference).uncertainty
                : mappingUncertainty(graph, mapping, inputs),
        };
    });
}
/** Checks internal completeness only; record truth needs the bound original inputs. */
export function uncertaintySummaryIssues(summaries) {
    const issues = [], ids = new Set();
    for (const summary of summaries) {
        if (ids.has(summary.mapping))
            issues.push(issue("DUPLICATE_UNCERTAINTY_SUMMARY", "Each mapping requires one uncertainty summary", summary.mapping));
        ids.add(summary.mapping);
        if (summary.dimensions.length !== UNCERTAINTY_DIMENSIONS.length ||
            new Set(summary.dimensions.map((entry) => entry.dimension)).size !==
                UNCERTAINTY_DIMENSIONS.length)
            issues.push(issue("INCOMPLETE_UNCERTAINTY_SUMMARY", "Each uncertainty dimension must appear exactly once", summary.mapping));
        for (const entry of summary.dimensions) {
            if (entry.status !== "unknown" && !entry.assessments.length)
                issues.push(issue("UNBOUND_UNCERTAINTY_STATE", "A known state requires contributing assessment identities", summary.mapping));
            for (const values of [
                entry.evidence,
                entry.assessments,
                entry.measurementModels,
                entry.sourceRevisions,
            ])
                if (new Set(values).size !== values.length)
                    issues.push(issue("DUPLICATE_UNCERTAINTY_REFERENCE", "Summary references must be unique", summary.mapping));
        }
    }
    return issues;
}
export function uncertaintyRequirementIssues(graph, active, summaries, requirements, inputs) {
    const kinds = new Map(graph.entities.map((entity) => [entity.id, entity.kind]));
    const summary = new Map(summaries.map((entry) => [entry.mapping, entry.dimensions]));
    const assessments = new Map(inputs.assessments.map((assessment) => [assessment.id, assessment]));
    const ids = new Set();
    const issues = [];
    for (const requirement of requirements) {
        if (ids.has(requirement.id))
            issues.push(issue("DUPLICATE_UNCERTAINTY_REQUIREMENT", "Requirement identity must be unique", requirement.id));
        ids.add(requirement.id);
        for (const id of requirement.select.ids ?? [])
            if (!summary.has(id))
                issues.push(issue("UNKNOWN_UNCERTAINTY_SELECTOR_MAPPING", `Requirement references missing mapping ${id}`, requirement.id));
        const matches = graph.mappings.filter((mapping) => selectorMatches(mapping, requirement.select, kinds));
        if (!matches.length)
            issues.push(issue("STALE_UNCERTAINTY_REQUIREMENT", "Requirement selector matches no graph mappings", requirement.id));
        for (const mapping of matches.filter((mapping) => active.has(mapping.id))) {
            const dimension = summary
                .get(mapping.id)
                ?.find((entry) => entry.dimension === requirement.dimension) ??
                unknownDimension(requirement.dimension);
            if (!requirement.allowedStates.includes(dimension.status))
                issues.push(issue("UNCERTAINTY_STATE_NOT_ALLOWED", `${requirement.id} requires ${requirement.dimension} in [${requirement.allowedStates.join(", ")}]; recorded state is ${dimension.status}${dimension.measurementModels.length > 1 ? " with incompatible named measurement models" : ""}`, mapping.id));
            if (!requirement.allowedStates.includes("not-applicable") &&
                dimension.assessments.some((id) => assessments.get(id)?.status === "not-applicable"))
                issues.push(issue("UNCERTAINTY_NOT_APPLICABLE_NOT_ALLOWED", `${requirement.id} does not permit a contributing ${requirement.dimension} assessment to be not-applicable`, mapping.id));
            if (requirement.requireEvidence &&
                (!dimension.evidence.length ||
                    !dimension.assessments.length ||
                    dimension.assessments.some((id) => !assessments.get(id)?.evidence.length)))
                issues.push(issue("UNCERTAINTY_EVIDENCE_REQUIRED", `${requirement.id} requires evidence for every contributing ${requirement.dimension} assessment`, mapping.id));
        }
    }
    return issues;
}
//# sourceMappingURL=uncertainty.js.map