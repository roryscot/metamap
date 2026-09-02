import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { AnySchema, ErrorObject } from "ajv";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

export const METAMAP_CONFIG_VERSION = "1.0.0" as const;

export interface PrismaSourceConfig {
  id: string;
  adapter: "prisma";
  path: string;
}

export interface TypeScriptZodSourceConfig {
  id: string;
  adapter: "typescript-zod";
  roots: string[];
  exclude?: string[];
}

export interface LegacySourcesConfig {
  id: string;
  adapter: "legacy-sources";
  path: string;
}

export interface JsonReferenceConfig {
  property: string;
  targetKind: string;
  relation?: string;
}

export interface JsonCollectionConfig {
  pointer: string;
  idProperty: string;
  labelProperty?: string;
  entityKind: string;
  references?: JsonReferenceConfig[];
}

export interface JsonCollectionsSourceConfig {
  id: string;
  adapter: "json-collections";
  path: string;
  collections: JsonCollectionConfig[];
}

export type MetamapSourceConfig =
  | PrismaSourceConfig
  | TypeScriptZodSourceConfig
  | LegacySourcesConfig
  | JsonCollectionsSourceConfig;

export interface StructureReferenceConfig {
  sourceId: string;
  kind: "model" | "schema" | "enum";
  name: string;
}

export type ComparedFact = "type" | "presence" | "nullability" | "cardinality";

export interface FieldPairConfig {
  source: string;
  target: string;
  compare?: ComparedFact[];
  allowDifferences?: ComparedFact[];
  transform?: string;
  note?: string;
}

export interface FieldCorrespondenceConfig {
  pairs: FieldPairConfig[];
  ignoreSource?: string[];
  ignoreTarget?: string[];
  requireSourceCoverage?: boolean;
  requireTargetCoverage?: boolean;
}

export interface EnumCorrespondenceConfig {
  allowSourceOnly?: string[];
  allowTargetOnly?: string[];
}

export interface CorrespondenceAuthorityConfig {
  side: "source" | "target";
  facts: string[];
}

export interface CorrespondenceConfig {
  id: string;
  source: StructureReferenceConfig;
  target: StructureReferenceConfig;
  relation?: string;
  fields?: FieldCorrespondenceConfig;
  enumValues?: EnumCorrespondenceConfig;
  authority?: CorrespondenceAuthorityConfig;
}

export interface MetamapOutputConfig {
  graph: string;
  snapshot: string;
  report: string;
  documentation: string;
  cache?: string;
}

export interface MetamapPolicyConfig {
  baselineChanges?: "error" | "warning" | "ignore";
  unconfiguredStructures?: "error" | "warning" | "ignore";
}

export interface MetamapConfig {
  $schema?: string;
  schemaVersion: typeof METAMAP_CONFIG_VERSION;
  id: string;
  label?: string;
  namespace: string;
  repository: string;
  repositoryRoot: string;
  sources: MetamapSourceConfig[];
  correspondences: CorrespondenceConfig[];
  outputs: MetamapOutputConfig;
  policy?: MetamapPolicyConfig;
}

export interface LoadedMetamapConfig {
  config: MetamapConfig;
  configPath: string;
  configDirectory: string;
  repositoryRoot: string;
}

const Ajv2020 = Ajv2020Module.default;
const addFormats = addFormatsModule.default;
const configSchema = JSON.parse(
  readFileSync(
    new URL("../schemas/metamap-config.schema.json", import.meta.url),
    "utf8",
  ),
) as AnySchema;
const configSchemaValidator = addFormats(
  new Ajv2020({ allErrors: true, strict: true }),
).compile(configSchema);

