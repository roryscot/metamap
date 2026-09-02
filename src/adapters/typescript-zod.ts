import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import ts from "typescript";
import type { TypeScriptZodSourceConfig } from "../config.js";
import {
  CORE_RELATION_PACK_ID,
  CORE_RELATION_PACK_VERSION,
  METAMAP_SCHEMA_VERSION,
  type JsonObject,
  type MetamapEntity,
  type Provenance,
  type StructuralMapping,
} from "../model.js";
import { makeRepositoryUri, makeUrn } from "../references.js";
import { contentDigest, valueDigest } from "../stable.js";
import type {
  AdapterContext,
  AdapterDiagnostic,
  AdapterInput,
  AdapterResult,
  MetamapAdapter,
} from "./types.js";

const ADAPTER_VERSION = "1.0.0";

interface ChainOperation {
  name: string;
  arguments: readonly ts.Expression[];
}

interface ExpressionShape {
  root?: string;
  rootArguments: readonly ts.Expression[];
  baseName?: string;
  operations: ChainOperation[];
}

interface ZodFieldObservation {
  name: string;
  expression: string;
  dataType: string;
  presenceRequired: boolean;
  nullable: boolean;
  cardinality: "one" | "many";
  hasDefault: boolean;
  line: number;
}

interface ZodStructureObservation {
  name: string;
  kind: "schema" | "enum";
  root: string;
  baseName?: string;
  operations: string[];
  fields: ZodFieldObservation[];
  enumValues: string[];
  filePath: string;
  fileDigest: string;
  line: number;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function expressionShape(
  expression: ts.Expression,
): ExpressionShape | undefined {
  let current = unwrapExpression(expression);
  const operations: ChainOperation[] = [];

  while (ts.isCallExpression(current)) {
    const called = unwrapExpression(current.expression);
    if (!ts.isPropertyAccessExpression(called)) break;
    const receiver = unwrapExpression(called.expression);
    const name = called.name.text;
    if (ts.isIdentifier(receiver) && receiver.text === "z") {
      return {
        root: name,
        rootArguments: current.arguments,
        operations,
      };
    }
    operations.unshift({ name, arguments: current.arguments });
    current = receiver;
  }

  if (ts.isIdentifier(current)) {
    return {
      rootArguments: [],
      baseName: current.text,
      operations,
    };
  }
  return undefined;
}

function propertyName(node: ts.PropertyName): string | undefined {
  if (
    ts.isIdentifier(node) ||
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node)
  ) {
    return node.text;
  }
  return undefined;
}

function normalizedZodType(shape: ExpressionShape | undefined): string {
  if (!shape) return "unknown";
  if (shape.baseName) {
    if (/IdSchema$/i.test(shape.baseName)) return "string";
    if (/DateTimeSchema$/i.test(shape.baseName)) return "datetime";
    return `reference:${shape.baseName}`;
  }
  switch (shape.root) {
    case "string":
      return "string";
    case "number":
      return shape.operations.some((operation) => operation.name === "int")
        ? "integer"
        : "number";
    case "boolean":
      return "boolean";
    case "date":
      return "datetime";
    case "record":
    case "object":
      return "json";
    case "array": {
      const item = shape.rootArguments[0];
      const itemType = item
        ? normalizedZodType(expressionShape(item))
        : "unknown";
      return `array:${itemType}`;
    }
    case "enum":
    case "nativeEnum":
      return "enum:inline";
    case "unknown":
    case "any":
      return "unknown";
    default:
      return shape.root ? `zod:${shape.root}` : "unknown";
  }
}

function observeFields(
  object: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
): ZodFieldObservation[] {
  const fields: ZodFieldObservation[] = [];
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = propertyName(property.name);
    if (!name) continue;
    const shape = expressionShape(property.initializer);
    const operationNames =
      shape?.operations.map((operation) => operation.name) ?? [];
    const root = shape?.root;
    const optional =
      operationNames.includes("optional") || operationNames.includes("nullish");
    const nullable =
      operationNames.includes("nullable") || operationNames.includes("nullish");
    const hasDefault = operationNames.includes("default");
    const line =
      sourceFile.getLineAndCharacterOfPosition(property.getStart(sourceFile))
        .line + 1;
    fields.push({
      name,
      expression: property.initializer.getText(sourceFile),
      dataType: normalizedZodType(shape),
      presenceRequired: !optional || hasDefault,
      nullable,
      cardinality:
        root === "array" || operationNames.includes("array") ? "many" : "one",
      hasDefault,
      line,
    });
  }
  return fields;
}

function stringArray(expression: ts.Expression | undefined): string[] {
  if (!expression || !ts.isArrayLiteralExpression(expression)) return [];
  return expression.elements
    .filter(ts.isStringLiteralLike)
    .map((element) => element.text);
}

