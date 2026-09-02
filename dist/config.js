import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
export const METAMAP_CONFIG_VERSION = "1.0.0";
const Ajv2020 = Ajv2020Module.default;
const addFormats = addFormatsModule.default;
const configSchema = JSON.parse(readFileSync(new URL("../schemas/metamap-config.schema.json", import.meta.url), "utf8"));
const configSchemaValidator = addFormats(new Ajv2020({ allErrors: true, strict: true })).compile(configSchema);
function schemaErrorMessage(errors) {
    return (errors ?? [])
        .map((error) => {
        const path = error.instancePath || "$config";
        return `${path} ${error.message ?? "is invalid"}`;
    })
        .join("; ");
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requireString(value, key, context) {
    const result = value[key];
    if (typeof result !== "string" || result.length === 0) {
        throw new Error(`${context}.${key} must be a non-empty string`);
    }
    return result;
}
function requireStringArray(value, key, context) {
    const result = value[key];
    if (!Array.isArray(result) ||
        result.length === 0 ||
        !result.every((entry) => typeof entry === "string" && entry.length > 0)) {
        throw new Error(`${context}.${key} must be a non-empty string array`);
    }
    return result;
}
/**
 * A deliberately strict runtime gate for configuration read by the CLI.
 * The JSON Schema remains the complete language-neutral contract.
 */
export function parseMetamapConfig(value) {
    if (!configSchemaValidator(value)) {
        throw new Error(`Metamap config does not match the portable schema: ${schemaErrorMessage(configSchemaValidator.errors)}`);
    }
    if (!isRecord(value))
        throw new Error("Metamap config must be an object");
    if (value.schemaVersion !== METAMAP_CONFIG_VERSION) {
        throw new Error(`Metamap config schemaVersion must be ${METAMAP_CONFIG_VERSION}`);
    }
    for (const key of [
        "id",
        "namespace",
        "repository",
        "repositoryRoot",
    ]) {
        requireString(value, key, "$config");
    }
    if (value.label !== undefined)
        requireString(value, "label", "$config");
    if (value.relationPacks !== undefined &&
        (!Array.isArray(value.relationPacks) ||
            !value.relationPacks.every((entry) => typeof entry === "string" && entry.length > 0))) {
        throw new Error("$config.relationPacks must be a string array");
    }
    if (!Array.isArray(value.sources) || value.sources.length === 0) {
        throw new Error("$config.sources must be a non-empty array");
    }
    const sourceIds = new Set();
    for (const [index, source] of value.sources.entries()) {
        const context = `$config.sources[${index}]`;
        if (!isRecord(source))
            throw new Error(`${context} must be an object`);
        const id = requireString(source, "id", context);
        if (sourceIds.has(id))
            throw new Error(`Duplicate source id ${id}`);
        sourceIds.add(id);
        if (source.adapter === "prisma" ||
            source.adapter === "legacy-sources" ||
            source.adapter === "metamap-shard") {
            requireString(source, "path", context);
        }
        else if (source.adapter === "json-collections") {
            requireString(source, "path", context);
            if (!Array.isArray(source.collections) ||
                source.collections.length === 0) {
                throw new Error(`${context}.collections must be a non-empty array`);
            }
        }
        else if (source.adapter === "typescript-zod") {
            requireStringArray(source, "roots", context);
            if (source.exclude !== undefined &&
                (!Array.isArray(source.exclude) ||
                    !source.exclude.every((entry) => typeof entry === "string"))) {
                throw new Error(`${context}.exclude must be a string array`);
            }
        }
        else {
            requireString(source, "adapter", context);
        }
    }
    if (!Array.isArray(value.correspondences)) {
        throw new Error("$config.correspondences must be an array");
    }
    const correspondenceIds = new Set();
    for (const [index, correspondence] of value.correspondences.entries()) {
        const context = `$config.correspondences[${index}]`;
        if (!isRecord(correspondence)) {
            throw new Error(`${context} must be an object`);
        }
        const id = requireString(correspondence, "id", context);
        if (correspondenceIds.has(id)) {
            throw new Error(`Duplicate correspondence id ${id}`);
        }
        correspondenceIds.add(id);
        for (const side of ["source", "target"]) {
            const reference = correspondence[side];
            if (!isRecord(reference)) {
                throw new Error(`${context}.${side} must be an object`);
            }
            const sourceId = requireString(reference, "sourceId", `${context}.${side}`);
            if (!sourceIds.has(sourceId)) {
                throw new Error(`${context}.${side} references unknown source ${sourceId}`);
            }
            requireString(reference, "name", `${context}.${side}`);
            requireString(reference, "kind", `${context}.${side}`);
        }
    }
    if (!isRecord(value.outputs)) {
        throw new Error("$config.outputs must be an object");
    }
    for (const key of ["graph", "snapshot", "report", "documentation"]) {
        requireString(value.outputs, key, "$config.outputs");
    }
    return value;
}
export async function loadMetamapConfig(path) {
    const configPath = resolve(path);
    const configDirectory = dirname(configPath);
    const value = JSON.parse(await readFile(configPath, "utf8"));
    const config = parseMetamapConfig(value);
    return {
        config,
        configPath,
        configDirectory,
        repositoryRoot: resolve(configDirectory, config.repositoryRoot),
    };
}
//# sourceMappingURL=config.js.map