import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../canonical.js";
import {
  composeCorrespondences,
  derivationDigest,
  parseCorrespondenceDerivation,
  validateCorrespondenceDerivations,
} from "../derivation.js";
import {
  DERIVATION_ATTRIBUTE,
  UNCERTAINTY_DIMENSIONS,
} from "../derivation-model.js";
import { compileMetamap } from "../viability.js";
import { coreRelationPack, RelationRegistry } from "../relations.js";
import { relationPackDigest } from "../relation-pack.js";
import { uncertaintyFixture } from "./helpers/uncertainty-fixture.js";

const compile = (inputs: ReturnType<typeof uncertaintyFixture>) =>
  compileMetamap(inputs.graph, inputs.policy, inputs.options);
const dimension = (
  inputs: ReturnType<typeof uncertaintyFixture>,
  name = "identity",
) =>
  inputs.policy.derivations[0].uncertainty.find(
    (entry) => entry.dimension === name,
  )!;

describe("typed recorded uncertainty", () => {
  it("satisfies the frozen required-unknown acceptance and gives a dimension-specific explanation", () => {
    const corpus = JSON.parse(
      readFileSync(
        new URL("../../evaluation/capability-corpus.json", import.meta.url),
        "utf8",
      ),
    );
    const fixture = corpus.laterMilestones.find(
      (entry: { id: string }) => entry.id === "unknown-required-uncertainty",
    );
    const inputs = uncertaintyFixture(),
      graph = structuredClone(inputs.graph);
    inputs.requireIdentity(["supported", "unknown"], false);
    expect(compile(inputs).status).toBe("viable");
    inputs.policy.uncertaintyRequirements[0].allowedStates =
      fixture.input.allowedStates;
    const rejected = compile(inputs);
    expect(rejected.status).toBe(fixture.expected.status);
    expect(rejected.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "UNCERTAINTY_STATE_NOT_ALLOWED",
          subjectId: inputs.request.resultId,
          message: expect.stringContaining(fixture.expected.dimension),
        }),
      ]),
    );
    expect(inputs.graph).toEqual(graph);
  });
  it.each(UNCERTAINTY_DIMENSIONS)(
    "propagates %s support without asserting other dimensions",
    (name) => {
      const inputs = uncertaintyFixture();
      inputs.graph.mappings
        .slice(0, 2)
        .forEach((mapping) => inputs.assess(mapping.id, name));
      const proof = inputs.recompose().derivation;
      expect(
        proof.uncertainty.find((entry) => entry.dimension === name)?.status,
      ).toBe("supported");
      expect(
        proof.uncertainty
          .filter((entry) => entry.dimension !== name)
          .every((entry) => entry.status === "unknown"),
      ).toBe(true);
      expect(compile(inputs).status).toBe("viable");
      expect(Object.isFrozen(proof.uncertainty)).toBe(true);
      expect(Object.isFrozen(inputs.policy.assessments)).toBe(false);
    },
  );
  it("binds full evidence values separately from their asserted artifact digest", () => {
    const inputs = uncertaintyFixture();
    inputs.supported();
    inputs.policy.evidence[0].digest = `sha256:${"a".repeat(64)}`;
    const proof = inputs.recompose().derivation;
    for (const record of [
      ...inputs.policy.assessments,
      ...inputs.policy.evidence,
    ])
      expect(proof.dependencies).toContainEqual({
        id: record.id,
        digest: canonicalDigest(record),
      });
    expect(
      proof.dependencies.find(
        (entry) => entry.id === inputs.policy.evidence[0].id,
      )?.digest,
    ).not.toBe(inputs.policy.evidence[0].digest);
    inputs.policy.evidence[0].producer = "changed-recorded-producer";
    expect(
      compile(inputs).issues.some(
        (issue) => issue.code === "DERIVATION_PREMISE_OR_RULE_MISMATCH",
      ),
    ).toBe(true);
    const next = inputs.recompose().derivation;
    expect(next.digest).not.toBe(proof.digest);
    expect(compile(inputs).status).toBe("viable");
  });
  it("does not strengthen repeated evidence or scalar confidence", () => {
    const inputs = uncertaintyFixture();
    const record = inputs.assess("urn:example:service"); // shared middle endpoint
    const proof = inputs.recompose().derivation;
    expect(dimension(inputs)).toMatchObject({
      status: "supported",
      assessments: [record.assessment.id],
      evidence: [record.evidence.id],
    });
    expect(
      proof.dependencies.filter((entry) => entry.id === record.evidence.id),
    ).toHaveLength(1);
    inputs.policy.evidence[0].confidence = 0.99;
    const next = inputs.recompose().derivation;
    expect(next.digest).not.toBe(proof.digest);
    expect(next.uncertainty).toEqual(proof.uncertainty);
    const unknown = uncertaintyFixture();
    unknown.graph.mappings[0].provenance.confidence = 1;
    unknown.recompose();
    expect(dimension(unknown).status).toBe("unknown");
  });
  it("keeps an unknown premise despite direct support on the derived result", () => {
    const inputs = uncertaintyFixture();
    inputs.assess(inputs.graph.mappings[0].id);
    inputs.assess(inputs.request.resultId!);
    inputs.recompose();
    expect(dimension(inputs).status).toBe("unknown");
    inputs.requireIdentity();
    expect(compile(inputs).status).toBe("rejected");
  });
  it.each(["unknown", "contradicted"] as const)(
    "cannot erase %s or lossiness through a supported result",
    (status) => {
      const inputs = uncertaintyFixture();
      inputs.graph.mappings[0].lossiness = "lossy";
      inputs.policy.mappings[0].reversibility = "irreversible";
      inputs.assess(inputs.graph.mappings[0].id, "identity", status);
      inputs.assess(inputs.graph.mappings[1].id);
      inputs.assess(inputs.request.resultId!);
      const proposal = inputs.recompose();
      expect(proposal.mapping.lossiness).toBe("lossy");
      expect(proposal.mapping.provenance.status).toBe("inferred");
      expect(dimension(inputs).status).toBe(status);
      inputs.requireIdentity();
      expect(
        compile(inputs).issues.some(
          (issue) => issue.code === "UNCERTAINTY_STATE_NOT_ALLOWED",
        ),
      ).toBe(true);
    },
  );
  it("uses named model incompatibility as unknown and never averages confidence", () => {
    const inputs = uncertaintyFixture();
    inputs.assess(inputs.graph.mappings[0].id, "identity", "supported", {
      model: "urn:model:a",
    });
    inputs.assess(inputs.graph.mappings[1].id, "identity", "supported", {
      model: "urn:model:b",
    });
    inputs.recompose();
    expect(dimension(inputs)).toMatchObject({
      status: "unknown",
      measurementModels: ["urn:model:a", "urn:model:b"],
    });
    inputs.requireIdentity();
    expect(
      compile(inputs).issues.some((issue) =>
        issue.message.includes("incompatible named measurement models"),
      ),
    ).toBe(true);
    inputs.policy.assessments[1].measurementModel = "urn:model:a";
    inputs.recompose();
    expect(dimension(inputs).status).toBe("supported");
    expect(compile(inputs).status).toBe("viable");
  });
  it("contradicting evidence dominates an assessment and unrelated model support", () => {
    const inputs = uncertaintyFixture();
    inputs.assess(
      inputs.graph.mappings[0].id,
      "conflicting-authority",
      "supported",
      { result: "contradicts", model: "urn:model:a" },
    );
    inputs.assess(
      inputs.graph.mappings[1].id,
      "conflicting-authority",
      "supported",
      { model: "urn:model:b" },
    );
    inputs.recompose();
    expect(dimension(inputs, "conflicting-authority").status).toBe(
      "contradicted",
    );
    // A consumer may record/review this dimension without making it a rejection.
    expect(compile(inputs).status).toBe("viable");
    inputs.policy.constraints = [
      {
        id: "urn:explicit:evidence-check",
        kind: "core:requires-evidence",
        subjects: [inputs.graph.mappings[0].id],
        parameters: { kinds: ["uncertainty:conflicting-authority"] },
      },
    ];
    expect(
      compile(inputs).issues.some(
        (issue) => issue.code === "REQUIRED_EVIDENCE_MISSING",
      ),
    ).toBe(true);
    inputs.policy.constraints = [];
    inputs.policy.uncertaintyRequirements = [
      {
        id: "urn:requirement:authority",
        select: { ids: [inputs.request.resultId!] },
        dimension: "conflicting-authority",
        allowedStates: ["supported"],
        requireEvidence: true,
      },
    ];
    expect(
      compile(inputs).issues.some(
        (issue) => issue.code === "UNCERTAINTY_STATE_NOT_ALLOWED",
      ),
    ).toBe(true);
    inputs.policy.evidence.push({
      id: "urn:legacy:contradiction",
      subjects: [inputs.graph.mappings[0].id],
      kind: "semantic-check",
      result: "contradicts",
      producer: "legacy-reviewer",
    });
    expect(
      compile(inputs).issues.some(
        (issue) => issue.code === "CONTRADICTING_EVIDENCE",
      ),
    ).toBe(true);
  });
  it("treats inconclusive support as unknown", () => {
    const inputs = uncertaintyFixture();
    inputs.supported();
    inputs.policy.evidence[0].result = "inconclusive";
    inputs.recompose();
    expect(dimension(inputs).status).toBe("unknown");
  });
  it("requires evidence on every contributing assessment rather than borrowing another path's record", () => {
    const inputs = uncertaintyFixture();
    inputs.assess(inputs.graph.mappings[0].id, "identity", "supported", {
      evidence: false,
    });
    inputs.assess(inputs.graph.mappings[1].id);
    inputs.recompose();
    inputs.requireIdentity();
    const result = compile(inputs);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "UNCERTAINTY_EVIDENCE_REQUIRED",
          subjectId: inputs.request.resultId,
        }),
      ]),
    );
    inputs.policy.uncertaintyRequirements[0].requireEvidence = false;
    expect(compile(inputs).status).toBe("viable");
  });
  it("allows a reasoned not-applicable dimension only when the consumer permits contributing exemptions", () => {
    const inputs = uncertaintyFixture();
    inputs.assess(inputs.graph.mappings[0].id, "identity", "not-applicable");
    inputs.assess(inputs.graph.mappings[1].id);
    inputs.recompose();
    inputs.requireIdentity();
    expect(
      compile(inputs).issues.some(
        (issue) => issue.code === "UNCERTAINTY_NOT_APPLICABLE_NOT_ALLOWED",
      ),
    ).toBe(true);
    inputs.policy.uncertaintyRequirements[0].allowedStates.push(
      "not-applicable",
    );
    expect(compile(inputs).status).toBe("viable");
    delete inputs.policy.assessments[0].notApplicableReason;
    expect(
      compile(inputs).issues.some(
        (issue) => issue.code === "INVALID_SEMANTIC_POLICY",
      ),
    ).toBe(true);
  });
  it("scopes authority assessments to incident mappings without transferring ownership", () => {
    const inputs = uncertaintyFixture();
    inputs.graph.authorities = [
      {
        id: "urn:example:authority",
        concept: "urn:example:service",
        source: "urn:example:consumer",
        facts: ["implementation"],
        mode: "canonical",
        provenance: { status: "declared", assertedBy: "consumer-owner" },
      },
    ];
    inputs.assess(
      "urn:example:authority",
      "conflicting-authority",
      "contradicted",
    );
    const proposed = inputs.recompose();
    expect(
      proposed.derivation.uncertainty.find(
        (entry) => entry.dimension === "conflicting-authority",
      )?.status,
    ).toBe("contradicted");
    expect("authority" in proposed.mapping).toBe(false);
    expect(proposed.mapping.provenance.assertedBy).toBe(inputs.request.law);
    expect(compile(inputs).status).toBe("viable");
  });
  it.each([
    [
      "missing evidence",
      "MISSING_UNCERTAINTY_EVIDENCE",
      (i: ReturnType<typeof uncertaintyFixture>) => {
        i.policy.evidence = [];
      },
    ],
    [
      "wrong scope",
      "UNCERTAINTY_EVIDENCE_SCOPE_MISMATCH",
      (i: ReturnType<typeof uncertaintyFixture>) => {
        i.policy.evidence[0].subjects = [i.graph.mappings[1].id];
      },
    ],
    [
      "wrong dimension",
      "UNCERTAINTY_EVIDENCE_DIMENSION_MISMATCH",
      (i: ReturnType<typeof uncertaintyFixture>) => {
        i.policy.evidence[0].kind = "uncertainty:context";
      },
    ],
    [
      "stale revision",
      "ASSESSMENT_REVISION_MISMATCH",
      (i: ReturnType<typeof uncertaintyFixture>) => {
        i.policy.assessments[0].sourceRevision = "old";
      },
    ],
    [
      "unknown subject",
      "UNKNOWN_ASSESSMENT_SUBJECT",
      (i: ReturnType<typeof uncertaintyFixture>) => {
        i.policy.assessments[0].subject = "urn:missing:subject";
      },
    ],
    [
      "duplicate identity",
      "DUPLICATE_UNCERTAINTY_ID",
      (i: ReturnType<typeof uncertaintyFixture>) => {
        i.policy.assessments[0].id = i.graph.mappings[0].id;
      },
    ],
  ] as const)(
    "rejects %s before deriving or admitting",
    (_label, code, mutate) => {
      const inputs = uncertaintyFixture();
      inputs.assess(inputs.graph.mappings[0].id);
      mutate(inputs);
      const proposal = composeCorrespondences(
        inputs.graph,
        {
          ...inputs.request,
          assessments: inputs.policy.assessments,
          evidence: inputs.policy.evidence,
        },
        inputs.registry,
      );
      expect(proposal).toMatchObject({
        status: "rejected",
        issues: [expect.objectContaining({ code })],
      });
      expect(compile(inputs).status).toBe("rejected");
    },
  );
  it("matches an explicit mapping source revision before falling back to graph revision", () => {
    const inputs = uncertaintyFixture();
    inputs.graph.mappings[0].provenance.sourceRevision = "owned:2";
    inputs.assess(inputs.graph.mappings[0].id);
    inputs.recompose();
    expect(compile(inputs).status).toBe("viable");
    inputs.policy.assessments[0].sourceRevision = inputs.graph.revision!;
    expect(
      compile(inputs).issues.some(
        (issue) => issue.code === "ASSESSMENT_REVISION_MISMATCH",
      ),
    ).toBe(true);
  });
  it.each(["entity", "authority"] as const)(
    "binds the declared %s source revision rather than only its containing graph revision",
    (kind) => {
      const inputs = uncertaintyFixture();
      let subject = inputs.graph.entities[1].id;
      if (kind === "entity")
        inputs.graph.entities[1].provenance = {
          status: "declared",
          assertedBy: "owner",
          sourceRevision: "owned:2",
        };
      else {
        subject = "urn:example:authority";
        inputs.graph.authorities = [
          {
            id: subject,
            concept: inputs.graph.entities[1].id,
            source: inputs.graph.entities[0].id,
            facts: ["implementation"],
            mode: "canonical",
            provenance: {
              status: "declared",
              assertedBy: "owner",
              sourceRevision: "owned:2",
            },
          },
        ];
      }
      inputs.assess(subject);
      inputs.recompose();
      expect(compile(inputs).status).toBe("viable");
      inputs.policy.assessments[0].sourceRevision = inputs.graph.revision!;
      expect(
        compile(inputs).issues.some(
          (issue) => issue.code === "ASSESSMENT_REVISION_MISMATCH",
        ),
      ).toBe(true);
    },
  );
  it("retains typed dependencies and unresolved conflict across a nested derivation", () => {
    const inputs = uncertaintyFixture();
    inputs.graph.mappings.pop();
    inputs.graph.entities.push({
      id: "urn:example:final",
      kind: "configuration",
    });
    inputs.graph.mappings.push({
      ...structuredClone(inputs.graph.mappings[0]),
      id: "urn:example:schema-final",
      sources: ["urn:example:schema"],
      targets: ["urn:example:final"],
    });
    inputs.supported();
    inputs.assess("urn:example:schema-final");
    inputs.assess(
      "urn:example:service",
      "conflicting-authority",
      "contradicted",
    );
    const pack = structuredClone(inputs.pack);
    pack.laws = [
      ...pack.laws,
      {
        id: "urn:example:law:nested-schema",
        operation: "chain",
        operands: ["example:uses_schema", "example:depends"],
        resultRelation: "example:uses_schema",
        handling: {
          lossiness: "conservative",
          uncertainty: "conservative",
          authority: "none",
        },
      },
    ];
    const registry = new RelationRegistry([coreRelationPack, pack]);
    inputs.graph.relationPacks = [coreRelationPack, pack].map((value) => ({
      id: value.id,
      version: value.version,
      digest: relationPackDigest(value),
    }));
    const child = composeCorrespondences(
      inputs.graph,
      {
        ...inputs.request,
        assessments: inputs.policy.assessments,
        evidence: inputs.policy.evidence,
      },
      registry,
    );
    if (child.status !== "proposed") throw new Error(JSON.stringify(child));
    inputs.graph.mappings.push(child.mapping);
    const parent = composeCorrespondences(
      inputs.graph,
      {
        ...inputs.request,
        law: "urn:example:law:nested-schema",
        resultId: "urn:example:consumer-final",
        premises: [child.mapping.id, "urn:example:schema-final"],
        derivations: [child.derivation],
        assessments: inputs.policy.assessments,
        evidence: inputs.policy.evidence,
      },
      registry,
    );
    if (parent.status !== "proposed") throw new Error(JSON.stringify(parent));
    expect(parent.derivation.depth).toBe(2);
    expect(parent.derivation.derivationCount).toBe(2);
    expect(
      parent.derivation.uncertainty.find(
        (entry) => entry.dimension === "conflicting-authority",
      )?.status,
    ).toBe("contradicted");
    for (const record of [
      ...inputs.policy.assessments,
      ...inputs.policy.evidence,
    ])
      expect(parent.derivation.dependencies).toContainEqual({
        id: record.id,
        digest: canonicalDigest(record),
      });
    inputs.graph.mappings.push(parent.mapping);
    expect(
      validateCorrespondenceDerivations(
        inputs.graph,
        [child.derivation, parent.derivation],
        inputs.options.context,
        inputs.policy.derivationLimits,
        registry,
        {
          assessments: inputs.policy.assessments,
          evidence: inputs.policy.evidence,
        },
      ).status,
    ).toBe("valid");
  });
  it("reports stale requirement selectors and checks only active matched mappings", () => {
    const inputs = uncertaintyFixture();
    inputs.requireIdentity();
    inputs.policy.uncertaintyRequirements[0].select.ids = [
      "urn:missing:mapping",
    ];
    expect(
      compile(inputs).issues.some(
        (issue) => issue.code === "UNKNOWN_UNCERTAINTY_SELECTOR_MAPPING",
      ),
    ).toBe(true);
    inputs.policy.uncertaintyRequirements[0].select.ids = [
      inputs.request.resultId!,
    ];
    inputs.policy.mappings = inputs.graph.mappings.map((mapping) => ({
      mapping: mapping.id,
      coverage: "total",
      determinism: "deterministic",
      reversibility: "reversible",
      ...(mapping.id === inputs.request.resultId
        ? {
            applicability: {
              when: {
                key: "environment",
                operator: "equals" as const,
                value: "inactive",
              },
            },
          }
        : {}),
    }));
    expect(compile(inputs).status).toBe("viable");
  });
  it("rejects duplicated dimensions and self-consistent rehashes concealing changed typed dependencies", () => {
    const inputs = uncertaintyFixture();
    inputs.supported();
    inputs.recompose();
    const proof = structuredClone(inputs.policy.derivations[0]);
    proof.uncertainty[1] = proof.uncertainty[0];
    proof.digest = derivationDigest(proof);
    proof.id = `urn:metamap:derivation:${proof.digest.slice(7)}`;
    expect(() => parseCorrespondenceDerivation(proof)).toThrow(/dimension/);
    const altered = structuredClone(inputs.policy.derivations[0]);
    altered.dependencies = altered.dependencies.filter(
      (entry) => !entry.id.startsWith("urn:assessment:"),
    );
    altered.digest = derivationDigest(altered);
    altered.id = `urn:metamap:derivation:${altered.digest.slice(7)}`;
    const graph = structuredClone(inputs.graph);
    graph.mappings[2].attributes![DERIVATION_ATTRIBUTE] = altered.id;
    const checked = validateCorrespondenceDerivations(
      graph,
      [altered],
      inputs.options.context,
      inputs.policy.derivationLimits,
      inputs.registry,
      {
        assessments: inputs.policy.assessments,
        evidence: inputs.policy.evidence,
      },
    );
    expect(checked).toMatchObject({
      status: "rejected",
      issues: [{ code: "DERIVATION_PREMISE_OR_RULE_MISMATCH" }],
    });
  });
});
