import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { canonicalDigest, canonicalJson, parseStrictJson, } from "./canonical.js";
import { diffMetamapDocuments } from "./diff.js";
import { compareSourceCaptures } from "./provenance.js";
import { emitTypeScriptProjection } from "./projection.js";
import { emitTypeScriptPathTree } from "./path-tree.js";
import { replayMetamap } from "./replay.js";
import { parseSourceReplayBundle } from "./semantic-replay.js";
import { contentDigest } from "./stable.js";
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
    "metamap-replay-v2",
    "metamap-config",
    "metamap-source-capture",
    "metamap-source-inspection",
    "metamap-replay-v3",
    "metamap-governance",
    "metamap-trusted-consumer",
    "metamap-artifact-manifest",
    "metamap-change-proposal",
    "metamap-approval",
    "metamap-activation-request",
    "metamap-activation",
    "metamap-active-pointer",
])
    ajv.addSchema(schema(name));
export class GovernanceError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "GovernanceError";
    }
}
function fail(code, message) {
    throw new GovernanceError(code, message);
}
function equal(a, b) {
    return canonicalJson(a) === canonicalJson(b);
}
function checked(value, name) {
    canonicalJson(value);
    const shape = ajv.getSchema(schema(name).$id);
    if (!shape(value))
        fail("GOVERNANCE_INVALID_SHAPE", name +
            ": " +
            (shape.errors ?? [])
                .map((item) => (item.instancePath || "$") + " " + item.message)
                .join("; "));
    return JSON.parse(canonicalJson(value));
}
function freeze(value) {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
}
/** New content addresses include every member except their own id and digest. */
export function governanceDocumentDigest(value) {
    canonicalJson(value);
    if (typeof value !== "object" || value === null || Array.isArray(value))
        fail("GOVERNANCE_INVALID_SHAPE", "Expected a governance object");
    return canonicalDigest(Object.fromEntries(Object.entries(value).filter(([key]) => key !== "id" && key !== "digest")));
}
function addressed(content, kind) {
    const digest = governanceDocumentDigest(content);
    return {
        ...content,
        id: "urn:metamap:" + kind + ":" + digest.slice(7),
        digest,
    };
}
function checkAddress(value, kind) {
    if (governanceDocumentDigest(value) !== value.digest ||
        value.id !== "urn:metamap:" + kind + ":" + value.digest.slice(7))
        fail("GOVERNANCE_CONTENT_MISMATCH", "Invalid " + kind + " content address");
}
function unique(values, label) {
    if (new Set(values).size !== values.length)
        fail("GOVERNANCE_DUPLICATE_ID", "Duplicate " + label);
}
function instant(text) {
    const date = new Date(text);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== text)
        fail("GOVERNANCE_INVALID_TIME", "Expected an exact UTC timestamp with milliseconds");
    return date.getTime();
}
function interval(from, until) {
    if (instant(from) >= instant(until))
        fail("GOVERNANCE_INVALID_TIME", "Validity interval is empty or reversed");
}
function base64(value, length) {
    const bytes = Buffer.from(value, "base64");
    if (bytes.toString("base64") !== value ||
        (length !== undefined && bytes.length !== length))
        fail("GOVERNANCE_INVALID_CRYPTO", "Noncanonical base64 or wrong byte length");
    return bytes;
}
function publicKey(value) {
    const bytes = base64(value);
    let key;
    try {
        key = createPublicKey({ key: bytes, format: "der", type: "spki" });
    }
    catch {
        return fail("GOVERNANCE_INVALID_CRYPTO", "Expected Ed25519 public SPKI DER");
    }
    if (key.asymmetricKeyType !== "ed25519" ||
        !key.export({ format: "der", type: "spki" }).equals(bytes))
        fail("GOVERNANCE_INVALID_CRYPTO", "Only exact Ed25519 public SPKI DER is supported");
    return key;
}
/** Fixed Ed25519 profile, also usable with independent published test vectors. */
export function verifyEd25519Signature(data, key, signature) {
    return verify(null, data, publicKey(key), base64(signature, 64));
}
export function parseTrustedConsumerConfiguration(value) {
    const config = checked(value, "metamap-trusted-consumer");
    unique(config.principals.map((item) => item.id), "principal");
    unique(config.keys.map((item) => item.id), "key");
    unique(config.grants.map((item) => item.id), "grant");
    const principals = new Set(config.principals.map((item) => item.id));
    const keyPrincipals = new Map();
    for (const key of config.keys) {
        if (!principals.has(key.principal))
            fail("GOVERNANCE_UNKNOWN_PRINCIPAL", "Key principal is not externally registered");
        interval(key.validFrom, key.validUntil);
        publicKey(key.publicKey);
        const previousPrincipal = keyPrincipals.get(key.publicKey);
        if (previousPrincipal !== undefined && previousPrincipal !== key.principal)
            fail("GOVERNANCE_SHARED_IDENTITY_KEY", "One public key cannot establish two independent principal identities");
        keyPrincipals.set(key.publicKey, key.principal);
    }
    for (const grant of config.grants) {
        if (!principals.has(grant.principal))
            fail("GOVERNANCE_UNKNOWN_PRINCIPAL", "Grant principal is not externally registered");
        interval(grant.validFrom, grant.validUntil);
    }
    return freeze(config);
}
export function parseTrustedConsumerConfigurationJson(text) {
    return parseTrustedConsumerConfiguration(parseStrictJson(text));
}
export function consumerTrustBinding(value) {
    const config = parseTrustedConsumerConfiguration(value);
    return {
        id: config.id,
        revision: config.revision,
        digest: canonicalDigest(config),
    };
}
function admittedReplay(value, consumer) {
    const bundle = parseSourceReplayBundle(value);
    const replay = replayMetamap(bundle);
    if (replay.status !== "verified" || !replay.admitted)
        fail("GOVERNANCE_CANDIDATE_REJECTED", "Governed artifacts require exact admitted replay, including every requested projection");
    if (!bundle.inputs.projections.length ||
        bundle.inputs.projections.some((spec) => spec.consumer !== consumer))
        fail("GOVERNANCE_WRONG_CONSUMER", "Every selected projection must belong to the governed consumer");
    return bundle;
}
/** Reuses existing native emitters. Artifact paths never come from entity IDs or locators. */
export function prepareGovernedArtifacts(value, consumer, environment) {
    const bundle = admittedReplay(value, consumer);
    const files = {};
    const json = (path, value) => {
        files[path] = canonicalJson(value) + "\n";
    };
    json("replay.json", bundle);
    json("graph.json", bundle.inputs.graph);
    json("policy.json", bundle.inputs.policy);
    json("source-capture.json", bundle.inputs.sourceCapture);
    const compilation = bundle.expected.compilation;
    if (compilation.status !== "viable")
        return fail("GOVERNANCE_CANDIDATE_REJECTED", "Missing viable generation");
    json("generation.json", compilation.generation);
    for (const [index, output] of bundle.expected.projections.entries()) {
        if (output.result.status !== "projected")
            return fail("GOVERNANCE_CANDIDATE_REJECTED", "Missing consumer projection");
        json("projection-" + index + ".json", output.result.projection);
        files["bindings-" + index + ".ts"] = emitTypeScriptProjection(output.result.projection);
        if (output.pathTree) {
            if (output.pathTree.status !== "projected")
                return fail("GOVERNANCE_CANDIDATE_REJECTED", "Missing consumer path tree");
            json("path-tree-" + index + ".json", output.pathTree.pathTree);
            files["path-tree-" + index + ".ts"] = emitTypeScriptPathTree(output.pathTree.pathTree);
        }
    }
    const manifest = addressed({
        schemaVersion: "1.0.0",
        consumer,
        environment,
        replay: { id: bundle.id, digest: bundle.digest },
        files: Object.keys(files)
            .sort()
            .map((path) => ({
            path,
            mediaType: path.endsWith(".ts")
                ? "text/typescript"
                : "application/json",
            byteDigest: contentDigest(files[path]),
            byteLength: Buffer.byteLength(files[path], "utf8"),
        })),
    }, "artifacts");
    return freeze({ manifest, files });
}
export function parseGovernedArtifactManifest(value) {
    const manifest = checked(value, "metamap-artifact-manifest");
    checkAddress(manifest, "artifacts");
    unique(manifest.files.map((file) => file.path), "artifact path");
    if (!equal(manifest.files.map((file) => file.path), manifest.files.map((file) => file.path).sort()))
        fail("GOVERNANCE_INVALID_MANIFEST", "Artifact paths must be sorted");
    return freeze(manifest);
}
function baselineValue(value, consumer) {
    if (value === null)
        return null;
    canonicalJson(value);
    if (!/^sha256:[a-f0-9]{64}$/.test(value.manifestDigest) ||
        Object.keys(value).sort().join(",") !== "manifestDigest,replay")
        fail("GOVERNANCE_INVALID_BASELINE", "Expected exact protected baseline manifest/replay binding");
    return {
        manifestDigest: value.manifestDigest,
        replay: admittedReplay(value.replay, consumer),
    };
}
/** Closed conservative action classification; it never infers a grant from graph ownership. */
export function governedChangeRequirements(before, after, consumer, intent = "deploy") {
    canonicalJson(after);
    if (before)
        canonicalJson(before);
    const requirements = [];
    const add = (action, subject, fact) => {
        requirements.push({ action, subject, fact });
    };
    add("activate", consumer, "activation");
    if (intent === "rollback")
        add("rollback", consumer, "activation");
    if (!before)
        add("bootstrap", consumer, "activation");
    const oldGraph = before?.inputs.graph;
    const graph = after.inputs.graph;
    const diff = diffMetamapDocuments(oldGraph ?? { ...graph, entities: [], mappings: [], authorities: [] }, graph);
    for (const change of diff.changes) {
        const properties = change.changedProperties ?? ["record"];
        if (change.kind === "authority") {
            const declarations = [
                oldGraph?.authorities.find((item) => item.id === change.id),
                graph.authorities.find((item) => item.id === change.id),
            ].filter((item) => item !== undefined);
            for (const declaration of declarations)
                for (const fact of declaration.facts)
                    add("change-authority", declaration.concept, "ownership:" + fact);
            add("change-authority", change.id, "authority.record");
        }
        else {
            for (const property of properties) {
                const rebind = change.change === "changed" &&
                    ((change.kind === "entity" && property === "locators") ||
                        (change.kind === "mapping" &&
                            ["sources", "targets", "transform"].includes(property)));
                add(rebind ? "rebind-implementation" : "change-graph", change.id, change.kind + "." + property);
            }
        }
    }
    for (const property of [
        "id",
        "namespace",
        "label",
        "revision",
        "metadata",
        "extensions",
    ]) {
        if (!equal(oldGraph?.[property] ?? null, graph[property] ?? null))
            add("change-graph", graph.id, "graph." + property);
    }
    const oldPolicy = before?.inputs.policy;
    const policy = after.inputs.policy;
    for (const property of Object.keys(policy)) {
        if (property === "schemaVersion" || property === "graph")
            continue;
        if (!equal(oldPolicy?.[property] ?? null, policy[property] ?? null)) {
            add("change-policy", policy.id, "policy." + property);
            if ([
                "constraints",
                "mappings",
                "uncertaintyRequirements",
                "derivationLimits",
            ].includes(property))
                add("relax-policy", policy.id, "policy." + property);
        }
    }
    // Removed optional policy fields remain changes, not an omission-based bypass.
    for (const property of Object.keys(oldPolicy ?? {})) {
        if (!(property in policy) && property !== "graph")
            add("change-policy", oldPolicy.id, "policy." + property);
    }
    const oldBudgets = new Map((oldPolicy?.riskBudgets ?? []).map((item) => [item.id, item]));
    const newBudgets = new Map(policy.riskBudgets.map((item) => [item.id, item]));
    for (const id of [
        ...new Set([...oldBudgets.keys(), ...newBudgets.keys()]),
    ].sort()) {
        const old = oldBudgets.get(id), current = newBudgets.get(id);
        if (!old ||
            !current ||
            current.maximumTotalCost > old.maximumTotalCost ||
            (current.maximumLossyMappings ?? Infinity) >
                (old.maximumLossyMappings ?? Infinity) ||
            (current.maximumInferredMappings ?? Infinity) >
                (old.maximumInferredMappings ?? Infinity) ||
            !equal(current.classifications, old.classifications) ||
            current.consumer !== old.consumer)
            add("raise-budget", id, "risk-budget");
    }
    for (const waiver of policy.waivers ?? [])
        if (!equal((oldPolicy?.waivers ?? []).find((item) => item.id === waiver.id) ??
            null, waiver))
            add("add-waiver", waiver.id, "waiver");
    if (!equal(before?.inputs.relationPacks ?? null, after.inputs.relationPacks) ||
        !equal(oldGraph?.relationPacks ?? null, graph.relationPacks ?? null))
        add("change-law", graph.id, "relation-packs");
    if (!before) {
        add("change-source", after.inputs.sourceCapture.config.id, "source-capture");
    }
    else {
        for (const change of compareSourceCaptures(before.inputs.sourceCapture, after.inputs.sourceCapture))
            add("change-source", change.subject, "source." + change.component);
    }
    if (!equal(before?.inputs.context ?? null, after.inputs.context))
        add("change-context", consumer, "evaluation-context");
    if (!equal(before?.inputs.evaluatedAt ?? null, after.inputs.evaluatedAt))
        add("change-context", consumer, "evaluation-time");
    if (!equal(before?.inputs.changedSubjects ?? null, after.inputs.changedSubjects))
        add("change-context", consumer, "changed-subjects");
    if (!equal(before?.inputs.projections ?? null, after.inputs.projections))
        add("change-projection", consumer, "projection-specifications");
    const uniqueRequirements = new Map(requirements.map((item) => [canonicalJson(item), item]));
    return [...uniqueRequirements.keys()]
        .sort()
        .map((key) => uniqueRequirements.get(key));
}
export function createGovernedChangeProposal(value, options) {
    const config = parseTrustedConsumerConfiguration(options.trustedConfiguration);
    if (config.consumer !== options.consumer ||
        config.environment !== options.environment)
        fail("GOVERNANCE_WRONG_ENVIRONMENT", "Consumer/environment do not match external trust configuration");
    const candidate = admittedReplay(value, options.consumer);
    const baseline = baselineValue(options.baseline, options.consumer);
    const intent = options.intent ?? "deploy";
    if (intent === "rollback" && baseline === null)
        fail("GOVERNANCE_INVALID_BASELINE", "Rollback requires a current protected baseline");
    const artifacts = prepareGovernedArtifacts(candidate, options.consumer, options.environment);
    const proposal = addressed({
        schemaVersion: "1.0.0",
        consumer: options.consumer,
        environment: options.environment,
        intent,
        proposer: options.proposer,
        trust: consumerTrustBinding(config),
        baseline,
        candidate,
        artifacts: artifacts.manifest,
        requirements: governedChangeRequirements(baseline?.replay ?? null, candidate, options.consumer, intent),
    }, "change-proposal");
    checked(proposal, "metamap-change-proposal");
    return freeze({ proposal, files: artifacts.files });
}
export function parseGovernedChangeProposal(value) {
    const proposal = checked(value, "metamap-change-proposal");
    checkAddress(proposal, "change-proposal");
    const candidate = admittedReplay(proposal.candidate, proposal.consumer);
    const baseline = baselineValue(proposal.baseline, proposal.consumer);
    if (proposal.intent === "rollback" && !baseline)
        fail("GOVERNANCE_INVALID_BASELINE", "Rollback requires a current protected baseline");
    const expected = prepareGovernedArtifacts(candidate, proposal.consumer, proposal.environment);
    parseGovernedArtifactManifest(proposal.artifacts);
    if (!equal(proposal.artifacts, expected.manifest))
        fail("GOVERNANCE_ARTIFACT_MISMATCH", "Manifest does not contain the exact recomputed consumer artifacts");
    if (!equal(proposal.requirements, governedChangeRequirements(baseline?.replay ?? null, candidate, proposal.consumer, proposal.intent)))
        fail("GOVERNANCE_DELTA_MISMATCH", "Requested actions/scopes do not match the complete classified delta");
    return freeze(proposal);
}
export function parseGovernedChangeProposalJson(text) {
    return parseGovernedChangeProposal(parseStrictJson(text));
}
/** Verifies every file and rejects additional outputs before any activation step. */
export function verifyGovernedArtifactBytes(proposal, files) {
    const current = parseGovernedChangeProposal(proposal);
    canonicalJson(files);
    const expected = prepareGovernedArtifacts(current.candidate, current.consumer, current.environment);
    if (!equal(files, expected.files))
        fail("GOVERNANCE_ARTIFACT_BYTES_MISMATCH", "Candidate output bytes or complete file inventory differ from the recomputed manifest");
}
export function createApprovalPayload(proposalValue, options) {
    const proposal = parseGovernedChangeProposal(proposalValue);
    const payload = {
        domain: "urn:metamap:approval:1",
        schemaVersion: "1.0.0",
        algorithm: "Ed25519",
        proposal: { id: proposal.id, digest: proposal.digest },
        artifacts: { id: proposal.artifacts.id, digest: proposal.artifacts.digest },
        baseline: proposal.baseline?.manifestDigest ?? null,
        consumer: proposal.consumer,
        environment: proposal.environment,
        intent: proposal.intent,
        trust: proposal.trust,
        principal: options.principal,
        key: options.key,
        grants: [...options.grants].sort(),
        requirements: proposal.requirements,
        issuedAt: options.issuedAt,
        expiresAt: options.expiresAt,
    };
    const validate = ajv.getSchema(schema("metamap-governance").$id + "#/$defs/payload");
    if (!validate(payload))
        fail("GOVERNANCE_INVALID_SHAPE", "Invalid approval payload");
    interval(payload.issuedAt, payload.expiresAt);
    return freeze(payload);
}
export function governedApprovalSigningBytes(value) {
    canonicalJson(value);
    const validate = ajv.getSchema(schema("metamap-governance").$id + "#/$defs/payload");
    if (!validate(value))
        fail("GOVERNANCE_INVALID_SHAPE", "Invalid domain-separated approval payload");
    return Buffer.from(canonicalJson(value), "utf8");
}
/** Attach an externally produced signature. This operation grants no authorization. */
export function attachGovernedApprovalSignature(payload, signature) {
    governedApprovalSigningBytes(payload);
    const text = typeof signature === "string"
        ? signature
        : Buffer.from(signature).toString("base64");
    base64(text, 64);
    return parseSignedGovernedApproval(addressed({ schemaVersion: "1.0.0", payload, signature: text }, "approval"));
}
export function parseSignedGovernedApproval(value) {
    const approval = checked(value, "metamap-approval");
    checkAddress(approval, "approval");
    base64(approval.signature, 64);
    interval(approval.payload.issuedAt, approval.payload.expiresAt);
    if (!equal(approval.payload.grants, [...approval.payload.grants].sort()))
        fail("GOVERNANCE_INVALID_SHAPE", "Approval grant IDs must be sorted");
    return freeze(approval);
}
export function parseSignedGovernedApprovalJson(text) {
    return parseSignedGovernedApproval(parseStrictJson(text));
}
const ownerOnly = new Set([
    "bootstrap",
    "rollback",
    "change-authority",
    "change-policy",
    "relax-policy",
    "raise-budget",
    "add-waiver",
    "change-law",
]);
function covers(grant, requirement) {
    return (grant.actions.includes(requirement.action) &&
        grant.scopes.some((scope) => (scope.subject === "*" || scope.subject === requirement.subject) &&
            (scope.fact === "*" || scope.fact === requirement.fact)));
}
/** Pure verification only. Current trust, state and time are supplied by the protected caller. */
export function verifyGovernedApproval(proposalValue, approvalValue, context) {
    try {
        const config = parseTrustedConsumerConfiguration(context.trustedConfiguration);
        const proposal = parseGovernedChangeProposal(proposalValue);
        const approval = parseSignedGovernedApproval(approvalValue);
        const payload = approval.payload;
        const now = instant(context.now);
        const baseline = baselineValue(context.baseline, config.consumer);
        if (!equal(proposal.baseline, baseline))
            fail("GOVERNANCE_STALE_BASELINE", "Proposal baseline differs from current protected state");
        if (proposal.consumer !== config.consumer ||
            proposal.environment !== config.environment)
            fail("GOVERNANCE_WRONG_ENVIRONMENT", "Proposal consumer/environment differ from the protected consumer");
        if (!equal(proposal.trust, consumerTrustBinding(config)))
            fail("GOVERNANCE_STALE_TRUST", "Proposal is bound to a different current trust configuration or revision");
        const expected = createApprovalPayload(proposal, {
            principal: payload.principal,
            key: payload.key,
            grants: payload.grants,
            issuedAt: payload.issuedAt,
            expiresAt: payload.expiresAt,
        });
        if (!equal(payload, expected))
            fail("GOVERNANCE_APPROVAL_CONTENT_MISMATCH", "Approval does not bind the exact proposal, artifacts, delta, baseline and deployment intent");
        if (instant(payload.issuedAt) > now || instant(payload.expiresAt) <= now)
            fail("GOVERNANCE_APPROVAL_NOT_CURRENT", "Approval is not issued yet or has expired at the current trusted clock");
        const principal = config.principals.find((item) => item.id === payload.principal);
        const key = config.keys.find((item) => item.id === payload.key);
        if (!principal || !key || key.principal !== principal.id)
            fail("GOVERNANCE_UNKNOWN_IDENTITY", "Principal/key binding is not externally trusted");
        if (principal.revoked || key.revoked)
            fail("GOVERNANCE_REVOKED", "Principal or key is currently revoked");
        if (now < instant(key.validFrom) ||
            now >= instant(key.validUntil) ||
            instant(payload.issuedAt) < instant(key.validFrom) ||
            instant(payload.expiresAt) > instant(key.validUntil))
            fail("GOVERNANCE_KEY_NOT_CURRENT", "Key does not cover the current approval validity interval");
        if (!verifyEd25519Signature(governedApprovalSigningBytes(payload), key.publicKey, approval.signature))
            fail("GOVERNANCE_BAD_SIGNATURE", "Approval signature is invalid for the externally trusted key");
        if (principal.role !== "owner" &&
            proposal.requirements.some((item) => ownerOnly.has(item.action)))
            fail("GOVERNANCE_OWNER_REQUIRED", "Bootstrap, rollback, authority, policy, waiver, budget and law changes require an externally registered owner");
        const grants = payload.grants.map((id) => {
            const grant = config.grants.find((item) => item.id === id);
            if (!grant || grant.principal !== principal.id)
                return fail("GOVERNANCE_UNKNOWN_GRANT", "Approval names a grant not assigned to its authenticated principal");
            if (grant.revoked)
                return fail("GOVERNANCE_REVOKED", "Approval grant is currently revoked");
            if (now < instant(grant.validFrom) ||
                now >= instant(grant.validUntil) ||
                instant(payload.issuedAt) < instant(grant.validFrom) ||
                instant(payload.expiresAt) > instant(grant.validUntil))
                return fail("GOVERNANCE_GRANT_NOT_CURRENT", "Grant does not cover the current approval validity interval");
            return grant;
        });
        for (const requirement of proposal.requirements)
            if (!grants.some((grant) => covers(grant, requirement)))
                fail("GOVERNANCE_SCOPE_DENIED", "Missing externally granted action/fact scope: " +
                    canonicalJson(requirement));
        return freeze({
            status: "authorized",
            principal: principal.id,
            approval: approval.id,
            grants: payload.grants,
            proposal,
        });
    }
    catch (error) {
        return {
            status: "rejected",
            issues: [
                {
                    code: error instanceof GovernanceError
                        ? error.code
                        : "GOVERNANCE_INVALID_INPUT",
                    message: error instanceof Error ? error.message : String(error),
                },
            ],
        };
    }
}
/** A proposal is data only: no incoming file path, clock or trust root is used. */
export function parseGovernedActivationRequest(value) {
    const request = checked(value, "metamap-activation-request");
    parseGovernedChangeProposal(request.proposal);
    parseSignedGovernedApproval(request.approval);
    verifyGovernedArtifactBytes(request.proposal, request.files);
    return freeze(request);
}
export function parseGovernedActivationRequestJson(text) {
    return parseGovernedActivationRequest(parseStrictJson(text));
}
/**
 * Checks historical integrity, using the trust recorded by the protected host.
 * This record is not a substitute for current external trust or protected storage.
 */
