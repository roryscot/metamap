import type { SourceReplayBundle } from "./semantic-replay-model.js";
import type { ApprovalPayload, CreateGovernedProposalOptions, GovernedArtifactManifest, GovernedChangeProposal, GovernanceRequirement, GovernanceVerificationContext, GovernanceVerificationResult, PreparedGovernedCandidate, SignedGovernedApproval, TrustedConsumerConfiguration, TrustBinding } from "./governance-model.js";
export declare class GovernanceError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** New content addresses include every member except their own id and digest. */
export declare function governanceDocumentDigest(value: unknown): string;
/** Fixed Ed25519 profile, also usable with independent published test vectors. */
export declare function verifyEd25519Signature(data: Uint8Array, key: string, signature: string): boolean;
export declare function parseTrustedConsumerConfiguration(value: unknown): TrustedConsumerConfiguration;
export declare function parseTrustedConsumerConfigurationJson(text: string): TrustedConsumerConfiguration;
export declare function consumerTrustBinding(value: TrustedConsumerConfiguration): TrustBinding;
/** Reuses existing native emitters. Artifact paths never come from entity IDs or locators. */
export declare function prepareGovernedArtifacts(value: SourceReplayBundle, consumer: string, environment: string): {
    manifest: GovernedArtifactManifest;
    files: Record<string, string>;
};
export declare function parseGovernedArtifactManifest(value: unknown): GovernedArtifactManifest;
/** Closed conservative action classification; it never infers a grant from graph ownership. */
export declare function governedChangeRequirements(before: SourceReplayBundle | null, after: SourceReplayBundle, consumer: string, intent?: "deploy" | "rollback"): GovernanceRequirement[];
export declare function createGovernedChangeProposal(value: SourceReplayBundle, options: CreateGovernedProposalOptions): PreparedGovernedCandidate;
export declare function parseGovernedChangeProposal(value: unknown): GovernedChangeProposal;
export declare function parseGovernedChangeProposalJson(text: string): GovernedChangeProposal;
/** Verifies every file and rejects additional outputs before any activation step. */
export declare function verifyGovernedArtifactBytes(proposal: GovernedChangeProposal, files: Record<string, string>): void;
export declare function createApprovalPayload(proposalValue: GovernedChangeProposal, options: {
    principal: string;
    key: string;
    grants: readonly string[];
    issuedAt: string;
    expiresAt: string;
}): ApprovalPayload;
export declare function governedApprovalSigningBytes(value: ApprovalPayload): Buffer;
/** Attach an externally produced signature. This operation grants no authorization. */
export declare function attachGovernedApprovalSignature(payload: ApprovalPayload, signature: string | Uint8Array): SignedGovernedApproval;
export declare function parseSignedGovernedApproval(value: unknown): SignedGovernedApproval;
export declare function parseSignedGovernedApprovalJson(text: string): SignedGovernedApproval;
/** Pure verification only. Current trust, state and time are supplied by the protected caller. */
export declare function verifyGovernedApproval(proposalValue: unknown, approvalValue: unknown, context: GovernanceVerificationContext): GovernanceVerificationResult;
//# sourceMappingURL=governance.d.ts.map