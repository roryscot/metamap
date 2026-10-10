import { readFileSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { stringify } from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canonicalJson } from "../canonical.js";
import { SssomTsvAdapter } from "../adapters/sssom-tsv.js";
import { parseMetamapConfig } from "../config.js";
import { RelationRegistry, coreRelationPack } from "../relations.js";
import { scientificSkosRelationPack } from "../scientific-relations.js";
import {
  SSSOM_MAX_BYTES,
  SssomError,
  expandSssomCurie,
  exportSssomTsv,
  interpretSssomDocument,
  parseSssomDocument,
  parseSssomTsv,
} from "../sssom.js";
import { contentDigest } from "../stable.js";
import { validateMetamapDocument } from "../validator.js";
import {
  sssomFixture,
  sssomSource,
  writeSssomWorkspace,
} from "./helpers/sssom-fixture.js";
const roots: string[] = [];
beforeEach(() => setImmediate());
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const parsed = () => parseSssomTsv(exportSssomTsv(sssomFixture()).text);
const mutate = (change: (raw: ReturnType<typeof sssomFixture>) => void) => {
  const raw = sssomFixture();
  change(raw);
  return () => parseSssomDocument(raw);
};
const registry = () =>
  new RelationRegistry([coreRelationPack, scientificSkosRelationPack()]);
