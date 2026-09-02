import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { PrismaSourceConfig } from "../config.js";
import {
  CORE_RELATION_PACK_ID,
  CORE_RELATION_PACK_VERSION,
  METAMAP_SCHEMA_VERSION,
  type MetamapEntity,
  type Provenance,
  type StructuralMapping,
} from "../model.js";
import { makeRepositoryUri, makeUrn } from "../references.js";
import { contentDigest } from "../stable.js";
import type {
  AdapterContext,
  AdapterDiagnostic,
  AdapterResult,
  MetamapAdapter,
} from "./types.js";

const ADAPTER_VERSION = "1.0.0";

interface PrismaBlock {
  kind: "model" | "enum";
  name: string;
  body: string;
  startLine: number;
}

interface ParsedPrismaField {
  name: string;
  nativeType: string;
  optional: boolean;
  list: boolean;
  attributes: string;
  line: number;
}

function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

function parseBlocks(
  source: string,
  diagnostics: AdapterDiagnostic[],
  path: string,
): PrismaBlock[] {
  const blocks: PrismaBlock[] = [];
  const pattern = /\b(model|enum)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/g;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    let depth = 1;
    let cursor = pattern.lastIndex;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === "{") depth += 1;
      if (source[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    if (depth !== 0) {
      diagnostics.push({
        severity: "error",
        code: "PRISMA_UNCLOSED_BLOCK",
        message: `${match[1]} ${match[2]} has no closing brace`,
        path,
      });
      continue;
    }
    blocks.push({
      kind: match[1] as PrismaBlock["kind"],
      name: match[2],
      body: source.slice(pattern.lastIndex, cursor - 1),
      startLine: lineAt(source, match.index),
    });
    pattern.lastIndex = cursor;
  }
  return blocks;
}

function parseModelFields(block: PrismaBlock): ParsedPrismaField[] {
  const fields: ParsedPrismaField[] = [];
  for (const [offset, rawLine] of block.body.split("\n").entries()) {
    const line = rawLine.replace(/\/\/.*$/, "").trim();
    if (!line || line.startsWith("@@")) continue;
    const match =
      /^([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)(\[\])?(\?)?\s*(.*)$/.exec(
        line,
      );
    if (!match) continue;
    fields.push({
      name: match[1],
      nativeType: match[2],
      list: match[3] === "[]",
      optional: match[4] === "?",
      attributes: match[5] ?? "",
      line: block.startLine + offset,
    });
  }
  return fields;
}

function parseEnumValues(
  block: PrismaBlock,
): Array<{ name: string; line: number }> {
  const values: Array<{ name: string; line: number }> = [];
  for (const [offset, rawLine] of block.body.split("\n").entries()) {
    const line = rawLine.replace(/\/\/.*$/, "").trim();
    if (!line || line.startsWith("@@")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\b/.exec(line);
    if (match) values.push({ name: match[1], line: block.startLine + offset });
  }
  return values;
}

function mappedName(body: string): string | undefined {
  return /@@map\("([^"]+)"\)/.exec(body)?.[1];
}

function fieldMappedName(attributes: string): string | undefined {
  return /@map\("([^"]+)"\)/.exec(attributes)?.[1];
}

function normalizedPrismaType(
  nativeType: string,
  enumNames: ReadonlySet<string>,
  modelNames: ReadonlySet<string>,
): string {
  if (enumNames.has(nativeType)) return `enum:${nativeType}`;
  if (modelNames.has(nativeType)) return `reference:${nativeType}`;
  return (
    (
      {
        String: "string",
        Int: "integer",
        BigInt: "integer",
        Float: "number",
        Decimal: "number",
        Boolean: "boolean",
        DateTime: "datetime",
        Json: "json",
        Bytes: "bytes",
      } as Record<string, string>
    )[nativeType] ?? `native:${nativeType}`
  );
}

function mappingForChildren(
  namespace: string,
  sourceId: string,
  parentId: string,
  childIds: string[],
  provenance: Provenance,
): StructuralMapping | undefined {
  if (childIds.length === 0) return undefined;
  return {
    id: makeUrn(namespace, "mapping", `${sourceId}:contains:${parentId}`),
    relation: "core:contains",
    sources: [parentId],
    targets: childIds,
    cardinality: childIds.length === 1 ? "one-to-one" : "one-to-many",
    lossiness: "lossless",
    provenance,
  };
}

export class PrismaAdapter implements MetamapAdapter<PrismaSourceConfig> {
  readonly id = "prisma" as const;
  readonly version = ADAPTER_VERSION;

  async fingerprint(
    config: PrismaSourceConfig,
    context: AdapterContext,
  ): Promise<AdapterResult["inputs"]> {
    const absolutePath = resolve(context.repositoryRoot, config.path);
    const source = await readFile(absolutePath, "utf8");
    return [
      {
        path: relative(context.repositoryRoot, absolutePath).replaceAll(
          "\\",
          "/",
        ),
        digest: contentDigest(source),
      },
    ];
  }

