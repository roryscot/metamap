import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AdapterResult } from "../../adapters/types.js";
import type { MetamapConfig } from "../../config.js";
import type { MetamapSourceCapture } from "../../provenance-model.js";
import { createSourceCapture, sourceCaptureDigest } from "../../provenance.js";
import { semanticReplayDigest } from "../../semantic-replay.js";
import type { SourceReplayBundle } from "../../semantic-replay-model.js";
import { contentDigest } from "../../stable.js";
import { assembleWorkspace } from "../../workspace.js";
import { uncertaintyFixture } from "./uncertainty-fixture.js";

export function sourceFixture() {
  const inputs = uncertaintyFixture();
  const base = structuredClone(inputs.graph);
  // This workspace selects its executable pack explicitly in configuration.
  base.relationPacks = base.relationPacks?.filter(
    (pack) => pack.id !== inputs.pack.id,
  );
  base.mappings = base.mappings.slice(0, 2);
  const first = {
    ...base,
    id: "urn:source:network",
    revision: "network-r1",
    entities: base.entities.slice(0, 2),
    mappings: base.mappings.slice(0, 1),
    authorities: [],
  };
  const second = {
    ...base,
    id: "urn:source:schema",
    revision: "schema-r1",
    entities: base.entities.slice(2),
    mappings: base.mappings.slice(1),
    authorities: [],
  };
  const config: MetamapConfig = {
    schemaVersion: "1.0.0",
    id: base.id,
    namespace: base.namespace,
    repository: "provenance-test",
    repositoryRoot: ".",
    sources: [
      { id: "network", adapter: "metamap-shard", path: "network.json" },
      { id: "schema", adapter: "metamap-shard", path: "schema.json" },
    ],
    relationPacks: ["pack.json"],
    correspondences: [],
    outputs: {
      graph: "generated/graph.json",
      snapshot: "generated/snapshot.json",
      report: "generated/report.md",
      documentation: "generated/graph.md",
      cache: ".cache/metamap",
    },
  };
  const adapters: AdapterResult[] = [first, second].map((document, index) => ({
    sourceId: config.sources[index].id,
    adapter: "metamap-shard",
    adapterVersion: "1.0.0",
    inputs: [
      {
        path: config.sources[index].path as string,
        digest: contentDigest(JSON.stringify(document)),
      },
    ],
    document,
    diagnostics: [],
  }));
  const discovery = assembleWorkspace(
    config,
    adapters,
    [{ configuredPath: "pack.json", pack: inputs.pack }],
    inputs.registry,
  );
  const capture = createSourceCapture(config, discovery, inputs.registry);
  const derived = inputs.graph.mappings.at(-1)!;
  Object.assign(inputs.graph, discovery.graph, {
    mappings: [...discovery.graph.mappings, derived],
  });
  inputs.rebind();
  return { ...inputs, config, adapters, discovery, sourceCapture: capture };
}
export function rehashCapture(capture: MetamapSourceCapture) {
  capture.digest = sourceCaptureDigest(capture);
  capture.id = `urn:metamap:source-capture:${capture.digest.slice(7)}`;
  return capture;
}
export function rehashSourceReplay(bundle: SourceReplayBundle) {
  bundle.digest = semanticReplayDigest(bundle);
  bundle.id = `urn:metamap:replay:${bundle.digest.slice(7)}`;
  return bundle;
}
export async function writeSourceWorkspace(root: string) {
  const inputs = sourceFixture();
  await Promise.all([
    writeFile(join(root, "metamap.config.json"), JSON.stringify(inputs.config)),
    writeFile(join(root, "pack.json"), JSON.stringify(inputs.pack)),
    ...inputs.adapters.map((adapter) =>
      writeFile(
        join(root, adapter.inputs[0].path),
        JSON.stringify(adapter.document),
      ),
    ),
  ]);
  return { ...inputs, root, configPath: join(root, "metamap.config.json") };
}
