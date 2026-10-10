import type { SourceReplayBundle } from "./semantic-replay-model.js";

export type GovernanceAction =
  | "activate"
  | "bootstrap"
  | "rollback"
  | "rebind-implementation"
  | "change-graph"
  | "change-authority"
  | "change-policy"
  | "relax-policy"
  | "raise-budget"
  | "add-waiver"
  | "change-law"
  | "change-source"
  | "change-context"
  | "change-projection";

export interface GovernanceScope {
  subject: string;
  fact: string;
}
export interface GovernanceRequirement extends GovernanceScope {
  action: GovernanceAction;
}
export interface TrustedPrincipal {
  id: string;
  role: "owner" | "agent" | "service";
  revoked: boolean;
}
export interface TrustedApprovalKey {
  id: string;
  principal: string;
  algorithm: "Ed25519";
  /** Canonical base64 of an Ed25519 SubjectPublicKeyInfo DER value. */
  publicKey: string;
  validFrom: string;
  validUntil: string;
  revoked: boolean;
}
export interface TrustedApprovalGrant {
  id: string;
  principal: string;
  actions: GovernanceAction[];
  scopes: GovernanceScope[];
  validFrom: string;
  validUntil: string;
  revoked: boolean;
}
/** Supplied by the consumer's protected environment, never by a candidate. */
export interface TrustedConsumerConfiguration {
  $schema?: string;
  schemaVersion: "1.0.0";
  id: string;
  revision: string;
  mode: "governed";
  consumer: string;
  environment: string;
  stateDirectory: string;
  proposalRoots: string[];
  principals: TrustedPrincipal[];
  keys: TrustedApprovalKey[];
  grants: TrustedApprovalGrant[];
}
export interface TrustBinding {
  id: string;
  revision: string;
  digest: string;
}
export interface GovernedArtifactFile {
  path: string;
  mediaType: "application/json" | "text/typescript";
  byteDigest: string;
  byteLength: number;
}
export interface GovernedArtifactManifest {
  $schema?: string;
  schemaVersion: "1.0.0";
  id: string;
  digest: string;
  consumer: string;
  environment: string;
  replay: { id: string; digest: string };
  files: GovernedArtifactFile[];
}
export interface GovernedBaseline {
  manifestDigest: string;
  replay: SourceReplayBundle;
}
export interface GovernedChangeProposal {
  $schema?: string;
  schemaVersion: "1.0.0";
  id: string;
  digest: string;
  consumer: string;
  environment: string;
  intent: "deploy" | "rollback";
  /** Attribution only; this field does not authenticate the proposer. */
  proposer: string;
  trust: TrustBinding;
  baseline: GovernedBaseline | null;
  candidate: SourceReplayBundle;
  artifacts: GovernedArtifactManifest;
  requirements: GovernanceRequirement[];
}
export interface ApprovalPayload {
  domain: "urn:metamap:approval:1";
  schemaVersion: "1.0.0";
  algorithm: "Ed25519";
  proposal: { id: string; digest: string };
  artifacts: { id: string; digest: string };
  baseline: string | null;
  consumer: string;
  environment: string;
  intent: "deploy" | "rollback";
  trust: TrustBinding;
  principal: string;
  key: string;
  grants: string[];
  requirements: GovernanceRequirement[];
  issuedAt: string;
  expiresAt: string;
}
export interface SignedGovernedApproval {
  $schema?: string;
  schemaVersion: "1.0.0";
  id: string;
  digest: string;
  payload: ApprovalPayload;
  /** Canonical base64 of the 64-byte signature over the entire JCS payload. */
  signature: string;
}
export interface PreparedGovernedCandidate {
  proposal: GovernedChangeProposal;
  files: Record<string, string>;
}
export interface CreateGovernedProposalOptions {
  consumer: string;
  environment: string;
  proposer: string;
  intent?: "deploy" | "rollback";
  baseline: GovernedBaseline | null;
  trustedConfiguration: TrustedConsumerConfiguration;
}
export interface GovernanceVerificationContext {
  trustedConfiguration: TrustedConsumerConfiguration;
  /** Read from current protected state, not accepted from the proposal. */
  baseline: GovernedBaseline | null;
  /** Current trusted clock; never a replay's historical evaluation time. */
  now: string;
}
export interface GovernanceIssue {
  code: string;
  message: string;
  subject?: string;
}
export type GovernanceVerificationResult =
  | {
      status: "authorized";
      principal: string;
      approval: string;
      grants: string[];
      proposal: GovernedChangeProposal;
    }
  | { status: "rejected"; issues: GovernanceIssue[] };
