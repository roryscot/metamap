import type { StructuralMapping } from "./model.js";
import type { EvaluationContext } from "./viability-model.js";
import type { EvidenceRecord } from "./viability-model.js";
import type { UncertaintyAssessment } from "./semantic-model.js";

export const METAMAP_DERIVATION_VERSION = "1.0.0" as const;
export const DERIVATION_ATTRIBUTE = "metamap:derivation" as const;
export const UNCERTAINTY_DIMENSIONS = [
  "identity",
  "context",
  "provenance",
  "completeness",
  "causal-relevance",
  "conflicting-authority",
] as const;
export type UncertaintyDimension = (typeof UNCERTAINTY_DIMENSIONS)[number];
export type UncertaintyStatus =
  "supported" | "contradicted" | "unknown" | "not-applicable";

export interface ContentBinding {
  id: string;
  digest: string;
}
export interface PackContentBinding extends ContentBinding {
  version: string;
}
export interface DerivationPremise {
  mapping: string;
  digest: string;
  derivation?: ContentBinding;
}
export interface DerivationUncertainty {
  dimension: UncertaintyDimension;
  status: UncertaintyStatus;
  evidence: string[];
  assessments: string[];
  measurementModels: string[];
  sourceRevisions: string[];
}
export interface CorrespondenceDerivation {
  $schema?: string;
  schemaVersion: typeof METAMAP_DERIVATION_VERSION;
  id: string;
  digest: string;
  interpretation: "declared-law-application";
  rule: { id: string; pack: PackContentBinding; imports: PackContentBinding[] };
  premises: DerivationPremise[];
  /** The mapping value before adding its own proof back-reference. */
  result: StructuralMapping;
  context: EvaluationContext;
  contextDigest: string;
  dependencies: ContentBinding[];
  depth: number;
  derivationCount: number;
  uncertainty: DerivationUncertainty[];
}

export interface DerivationBounds {
  maxDepth: number;
  maxDerivations: number;
}
export interface CorrespondenceCompositionRequest {
  schemaVersion: "1.0.0";
  law: string;
  premises: string[];
  context: EvaluationContext;
  bounds: DerivationBounds;
  resultId?: string;
  derivations: CorrespondenceDerivation[];
  assessments: UncertaintyAssessment[];
  evidence: EvidenceRecord[];
}
export interface DerivationIssue {
  code: string;
  message: string;
  subjectId?: string;
  path?: string;
}
export type CorrespondenceCompositionResult =
  | {
      schemaVersion: "1.0.0";
      status: "proposed";
      mapping: StructuralMapping;
      derivation: CorrespondenceDerivation;
      issues: DerivationIssue[];
    }
  | {
      schemaVersion: "1.0.0";
      status: "rejected" | "unsupported" | "unknown" | "incomplete";
      issues: DerivationIssue[];
    };