function schemaErrorMessage(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((error) => {
      const path = error.instancePath || "$config";
      return `${path} ${error.message ?? "is invalid"}`;
    })
    .join("; ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  value: Record<string, unknown>,
  key: string,
  context: string,
): string {
  const result = value[key];
  if (typeof result !== "string" || result.length === 0) {
    throw new Error(`${context}.${key} must be a non-empty string`);
  }
  return result;
}

function requireStringArray(
  value: Record<string, unknown>,
  key: string,
  context: string,
): string[] {
  const result = value[key];
  if (
    !Array.isArray(result) ||
    result.length === 0 ||
    !result.every((entry) => typeof entry === "string" && entry.length > 0)
  ) {
    throw new Error(`${context}.${key} must be a non-empty string array`);
  }
  return result;
}

/**
 * A deliberately strict runtime gate for configuration read by the CLI.
 * The JSON Schema remains the complete language-neutral contract.
 */
export function parseMetamapConfig(value: unknown): MetamapConfig {
  if (!configSchemaValidator(value)) {
    throw new Error(
      `Metamap config does not match the portable schema: ${schemaErrorMessage(configSchemaValidator.errors)}`,
    );
  }
  if (!isRecord(value)) throw new Error("Metamap config must be an object");
  if (value.schemaVersion !== METAMAP_CONFIG_VERSION) {
    throw new Error(
      `Metamap config schemaVersion must be ${METAMAP_CONFIG_VERSION}`,
    );
  }

  for (const key of [
    "id",
    "namespace",
    "repository",
    "repositoryRoot",
  ] as const) {
    requireString(value, key, "$config");
  }
  if (value.label !== undefined) requireString(value, "label", "$config");
  if (!Array.isArray(value.sources) || value.sources.length === 0) {
    throw new Error("$config.sources must be a non-empty array");
  }
  const sourceIds = new Set<string>();
  for (const [index, source] of value.sources.entries()) {
    const context = `$config.sources[${index}]`;
    if (!isRecord(source)) throw new Error(`${context} must be an object`);
    const id = requireString(source, "id", context);
    if (sourceIds.has(id)) throw new Error(`Duplicate source id ${id}`);
    sourceIds.add(id);
    if (source.adapter === "prisma" || source.adapter === "legacy-sources") {
      requireString(source, "path", context);
    } else if (source.adapter === "json-collections") {
      requireString(source, "path", context);
      if (
        !Array.isArray(source.collections) ||
        source.collections.length === 0
      ) {
        throw new Error(`${context}.collections must be a non-empty array`);
      }
    } else if (source.adapter === "typescript-zod") {
      requireStringArray(source, "roots", context);
      if (
        source.exclude !== undefined &&
        (!Array.isArray(source.exclude) ||
          !source.exclude.every((entry) => typeof entry === "string"))
      ) {
        throw new Error(`${context}.exclude must be a string array`);
      }
    } else {
      throw new Error(`${context}.adapter is not supported`);
    }
  }

  if (!Array.isArray(value.correspondences)) {
    throw new Error("$config.correspondences must be an array");
  }
  const correspondenceIds = new Set<string>();
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
    for (const side of ["source", "target"] as const) {
      const reference = correspondence[side];
      if (!isRecord(reference)) {
        throw new Error(`${context}.${side} must be an object`);
      }
      const sourceId = requireString(
        reference,
        "sourceId",
        `${context}.${side}`,
      );
      if (!sourceIds.has(sourceId)) {
        throw new Error(
          `${context}.${side} references unknown source ${sourceId}`,
        );
      }
      requireString(reference, "name", `${context}.${side}`);
      if (!new Set(["model", "schema", "enum"]).has(String(reference.kind))) {
        throw new Error(`${context}.${side}.kind is invalid`);
      }
    }
  }

  if (!isRecord(value.outputs)) {
    throw new Error("$config.outputs must be an object");
  }
  for (const key of ["graph", "snapshot", "report", "documentation"] as const) {
    requireString(value.outputs, key, "$config.outputs");
  }

  return value as unknown as MetamapConfig;
}

export async function loadMetamapConfig(
  path: string,
): Promise<LoadedMetamapConfig> {
  const configPath = resolve(path);
  const configDirectory = dirname(configPath);
  const value = JSON.parse(await readFile(configPath, "utf8")) as unknown;
  const config = parseMetamapConfig(value);
  return {
    config,
    configPath,
    configDirectory,
    repositoryRoot: resolve(configDirectory, config.repositoryRoot),
  };
}
