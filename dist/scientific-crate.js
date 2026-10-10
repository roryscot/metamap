import { Ajv2020 } from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import { canonicalJson } from "./canonical.js";
import { contentDigest } from "./stable.js";
import { prepareGovernedArtifacts } from "./governance.js";
import { parseSssomDocument, parseSssomTsv, exportSssomTsv } from "./sssom.js";
export const SCIENTIFIC_CRATE_PROFILE = "https://raw.githubusercontent.com/roryscot/metamap/main/schemas/metamap-scientific-crate-profile.schema.json";
const RO_CRATE = "https://w3id.org/ro/crate/1.2";
const validate = new Ajv2020({
    strict: true,
    allErrors: true,
}).compile(JSON.parse(readFileSync(new URL("../schemas/metamap-scientific-crate-profile.schema.json", import.meta.url), "utf8")));
function fail(message) {
    throw new Error("SCIENTIFIC_CRATE_INVALID: " + message);
}
function safePath(path) {
    if (!/^[A-Za-z0-9_-][A-Za-z0-9_./-]*$/.test(path) ||
        path.split("/").some((part) => part === ".." || part === "." || part === ""))
        fail("Unsupported portable payload path: " + path);
}
/** Pure, bounded RO-Crate 1.2 export over existing checked replay/artifact contracts. */
export function createScientificCrate(replay, options) {
    canonicalJson(options);
    if (Object.keys(options).some((key) => ![
        "name",
        "description",
        "datePublished",
        "consumer",
        "environment",
        "rawInputs",
        "externalOriginal",
    ].includes(key)))
        fail("Unknown export option");
    const { rawInputs, ...settings } = options;
    const profile = {
        schemaVersion: "1.0.0",
        ...settings,
        rawInputs: Object.keys(rawInputs ?? {}).sort(),
    };
    if (!validate(profile))
        fail(JSON.stringify(validate.errors));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(options.datePublished) ||
        new Date(options.datePublished).toISOString().slice(0, 10) !==
            options.datePublished)
        fail("datePublished must be an actual ISO calendar date");
    if (typeof rawInputs !== "object" ||
        rawInputs === null ||
        Array.isArray(rawInputs) ||
        Object.values(rawInputs).some((value) => typeof value !== "string"))
        fail("rawInputs must contain UTF-8 strings");
    const prepared = prepareGovernedArtifacts(replay, options.consumer, options.environment);
    const captured = JSON.parse(prepared.files["replay.json"]);
    const adapters = captured.inputs.sourceCapture.adapters;
    if (adapters.length !== 1 || adapters[0].adapter !== "sssom-tsv")
        fail("This profile supports one captured SSSOM source");
    const receipt = captured.inputs.sourceReceipts[0];
    const raw = parseSssomDocument(adapters[0].document.metadata.sssom.rawDocument);
    const exported = exportSssomTsv(raw);
    const files = { ...prepared.files };
    files["metamap-crate-profile.json"] = canonicalJson(profile) + "\n";
    files["artifact-manifest.json"] = canonicalJson(prepared.manifest) + "\n";
    files["export.sssom.tsv"] = exported.text;
    files["export-loss.json"] = canonicalJson(exported.loss) + "\n";
    const license = raw.metadata.license;
    const ref = (id) => ({ "@id": id });
    const parts = [];
    const entities = [];
    for (const path of Object.keys(rawInputs)) {
        safePath(path);
        const input = receipt.inputs.find((input) => input.path === path);
        if (!input || contentDigest(rawInputs[path]) !== input.digest)
            fail("Raw payload does not match its captured receipt: " + path);
        files["source/" + path] = rawInputs[path];
    }
    if (receipt.inputs.every((input) => Object.hasOwn(rawInputs, input.path))) {
        const document = parseSssomTsv(rawInputs[receipt.inputs[0].path], receipt.inputs.length === 2
            ? rawInputs[receipt.inputs[1].path]
            : undefined);
        if (canonicalJson(document) !== canonicalJson(raw))
            fail("Included raw bytes disagree with the captured SSSOM document");
    }
    for (const input of receipt.inputs) {
        if (Object.hasOwn(rawInputs, input.path))
            continue;
        const id = "urn:metamap:raw-input:" + input.digest.slice(7);
        parts.push(ref(id));
        entities.push({
            "@id": id,
            "@type": "File",
            name: input.path,
            description: "Raw payload not included or fetched; captured digest is a reference only",
            sha256: input.digest.slice(7),
            license: ref(license),
        });
    }
    for (const path of Object.keys(files).sort()) {
        safePath(path);
        parts.push(ref(path));
        entities.push({
            "@id": path,
            "@type": "File",
            name: path,
            encodingFormat: path.endsWith(".ts")
                ? "text/typescript"
                : path.endsWith(".tsv") || path.startsWith("source/")
                    ? "text/plain"
                    : "application/json",
            contentSize: String(Buffer.byteLength(files[path], "utf8")),
            sha256: contentDigest(files[path]).slice(7),
            license: ref(license),
        });
    }
    if (options.externalOriginal) {
        parts.push(ref(options.externalOriginal.uri));
        entities.push({
            "@id": options.externalOriginal.uri,
            "@type": "File",
            name: options.externalOriginal.name,
            description: options.externalOriginal.description +
                "; external original is not embedded or fetched by this exporter",
            license: ref(license),
            encodingFormat: "text/tab-separated-values",
        });
    }
    const creators = raw.metadata.creator_id;
    const credit = Array.isArray(creators)
        ? creators.join(", ")
        : typeof creators === "string"
            ? creators
            : "Source attribution retained in source-capture.json";
    const metadata = {
        "@context": "https://w3id.org/ro/crate/1.2/context",
        "@graph": [
            {
                "@id": "ro-crate-metadata.json",
                "@type": "CreativeWork",
                about: ref("./"),
                conformsTo: ref(RO_CRATE),
            },
            {
                "@id": "./",
                "@type": "Dataset",
                name: options.name,
                description: options.description +
                    "; checked binding/provenance behavior, scientific truth and current authorization not established",
                datePublished: options.datePublished,
                license: ref(license),
                creditText: credit,
                conformsTo: ref(SCIENTIFIC_CRATE_PROFILE),
                hasPart: parts,
            },
            {
                "@id": license,
                "@type": "CreativeWork",
                name: "Source-declared license",
                description: "Source license retained without asserting endorsement; source attribution and subset changes are in source-capture.json",
                identifier: license,
            },
            {
                "@id": RO_CRATE,
                "@type": "CreativeWork",
                name: "RO-Crate 1.2 specification",
            },
            {
                "@id": SCIENTIFIC_CRATE_PROFILE,
                "@type": "CreativeWork",
                name: "MetaMap single-source scientific crate profile 1.0",
            },
            ...entities,
        ],
    };
    const graph = metadata["@graph"];
    if (new Set(graph.map((entity) => entity["@id"])).size !== graph.length)
        fail("Conflicting JSON-LD entity identifiers");
    return { metadata, files };
}
/** Checks this closed profile and recomputes every native output and payload hash; no I/O. */
export function verifyScientificCrate(value) {
    try {
        const profile = JSON.parse(value.files["metamap-crate-profile.json"]);
        if (!validate(profile))
            fail(JSON.stringify(validate.errors));
        const { schemaVersion: _version, rawInputs: paths, ...settings } = profile;
        const rawInputs = Object.fromEntries(paths.map((path) => [path, value.files["source/" + path]]));
        const expected = createScientificCrate(JSON.parse(value.files["replay.json"]), { ...settings, rawInputs });
        if (canonicalJson(value.metadata) !== canonicalJson(expected.metadata) ||
            canonicalJson(value.files) !== canonicalJson(expected.files))
            fail("Metadata, complete inventory or payload bytes differ from checked export");
        const replay = JSON.parse(value.files["replay.json"]);
        return {
            status: "verified",
            files: Object.keys(expected.files).length,
            externalRawInputs: replay.inputs.sourceReceipts[0].inputs.length - paths.length,
        };
    }
    catch (error) {
        fail(error instanceof Error ? error.message : String(error));
    }
}
//# sourceMappingURL=scientific-crate.js.map