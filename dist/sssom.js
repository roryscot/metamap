import { readFileSync } from "node:fs";
import Ajv2019Module from "ajv/dist/2019.js";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { parseDocument, stringify, visit } from "yaml";
import { canonicalJson } from "./canonical.js";
import { SSSOM_ENTITY_PROFILE, SSSOM_FORMAT_VERSION, } from "./sssom-model.js";
export const SSSOM_MAX_BYTES = 64 * 1024 * 1024;
const MAX_ROWS = 50000;
const MAX_COLUMNS = 256;
const XSD = "http://www.w3.org/2001/XMLSchema#";
export const SSSOM_BUILTIN_PREFIXES = Object.freeze({
    owl: "http://www.w3.org/2002/07/owl#",
    rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    rdfs: "http://www.w3.org/2000/01/rdf-schema#",
    semapv: "https://w3id.org/semapv/vocab/",
    skos: "http://www.w3.org/2004/02/skos/core#",
    sssom: "https://w3id.org/sssom/",
    xsd: XSD,
    linkml: "https://w3id.org/linkml/",
});
const slots = JSON.parse(readFileSync(new URL("../schemas/sssom-1.0.0-slots.json", import.meta.url), "utf8"));
export const SSSOM_PROPAGATABLE_SLOTS = Object.freeze(Object.keys(slots.mappingSet).filter((name) => slots.mappingSet[name].propagated));
const addFormats = addFormatsModule.default;
const ajv = addFormats(new Ajv2020Module.default({ allErrors: true, strict: true }));
const schema = (name) => JSON.parse(readFileSync(new URL(`../schemas/${name}`, import.meta.url), "utf8"));
const validateDocument = ajv.compile(schema("metamap-sssom-document.schema.json"));
const validateSource = ajv.compile(schema("metamap-sssom-source.schema.json"));
// The unchanged upstream model uses draft2019 and LinkML annotations. Its
// structural/type constraints remain enforced; annotations are not keywords.
const upstream = schema("sssom-1.0.0.schema.json");
const modelAjv = addFormats(new Ajv2019Module.default({ allErrors: true, strict: false }));
modelAjv.addSchema(upstream, "sssom-1.0.0");
const validateSet = modelAjv.compile({ $ref: "sssom-1.0.0#/$defs/MappingSet" });
const validDate = ajv.compile({ type: "string", format: "date" });
const validDateTime = ajv.compile({ type: "string", format: "date-time" });
const ncname = /^[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}][A-Z_a-z0-9.\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u036F\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}-]*$/u;
export class SssomError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "SssomError";
    }
}
function fail(code, message) {
    throw new SssomError(code, message);
}
function errors(value) {
    return (value ?? [])
        .map((e) => `${e.instancePath || "$"} ${e.message}`)
        .join("; ");
}
function hasValue(value) {
    return (value !== undefined &&
        value !== null &&
        value !== "" &&
        (!Array.isArray(value) || value.length > 0));
}
function freeze(value) {
    if (value !== null && typeof value === "object") {
        for (const child of Object.values(value))
            freeze(child);
        Object.freeze(value);
    }
    return value;
}
function text(input) {
    if (typeof input === "string")
        canonicalJson(input);
    const bytes = typeof input === "string" ? Buffer.from(input, "utf8") : input;
    if (bytes.byteLength > SSSOM_MAX_BYTES)
        fail("SSSOM_SIZE_LIMIT", "SSSOM input exceeds 64 MiB");
    let result;
    try {
        result = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    }
    catch {
        return fail("SSSOM_UTF8", "SSSOM input is not valid UTF-8");
    }
    if (result.startsWith("\uFEFF"))
        fail("SSSOM_BOM", "SSSOM input must not start with a BOM");
    return result;
}
function iri(value, context) {
    if (!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) ||
        /[\u0000-\u0020\u007F]/u.test(value))
        fail("SSSOM_IDENTIFIER", `${context} must be an absolute IRI without whitespace/control characters`);
    try {
        new URL(value);
    }
    catch {
        fail("SSSOM_IDENTIFIER", `${context} is not an absolute IRI`);
    }
    return value;
}
export function expandSssomCurie(value, prefixes) {
    const colon = value.indexOf(":");
    const prefix = value.slice(0, colon), local = value.slice(colon + 1);
    if (colon < 1 ||
        !ncname.test(prefix) ||
        !local ||
        local.startsWith("//") ||
        /[\u0000-\u0020\u007F]/u.test(value))
        fail("SSSOM_CURIE", `${value} must be a CURIE, not a full IRI`);
    if (!Object.hasOwn(prefixes, prefix))
        fail("SSSOM_UNDECLARED_PREFIX", `Undeclared prefix ${prefix}`);
    return iri(prefixes[prefix] + local, value);
}
function metadataYaml(source) {
    const doc = parseDocument(source, {
        version: "1.2",
        schema: "core",
        strict: true,
        uniqueKeys: true,
        stringKeys: true,
        merge: false,
        resolveKnownTags: false,
    });
    if (doc.errors.length || doc.warnings.length)
        fail("SSSOM_METADATA_YAML", [...doc.errors, ...doc.warnings].map((e) => e.message).join("; "));
    if (doc.directives?.yaml.explicit ||
        Object.keys(doc.directives?.tags ?? {}).some((key) => key !== "!!"))
        fail("SSSOM_FORBIDDEN_YAML", "YAML directives are unsupported");
    visit(doc, {
        Node(_key, node) {
            if (("anchor" in node && node.anchor) || ("tag" in node && node.tag))
                fail("SSSOM_FORBIDDEN_YAML", "YAML anchors and explicit node tags are unsupported");
        },
        Alias() {
            fail("SSSOM_FORBIDDEN_YAML", "YAML aliases are unsupported");
        },
    });
    const value = doc.toJS({ maxAliasCount: 0 });
    if (!value || typeof value !== "object" || Array.isArray(value))
        fail("SSSOM_METADATA_YAML", "Metadata must be a YAML mapping");
    canonicalJson(value);
    return value;
}
function tsv(source) {
    const result = [];
    let row = [], field = "", quoted = false, endedQuote = false, started = false;
    const cell = () => {
        row.push(field);
        field = "";
        endedQuote = false;
        started = false;
        if (row.length > MAX_COLUMNS)
            fail("SSSOM_COLUMN_LIMIT", "More than 256 columns");
    };
    const record = () => {
        cell();
        result.push(row);
        row = [];
        if (result.length > MAX_ROWS + 1)
            fail("SSSOM_ROW_LIMIT", "More than 50000 records");
    };
    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        if (quoted) {
            if (char === '"') {
                if (source[i + 1] === '"') {
                    field += '"';
                    i++;
                }
                else {
                    quoted = false;
                    endedQuote = true;
                }
            }
            else
                field += char;
        }
        else if (char === "\t")
            cell();
        else if (char === "\n" || char === "\r") {
            record();
            if (char === "\r" && source[i + 1] === "\n")
                i++;
        }
        else if (char === '"' && !started && !endedQuote) {
            quoted = true;
            started = true;
        }
        else {
            if (endedQuote || char === '"')
                fail("SSSOM_TSV_QUOTING", "Invalid quoting in TSV cell");
            field += char;
            started = true;
        }
    }
    if (quoted)
        fail("SSSOM_TSV_QUOTING", "Unclosed quoted TSV cell");
    if (row.length || started || endedQuote)
        record();
    return result;
}
function shape(value) {
    const serialized = canonicalJson(value);
    if (Buffer.byteLength(serialized) > SSSOM_MAX_BYTES)
        fail("SSSOM_SIZE_LIMIT", "Serialized SSSOM document exceeds 64 MiB");
    const document = JSON.parse(serialized);
    if (!validateDocument(document))
        fail("SSSOM_DOCUMENT", errors(validateDocument.errors));
    return document;
}
function prefixesFor(metadata) {
    const declared = metadata.curie_map ?? {};
    if (!declared || typeof declared !== "object" || Array.isArray(declared))
        fail("SSSOM_PREFIX_MAP", "curie_map must contain prefix/IRI string pairs");
    const prefixes = { ...SSSOM_BUILTIN_PREFIXES };
    for (const [key, value] of Object.entries(declared)) {
        if (!ncname.test(key) || typeof value !== "string")
            fail("SSSOM_PREFIX_MAP", `Unsupported prefix declaration ${key}`);
        iri(value, `curie_map.${key}`);
        if (Object.hasOwn(SSSOM_BUILTIN_PREFIXES, key) &&
            SSSOM_BUILTIN_PREFIXES[key] !== value)
            fail("SSSOM_PREFIX_COLLISION", `Built-in prefix ${key} cannot be redefined`);
        Object.defineProperty(prefixes, key, { value, enumerable: true });
    }
    return prefixes;
}
function extensionsFor(metadata, prefixes) {
    const definitions = metadata.extension_definitions ?? [];
    if (!Array.isArray(definitions))
        fail("SSSOM_EXTENSION", "extension_definitions must be an array");
    const names = new Set(), properties = new Set();
    return definitions.map((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value))
            fail("SSSOM_EXTENSION", "Malformed extension definition");
        const { slot_name: name, property, type_hint: hint } = value;
        if (Object.keys(value).some((key) => !["slot_name", "property", "type_hint"].includes(key)) ||
            typeof name !== "string" ||
            !ncname.test(name) ||
            Object.hasOwn(slots.mapping, name) ||
            Object.hasOwn(slots.mappingSet, name) ||
            names.has(name))
            fail("SSSOM_EXTENSION", "Extension names must be unique NCNames distinct from all standard slots");
        const expandedProperty = property === undefined
            ? "http://sssom.invalid/" + name
            : typeof property === "string"
                ? expandSssomCurie(property, prefixes)
                : fail("SSSOM_EXTENSION", "Extension property must be a CURIE");
        const type = hint === undefined
            ? XSD + "string"
            : typeof hint === "string"
                ? expandSssomCurie(hint, prefixes)
                : fail("SSSOM_EXTENSION", "Extension type_hint must be a CURIE");
        if (properties.has(expandedProperty))
            fail("SSSOM_EXTENSION", "Extension properties must be unique");
        names.add(name);
        properties.add(expandedProperty);
        return { name, property: expandedProperty, type };
    });
}
function extensionValue(value, type, prefixes) {
    if (value === null || typeof value === "object")
        fail("SSSOM_EXTENSION_VALUE", "Extension values must be simple scalars");
    if (type === XSD + "string") {
        if (typeof value !== "string")
            fail("SSSOM_EXTENSION_VALUE", "String extension must contain a string");
        return value;
    }
    if (type === XSD + "integer" || type === XSD + "double") {
        if (typeof value === "boolean" ||
            (typeof value === "string" &&
                !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)))
            fail("SSSOM_EXTENSION_VALUE", "Numeric extension has invalid lexical form");
        const number = Number(value);
        if (!Number.isFinite(number) ||
            (type === XSD + "integer" && !Number.isSafeInteger(number)))
            fail("SSSOM_EXTENSION_VALUE", "Numeric extension is outside the supported finite/safe-integer range");
        return number;
    }
    if (type === XSD + "boolean") {
        if (typeof value !== "boolean" && value !== "true" && value !== "false")
            fail("SSSOM_EXTENSION_VALUE", "Boolean extension must be true or false");
        return value === true || value === "true";
    }
    if (type === XSD + "date" ||
        type === XSD + "datetime" ||
        type === XSD + "dateTime") {
        if (!(type === XSD + "date" ? validDate(value) : validDateTime(value)))
            fail("SSSOM_EXTENSION_VALUE", "Invalid date/datetime extension");
    }
    else if (type === "https://w3id.org/linkml/Uriorcurie") {
        if (typeof value !== "string")
            fail("SSSOM_EXTENSION_VALUE", "URI-or-CURIE extension must be a CURIE");
        expandSssomCurie(value, prefixes);
    }
    // Unrecognized hints have no executable meaning; their scalar values and
    // definitions remain available verbatim rather than being discarded.
    return value;
}
function standardValue(value, slot, context) {
    const result = slot.multivalued && !Array.isArray(value) ? [value] : value;
    if (slot.range === "double") {
        if (typeof result !== "string" ||
            !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(result))
            fail("SSSOM_NUMERIC_VALUE", `${context} is not a finite number`);
        const number = Number(result);
        if (!Number.isFinite(number))
            fail("SSSOM_NUMERIC_VALUE", `${context} is not finite`);
        return number;
    }
    return result;
}
function interpret(document) {
    const prefixes = prefixesFor(document.metadata);
    const extensions = extensionsFor(document.metadata, prefixes);
    const extensionMap = new Map(extensions.map((e) => [e.name, e]));
    if (Object.hasOwn(document.metadata, "mappings"))
        fail("SSSOM_METADATA", "TSV metadata cannot contain mappings");
    const metadata = structuredClone(document.metadata);
    for (const [key, value] of Object.entries(metadata)) {
        if (Object.hasOwn(slots.mappingSet, key)) {
            if (hasValue(value) &&
                slots.mappingSet[key].multivalued &&
                !["curie_map"].includes(key) &&
                !Array.isArray(value))
                metadata[key] = [value];
            if (slots.mappingSet[key].range === "EntityReference" &&
                hasValue(metadata[key])) {
                for (const id of Array.isArray(metadata[key])
                    ? metadata[key]
                    : [metadata[key]]) {
                    if (typeof id !== "string")
                        fail("SSSOM_IDENTIFIER", `${key} is not a CURIE string`);
                    expandSssomCurie(id, prefixes);
                }
            }
        }
        else {
            const extension = extensionMap.get(key);
            if (!extension)
                fail("SSSOM_UNDEFINED_EXTENSION", `Unknown metadata slot ${key} has no valid extension definition`);
            metadata[key] = extensionValue(value, extension.type, prefixes);
        }
    }
    for (const name of document.columns) {
        if (!Object.hasOwn(slots.mapping, name) && !extensionMap.has(name))
            fail("SSSOM_UNDEFINED_EXTENSION", `Unknown TSV slot ${name} has no valid extension definition`);
    }
    for (const key of [
        "subject_id",
        "predicate_id",
        "object_id",
        "mapping_justification",
    ])
        if (!document.columns.includes(key))
            fail("SSSOM_REQUIRED_FIELD", `Missing mandatory column ${key}`);
    const records = document.rows.map((row, index) => {
        if (row.length !== document.columns.length)
            fail("SSSOM_TSV_WIDTH", `Record ${index + 1} has ${row.length} cells; expected ${document.columns.length}`);
        const raw = Object.fromEntries(document.columns.map((name, i) => [name, row[i]]));
        const fields = {}, origins = {};
        for (const [name, value] of Object.entries(raw))
            if (value !== "") {
                const extension = extensionMap.get(name), slot = slots.mapping[name];
                const converted = extension
                    ? extensionValue(value, extension.type, prefixes)
                    : standardValue(slot.multivalued ? value.split("|") : value, slot, name);
                if (Array.isArray(converted) && converted.some((item) => item === ""))
                    fail("SSSOM_MULTIVALUE", `Empty member in ${name}`);
                Object.defineProperty(fields, name, {
                    value: converted,
                    enumerable: true,
                    configurable: true,
                    writable: true,
                });
                Object.defineProperty(origins, name, {
                    value: "record",
                    enumerable: true,
                    configurable: true,
                    writable: true,
                });
            }
        return { raw, fields, origins, expanded: {} };
    });
    const propagation = [];
    for (const [name, slot] of Object.entries(slots.mappingSet)) {
        if (!slot.propagated || !hasValue(metadata[name]))
            continue;
        const value = structuredClone(metadata[name]);
        const blocked = records.some((record) => hasValue(record.fields[name]));
        propagation.push({
            slot: name,
            status: blocked ? "blocked-by-record-value" : "propagated",
            value,
        });
        if (!blocked) {
            for (const record of records) {
                record.fields[name] = structuredClone(value);
                record.origins[name] = "set";
            }
            delete metadata[name];
        }
    }
    for (const record of records) {
        const { fields } = record;
        if (fields.subject_type === "rdfs literal" ||
            fields.object_type === "rdfs literal")
            fail("SSSOM_UNSUPPORTED_LITERAL", "Literal records are outside the entity TSV profile");
        if (fields.predicate_modifier !== undefined)
            fail("SSSOM_UNSUPPORTED_NEGATION", "Predicate modifiers are outside the entity TSV profile");
        for (const name of [
            "subject_id",
            "predicate_id",
            "object_id",
            "mapping_justification",
        ]) {
            if (typeof fields[name] !== "string" || !fields[name])
                fail("SSSOM_REQUIRED_FIELD", `Record has no ${name}`);
        }
        for (const [name, value] of Object.entries(fields)) {
            if (slots.mapping[name]?.range !== "EntityReference")
                continue;
            const expand = (id) => {
                if (typeof id !== "string")
                    fail("SSSOM_IDENTIFIER", `${name} must be a CURIE string`);
                const result = expandSssomCurie(id, prefixes);
                if (result === SSSOM_BUILTIN_PREFIXES.sssom + "NoTermFound")
                    fail("SSSOM_UNSUPPORTED_UNMAPPED", "NoTermFound records are outside the entity TSV profile");
                return result;
            };
            record.expanded[name] = Array.isArray(value)
                ? value.map(expand)
                : expand(value);
        }
    }
    const modelMetadata = Object.fromEntries(Object.entries(metadata).filter(([key]) => Object.hasOwn(slots.mappingSet, key)));
    const model = {
        ...modelMetadata,
        mappings: records.map((r) => Object.fromEntries(Object.entries(r.fields).filter(([key]) => Object.hasOwn(slots.mapping, key)))),
    };
    if (!validateSet(model))
        fail("SSSOM_MODEL", errors(validateSet.errors));
    for (const key of ["mapping_set_id", "license"]) {
        if (typeof metadata[key] !== "string" || !metadata[key])
            fail("SSSOM_REQUIRED_FIELD", `Missing ${key}`);
        iri(metadata[key], key);
    }
    return { metadata, prefixes, extensions, propagation, records };
}
export function parseSssomDocument(value) {
    const document = shape(value);
    interpret(document);
    return freeze(document);
}
export function interpretSssomDocument(value) {
    return freeze(interpret(shape(value)));
}
export function parseSssomTsv(input, externalMetadata) {
    let source = text(input), metadataSource = "";
    if (externalMetadata !== undefined) {
        if (source.startsWith("#"))
            fail("SSSOM_METADATA_MODE", "External metadata cannot be combined with embedded metadata");
        metadataSource = text(externalMetadata);
    }
    else {
        const lines = [];
        while (source.startsWith("#")) {
            const end = source.search(/[\r\n]/);
            if (end < 0)
                fail("SSSOM_TSV_HEADER", "Embedded metadata has no TSV block");
            lines.push(source.slice(1, end));
            source = source.slice(end + (source[end] === "\r" && source[end + 1] === "\n" ? 2 : 1));
        }
        if (!lines.length)
            fail("SSSOM_METADATA", "No embedded metadata; supply explicit external metadata");
        const spaces = lines[0].match(/^ */)[0].length;
        if (lines.some((line) => !line.startsWith(" ".repeat(spaces))))
            fail("SSSOM_METADATA_INDENT", "Metadata lines have inconsistent space prefixes");
        metadataSource = lines.map((line) => line.slice(spaces)).join("\n");
    }
    const [columns, ...rows] = tsv(source);
    return parseSssomDocument({
        schemaVersion: SSSOM_FORMAT_VERSION,
        profile: SSSOM_ENTITY_PROFILE,
        metadata: metadataYaml(metadataSource),
        columns,
        rows,
    });
}
export function parseSssomSourceConfig(value) {
    canonicalJson(value);
    if (!validateSource(value))
        fail("SSSOM_SOURCE_CONFIG", errors(validateSource.errors));
    return freeze(JSON.parse(canonicalJson(value)));
}
function quote(value) {
    return /["\t\r\n]/u.test(value)
        ? '"' + value.replaceAll('"', '""') + '"'
        : value;
}
export function exportSssomTsv(value, options = {}) {
    if (Object.keys(options).some((key) => key !== "condense") ||
        (options.condense !== undefined && typeof options.condense !== "boolean"))
        fail("SSSOM_EXPORT_OPTIONS", "Only a boolean condense option is supported");
    const document = shape(value), interpreted = interpret(document), condensedSlots = [];
    if (options.condense && interpreted.records.length)
        for (const [name, slot] of Object.entries(slots.mappingSet)) {
            if (!slot.propagated)
                continue;
            const common = interpreted.records[0].fields[name];
            if (!hasValue(common) ||
                interpreted.records.some((r) => canonicalJson(r.fields[name] ?? null) !== canonicalJson(common)))
                continue;
            const setValue = document.metadata[name];
            const normalized = slot.multivalued && hasValue(setValue) && !Array.isArray(setValue)
                ? [setValue]
                : setValue;
            if (hasValue(setValue) &&
                canonicalJson(normalized) !== canonicalJson(common))
                continue;
            const index = document.columns.indexOf(name);
            if (index < 0 || document.rows.every((row) => row[index] === ""))
                continue;
            document.metadata[name] = structuredClone(common);
            document.columns.splice(index, 1);
            for (const row of document.rows)
                row.splice(index, 1);
            condensedSlots.push(name);
        }
    const metadataText = stringify(document.metadata, {
        version: "1.2",
        directives: false,
        aliasDuplicateObjects: false,
        lineWidth: 0,
    });
    const result = metadataText
        .trimEnd()
        .split("\n")
        .map((line) => "#" + line)
        .join("\n") +
        "\n" +
        [document.columns, ...document.rows]
            .map((row) => row.map(quote).join("\t"))
            .join("\n") +
        "\n";
    const after = interpretSssomDocument(parseSssomTsv(result));
    const retainedMetadata = (metadata) => Object.fromEntries(Object.entries(metadata).filter(([name]) => !condensedSlots.includes(name)));
    if (canonicalJson(interpreted.records.map((r) => r.fields)) !==
        canonicalJson(after.records.map((r) => r.fields)) ||
        canonicalJson(retainedMetadata(interpreted.metadata)) !==
            canonicalJson(retainedMetadata(after.metadata)) ||
        canonicalJson(interpreted.prefixes) !== canonicalJson(after.prefixes) ||
        canonicalJson(interpreted.extensions) !== canonicalJson(after.extensions))
        fail("SSSOM_EXPORT_PRESERVATION", "Export changed effective records or retained set context");
    return freeze({
        text: result,
        loss: {
            profile: SSSOM_ENTITY_PROFILE,
            semanticFieldsPreserved: true,
            byteIdentityPreserved: false,
            droppedFields: [],
            condensedSlots,
            normalization: [
                "YAML serialization, TSV quoting and outer line endings may change",
                "Raw source provenance remains bound to its original bytes; condensation changes field origins explicitly",
            ],
        },
    });
}
//# sourceMappingURL=sssom.js.map