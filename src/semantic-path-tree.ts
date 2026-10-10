import { readFileSync } from "node:fs";
import type { AnySchema } from "ajv";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import {
  canonicalDigest,
  canonicalJson,
  parseStrictJson,
} from "./canonical.js";
import {
  legacyProjectionSpecView,
  parseSemanticProjectionSpec,
  validateSemanticProjection,
} from "./semantic-projection.js";
import type {
  SemanticPathTree,
  SemanticPathTreeResult,
  SemanticProjection,
  SemanticProjectionSpec,
} from "./semantic-projection-model.js";
import type {
  MetamapProjection,
  MetamapProjectionSpec,
  ProjectionIssue,
} from "./projection.js";
import type { PathTreeCompilationResult } from "./path-tree.js";
import { valueDigest } from "./stable.js";

const Ajv2020 = Ajv2020Module.default;
const addFormats = addFormatsModule.default;
const validateShape = addFormats(
  new Ajv2020({ allErrors: true, strict: true }),
).compile(
  JSON.parse(
    readFileSync(
      new URL("../schemas/metamap-path-tree-v2.schema.json", import.meta.url),
      "utf8",
    ),
  ) as AnySchema,
);
const problem = (code: string, message: string): ProjectionIssue => ({
  severity: "error",
  code,
  message,
});
export function semanticPathTreeDigest(tree: SemanticPathTree): string {
  const { id: _id, digest: _digest, ...content } = tree;
  return canonicalDigest(content);
}
export function validateSemanticPathTree(value: unknown): {
  valid: boolean;
  issues: ProjectionIssue[];
} {
  try {
    canonicalJson(value);
    if (!validateShape(value))
      return {
        valid: false,
        issues: (validateShape.errors ?? []).map((issue) => ({
          severity: "error",
          code: "INVALID_SEMANTIC_PATH_TREE",
          message: issue.message ?? "Invalid path tree",
          path: issue.instancePath || "$",
        })),
      };
    const tree = value as SemanticPathTree;
    const digest = semanticPathTreeDigest(tree);
    if (
      tree.digest !== digest ||
      tree.id !== `urn:metamap:path-tree:${digest.slice(7)}`
    )
      return {
        valid: false,
        issues: [
          problem(
            "SEMANTIC_PATH_TREE_DIGEST_MISMATCH",
            "Path tree content binding mismatch",
          ),
        ],
      };
    return { valid: true, issues: [] };
  } catch (error) {
    return {
      valid: false,
      issues: [
        problem(
          "INVALID_SEMANTIC_PATH_TREE",
          error instanceof Error ? error.message : "Invalid path tree",
        ),
      ],
    };
  }
}
export function parseSemanticPathTree(value: unknown): SemanticPathTree {
  const validation = validateSemanticPathTree(value);
  if (!validation.valid)
    throw new Error(validation.issues.map((issue) => issue.message).join("; "));
  return value as SemanticPathTree;
}
export function parseSemanticPathTreeJson(text: string): SemanticPathTree {
  return parseSemanticPathTree(parseStrictJson(text));
}
type LegacyTreeCompiler = (
  projection: MetamapProjection,
  spec: MetamapProjectionSpec,
) => PathTreeCompilationResult;
export function compileSemanticPathTree(
  projection: SemanticProjection,
  spec: SemanticProjectionSpec,
  legacy: LegacyTreeCompiler,
): SemanticPathTreeResult {
  try {
    parseSemanticProjectionSpec(spec);
    const validation = validateSemanticProjection(projection);
    if (!validation.valid)
      return { status: "rejected", issues: validation.issues };
    if (
      projection.spec.id !== spec.id ||
      projection.spec.digest !== canonicalDigest(spec)
    )
      return {
        status: "rejected",
        issues: [
          problem(
            "PATH_TREE_SPEC_DIGEST_MISMATCH",
            "The path-tree specification does not match the captured semantic projection",
          ),
        ],
      };
    const view = legacyProjectionSpecView(spec);
    const {
      $schema: _schema,
      schemaVersion: _version,
      id: _id,
      digest: _digest,
      semantic: _semantic,
      ...common
    } = projection;
    const content = {
      ...common,
      schemaVersion: "1.0.0" as const,
      spec: { id: view.id, digest: valueDigest(view) },
    };
    const digest = valueDigest(content);
    const result = legacy(
      { ...content, id: `urn:metamap:projection:${digest.slice(7)}`, digest },
      view,
    );
    if (result.status !== "projected") return result;
    const {
      $schema: _oldSchema,
      schemaVersion: _oldVersion,
      id: _oldId,
      digest: _oldDigest,
      ...tree
    } = result.pathTree;
    const actual = {
      ...tree,
      $schema:
        "https://raw.githubusercontent.com/roryscot/metamap/main/schemas/metamap-path-tree-v2.schema.json",
      schemaVersion: "2.0.0" as const,
      projection: { id: projection.id, digest: projection.digest },
      spec: { id: spec.id, digest: canonicalDigest(spec) },
    };
    const actualDigest = canonicalDigest(actual);
    const pathTree = JSON.parse(
      canonicalJson({
        ...actual,
        id: `urn:metamap:path-tree:${actualDigest.slice(7)}`,
        digest: actualDigest,
      }),
    ) as SemanticPathTree;
    parseSemanticPathTree(pathTree);
    const freeze = (value: unknown): void => {
      if (typeof value === "object" && value !== null) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
      }
    };
    freeze(pathTree);
    return { status: "projected", pathTree, issues: [] };
  } catch (error) {
    return {
      status: "rejected",
      issues: [
        problem(
          "INVALID_SEMANTIC_PATH_TREE",
          error instanceof Error
            ? error.message
            : "Invalid semantic path-tree input",
        ),
      ],
    };
  }
}