describe("loss-preserving supported SSSOM1.0 entity TSV profile", () => {
  it("validates exact pinned public subset bytes and preserves all seven records and five predicates", () => {
    const bytes = readFileSync(
      new URL(
        "../../examples/scientific-mapping/fixtures/mgi-subset.sssom.tsv",
        import.meta.url,
      ),
    );
    expect(contentDigest(bytes)).toBe(
      "sha256:0eafab5a5673563e0a7fc737f9470f4fb3a53ad29beb4bc8d6138f1b3a610b69",
    );
    const raw = parseSssomTsv(bytes),
      interpreted = interpretSssomDocument(raw);
    expect(raw.rows).toHaveLength(7);
    expect(
      new Set(interpreted.records.map((r) => r.fields.predicate_id)),
    ).toEqual(
      new Set([
        "skos:exactMatch",
        "skos:closeMatch",
        "skos:broadMatch",
        "skos:narrowMatch",
        "skos:relatedMatch",
      ]),
    );
    expect(interpreted.records[5].fields).toMatchObject({
      subject_id: "MP:0000433",
    });
    expect(interpreted.records[6].fields).toMatchObject({
      subject_id: "MP:0000433",
    });
    expect(interpreted.records[5].fields).not.toEqual(
      interpreted.records[6].fields,
    );
    expect(raw.metadata.mapping_set_description).toContain(
      "ignoring the species restriction",
    );
    expect(Object.isFrozen(raw.rows[0])).toBe(true);
  });
  it("round-trips quoted tabs, newlines, double quotes, multivalues and raw numeric spellings", () => {
    const raw = sssomFixture();
    raw.rows[0][6] = 'a\tb\n"quoted"\r\nend';
    raw.rows[0][5] = "0.9900";
    const result = exportSssomTsv(raw),
      after = parseSssomTsv(result.text);
    expect(after.rows).toEqual(raw.rows);
    expect(interpretSssomDocument(after).records[0].fields).toMatchObject({
      author_id: ["A:author", "B:author"],
      confidence: 0.99,
      comment: raw.rows[0][6],
    });
    expect(result.loss).toMatchObject({
      semanticFieldsPreserved: true,
      byteIdentityPreserved: false,
      droppedFields: [],
      condensedSlots: [],
    });
  });
  it("accepts CRLF outer line endings and a header-only empty mapping set", () => {
    const encoded = exportSssomTsv(sssomFixture()).text;
    expect(parseSssomTsv(encoded.replaceAll("\n", "\r\n")).rows).toEqual(
      sssomFixture().rows,
    );
    const empty = sssomFixture();
    empty.rows = [];
    expect(parseSssomTsv(exportSssomTsv(empty).text).rows).toEqual([]);
  });
  it("propagates only annotated slots, removes their effective set values and retains originals separately", () => {
    const raw = parsed(),
      result = interpretSssomDocument(raw);
    expect(result.metadata).not.toHaveProperty("subject_source");
    expect(result.metadata.creator_id).toEqual(["A:set-creator"]);
    expect(result.records[0].fields).toMatchObject({
      subject_source: "A:ontology",
      mapping_date: "2026-10-10",
    });
    expect(result.records[0].fields).not.toHaveProperty("creator_id");
    expect(result.records[0].origins.subject_source).toBe("set");
    expect(raw.metadata.subject_source).toBe("A:ontology");
  });
  it("blocks propagation across the entire set when one record has a value", () => {
    const raw = sssomFixture();
    raw.columns.push("subject_source");
    raw.rows[0].push("A:individual");
    raw.rows[1].push("");
    const result = interpretSssomDocument(raw);
    expect(result.propagation).toContainEqual({
      slot: "subject_source",
      status: "blocked-by-record-value",
      value: "A:ontology",
    });
    expect(result.records[0].fields.subject_source).toBe("A:individual");
    expect(result.records[1].fields).not.toHaveProperty("subject_source");
    expect(result.metadata.subject_source).toBe("A:ontology");
  });
  it("condenses explicitly only common values and preserves effective fields", () => {
    const raw = sssomFixture();
    raw.columns.push("subject_source", "mapping_date");
    for (const row of raw.rows) row.push("A:ontology", "2026-10-10");
    const untouched = exportSssomTsv(raw),
      condensed = exportSssomTsv(raw, { condense: true });
    expect(untouched.loss.condensedSlots).toEqual([]);
    expect(condensed.loss.condensedSlots).toEqual(
      expect.arrayContaining(["subject_source", "mapping_date"]),
    );
    expect(parseSssomTsv(condensed.text).columns).not.toContain(
      "subject_source",
    );
    expect(
      interpretSssomDocument(parseSssomTsv(condensed.text)).records.map(
        (r) => r.fields,
      ),
    ).toEqual(interpretSssomDocument(raw).records.map((r) => r.fields));
    expect(raw.columns).toContain("subject_source");
  });
  it("does not condense conflicting set values or partially populated record fields", () => {
    const raw = sssomFixture();
    raw.columns.push("subject_source", "mapping_date");
    raw.rows[0].push("A:individual", "2026-10-10");
    raw.rows[1].push("A:individual", "");
    const result = exportSssomTsv(raw, { condense: true });
    expect(result.loss.condensedSlots).toEqual([]);
    expect(parseSssomTsv(result.text).rows).toEqual(raw.rows);
  });
  it("accepts explicit local external metadata without inferring its filename", () => {
    const raw = sssomFixture(),
      encoded = exportSssomTsv(raw).text;
    const body = encoded.slice(encoded.indexOf("subject_id\t"));
    expect(parseSssomTsv(body, stringify(raw.metadata)).rows).toEqual(raw.rows);
    expect(() => parseSssomTsv(encoded, stringify(raw.metadata))).toThrow(
      /External metadata/,
    );
    expect(() => parseSssomTsv(body)).toThrow(/No embedded metadata/);
  });
  it("retains defined scalar extensions, definitions and unknown type hints without assigning executable meaning", () => {
    const raw = sssomFixture();
    raw.metadata.extension_definitions = [
      { slot_name: "record_id" },
      { slot_name: "ext_count", property: "A:count", type_hint: "xsd:integer" },
      { slot_name: "ext_opaque", type_hint: "A:uninterpretedType" },
    ];
    raw.metadata.ext_count = 4;
    raw.columns.push("record_id", "ext_count", "ext_opaque");
    raw.rows[0].push("rec1", "4", "opaque-json-is-text");
    raw.rows[1].push("rec2", "5", "opaque2");
    const result = interpretSssomDocument(
      parseSssomTsv(exportSssomTsv(raw).text),
    );
    expect(result.records[0].fields).toMatchObject({
      record_id: "rec1",
      ext_count: 4,
      ext_opaque: "opaque-json-is-text",
    });
    expect(result.extensions).toContainEqual({
      name: "record_id",
      property: "http://sssom.invalid/record_id",
      type: "http://www.w3.org/2001/XMLSchema#string",
    });
    expect(result.metadata.ext_count).toBe(4);
  });
  it.each(["metadata", "column"])(
    "rejects an undefined %s extension without dropping source data",
    (location) => {
      expect(
        mutate((raw) => {
          if (location === "metadata")
            raw.metadata.unrecognized = "preserve-or-reject";
          else {
            raw.columns.push("unrecognized");
            for (const row of raw.rows) row.push("preserve-or-reject");
          }
        }),
      ).toThrow(SssomError);
    },
  );
  it.each([
    "same-name",
    "same-property",
    "standard-name",
    "unknown-prefix",
    "compound-value",
    "extra-definition-key",
  ])("rejects invalid extension %s", (change) => {
    expect(
      mutate((raw) => {
        raw.metadata.extension_definitions = [
          { slot_name: "ext_a", property: "A:a" },
        ];
        if (change === "same-name")
          raw.metadata.extension_definitions.push({
            slot_name: "ext_a",
            property: "A:b",
          });
        if (change === "same-property")
          raw.metadata.extension_definitions.push({
            slot_name: "ext_b",
            property: "A:a",
          });
        if (change === "standard-name")
          raw.metadata.extension_definitions = [{ slot_name: "subject_id" }];
        if (change === "unknown-prefix")
          raw.metadata.extension_definitions = [
            { slot_name: "ext_a", property: "Unknown:a" },
          ];
        if (change === "compound-value") raw.metadata.ext_a = ["not", "scalar"];
        if (change === "extra-definition-key")
          raw.metadata.extension_definitions = [
            { slot_name: "ext_a", extra: "not-defined" },
          ];
      }),
    ).toThrow();
  });
  it.each(["NaN", "Infinity", "1e9999", "-0.1", "1.1", "abc"])(
    "rejects invalid confidence %s without promoting it into support",
    (value) => {
      expect(
        mutate((raw) => {
          raw.rows[0][5] = value;
        }),
      ).toThrow();
    },
  );
  it.each(["BOM", "UTF8", "size"])(
    "rejects invalid encoded input %s",
    (kind) => {
      const bytes =
        kind === "BOM"
          ? Buffer.from("\uFEFF" + exportSssomTsv(sssomFixture()).text)
          : kind === "UTF8"
            ? Buffer.from([0xc3, 0x28])
            : Buffer.alloc(SSSOM_MAX_BYTES + 1);
      expect(() => parseSssomTsv(bytes)).toThrow(SssomError);
    },
  );
  it.each([
    "duplicate-header",
    "width",
    "required-header",
    "required-value",
    "invalid-date",
    "empty-multivalue",
  ])("rejects malformed supported field %s", (kind) => {
    expect(
      mutate((raw) => {
        if (kind === "duplicate-header") raw.columns[1] = "subject_id";
        if (kind === "width") raw.rows[0].pop();
        if (kind === "required-header") raw.columns[1] = "predicate_label";
        if (kind === "required-value") raw.rows[0][2] = "";
        if (kind === "invalid-date") raw.metadata.mapping_date = "2026-02-30";
        if (kind === "empty-multivalue") raw.rows[0][4] += "|";
      }),
    ).toThrow();
  });
  it.each([
    "A:1\tsk os:exactMatch\tB:1\tsemapv:ManualMappingCuration",
    '"A:1"bad\tskos:exactMatch\tB:1\tsemapv:ManualMappingCuration',
    '"A:1\tskos:exactMatch\tB:1\tsemapv:ManualMappingCuration',
  ])("rejects bad identifier/quoting before graph construction", (line) => {
    const encoded = exportSssomTsv(sssomFixture()).text;
    const body =
      "subject_id\tpredicate_id\tobject_id\tmapping_justification\n" +
      line +
      "\n";
    expect(() =>
      parseSssomTsv(body, stringify(sssomFixture().metadata)),
    ).toThrow();
    expect(encoded).toContain("subject_id");
  });
  it.each(["duplicate", "anchor", "tag", "directive"])(
    "rejects forbidden/malformed YAML %s",
    (kind) => {
      let meta =
        "mapping_set_id: https://example.test/set\nlicense: https://creativecommons.org/licenses/by/4.0/\n";
      if (kind === "duplicate") meta += "license: https://example.test/other\n";
      if (kind === "anchor")
        meta += "curie_map: &map { A: https://example.test/A/ }\n";
      if (kind === "tag") meta += "mapping_set_title: !!str title\n";
      if (kind === "directive") meta = "%YAML 1.2\n---\n" + meta;
      const body =
        "subject_id\tpredicate_id\tobject_id\tmapping_justification\n";
      expect(() => parseSssomTsv(body, meta)).toThrow();
    },
  );
  it.each(["undefined", "builtin-collision", "full-IRI", "case-fold"])(
    "rejects identifier error %s",
    (kind) => {
      expect(
        mutate((raw) => {
          if (kind === "undefined") raw.rows[0][0] = "Unknown:1";
          if (kind === "builtin-collision")
            raw.metadata.curie_map = {
              A: "https://example.test/A/",
              B: "https://example.test/B/",
              skos: "https://example.test/fake/",
            };
          if (kind === "full-IRI") raw.rows[0][0] = "https://example.test/A/1";
          if (kind === "case-fold") raw.rows[0][0] = "a:1";
        }),
      ).toThrow();
    },
  );
  it("resolves built-ins and Unicode NCNames without network access or case folding", () => {
    expect(
      expandSssomCurie("α:term", { α: "https://example.test/greek/" }),
    ).toBe("https://example.test/greek/term");
    expect(
      interpretSssomDocument(parsed()).records[0].expanded.predicate_id,
    ).toBe("http://www.w3.org/2004/02/skos/core#exactMatch");
  });
  it.each(["literal", "unmapped", "negated"])(
    "explicitly rejects unsupported %s records",
    (kind) => {
      expect(
        mutate((raw) => {
          if (kind === "literal") {
            raw.columns.push("subject_type", "subject_label");
            raw.rows[0].push("rdfs literal", "literal text");
            raw.rows[1].push("owl class", "label");
            raw.rows[0][0] = "";
          }
          if (kind === "unmapped") raw.rows[0][2] = "sssom:NoTermFound";
          if (kind === "negated") {
            raw.columns.push("predicate_modifier");
            raw.rows[0].push("Not");
            raw.rows[1].push("");
          }
        }),
      ).toThrow(/outside the entity TSV profile/);
    },
  );
  it("rejects forged portable document profile/extra fields and wrong format configuration", () => {
    expect(() =>
      parseSssomDocument({ ...sssomFixture(), profile: "unchecked" }),
    ).toThrow();
    expect(() =>
      parseSssomDocument({ ...sssomFixture(), checked: true }),
    ).toThrow();
    expect(() =>
      parseMetamapConfig({
        schemaVersion: "1.0.0",
        id: "urn:test:bad",
        namespace: "test",
        repository: "test",
        repositoryRoot: ".",
        sources: [sssomSource({ formatVersion: "0.9" as "1.0.0" })],
        correspondences: [],
        outputs: { graph: "g", snapshot: "s", report: "r", documentation: "d" },
      }),
    ).toThrow();
  });
});
describe("scientific adapter assertion identities and conservative interpretation", () => {
  async function discover(
    change?: (raw: ReturnType<typeof sssomFixture>) => void,
    overrides = {},
  ) {
    const f = await writeSssomWorkspace();
    roots.push(f.root);
    const raw = sssomFixture();
    change?.(raw);
    await writeFile(join(f.root, f.source.path), exportSssomTsv(raw).text);
    const adapter = new SssomTsvAdapter();
    const context = {
      namespace: "test",
      repository: "synthetic",
      repositoryRoot: f.root,
    };
    return {
      ...f,
      raw,
      context,
      adapter,
      output: await adapter.discover(sssomSource(overrides), context),
    };
  }
  it("preserves repeated four-core-field assertions, distinct complementary metadata and exact duplicates", async () => {
    const f = await discover((raw) => {
      raw.rows = [raw.rows[0], [...raw.rows[0]], [...raw.rows[0]]];
      raw.rows[2][6] = "different context";
    });
    expect(f.output.document.mappings).toHaveLength(3);
    expect(new Set(f.output.document.mappings.map((m) => m.id)).size).toBe(3);
    expect(f.output.document.entities).toHaveLength(2);
    expect(validateMetamapDocument(f.output.document, registry())).toEqual({
      valid: true,
      issues: [],
    });
    expect(f.output.document.authorities).toEqual([]);
    expect(
      f.output.document.mappings.every(
        (m) =>
          m.lossiness === "unknown" && m.provenance.confidence === undefined,
      ),
    ).toBe(true);
  });
  it("keeps anonymous content occurrence IDs across reordering and semantic condensation", async () => {
    const f = await discover((raw) => {
      raw.rows.push([...raw.rows[0]]);
      raw.columns.push("subject_source");
      for (const row of raw.rows) row.push("A:ontology");
    });
    const before = f.output.document.mappings.map((m) => m.id).sort();
    f.raw.rows.reverse();
    await writeFile(
      join(f.root, f.source.path),
      exportSssomTsv(f.raw, { condense: true }).text,
    );
    const after = await f.adapter.discover(f.source, f.context);
    expect(after.document.mappings.map((m) => m.id).sort()).toEqual(before);
    expect(after.inputs).not.toEqual(f.output.inputs);
  });
  it("gives changed anonymous assertions new IDs without changing stable ontology identities", async () => {
    const f = await discover();
    f.raw.rows[0][6] = "changed assertion context";
    await writeFile(join(f.root, f.source.path), exportSssomTsv(f.raw).text);
    const after = await f.adapter.discover(f.source, f.context);
    expect(after.document.mappings[0].id).not.toBe(
      f.output.document.mappings[0].id,
    );
    expect(after.document.entities.map((e) => e.id)).toEqual(
      f.output.document.entities.map((e) => e.id),
    );
  });
  it("retains explicit scoped source IDs across record changes and rejects duplicate IDs", async () => {
    const f = await discover(
      (raw) => {
        raw.metadata.extension_definitions = [{ slot_name: "record_id" }];
        raw.columns.push("record_id");
        raw.rows[0].push("r1");
        raw.rows[1].push("r2");
      },
      { recordIdColumn: "record_id" },
    );
    f.raw.rows[0][6] = "changed metadata";
    await writeFile(join(f.root, f.source.path), exportSssomTsv(f.raw).text);
    const after = await f.adapter.discover(
      sssomSource({ recordIdColumn: "record_id" }),
      f.context,
    );
    expect(after.document.mappings[0].id).toBe(
      f.output.document.mappings[0].id,
    );
    expect(canonicalJson(after.document)).not.toBe(
      canonicalJson(f.output.document),
    );
    f.raw.rows[1][7] = "r1";
    await writeFile(join(f.root, f.source.path), exportSssomTsv(f.raw).text);
    await expect(
      f.adapter.discover(
        sssomSource({ recordIdColumn: "record_id" }),
        f.context,
      ),
    ).rejects.toMatchObject({ code: "SSSOM_RECORD_ID" });
  });
  it("preserves arbitrary predicates as unregistered uninterpreted relations", async () => {
    const f = await discover((raw) => {
      raw.rows[0][1] = "A:customPredicate";
    });
    expect(f.output.document.mappings[0].relation).toMatch(
      /^sssom:uninterpreted-/,
    );
    expect(f.output.diagnostics).toMatchObject([
      { code: "SSSOM_UNINTERPRETED_PREDICATE" },
    ]);
    expect(validateMetamapDocument(f.output.document, registry()).valid).toBe(
      false,
    );
    expect(
      (
        f.output.document.mappings[0].attributes!.sssom as Record<
          string,
          unknown
        >
      ).fields,
    ).toMatchObject({ predicate_id: "A:customPredicate" });
  });
  it("fingerprints both external inputs, accepts arbitrary local filename extensions and writes nothing", async () => {
    const f = await writeSssomWorkspace(true);
    roots.push(f.root);
    const before = await Promise.all([
      readFile(join(f.root, f.source.path)),
      readFile(join(f.root, f.source.metadataPath!)),
    ]);
    const adapter = new SssomTsvAdapter(),
      context = {
        namespace: "test",
        repository: "test",
        repositoryRoot: f.root,
      };
    const output = await adapter.discover(f.source, context);
    expect(output.inputs).toEqual(await adapter.fingerprint(f.source, context));
    expect(output.inputs).toHaveLength(2);
    expect(await readFile(join(f.root, f.source.path))).toEqual(before[0]);
    expect(await readFile(join(f.root, f.source.metadataPath!))).toEqual(
      before[1],
    );
    expect(output.document.mappings).toHaveLength(2);
    await expect(
      adapter.fingerprint(
        sssomSource({ path: "https://example.test/remote.tsv" }),
        context,
      ),
    ).rejects.toMatchObject({ code: "SSSOM_LOCAL_INPUT" });
  });
});
