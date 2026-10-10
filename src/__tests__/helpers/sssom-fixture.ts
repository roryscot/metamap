import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify } from "yaml";
import type { MetamapConfig, SssomSourceConfig } from "../../config.js";
import { scientificSkosRelationPack } from "../../scientific-relations.js";
import { exportSssomTsv } from "../../sssom.js";
import type { SssomDocument } from "../../sssom-model.js";

export function sssomFixture(): SssomDocument {
  return {
    schemaVersion: "1.0.0",
    profile: "sssom-1.0-entity-tsv",
    metadata: {
      mapping_set_id: "https://example.test/mapping-set",
      license: "https://creativecommons.org/licenses/by/4.0/",
      mapping_set_title: "Synthetic entity mapping fixture",
      curie_map: { A: "https://example.test/A/", B: "https://example.test/B/" },
      subject_source: "A:ontology",
      mapping_date: "2026-10-10",
      creator_id: "A:set-creator",
    },
    columns: [
      "subject_id",
      "predicate_id",
      "object_id",
      "mapping_justification",
      "author_id",
      "confidence",
      "comment",
    ],
    rows: [
      [
        "A:1",
        "skos:exactMatch",
        "B:1",
        "semapv:ManualMappingCuration",
        "A:author|B:author",
        "0.99",
        "first",
      ],
      [
        "A:2",
        "skos:closeMatch",
        "B:2",
        "semapv:UnspecifiedMatching",
        "A:author",
        "0.75",
        "second",
      ],
    ],
  };
}
export function sssomSource(
  overrides: Partial<SssomSourceConfig> = {},
): SssomSourceConfig {
  return {
    id: "mapping-set",
    adapter: "sssom-tsv",
    path: "mapping.data",
    formatVersion: "1.0.0",
    sourceRevision: "synthetic-r1",
    ...overrides,
  };
}
export async function writeSssomWorkspace(external = false) {
  const root = await mkdtemp(join(tmpdir(), "metamap-sssom-"));
  const raw = sssomFixture(),
    encoded = exportSssomTsv(raw).text;
  const header = encoded.indexOf("subject_id\t");
  const source = sssomSource(external ? { metadataPath: "metadata.data" } : {});
  await writeFile(
    join(root, source.path),
    external ? encoded.slice(header) : encoded,
  );
  if (external)
    await writeFile(
      join(root, source.metadataPath!),
      stringify(raw.metadata, { version: "1.2", lineWidth: 0 }),
    );
  await writeFile(
    join(root, "pack.json"),
    JSON.stringify(scientificSkosRelationPack()),
  );
  const config: MetamapConfig = {
    schemaVersion: "1.0.0",
    id: "urn:test:scientific-workspace",
    namespace: "scientific-test",
    repository: "synthetic-test",
    repositoryRoot: ".",
    relationPacks: ["pack.json"],
    sources: [source],
    correspondences: [],
    outputs: {
      graph: "generated/graph.json",
      snapshot: "generated/snapshot.json",
      report: "generated/report.md",
      documentation: "generated/graph.md",
      cache: ".cache",
    },
  };
  const configPath = join(root, "metamap.config.json");
  await writeFile(configPath, JSON.stringify(config));
  return { root, raw, encoded, source, config, configPath };
}
