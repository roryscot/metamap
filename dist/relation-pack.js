import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { canonicalDigest, canonicalJson, parseStrictJson, } from "./canonical.js";
import { valueDigest } from "./stable.js";
const Ajv2020 = Ajv2020Module.default;
const addFormats = addFormatsModule.default;
const relationPackSchema = JSON.parse(readFileSync(new URL("../schemas/relation-pack.schema.json", import.meta.url), "utf8"));
const validateRelationPackShape = addFormats(new Ajv2020({ allErrors: true, strict: true })).compile(relationPackSchema);
const validateExecutablePackShape = addFormats(new Ajv2020({ allErrors: true, strict: true })).compile(JSON.parse(readFileSync(new URL("../schemas/relation-pack-v2.schema.json", import.meta.url), "utf8")));
function schemaMessage(errors) {
    return (errors ?? [])
        .map((error) => `${error.instancePath || "$"} ${error.message ?? "is invalid"}`)
        .join("; ");
}
/** Strictly parse a portable relation-pack document. */
export function parseRelationPack(value) {
    const executable = typeof value === "object" &&
        value !== null &&
        Object.getOwnPropertyDescriptor(value, "schemaVersion")?.value === "2.0.0";
    if (executable)
        canonicalJson(value);
    const validator = executable
        ? validateExecutablePackShape
        : validateRelationPackShape;
    if (!validator(value)) {
        throw new Error(`Relation pack does not match the portable schema: ${schemaMessage(validator.errors)}`);
    }
    return value;
}
/** A referenced legacy pack keeps its original digest convention. */
export function relationPackDigest(pack) {
    return pack.schemaVersion === "2.0.0"
        ? canonicalDigest(pack)
        : valueDigest(pack);
}
export async function loadRelationPack(path) {
    const absolutePath = resolve(path);
    const text = await readFile(absolutePath, "utf8");
    const parsed = JSON.parse(text);
    const value = typeof parsed === "object" &&
        parsed !== null &&
        "schemaVersion" in parsed &&
        parsed.schemaVersion === "2.0.0"
        ? parseStrictJson(text)
        : parsed;
    return parseRelationPack(value);
}
//# sourceMappingURL=relation-pack.js.map