function observeDeclaration(
  name: string,
  initializer: ts.Expression,
  sourceFile: ts.SourceFile,
  filePath: string,
  fileDigest: string,
): ZodStructureObservation | undefined {
  const shape = expressionShape(initializer);
  if (!shape) return undefined;
  const operations = shape.operations.map((operation) => operation.name);
  const line =
    sourceFile.getLineAndCharacterOfPosition(initializer.getStart(sourceFile))
      .line + 1;

  if (shape.root === "enum") {
    return {
      name,
      kind: "enum",
      root: shape.root,
      operations,
      fields: [],
      enumValues: stringArray(shape.rootArguments[0]),
      filePath,
      fileDigest,
      line,
    };
  }

  const objectArgument =
    shape.root === "object" &&
    shape.rootArguments[0] &&
    ts.isObjectLiteralExpression(shape.rootArguments[0])
      ? shape.rootArguments[0]
      : undefined;
  if (shape.root || shape.baseName) {
    return {
      name,
      kind: "schema",
      root: shape.root ?? "reference",
      baseName: shape.baseName,
      operations,
      fields: objectArgument ? observeFields(objectArgument, sourceFile) : [],
      enumValues: [],
      filePath,
      fileDigest,
      line,
    };
  }
  return undefined;
}

function isExported(statement: ts.VariableStatement): boolean {
  return (
    statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    ) === true
  );
}

async function collectTypeScriptFiles(
  config: TypeScriptZodSourceConfig,
  context: AdapterContext,
): Promise<string[]> {
  const excluded = new Set(
    (config.exclude ?? []).map((path) => resolve(context.repositoryRoot, path)),
  );
  const files: string[] = [];

  const visit = async (path: string): Promise<void> => {
    if (excluded.has(path)) return;
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const child = resolve(path, entry.name);
      if (excluded.has(child)) continue;
      if (entry.isDirectory()) {
        await visit(child);
      } else if (
        entry.isFile() &&
        child.endsWith(".ts") &&
        !child.endsWith(".d.ts") &&
        !child.endsWith(".test.ts") &&
        !child.endsWith(".spec.ts")
      ) {
        files.push(child);
      }
    }
  };

  for (const root of config.roots) {
    await visit(resolve(context.repositoryRoot, root));
  }
  return [...new Set(files)].sort();
}

function structureId(
  namespace: string,
  sourceId: string,
  observation: Pick<ZodStructureObservation, "kind" | "name">,
): string {
  return makeUrn(
    namespace,
    observation.kind === "enum" ? "zod-enum" : "zod-schema",
    `${sourceId}:${observation.name}`,
  );
}

function jsonAttributes(value: Record<string, unknown>): JsonObject {
  return value as JsonObject;
}

export class TypeScriptZodAdapter implements MetamapAdapter<TypeScriptZodSourceConfig> {
  readonly id = "typescript-zod" as const;
  readonly version = ADAPTER_VERSION;

  async fingerprint(
    config: TypeScriptZodSourceConfig,
    context: AdapterContext,
  ): Promise<AdapterInput[]> {
    const files = await collectTypeScriptFiles(config, context);
    return Promise.all(
      files.map(async (absolutePath) => ({
        path: relative(context.repositoryRoot, absolutePath).replaceAll(
          "\\",
          "/",
        ),
        digest: contentDigest(await readFile(absolutePath, "utf8")),
      })),
    );
  }