export function parseGovernedActivationManifest(value) {
    const manifest = checked(value, "metamap-activation");
    checkAddress(manifest, "activation");
    instant(manifest.activatedAt);
    const proposal = parseGovernedChangeProposal(manifest.proposal);
    if (manifest.consumer !== proposal.consumer ||
        manifest.environment !== proposal.environment ||
        !equal(manifest.artifacts, proposal.artifacts) ||
        manifest.previousManifest !== (proposal.baseline?.manifestDigest ?? null))
        fail("GOVERNANCE_ACTIVATION_CONTENT_MISMATCH", "Activation does not bind its complete approved candidate and baseline");
    const verification = verifyGovernedApproval(proposal, manifest.approval, {
        trustedConfiguration: manifest.acceptedTrust,
        baseline: proposal.baseline,
        now: manifest.activatedAt,
    });
    if (verification.status === "rejected")
        fail(verification.issues[0].code, verification.issues[0].message);
    return freeze(manifest);
}
export function parseGovernedActivePointer(value) {
    const pointer = checked(value, "metamap-active-pointer");
    if (pointer.manifest.id !==
        "urn:metamap:activation:" + pointer.manifest.digest.slice(7))
        fail("GOVERNANCE_CONTENT_MISMATCH", "Invalid active manifest identity");
    return freeze(pointer);
}
/** Obtain a baseline from the host's complete verified active state. */
export function governedActivationBaseline(current) {
    if (!current)
        return null;
    const manifest = parseGovernedActivationManifest(current.manifest);
    verifyGovernedArtifactBytes(manifest.proposal, current.files);
    return freeze({
        manifestDigest: manifest.digest,
        replay: manifest.proposal.candidate,
    });
}
/** Shared lifecycle evaluator for the existing memory and persistent promoters. */
export function evaluateGovernedActivation(value, context, previous) {
    try {
        const request = parseGovernedActivationRequest(value);
        const config = parseTrustedConsumerConfiguration(context.trustedConfiguration);
        instant(context.now);
        const baseline = governedActivationBaseline(previous);
        if (previous &&
            equal(previous.manifest.proposal, request.proposal) &&
            equal(previous.manifest.approval, request.approval) &&
            equal(previous.files, request.files)) {
            // An exact retry performs no deployment. It must still be currently authorized.
            const verified = verifyGovernedApproval(request.proposal, request.approval, {
                trustedConfiguration: config,
                baseline: previous.manifest.proposal.baseline,
                now: context.now,
            });
            if (verified.status === "rejected")
                return {
                    status: "rejected",
                    activated: false,
                    issues: verified.issues,
                    current: previous,
                };
            return { status: "already-active", activated: false, current: previous };
        }
        const verified = verifyGovernedApproval(request.proposal, request.approval, {
            trustedConfiguration: config,
            baseline,
            now: context.now,
        });
        if (verified.status === "rejected")
            return {
                status: "rejected",
                activated: false,
                issues: verified.issues,
                ...(previous ? { current: previous } : {}),
            };
        const manifest = parseGovernedActivationManifest(addressed({
            schemaVersion: "1.0.0",
            consumer: request.proposal.consumer,
            environment: request.proposal.environment,
            artifacts: request.proposal.artifacts,
            proposal: request.proposal,
            approval: request.approval,
            acceptedTrust: config,
            previousManifest: baseline?.manifestDigest ?? null,
            activatedAt: context.now,
        }, "activation"));
        return freeze({
            status: "activated",
            activated: true,
            current: { manifest, files: request.files },
        });
    }
    catch (error) {
        return {
            status: "rejected",
            activated: false,
            issues: [
                {
                    code: error instanceof GovernanceError
                        ? error.code
                        : "GOVERNANCE_INVALID_INPUT",
                    message: error instanceof Error ? error.message : String(error),
                },
            ],
            ...(previous ? { current: previous } : {}),
        };
    }
}
//# sourceMappingURL=governance.js.map