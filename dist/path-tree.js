import { readFileSync } from "node:fs";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { collapseProjectedSlots, validateExportName, validateProjection, validateProjectionSpec, } from "./projection.js";
import { stableJson, valueDigest } from "./stable.js";
export const METAMAP_PATH_TREE_VERSION = "1.0.0";
const PATH_PARAM = /^(?::[A-Za-z][A-Za-z0-9_]*|\*[A-Za-z][A-Za-z0-9_]*\??)$/;
const PATH_SEGMENT = /^(?:[A-Za-z0-9._~-]+|:[A-Za-z][A-Za-z0-9_]*|\*[A-Za-z][A-Za-z0-9_]*\??)$/;
const PATH_PARAM_TOKEN = /\*[A-Za-z][A-Za-z0-9_]*\?|:[A-Za-z][A-Za-z0-9_]*|\*[A-Za-z][A-Za-z0-9_]*/g;
const RESERVED_SEGMENTS = new Set(["_", "$"]);
function paramBareName(name) {
    return name.replace(/^[*:]/, "").replace(/\?$/, "");
}
function isCatchAllParam(name) {
    return name.startsWith("*");
}
function isOptionalParam(name) {
    return name.startsWith("*") && name.endsWith("?");
}
const Ajv2020 = Ajv2020Module.default;
const addFormats = addFormatsModule.default;
const pathTreeSchema = JSON.parse(readFileSync(new URL("../schemas/metamap-path-tree.schema.json", import.meta.url), "utf8"));
const pathTreeSchemaValidator = addFormats(new Ajv2020({ allErrors: true, strict: true })).compile(pathTreeSchema);
function issue(code, message, options = {}) {
    return { severity: "error", code, message, ...options };
}
function schemaIssues(errors) {
    return (errors ?? []).map((error) => issue("INVALID_PATH_TREE", error.message ?? "Path tree is invalid", {
        path: error.instancePath || "$",
    }));
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function deepFreeze(value) {
    if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
        return value;
    }
    for (const child of Object.values(value)) {
        deepFreeze(child);
    }
    return Object.freeze(value);
}
function pathTreeConfig(spec) {
    return spec.pathTree ?? {};
}
function delimiterOf(spec) {
    return pathTreeConfig(spec).delimiter ?? "/";
}
function attributeOf(spec) {
    return pathTreeConfig(spec).attribute ?? "path";
}
function pathAt(segments, delimiter) {
    if (segments.length === 0)
        return delimiter === "/" ? "/" : delimiter;
    if (delimiter === "/")
        return `/${segments.join("/")}`;
    return `${delimiter}${segments.join(delimiter)}`;
}
function splitPath(path, delimiter, subjectId) {
    const root = delimiter === "/" ? "/" : delimiter;
    if (path === root)
        return { segments: [] };
    const prefix = root;
    if (!path.startsWith(prefix)) {
        return {
            issue: issue("PATH_TREE_INVALID_PATH", `Path ${path} must start with delimiter ${delimiter}`, { subjectId }),
        };
    }
    if (delimiter === "/" && path.endsWith("/") && path !== "/") {
        return {
            issue: issue("PATH_TREE_INVALID_PATH", `Path ${path} must not have a trailing delimiter`, { subjectId }),
        };
    }
    const rest = path.slice(prefix.length);
    if (rest.length === 0) {
        return {
            issue: issue("PATH_TREE_INVALID_PATH", `Path ${path} is empty after its delimiter`, { subjectId }),
        };
    }
    const segments = delimiter === "/" ? rest.split("/") : rest.split(delimiter);
    if (segments.some((segment) => segment.length === 0)) {
        return {
            issue: issue("PATH_TREE_INVALID_PATH", `Path ${path} contains an empty segment`, { subjectId }),
        };
    }
    for (const segment of segments) {
        if (RESERVED_SEGMENTS.has(segment)) {
            return {
                issue: issue("PATH_TREE_RESERVED_SEGMENT", `Path ${path} uses reserved segment ${segment}`, { subjectId }),
            };
        }
        if (!PATH_SEGMENT.test(segment)) {
            return {
                issue: issue("PATH_TREE_INVALID_PATH", `Path ${path} contains unsafe segment ${segment}`, { subjectId }),
            };
        }
    }
    return { segments };
}
function occupantOf(subject, slots) {
    return {
        id: subject.id,
        kind: subject.kind,
        ...(subject.label === undefined ? {} : { label: subject.label }),
        slots,
    };
}
function collectParams(node) {
    const params = new Set();
    function walk(current) {
        for (const [key, value] of Object.entries(current)) {
            if (key === "_" || key === "$")
                continue;
            if (PATH_PARAM.test(key))
                params.add(key);
            if (isRecord(value) && typeof value._ === "string") {
                walk(value);
            }
        }
    }
    walk(node);
    return [...params].sort();
}
function ensureChild(parent, segment, path) {
    const existing = parent[segment];
    if (existing && typeof existing === "object" && "_" in existing) {
        return existing;
    }
    const child = { _: path };
    parent[segment] = child;
    return child;
}
/**
 * Compile a nested path tree from a viable static projection. Paths are facts
 * owned by the selected subjects; the compiler never infers them from labels
 * or identities.
 */
