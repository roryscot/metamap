import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
const Ajv2020 = Ajv2020Module.default;
const addFormats = addFormatsModule.default;
const relationPackSchema = JSON.parse(readFileSync(new URL("../schemas/relation-pack.schema.json", import.meta.url), "utf8"));
const validateRelationPackShape = addFormats(new Ajv2020({ allErrors: true, strict: true })).compile(relationPackSchema);
function schemaMessage(errors) {
    return (errors ?? [])
        .map((error) => `${error.instancePath || "$"} ${error.message ?? "is invalid"}`)
        .join("; ");
}
/** Strictly parse a portable relation-pack document. */
export function parseRelationPack(value) {
    if (!validateRelationPackShape(value)) {
        throw new Error(`Relation pack does not match the portable schema: ${schemaMessage(validateRelationPackShape.errors)}`);
    }
    return value;
}
export async function loadRelationPack(path) {
    const absolutePath = resolve(path);
    const value = JSON.parse(await readFile(absolutePath, "utf8"));
    return parseRelationPack(value);
}
//# sourceMappingURL=relation-pack.js.map