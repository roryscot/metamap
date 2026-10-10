import type {
  UncertaintyDimension,
  UncertaintyStatus,
} from "../../derivation-model.js";
import type {
  UncertaintyAssessment,
  ConsumerRiskBudget,
} from "../../semantic-model.js";
import type { EvidenceRecord } from "../../viability-model.js";
import { compileProjection } from "../../projection.js";
import { semanticFixture } from "./semantic-fixture.js";

export function uncertaintyFixture() {
  const inputs = semanticFixture();
  const assess = (
    subject: string,
    dimension: UncertaintyDimension = "identity",
    status: UncertaintyStatus = "supported",
    options: {
      evidence?: boolean;
      result?: EvidenceRecord["result"];
      model?: string;
    } = {},
  ) => {
    const index = inputs.policy.assessments.length;
    const evidence: EvidenceRecord = {
      id: `urn:assessment:evidence:${index}`,
      subjects: [subject],
      kind: `uncertainty:${dimension}`,
      result: options.result ?? "supports",
      producer: "recorded-source-owner",
      confidence: 0.2,
    };
    const assessment: UncertaintyAssessment = {
      id: `urn:assessment:${index}`,
      subject,
      dimension,
      status,
      evidence: options.evidence === false ? [] : [evidence.id],
      assessor: "recorded-reviewer",
      sourceRevision:
        inputs.graph.mappings.find((mapping) => mapping.id === subject)
          ?.provenance.sourceRevision ??
        inputs.graph.entities.find((entity) => entity.id === subject)
          ?.provenance?.sourceRevision ??
        inputs.graph.authorities.find((authority) => authority.id === subject)
          ?.provenance.sourceRevision ??
        inputs.graph.revision ??
        "declared-only",
      ...(options.model ? { measurementModel: options.model } : {}),
      ...(status === "not-applicable"
        ? {
            notApplicableReason:
              "Consumer configuration has no causal assertion",
          }
        : {}),
    };
    inputs.policy.assessments.push(assessment);
    if (options.evidence !== false) inputs.policy.evidence.push(evidence);
    return { assessment, evidence };
  };
  const supported = () =>
    inputs.graph.mappings.slice(0, 2).forEach((mapping) => assess(mapping.id));
  const requireIdentity = (
    allowedStates: UncertaintyStatus[] = ["supported"],
    requireEvidence = true,
  ) => {
    inputs.policy.uncertaintyRequirements = [
      {
        id: "urn:requirement:identity",
        select: { ids: [inputs.request.resultId!] },
        dimension: "identity",
        allowedStates,
        requireEvidence,
      },
    ];
  };
  const budget = (maximumTotalCost = 5): ConsumerRiskBudget => {
    const value: ConsumerRiskBudget = {
      id: "urn:example:budget",
      consumer: inputs.spec.consumer,
      classifications: inputs.graph.mappings.map((mapping, index) => ({
        id: `urn:example:class:${index}`,
        select: { ids: [mapping.id] },
        classification: index < 2 ? "declared-directional" : "derived",
        cost: [2, 3, 0][index] ?? 0,
      })),
      maximumTotalCost,
      requireCompleteClassification: true,
      requireCompleteDependencies: true,
    };
    inputs.policy.riskBudgets = [value];
    inputs.spec.budget = value.id;
    return value;
  };
  const project = () =>
    compileProjection(inputs.graph, inputs.generation(), inputs.spec, {
      semanticPolicy: inputs.policy,
      relationRegistry: inputs.registry,
    });
  return { ...inputs, assess, supported, requireIdentity, budget, project };
}