export function compilePathTree(projection, spec) {
    const specValidation = validateProjectionSpec(spec);
    const projectionValidation = validateProjection(projection);
    const issues = [
        ...specValidation.issues,
        ...projectionValidation.issues,
    ];
    if (!spec.pathTree) {
        issues.push(issue("PATH_TREE_SPEC_MISSING", `Projection ${spec.id} does not declare pathTree`, { subjectId: spec.id, path: "$.pathTree" }));
    }
    if (projection.spec.id !== spec.id) {
        issues.push(issue("PATH_TREE_SPEC_MISMATCH", `Path tree spec ${spec.id} does not match projection spec ${projection.spec.id}`, { subjectId: spec.id }));
    }
    if (projection.spec.digest !== valueDigest(spec)) {
        issues.push(issue("PATH_TREE_SPEC_DIGEST_MISMATCH", `Path tree spec digest does not match projection ${projection.id}`, { subjectId: spec.id }));
    }
    if (issues.length > 0)
        return { status: "rejected", issues };
    const delimiter = delimiterOf(spec);
    const attribute = attributeOf(spec);
    const root = { _: pathAt([], delimiter) };
    const occupied = new Map();
    const entries = [...projection.entries].sort((left, right) => left.subject.id.localeCompare(right.subject.id));
    for (const entry of entries) {
        const raw = entry.subject.attributes?.[attribute];
        if (typeof raw !== "string" || raw.length === 0) {
            issues.push(issue("PATH_TREE_PATH_MISSING", `${entry.subject.id} has no string ${attribute} attribute`, { subjectId: entry.subject.id }));
            continue;
        }
        const split = splitPath(raw, delimiter, entry.subject.id);
        if (split.issue) {
            issues.push(split.issue);
            continue;
        }
        const segments = split.segments ?? [];
        const canonical = pathAt(segments, delimiter);
        if (canonical !== raw) {
            issues.push(issue("PATH_TREE_INVALID_PATH", `${entry.subject.id} path ${raw} is not canonical; expected ${canonical}`, { subjectId: entry.subject.id }));
            continue;
        }
        const previous = occupied.get(canonical);
        if (previous) {
            issues.push(issue("PATH_TREE_COLLISION", `Path ${canonical} is claimed by both ${previous} and ${entry.subject.id}`, { subjectId: entry.subject.id }));
            continue;
        }
        occupied.set(canonical, entry.subject.id);
        let current = root;
        for (const [index, segment] of segments.entries()) {
            current = ensureChild(current, segment, pathAt(segments.slice(0, index + 1), delimiter));
        }
        if (current.$) {
            issues.push(issue("PATH_TREE_COLLISION", `Path ${canonical} already has occupant ${current.$.id}`, { subjectId: entry.subject.id }));
            continue;
        }
        current.$ = occupantOf(entry.subject, collapseProjectedSlots(entry));
    }
    if (issues.length > 0)
        return { status: "rejected", issues };
    const params = collectParams(root);
    const content = {
        schemaVersion: METAMAP_PATH_TREE_VERSION,
        projection: { id: projection.id, digest: projection.digest },
        spec: { id: spec.id, digest: projection.spec.digest },
        attribute,
        delimiter,
        params,
        tree: root,
    };
    const digest = valueDigest(content);
    return {
        status: "projected",
        issues: [],
        pathTree: deepFreeze({
            $schema: "https://raw.githubusercontent.com/roryscot/metamap/main/schemas/metamap-path-tree.schema.json",
            ...content,
            id: `urn:metamap:path-tree:${digest.replace(/^sha256:/, "")}`,
            digest,
        }),
    };
}
export function validatePathTree(value) {
    if (!pathTreeSchemaValidator(value)) {
        return {
            valid: false,
            issues: schemaIssues(pathTreeSchemaValidator.errors),
        };
    }
    const pathTree = value;
    const { $schema: _schema, id, digest, ...content } = pathTree;
    const expectedDigest = valueDigest(content);
    const expectedId = `urn:metamap:path-tree:${expectedDigest.replace(/^sha256:/, "")}`;
    const issues = [];
    if (digest !== expectedDigest) {
        issues.push(issue("PATH_TREE_DIGEST_MISMATCH", `Path tree digest ${digest} does not match ${expectedDigest}`, { subjectId: id }));
    }
    if (id !== expectedId) {
        issues.push(issue("PATH_TREE_ID_MISMATCH", `Path tree id ${id} does not match its content address`, { subjectId: id }));
    }
    return { valid: issues.length === 0, issues };
}
export function parsePathTree(value) {
    const result = validatePathTree(value);
    if (!result.valid || !isRecord(value)) {
        throw new Error(`Invalid Metamap path tree: ${result.issues
            .map((entry) => `${entry.path ?? "$"} ${entry.message}`)
            .join("; ")}`);
    }
    return value;
}
function paramValue(name, params) {
    const bare = paramBareName(name);
    return (params[name] ??
        params[bare] ??
        params[`:${bare}`] ??
        params[`*${bare}`] ??
        params[`*${bare}?`]);
}
function isUnsafeParamValue(value, delimiter, token) {
    if (value.length === 0)
        return true;
    if (/\s|[?#]/.test(value))
        return true;
    if (delimiter !== "/" && value.includes(delimiter))
        return true;
    if (!isCatchAllParam(token) && value.includes("/"))
        return true;
    return false;
}
function collapseHydratedPath(path, delimiter) {
    const root = delimiter === "/" ? "/" : delimiter;
    if (delimiter === "/") {
        let collapsed = path.replace(/\/{2,}/g, "/");
        if (collapsed.length > 1 && collapsed.endsWith("/")) {
            collapsed = collapsed.slice(0, -1);
        }
        return collapsed.length === 0 ? root : collapsed;
    }
    const parts = path.split(delimiter).filter((part) => part.length > 0);
    return parts.length === 0 ? root : `${delimiter}${parts.join(delimiter)}`;
}
function substitutePath(path, params, delimiter) {
    const tokens = [...new Set(path.match(PATH_PARAM_TOKEN) ?? [])].sort((left, right) => right.length - left.length);
    let hydrated = path;
    for (const token of tokens) {
        const value = paramValue(token, params);
        if (value === undefined) {
            if (isOptionalParam(token)) {
                hydrated = hydrated.split(token).join("");
                continue;
            }
            return { missing: token };
        }
        if (isUnsafeParamValue(value, delimiter, token))
            return { unsafe: token };
        hydrated = hydrated.split(token).join(value);
    }
    return { path: collapseHydratedPath(hydrated, delimiter) };
}
function hydrateNode(node, params, delimiter) {
    const hydrated = { _: node._ };
    const substitution = substitutePath(node._, params, delimiter);
    if (substitution.missing) {
        throw new Error(`Missing path parameter ${substitution.missing}`);
    }
    if (substitution.unsafe) {
        throw new Error(`Unsafe value for path parameter ${substitution.unsafe}`);
    }
    hydrated._ = substitution.path ?? node._;
    if (node.$)
        hydrated.$ = structuredClone(node.$);
    for (const [key, value] of Object.entries(node)) {
        if (key === "_" || key === "$")
            continue;
        if (isRecord(value) && typeof value._ === "string") {
            hydrated[key] = hydrateNode(value, params, delimiter);
        }
    }
    return hydrated;
}
/**
 * Replace `:param`, `*param`, and optional `*param?` tokens in `_` path
 * templates. Child keys and `$` occupants stay immutable. The input tree is
 * not mutated.
 */
export function hydratePathTree(tree, params, options = {}) {
    const delimiter = options.delimiter ?? "/";
    const required = (options.requiredParams ?? collectParams(tree)).filter((name) => !isOptionalParam(name));
    for (const name of required) {
        if (paramValue(name, params) === undefined) {
            throw new Error(`Missing path parameter ${name}`);
        }
        const value = paramValue(name, params);
        if (value !== undefined && isUnsafeParamValue(value, delimiter, name)) {
            throw new Error(`Unsafe value for path parameter ${name}`);
        }
    }
    return hydrateNode(structuredClone(tree), params, delimiter);
}
/** Emit a dependency-free nested path tree with a hydrate helper. */
export function emitTypeScriptPathTree(pathTree, options = {}) {
    const exportName = options.exportName ?? "pathTree";
    validateExportName(exportName);
    const typeName = `${exportName[0].toUpperCase()}${exportName.slice(1)}`;
    const paramsName = `${exportName}Params`;
    const hydrateName = `hydrate${typeName}`;
    return (`/* Generated by Metamap from ${pathTree.id}. Do not edit. */\n` +
        `export const ${exportName} = ${stableJson(pathTree.tree, true).trimEnd()} as const;\n\n` +
        `export const ${paramsName} = ${stableJson(pathTree.params, true).trimEnd()} as const;\n\n` +
        `export type ${typeName}Param = (typeof ${paramsName})[number];\n\n` +
        `export function ${hydrateName}(\n` +
        `  params: Record<string, string>,\n` +
        `  tree: typeof ${exportName} = ${exportName},\n` +
        `): typeof ${exportName} {\n` +
        `  const delimiter = ${JSON.stringify(pathTree.delimiter)};\n` +
        `  const tokens = [...${paramsName}].sort((left, right) => right.length - left.length);\n` +
        `  const resolve = (name: string): string | undefined => {\n` +
        `    const bare = name.replace(/^[*:]/, "").replace(/\\?$/, "");\n` +
        `    return params[name] ?? params[bare] ?? params[\`:\${bare}\`] ?? params[\`*\${bare}\`] ?? params[\`*\${bare}?\`];\n` +
        `  };\n` +
        `  for (const name of tokens) {\n` +
        `    if (name.endsWith("?")) continue;\n` +
        `    const value = resolve(name);\n` +
        `    const catchAll = name.startsWith("*");\n` +
        `    if (value === undefined || value.length === 0 || /\\s|[?#]/.test(value) || (!catchAll && value.includes("/")) || (delimiter !== "/" && value.includes(delimiter))) {\n` +
        `      throw new Error(\`Missing or unsafe path parameter \${name}\`);\n` +
        `    }\n` +
        `  }\n` +
        `  const collapse = (path: string): string => {\n` +
        `    if (delimiter === "/") {\n` +
        `      let next = path.replace(/\\/{2,}/g, "/");\n` +
        `      if (next.length > 1 && next.endsWith("/")) next = next.slice(0, -1);\n` +
        `      return next.length === 0 ? "/" : next;\n` +
        `    }\n` +
        `    const parts = path.split(delimiter).filter((part) => part.length > 0);\n` +
        `    return parts.length === 0 ? delimiter : delimiter + parts.join(delimiter);\n` +
        `  };\n` +
        `  const hydrate = (node: Record<string, unknown>): Record<string, unknown> => {\n` +
        `    const next: Record<string, unknown> = {};\n` +
        `    for (const [key, value] of Object.entries(node)) {\n` +
        `      if (key === "_") {\n` +
        `        let path = String(value);\n` +
        `        for (const token of tokens) {\n` +
        `          const replacement = resolve(token);\n` +
        `          path = path.split(token).join(replacement ?? (token.endsWith("?") ? "" : token));\n` +
        `        }\n` +
        `        next[key] = collapse(path);\n` +
        `        continue;\n` +
        `      }\n` +
        `      if (key === "$" || value === null || typeof value !== "object") {\n` +
        `        next[key] = value;\n` +
        `        continue;\n` +
        `      }\n` +
        `      next[key] = hydrate(value as Record<string, unknown>);\n` +
        `    }\n` +
        `    return next;\n` +
        `  };\n` +
        `  return hydrate(tree) as typeof ${exportName};\n` +
        `}\n`);
}
//# sourceMappingURL=path-tree.js.map