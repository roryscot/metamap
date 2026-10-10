import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { SssomSourceConfig } from "../config.js";
import type { JsonObject, MetamapEntity, StructuralMapping } from "../model.js";
import { canonicalDigest } from "../canonical.js";
import { relationPackDigest } from "../relation-pack.js";
import {
  scientificSkosRelationPack,
  SCIENTIFIC_SKOS_PREDICATES,
} from "../scientific-relations.js";
import {
  SSSOM_PROPAGATABLE_SLOTS,
  SssomError,
  interpretSssomDocument,
  parseSssomSourceConfig,
  parseSssomTsv,
} from "../sssom.js";
import { contentDigest } from "../stable.js";
import type {
  AdapterContext,
  AdapterInput,
  AdapterResult,
  MetamapAdapter,
} from "./types.js";

/** Read-only local import; record metadata never creates a trusted approver. */
export class SssomTsvAdapter implements MetamapAdapter<SssomSourceConfig> {
  readonly id = "sssom-tsv" as const;
  readonly version = "1.0.0";

  private async inputs(value: SssomSourceConfig, context: AdapterContext) {
    const config = parseSssomSourceConfig(value);
    const paths = [
      config.path,
      ...(config.metadataPath === undefined ? [] : [config.metadataPath]),
    ];
    if (paths.some((path) => /^[a-z][a-z0-9+.-]*:\/\//i.test(path)))
      throw new SssomError(
        "SSSOM_LOCAL_INPUT",
        "SSSOM inputs must be local filesystem paths",
      );
    const files = await Promise.all(
      paths.map(async (path) => {
        const absolute = resolve(context.repositoryRoot, path);
        const bytes = await readFile(absolute);
        return {
          bytes,
          input: {
            path: relative(context.repositoryRoot, absolute).replaceAll(
              "\\",
              "/",
            ),
            digest: contentDigest(bytes),
          },
        };
      }),
    );
    return { config, files };
  }
  async fingerprint(
    config: SssomSourceConfig,
    context: AdapterContext,
  ): Promise<AdapterInput[]> {
    return (await this.inputs(config, context)).files.map((file) => file.input);
  }
  async discover(
    value: SssomSourceConfig,
    context: AdapterContext,
  ): Promise<AdapterResult> {
    const { config, files } = await this.inputs(value, context);
    const raw = parseSssomTsv(files[0].bytes, files[1]?.bytes);
    const interpretation = interpretSssomDocument(raw);
    const pack = scientificSkosRelationPack();
    const entities = new Map<
      string,
      { identifiers: Set<string>; labels: Set<string>; types: Set<string> }
    >();
    const mappings: StructuralMapping[] = [],
      occurrences = new Map<string, number>(),
      explicitIds = new Set<string>();
    const setContext = Object.fromEntries(
      Object.entries(interpretation.metadata).filter(
        ([name]) => !SSSOM_PROPAGATABLE_SLOTS.includes(name),
      ),
    );
    if (
      config.recordIdColumn !== undefined &&
      !raw.columns.includes(config.recordIdColumn)
    )
      throw new SssomError(
        "SSSOM_RECORD_ID",
        "Selected record ID column is missing",
      );
    for (const record of interpretation.records) {
      for (const side of ["subject", "object"] as const) {
        const id = record.expanded[side + "_id"] as string;
        const data = entities.get(id) ?? {
          identifiers: new Set(),
          labels: new Set(),
          types: new Set(),
        };
        data.identifiers.add(record.fields[side + "_id"] as string);
        if (typeof record.fields[side + "_label"] === "string")
          data.labels.add(record.fields[side + "_label"] as string);
        if (typeof record.fields[side + "_type"] === "string")
          data.types.add(record.fields[side + "_type"] as string);
        entities.set(id, data);
      }
      const predicate = record.expanded.predicate_id as string;
      const recognized = Object.hasOwn(SCIENTIFIC_SKOS_PREDICATES, predicate);
      const relation = recognized
        ? SCIENTIFIC_SKOS_PREDICATES[predicate]
        : "sssom:uninterpreted-" + canonicalDigest(predicate).slice(7);
      const semanticFields = { ...record.fields, ...record.expanded };
      let identity: string,
        sourceRecordId: string | null = null;
      if (config.recordIdColumn !== undefined) {
        sourceRecordId = record.raw[config.recordIdColumn];
        if (!sourceRecordId || explicitIds.has(sourceRecordId))
          throw new SssomError(
            "SSSOM_RECORD_ID",
            "Source record IDs must be present and unique",
          );
        explicitIds.add(sourceRecordId);
        identity = canonicalDigest({
          source: config.id,
          mappingSet: interpretation.metadata.mapping_set_id,
          sourceRecordId,
        });
      } else {
        const content = canonicalDigest({
          source: config.id,
          context: setContext,
          fields: semanticFields,
        });
        const occurrence = occurrences.get(content) ?? 0;
        occurrences.set(content, occurrence + 1);
        identity = canonicalDigest({ content, occurrence });
      }
      mappings.push({
        id: "urn:metamap:sssom:assertion:" + identity.slice(7),
        relation,
        sources: [record.expanded.subject_id as string],
        targets: [record.expanded.object_id as string],
        cardinality: "one-to-one",
        lossiness: "unknown",
        provenance: {
          status: "observed",
          assertedBy: config.id,
          sourceRevision: config.sourceRevision,
        },
        attributes: {
          sssom: {
            raw: record.raw,
            fields: record.fields,
            origins: record.origins,
            expanded: record.expanded,
            predicateInterpretation: recognized
              ? "explicit-skos-lookup"
              : "uninterpreted",
            sourceRecordId,
            uncertaintyInterpretation:
              "source-confidence-is-not-a-typed-assessment",
          },
        },
      });
    }
    const graphEntities: MetamapEntity[] = [...entities.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, data]) => ({
        id,
        kind: "scientific:entity",
        ...(data.labels.size ? { label: [...data.labels].sort()[0] } : {}),
        locators: [{ uri: id }],
        attributes: {
          sssom: {
            originalIdentifiers: [...data.identifiers].sort(),
            labels: [...data.labels].sort(),
            types: [...data.types].sort(),
          },
        },
        provenance: {
          status: "observed",
          assertedBy: config.id,
          sourceRevision: config.sourceRevision,
        },
      }));
    const metadata: JsonObject = {
      sssom: {
        profile: raw.profile,
        formatVersion: config.formatVersion,
        rawDocument: { ...raw },
        effectiveMetadata: interpretation.metadata,
        propagation: interpretation.propagation,
        prefixes: interpretation.prefixes,
        extensions: interpretation.extensions,
        assertionIdentity:
          config.recordIdColumn === undefined
            ? "effective-content-occurrence-with-set-only-context"
            : "scoped-explicit-source-record-id",
        sourceRevision: config.sourceRevision,
        rawSourceBytesEmbedded: false,
        observedRecordCount: raw.rows.length,
        setCompleteness: "not-established-by-TSV",
        declaredProvenance: config.provenance ?? null,
        scientificTruth: "not-established",
        authority: "source-declared-only",
      },
    };
    return {
      sourceId: config.id,
      adapter: this.id,
      adapterVersion: this.version,
      inputs: files.map((file) => file.input),
      document: {
        schemaVersion: "2.0.0",
        id:
          "urn:metamap:sssom:source:" +
          canonicalDigest({
            namespace: context.namespace,
            source: config.id,
            mappingSet: interpretation.metadata.mapping_set_id,
          }).slice(7),
        namespace: context.namespace,
        revision: config.sourceRevision,
        label:
          typeof interpretation.metadata.mapping_set_title === "string"
            ? interpretation.metadata.mapping_set_title
            : "Scientific mapping source",
        relationPacks: [
          {
            id: pack.id,
            version: pack.version,
            digest: relationPackDigest(pack),
          },
        ],
        entities: graphEntities,
        mappings,
        authorities: [],
        metadata,
      },
      diagnostics: interpretation.records.some(
        (record) =>
          !Object.hasOwn(
            SCIENTIFIC_SKOS_PREDICATES,
            record.expanded.predicate_id as string,
          ),
      )
        ? [
            {
              severity: "warning",
              code: "SSSOM_UNINTERPRETED_PREDICATE",
              message:
                "Arbitrary predicates are retained without executable semantics; checked use requires an explicitly registered relation profile",
            },
          ]
        : [],
    };
  }
}