  async discover(
    config: TypeScriptZodSourceConfig,
    context: AdapterContext,
  ): Promise<AdapterResult> {
    const files = await collectTypeScriptFiles(config, context);
    const inputs: AdapterInput[] = [];
    const observations: ZodStructureObservation[] = [];
    const diagnostics: AdapterDiagnostic[] = [];

    for (const absolutePath of files) {
      const source = await readFile(absolutePath, "utf8");
      const digest = contentDigest(source);
      const repositoryPath = relative(
        context.repositoryRoot,
        absolutePath,
      ).replaceAll("\\", "/");
      inputs.push({ path: repositoryPath, digest });
      const sourceFile = ts.createSourceFile(
        repositoryPath,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement) || !isExported(statement))
          continue;
        for (const declaration of statement.declarationList.declarations) {
          if (
            !ts.isIdentifier(declaration.name) ||
            declaration.initializer === undefined
          ) {
            continue;
          }
          const observation = observeDeclaration(
            declaration.name.text,
            declaration.initializer,
            sourceFile,
            repositoryPath,
            digest,
          );
          if (observation) observations.push(observation);
        }
      }
    }

    const byName = new Map<string, ZodStructureObservation>();
    for (const observation of observations) {
      const existing = byName.get(observation.name);
      if (existing) {
        diagnostics.push({
          severity: "error",
          code: "DUPLICATE_ZOD_SCHEMA_NAME",
          message: `${observation.name} is exported by both ${existing.filePath} and ${observation.filePath}`,
          path: observation.filePath,
          subjectId: observation.name,
        });
      } else {
        byName.set(observation.name, observation);
      }
    }

    const entities = new Map<string, MetamapEntity>();
    const mappings: StructuralMapping[] = [];
    const combinedRevision = valueDigest(inputs);

    for (const observation of byName.values()) {
      const id = structureId(context.namespace, config.id, observation);
      const provenance: Provenance = {
        status: "observed",
        assertedBy: `adapter:typescript-zod@${ADAPTER_VERSION}`,
        sourceRevision: observation.fileDigest,
      };
      entities.set(id, {
        id,
        kind: observation.kind === "enum" ? "zod-enum" : "zod-schema",
        label: observation.name,
        locators: [
          {
            uri: `${makeRepositoryUri(observation.filePath, context.repository)}#L${observation.line}`,
            mediaType: "text/typescript",
            digest: observation.fileDigest,
          },
          {
            uri: `ts-symbol://${encodeURIComponent(context.repository)}/${observation.filePath}#${encodeURIComponent(observation.name)}`,
          },
        ],
        attributes: jsonAttributes({
          adapter: this.id,
          sourceId: config.id,
          structureKind: observation.kind,
          name: observation.name,
          zodRoot: observation.root,
          baseSchemaName: observation.baseName ?? null,
          operations: observation.operations,
        }),
        provenance,
      });

      const childIds: string[] = [];
      for (const field of observation.fields) {
        const fieldId = makeUrn(
          context.namespace,
          "zod-field",
          `${config.id}:${observation.name}.${field.name}`,
        );
        childIds.push(fieldId);
        entities.set(fieldId, {
          id: fieldId,
          kind: "zod-field",
          label: `${observation.name}.${field.name}`,
          locators: [
            {
              uri: `${makeRepositoryUri(observation.filePath, context.repository)}#L${field.line}`,
              mediaType: "text/typescript",
              digest: observation.fileDigest,
            },
          ],
          attributes: jsonAttributes({
            adapter: this.id,
            sourceId: config.id,
            structureId: id,
            structureName: observation.name,
            name: field.name,
            expression: field.expression,
            dataType: field.dataType,
            presenceRequired: field.presenceRequired,
            nullable: field.nullable,
            cardinality: field.cardinality,
            hasDefault: field.hasDefault,
            relation: false,
          }),
          provenance,
        });
      }
      for (const [index, value] of observation.enumValues.entries()) {
        const valueId = makeUrn(
          context.namespace,
          "zod-enum-value",
          `${config.id}:${observation.name}.${value}`,
        );
        childIds.push(valueId);
        entities.set(valueId, {
          id: valueId,
          kind: "zod-enum-value",
          label: `${observation.name}.${value}`,
          attributes: {
            adapter: this.id,
            sourceId: config.id,
            structureId: id,
            structureName: observation.name,
            name: value,
            value,
            order: index,
          },
          provenance,
        });
      }
      if (childIds.length > 0) {
        mappings.push({
          id: makeUrn(
            context.namespace,
            "mapping",
            `${config.id}:contains:${observation.name}`,
          ),
          relation: "core:contains",
          sources: [id],
          targets: childIds,
          cardinality: childIds.length === 1 ? "one-to-one" : "one-to-many",
          lossiness: "lossless",
          provenance,
        });
      }
    }

    for (const observation of byName.values()) {
      if (!observation.baseName) continue;
      const derivedId = structureId(context.namespace, config.id, observation);
      const baseObservation = byName.get(observation.baseName);
      const baseId = baseObservation
        ? structureId(context.namespace, config.id, baseObservation)
        : makeUrn(
            context.namespace,
            "zod-schema",
            `${config.id}:${observation.baseName}`,
          );
      if (!baseObservation && !entities.has(baseId)) {
        entities.set(baseId, {
          id: baseId,
          kind: "zod-schema",
          label: observation.baseName,
          attributes: {
            adapter: this.id,
            sourceId: config.id,
            structureKind: "schema",
            name: observation.baseName,
            externalReference: true,
          },
          provenance: {
            status: "inferred",
            assertedBy: `adapter:typescript-zod@${ADAPTER_VERSION}`,
            sourceRevision: observation.fileDigest,
          },
        });
      }
      const lossy = observation.operations.some((operation) =>
        new Set(["pick", "omit"]).has(operation),
      );
      mappings.push({
        id: makeUrn(
          context.namespace,
          "mapping",
          `${config.id}:derives:${observation.name}:${observation.baseName}`,
        ),
        relation: "core:derives_from",
        sources: [derivedId],
        targets: [baseId],
        cardinality: "one-to-one",
        lossiness: lossy ? "lossy" : "unknown",
        transform:
          observation.operations.length > 0
            ? {
                adapter: this.id,
                version: this.version,
                entrypoint: observation.operations.join("."),
                deterministic: true,
              }
            : undefined,
        provenance: {
          status: "observed",
          assertedBy: `adapter:typescript-zod@${ADAPTER_VERSION}`,
          sourceRevision: observation.fileDigest,
        },
      });
    }

    return {
      sourceId: config.id,
      adapter: this.id,
      adapterVersion: this.version,
      inputs,
      diagnostics,
      document: {
        schemaVersion: METAMAP_SCHEMA_VERSION,
        id: makeUrn(context.namespace, "metamap-shard", config.id),
        namespace: context.namespace,
        label: `TypeScript/Zod discovery: ${config.id}`,
        revision: combinedRevision,
        relationPacks: [
          {
            id: CORE_RELATION_PACK_ID,
            version: CORE_RELATION_PACK_VERSION,
          },
        ],
        entities: [...entities.values()],
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
