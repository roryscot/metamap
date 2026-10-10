import { captureReplayBundle } from "../../replay.js";
import {
  createMetamapRepairRequest,
  metamapRepairDigest,
} from "../../repair.js";
import type {
  MetamapRepairEdit,
  MetamapRepairRequest,
} from "../../repair-model.js";
import type { StructuralMapping } from "../../model.js";
import { sourceFixture } from "./source-fixture.js";

export function repairFixture() {
  const inputs = sourceFixture();
  inputs.graph.mappings = inputs.graph.mappings.slice(0, 2);
  inputs.policy.derivations = [];
  const mapping: StructuralMapping = {
    id: "urn:repair:mapping:schema",
    relation: "example:uses_schema",
    sources: [inputs.graph.entities[0].id],
    targets: [inputs.graph.entities[2].id],
    cardinality: "one-to-one",
    lossiness: "lossless",
    provenance: { status: "declared", assertedBy: "supplied-synthetic-owner" },
  };
  const restore: MetamapRepairEdit = {
    id: "restore-schema",
    kind: "restore-mapping",
    semanticCost: 1,
    mapping,
  };
  const capture = () => {
    inputs.rebind();
    return captureReplayBundle(inputs.graph, inputs.policy, {
      ...inputs.options,
      sourceCapture: inputs.sourceCapture,
      projections: [inputs.spec],
    });
  };
  const request = (
    edits: MetamapRepairEdit[] = [restore],
    options: Partial<
      Pick<MetamapRepairRequest, "allowedFacts" | "protectedFacts" | "bounds">
    > = {},
  ) =>
    createMetamapRepairRequest(capture(), {
      consumer: inputs.spec.consumer,
      requiredProjections: [inputs.spec.id],
      allowedFacts: [{ subject: "*", fact: "*" }],
      protectedFacts: [],
      edits,
      bounds: {
        maximumCandidates: 32,
        maximumEdits: 8,
        maximumDerivationDepth: inputs.policy.derivationLimits.maxDepth,
        maximumElapsedMilliseconds: 60000,
      },
      ...options,
    });
  return { inputs, mapping, restore, capture, request };
}
export function rehashRepair<T extends { id: string; digest: string }>(
  value: T,
  kind = "repair-request",
): T {
  value.digest = metamapRepairDigest(value);
  value.id = "urn:metamap:" + kind + ":" + value.digest.slice(7);
  return value;
}
