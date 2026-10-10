import { readFileSync } from "node:fs";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { canonicalDigest, canonicalJson, legacyReferenceValue, } from "./canonical.js";
import { DERIVATION_ATTRIBUTE, } from "./derivation-model.js";
import { executableRelationConflictIssues, parseCorrespondenceDerivation, validateCorrespondenceDerivations, } from "./derivation.js";
import { analyzeImpact } from "./impact.js";
import { relationPackDigest } from "./relation-pack.js";
import { RelationRegistry } from "./relations.js";
import { graphUncertainty, uncertaintyRequirementIssues, uncertaintySummaryIssues, validateUncertaintyInputs, } from "./uncertainty.js";
import { consumerBudgetIssues } from "./risk.js";
const Ajv2020 = Ajv2020Module.default;
const addFormats = addFormatsModule.default;
const ajv = addFormats(new Ajv2020({ allErrors: true, strict: true }));
const schema = (name) => JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), "utf8"));
for (const name of [
    "metamap-graph",
    "metamap-viability",
    "metamap-generation",
    "relation-pack",
    "relation-pack-v2",
    "metamap-derivation",
    "metamap-viability-v2",
    "metamap-generation-v2",
])
    ajv.addSchema(schema(name));
const policyShape = ajv.getSchema(schema("metamap-viability-v2").$id);
const generationShape = ajv.getSchema(schema("metamap-generation-v2").$id);
function error(code, message, subjectId) {
    return {
        severity: "error",
        code,
        message,
        ...(subjectId ? { subjectId } : {}),
    };
}
function shapeResult(value, validate, code) {
    try {
        canonicalJson(value);
        if (!validate(value))
            return {
                valid: false,
                issues: (validate.errors ?? []).map((issue) => ({
                    severity: "error",
                    code,
                    message: issue.message ?? "Invalid semantic document",
                    path: issue.instancePath || "$",
                })),
            };
        return { valid: true, issues: [] };
    }
    catch (cause) {
        return {
            valid: false,
            issues: [
                error(code, cause instanceof Error ? cause.message : "Invalid semantic document"),
            ],
        };
    }
}
export function validateSemanticPolicy(value) {
    const result = shapeResult(value, policyShape, "INVALID_SEMANTIC_POLICY");
    if (!result.valid)
        return result;
    const policy = value;
    const identities = new Set();
    for (const id of [
        policy.id,
        ...[
            policy.constraints,
            policy.evidence,
            policy.waivers ?? [],
            policy.derivations,
            policy.assessments,
            policy.uncertaintyRequirements,
            policy.riskBudgets,
        ].flatMap((records) => records.map((record) => record.id)),
    ]) {
        if (identities.has(id))
            result.issues.push(error("DUPLICATE_SEMANTIC_POLICY_ID", "Policy record identities must be unique", id));
        identities.add(id);
    }
    result.valid = !result.issues.length;
    return result;
}
export function parseSemanticPolicy(value) {
    const result = validateSemanticPolicy(value);
    if (!result.valid)
        throw new Error(result.issues
            .map((issue) => `${issue.path ?? "$"} ${issue.message}`)
            .join("; "));
    return value;
}
export function semanticGenerationDigest(value) {
    const { id: _id, digest: _digest, ...content } = value;
    return canonicalDigest(content);
}
export function validateSemanticGeneration(value) {
    const result = shapeResult(value, generationShape, "INVALID_SEMANTIC_GENERATION");
    if (!result.valid)
        return result;
    const generation = value;
    const digest = semanticGenerationDigest(generation);
    if (digest !== generation.digest ||
        generation.id !== `urn:metamap:generation:${digest.slice(7)}`)
        return {
            valid: false,
            issues: [
                error("SEMANTIC_GENERATION_DIGEST_MISMATCH", "Generation content binding does not match its identity", generation.id),
            ],
        };
    result.issues.push(...uncertaintySummaryIssues(generation.semantic.uncertainty).map((issue) => error(issue.code, issue.message, issue.subjectId)));
    const assessments = new Map(generation.semantic.assessments.map((entry) => [entry.id, entry]));
    const declarationIds = new Set(generation.semantic.declarations.map((entry) => entry.mapping));
    const summaryIds = new Set(generation.semantic.uncertainty.map((entry) => entry.mapping));
    if (assessments.size !== generation.semantic.assessments.length ||
        declarationIds.size !== summaryIds.size ||
        [...declarationIds].some((id) => !summaryIds.has(id)))
        result.issues.push(error("INCOMPLETE_GENERATION_UNCERTAINTY", "Captured assessments and mapping summaries must be complete and unique", generation.id));
    for (const summary of generation.semantic.uncertainty)
        for (const dimension of summary.dimensions) {
            if (dimension.assessments.some((id) => assessments.get(id)?.dimension !== dimension.dimension) ||
                dimension.evidence.some((id) => !dimension.assessments.some((assessment) => assessments.get(assessment)?.evidence.includes(id))))
                result.issues.push(error("UNBOUND_GENERATION_UNCERTAINTY", "Summary references must name captured contributing assessments and their evidence", summary.mapping));
        }
    if (generation.semantic.riskEvaluation !==
        (generation.semantic.riskBudgets.length
            ? "available-for-projection"
            : "not-evaluated"))
        result.issues.push(error("INVALID_GENERATION_RISK_STATE", "Risk availability must match captured budgets", generation.id));
    if (result.issues.length)
        return { valid: false, issues: result.issues };
    try {
        for (const proof of generation.semantic.derivations)
            parseCorrespondenceDerivation(proof);
    }
    catch (cause) {
        return {
            valid: false,
            issues: [
                error("SEMANTIC_DERIVATION_BINDING_MISMATCH", cause instanceof Error
                    ? cause.message
                    : "Invalid captured derivation", generation.id),
            ],
        };
    }
    try {
        const registry = new RelationRegistry(generation.semantic.packs.map((pack) => pack.value));
        for (const { binding, value } of generation.semantic.packs) {
            if (binding.id !== value.id ||
                binding.version !== value.version ||
                binding.digest !== relationPackDigest(value))
                throw new Error("Captured pack does not match its binding");
        }
        for (const pack of registry.executablePacks())
            for (const law of pack.laws)
                registry.getLaw(law.id);
    }
    catch (cause) {
        return {
            valid: false,
            issues: [
                error("SEMANTIC_PACK_BINDING_MISMATCH", cause instanceof Error ? cause.message : "Invalid captured packs", generation.id),
            ],
        };
    }
    return result;
}
export function parseSemanticGeneration(value) {
    const result = validateSemanticGeneration(value);
    if (!result.valid)
        throw new Error(result.issues
            .map((issue) => `${issue.path ?? "$"} ${issue.message}`)
            .join("; "));
    return value;
}
function freeze(value) {
    if (typeof value === "object" && value !== null) {
        for (const child of Object.values(value))
            freeze(child);
        Object.freeze(value);
    }
    return value;
}
export function legacyPolicyView(policy) {
    const { derivations: _proofs, derivationLimits: _limits, assessments: _assessments, uncertaintyRequirements: _requirements, riskBudgets: _budgets, ...common } = policy;
    return { ...common, schemaVersion: "1.0.0" };
}
export function derivationAdmissionIssues(proofs, active, declarations, registry) {
    const issues = [];
    for (const proof of proofs) {
        if (!active.has(proof.result.id))
            continue;
        const result = declarations.get(proof.result.id)?.[0];
        for (const premise of proof.premises) {
            if (!active.has(premise.mapping))
                issues.push(error("INACTIVE_DERIVATION_PREMISE", "An active derived mapping requires active premises", proof.result.id));
            const source = declarations.get(premise.mapping)?.[0];
            if (!result || !source)
                continue; // The existing declaration checker reports this.
            if ((source.coverage === "partial" && result.coverage === "total") ||
                (source.determinism === "nondeterministic" &&
                    result.determinism === "deterministic") ||
                (source.reversibility === "irreversible" &&
                    result.reversibility === "reversible"))
                issues.push(error("DERIVATION_SEMANTICS_STRENGTHENED", "A derived declaration cannot erase a premise's partial coverage, nondeterminism, or irreversibility", proof.result.id));
            const law = registry.getLaw(proof.rule.id).law;
            if (law.operation === "reverse" && source.reversibility !== "reversible")
                issues.push(error("IRREVERSIBLE_DERIVATION_PREMISE", "A reversal requires a reversible premise declaration", proof.result.id));
        }
    }
    return issues;
}
export function admittedMappingDependencies(graph, active, records) {
    const proofs = new Map(records.map((proof) => [proof.id, proof]));
    return graph.mappings
        .filter((mapping) => active.has(mapping.id))
        .map((mapping) => {
        const proofId = mapping.attributes?.[DERIVATION_ATTRIBUTE];
        const proof = typeof proofId === "string" ? proofs.get(proofId) : undefined;
        return {
            mapping: mapping.id,
            premises: proof
                ? [
                    ...new Set(proof.premises.map((premise) => premise.mapping)),
                ].sort()
                : [],
            ...(proof
                ? { derivation: { id: proof.id, digest: proof.digest } }
                : {}),
        };
    })
        .sort((left, right) => left.mapping < right.mapping ? -1 : left.mapping > right.mapping ? 1 : 0);
}
/** Reuse the contextual compiler; add nonwaivable checks for the selected profile. */
export function compileSemanticMetamap(graph, policy, options, legacy) {
    const registry = options.relationRegistry ?? new RelationRegistry();
    let context = options.context ?? {};
    const shape = validateSemanticPolicy(policy);
    if (!shape.valid) {
        const impact = analyzeImpact(graph, {
            changedSubjects: options.changedSubjects ?? [],
            registry,
        });
        return {
            status: "rejected",
            issues: shape.issues,
            impact,
            quarantinedSubjects: impact.affectedSubjects,
        };
    }
    try {
        policy = JSON.parse(canonicalJson(policy));
        context = JSON.parse(canonicalJson(context));
        graph = legacyReferenceValue(graph);
    }
    catch (cause) {
        return {
            status: "rejected",
            issues: [
                error("INVALID_SEMANTIC_INPUT", cause instanceof Error ? cause.message : "Invalid semantic input"),
            ],
            impact: {
                changedSubjects: [...(options.changedSubjects ?? [])],
                affectedSubjects: [],
                paths: [],
            },
            quarantinedSubjects: [],
        };
    }
    const view = legacyPolicyView(policy);
    const base = legacy.compile(graph, view, {
        ...options,
        context,
        relationRegistry: registry,
    }, new Set(policy.assessments.flatMap((assessment) => assessment.evidence)));
    const issues = [...base.issues];
    const uncertaintyInputs = {
        assessments: policy.assessments,
        evidence: policy.evidence,
    };
    issues.push(...validateUncertaintyInputs(graph, uncertaintyInputs, undefined, policy.derivations.map((proof) => proof.id)).map((issue) => error(issue.code, issue.message, issue.subjectId)));
    issues.push(...consumerBudgetIssues(graph, policy.riskBudgets).map((issue) => error(issue.code, issue.message, issue.subjectId)));
    for (const reference of graph.relationPacks ?? []) {
        const pack = registry.getPack(reference.id);
        if (pack &&
            ((pack.schemaVersion === "2.0.0" && !reference.digest) ||
                (reference.digest && reference.digest !== relationPackDigest(pack))))
            issues.push(error("EXECUTABLE_PACK_BINDING_MISMATCH", "Graph pack references must match their exact captured digest", reference.id));
    }
    for (const pack of registry.executablePacks()) {
        try {
            for (const law of pack.laws)
                registry.getLaw(law.id);
        }
        catch (cause) {
            issues.push(error("EXECUTABLE_PACK_IMPORT_MISMATCH", cause instanceof Error ? cause.message : "Imported pack changed", pack.id));
        }
    }
    const checked = validateCorrespondenceDerivations(graph, policy.derivations, context, policy.derivationLimits, registry, uncertaintyInputs);
    issues.push(...checked.issues.map((issue) => error(issue.code, issue.message, issue.subjectId)));
    const declarations = base.status === "viable"
        ? legacy.declarations(graph, view)
        : new Map();
    const uncertainty = checked.status === "valid"
        ? graphUncertainty(graph, checked.checked, uncertaintyInputs)
        : [];
    if (base.status === "viable") {
        const active = new Set(base.generation.activeMappings);
        issues.push(...executableRelationConflictIssues(graph, active, registry).map((issue) => error(issue.code, issue.message, issue.subjectId)));
        issues.push(...derivationAdmissionIssues(checked.checked, active, declarations, registry));
        if (checked.status === "valid")
            issues.push(...uncertaintyRequirementIssues(graph, active, uncertainty, policy.uncertaintyRequirements, uncertaintyInputs).map((issue) => error(issue.code, issue.message, issue.subjectId)));
    }
    const impact = analyzeImpact(graph, {
        changedSubjects: options.changedSubjects?.length
            ? options.changedSubjects
            : issues
                .filter((issue) => issue.severity === "error" && !issue.waivedBy && issue.subjectId)
                .map((issue) => issue.subjectId),
        policy: view,
        registry,
        derivations: policy.derivations,
    });
    const paths = new Map(impact.paths.map((path) => [path.subjectId, path.path]));
    const reportedIssues = issues.map((issue) => ({
        ...issue,
        ...(issue.subjectId && paths.has(issue.subjectId)
            ? { causalPath: paths.get(issue.subjectId) }
            : {}),
    }));
    if (base.status !== "viable" ||
        issues.some((issue) => issue.severity === "error" && !issue.waivedBy))
        return {
            status: "rejected",
            issues: reportedIssues,
            impact,
            quarantinedSubjects: impact.affectedSubjects,
        };
    // Only compiler-produced legacy output is normalized. Untrusted v2 inputs
    // have already passed strict JSON validation; their fields are never dropped.
    const { $schema: _schema, schemaVersion: _version, id: _id, digest: _digest, ...common } = JSON.parse(JSON.stringify(base.generation));
    const dependencies = admittedMappingDependencies(graph, new Set(base.generation.activeMappings), checked.checked);
    const content = {
        $schema: "https://raw.githubusercontent.com/roryscot/metamap/main/schemas/metamap-generation-v2.schema.json",
        ...common,
        schemaVersion: "2.0.0",
        policy: { id: policy.id, digest: canonicalDigest(policy) },
        semantic: {
            interpretation: "declared-law-application",
            packs: registry.allPacks().map((pack) => ({
                binding: {
                    id: pack.id,
                    version: pack.version,
                    digest: relationPackDigest(pack),
                },
                value: JSON.parse(JSON.stringify(pack)),
            })),
            derivations: checked.checked,
            derivationLimits: { ...policy.derivationLimits },
            declarations: [...declarations].map(([mapping, entries]) => ({
                mapping,
                declaration: JSON.parse(JSON.stringify(entries[0])),
            })),
            dependencies,
            assessments: policy.assessments,
            uncertaintyRequirements: policy.uncertaintyRequirements,
            uncertainty,
            riskBudgets: policy.riskBudgets,
            riskEvaluation: policy.riskBudgets.length
                ? "available-for-projection"
                : "not-evaluated",
        },
    };
    const digest = canonicalDigest(content);
    const generation = freeze({
        ...content,
        id: `urn:metamap:generation:${digest.slice(7)}`,
        digest,
    });
    const validation = validateSemanticGeneration(generation);
    if (!validation.valid)
        return {
            status: "rejected",
            issues: validation.issues,
            impact,
            quarantinedSubjects: impact.affectedSubjects,
        };
    return { status: "viable", generation, issues: reportedIssues, impact };
}
//# sourceMappingURL=semantic.js.map