  async discover(
    config: PrismaSourceConfig,
    context: AdapterContext,
  ): Promise<AdapterResult> {
    const absolutePath = resolve(context.repositoryRoot, config.path);
    const source = await readFile(absolutePath, "utf8");
    const digest = contentDigest(source);
    const repositoryPath = relative(
      context.repositoryRoot,
      absolutePath,
    ).replaceAll("\\", "/");
    const diagnostics: AdapterDiagnostic[] = [];
    const blocks = parseBlocks(source, diagnostics, repositoryPath);
    const modelNames = new Set(
      blocks
        .filter((block) => block.kind === "model")
        .map((block) => block.name),
    );
    const enumNames = new Set(
      blocks
        .filter((block) => block.kind === "enum")
        .map((block) => block.name),
    );
    const provenance: Provenance = {
      status: "observed",
      assertedBy: `adapter:prisma@${ADAPTER_VERSION}`,
      sourceRevision: digest,
    };
    const entities: MetamapEntity[] = [];
    const mappings: StructuralMapping[] = [];

    for (const block of blocks) {
      const structureKind =
        block.kind === "model" ? "prisma-model" : "prisma-enum";
      const structureId = makeUrn(
        context.namespace,
        structureKind,
        `${config.id}:${block.name}`,
      );
      entities.push({
        id: structureId,
        kind: structureKind,
        label: block.name,
        locators: [
          {
            uri: `${makeRepositoryUri(repositoryPath, context.repository)}#L${block.startLine}`,
            mediaType: "text/plain",
            digest,
          },
          {
            uri: `prisma-symbol://${encodeURIComponent(context.repository)}/${encodeURIComponent(block.name)}`,
          },
        ],
        attributes: {
          adapter: this.id,
          sourceId: config.id,
          structureKind: block.kind,
          name: block.name,
          mappedName: mappedName(block.body) ?? block.name,
        },
        provenance,
      });

      if (block.kind === "model") {
        const childIds: string[] = [];
        for (const field of parseModelFields(block)) {
          const fieldId = makeUrn(
            context.namespace,
            "prisma-field",
            `${config.id}:${block.name}.${field.name}`,
          );
          const relation = modelNames.has(field.nativeType);
          childIds.push(fieldId);
          entities.push({
            id: fieldId,
            kind: "prisma-field",
            label: `${block.name}.${field.name}`,
            locators: [
              {
                uri: `${makeRepositoryUri(repositoryPath, context.repository)}#L${field.line}`,
                mediaType: "text/plain",
                digest,
              },
              {
                uri: `prisma-symbol://${encodeURIComponent(context.repository)}/${encodeURIComponent(block.name)}/${encodeURIComponent(field.name)}`,
              },
            ],
            attributes: {
              adapter: this.id,
              sourceId: config.id,
              structureId,
              structureName: block.name,
              name: field.name,
              mappedName: fieldMappedName(field.attributes) ?? field.name,
              nativeType: field.nativeType,
              dataType: normalizedPrismaType(
                field.nativeType,
                enumNames,
                modelNames,
              ),
              presenceRequired: true,
              nullable: field.optional,
              cardinality: field.list ? "many" : "one",
              relation,
              id: field.attributes.includes("@id"),
              unique: field.attributes.includes("@unique"),
              hasDefault: field.attributes.includes("@default("),
            },
            provenance,
          });
        }
        const contains = mappingForChildren(
          context.namespace,
          config.id,
          structureId,
          childIds,
          provenance,
        );
        if (contains) mappings.push(contains);
      } else {
        const childIds: string[] = [];
        for (const value of parseEnumValues(block)) {
          const valueId = makeUrn(
            context.namespace,
            "prisma-enum-value",
            `${config.id}:${block.name}.${value.name}`,
          );
          childIds.push(valueId);
          entities.push({
            id: valueId,
            kind: "prisma-enum-value",
            label: `${block.name}.${value.name}`,
            locators: [
              {
                uri: `${makeRepositoryUri(repositoryPath, context.repository)}#L${value.line}`,
                mediaType: "text/plain",
                digest,
              },
            ],
            attributes: {
              adapter: this.id,
              sourceId: config.id,
              structureId,
              structureName: block.name,
              name: value.name,
              value: value.name,
            },
            provenance,
          });
        }
        const contains = mappingForChildren(
          context.namespace,
          config.id,
          structureId,
          childIds,
          provenance,
        );
        if (contains) mappings.push(contains);
      }
    }

    return {
      sourceId: config.id,
      adapter: this.id,
      adapterVersion: this.version,
      inputs: [{ path: repositoryPath, digest }],
      diagnostics,
      document: {
        schemaVersion: METAMAP_SCHEMA_VERSION,
        id: makeUrn(context.namespace, "metamap-shard", config.id),
        namespace: context.namespace,
        label: `Prisma discovery: ${config.id}`,
        revision: digest,
        relationPacks: [
          {
            id: CORE_RELATION_PACK_ID,
            version: CORE_RELATION_PACK_VERSION,
          },
        ],
        entities,
        mappings,
        authorities: [],
        metadata: {
          adapter: this.id,
          adapterVersion: this.version,
          sourceId: config.id,
        },
      },
    };
  }
}
