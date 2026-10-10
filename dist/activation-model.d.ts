import type { GovernedArtifactManifest, GovernedChangeProposal, GovernanceIssue, SignedGovernedApproval, TrustedConsumerConfiguration } from "./governance-model.js";
export interface GovernedActivationRequest {
    schemaVersion: "1.0.0";
    proposal: GovernedChangeProposal;
    approval: SignedGovernedApproval;
    files: Record<string, string>;
}
export interface GovernedActivationManifest {
    $schema?: string;
    schemaVersion: "1.0.0";
    id: string;
    digest: string;
    consumer: string;
    environment: string;
    artifacts: GovernedArtifactManifest;
    proposal: GovernedChangeProposal;
    approval: SignedGovernedApproval;
    /** Historical external configuration recorded by the trusted promoter. */
    acceptedTrust: TrustedConsumerConfiguration;
    previousManifest: string | null;
    activatedAt: string;
}
export interface GovernedActivePointer {
    schemaVersion: "1.0.0";
    consumer: string;
    environment: string;
    manifest: {
        id: string;
        digest: string;
    };
}
export interface GovernedActivationState {
    manifest: GovernedActivationManifest;
    files: Record<string, string>;
}
export interface GovernedActivationContext {
    trustedConfiguration: TrustedConsumerConfiguration;
    now: string;
}
/** Installed by the consumer host, never selected by an incoming candidate. */
export interface GovernedInMemoryHost {
    mode: "governed";
    configuration: () => TrustedConsumerConfiguration;
    clock?: () => string;
}
export type ProtectedPromotionPhase = "locked" | "artifacts-ready" | "manifest-ready" | "before-commit" | "committed";
export interface ProtectedPromotionOptions {
    mode: "governed";
    trustPath: string;
    /** A trusted host clock, not a field in the request or historical replay. */
    clock?: () => string;
    /** Trusted host observation only; unavailable through the wire protocol. */
    onPhase?: (phase: ProtectedPromotionPhase) => void | Promise<void>;
}
export type GovernedActivationResult = {
    status: "activated";
    activated: true;
    current: GovernedActivationState;
} | {
    status: "already-active";
    activated: false;
    current: GovernedActivationState;
} | {
    status: "rejected";
    activated: false;
    issues: GovernanceIssue[];
    current?: GovernedActivationState;
} | {
    status: "indeterminate";
    activated: null;
    issues: GovernanceIssue[];
    current?: GovernedActivationState;
};
//# sourceMappingURL=activation-model.d.ts.map