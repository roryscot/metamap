import { readFileSync } from "node:fs";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { canonicalDigest, canonicalJson, legacyReferenceValue, } from "./canonical.js";
import { DERIVATION_ATTRIBUTE, UNCERTAINTY_DIMENSIONS, } from "./derivation-model.js";
import { executableRelationConflictIssues, parseCorrespondenceDerivation, validateCorrespondenceDerivations, } from "./derivation.js";
import { analyzeImpact } from "./impact.js";
import { relationPackDigest } from "./relation-pack.js";
import { RelationRegistry } from "./relations.js";
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
    return shapeResult(value, policyShape, "INVALID_SEMANTIC_POLICY");
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
    if (generation.semantic.assessments.length ||
        generation.semantic.uncertaintyRequirements.length ||
        generation.semantic.riskBudgets.length ||
        generation.semantic.riskEvaluation !== "not-evaluated" ||
        generation.semantic.uncertainty.some((entry) => entry.dimensions.some((dimension) => dimension.status !== "unknown" ||
            dimension.evidence.length ||
            dimension.assessments.length ||
            dimension.measurementModels.length ||
            dimension.sourceRevisions.length)))
        return {
            valid: false,
            issues: [
                error("TYPED_UNCERTAINTY_NOT_IMPLEMENTED", "The captured generation requests an unimplemented typed evaluator", generation.id),
            ],
        };
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
    });
    const issues = [...base.issues];
    if (policy.assessments.length ||
        policy.uncertaintyRequirements.length ||
        policy.riskBudgets.length)
        issues.push(error("TYPED_UNCERTAINTY_NOT_IMPLEMENTED", "Typed assessments and consumer budgets are not yet executable; requested inputs cannot be ignored", policy.id));
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
    const checked = validateCorrespondenceDerivations(graph, policy.derivations, context, policy.derivationLimits, registry);
    issues.push(...checked.issues.map((issue) => error(issue.code, issue.message, issue.subjectId)));
    const declarations = base.status === "viable"
        ? legacy.declarations(graph, view)
        : new Map();
    if (base.status === "viable") {
        const active = new Set(base.generation.activeMappings);
        issues.push(...executableRelationConflictIssues(graph, active, registry).map((issue) => error(issue.code, issue.message, issue.subjectId)));
        for (const proof of checked.checked) {
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
                if (law.operation === "reverse" &&
                    source.reversibility !== "reversible")
                    issues.push(error("IRREVERSIBLE_DERIVATION_PREMISE", "A reversal requires a reversible premise declaration", proof.result.id));
            }
        }
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
    const proofs = new Map(checked.checked.map((proof) => [proof.id, proof]));
    const dependencies = graph.mappings
        .filter((mapping) => base.generation.activeMappings.includes(mapping.id))
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
            assessments: [],
            uncertaintyRequirements: [],
            uncertainty: graph.mappings.map((mapping) => ({
                mapping: mapping.id,
                dimensions: UNCERTAINTY_DIMENSIONS.map((dimension) => ({
                    dimension,
                    status: "unknown",
                    evidence: [],
                    assessments: [],
                    measurementModels: [],
                    sourceRevisions: [],
                })),
            })),
            riskBudgets: [],
            riskEvaluation: "not-evaluated",
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