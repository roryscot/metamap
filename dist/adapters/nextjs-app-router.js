import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";
import { APPLICATION_TOPOLOGY_RELATION_PACK_ID, APPLICATION_TOPOLOGY_RELATION_PACK_VERSION, CORE_RELATION_PACK_ID, CORE_RELATION_PACK_VERSION, METAMAP_SCHEMA_VERSION, } from "../model.js";
import { makeRepositoryUri, makeUrn } from "../references.js";
import { contentDigest, valueDigest } from "../stable.js";
const ADAPTER_VERSION = "1.1.0";
const DEFAULT_EXTENSIONS = ["ts", "tsx", "js", "jsx"];
const SPECIAL_ROLES = new Set([
    "page",
    "layout",
    "template",
    "route",
    "loading",
    "error",
    "global-error",
    "not-found",
    "default",
]);
const HTTP_METHODS = new Set([
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
]);
const LOADER_CALL_KINDS = new Map([
    ["fetch", "fetch"],
    ["useQuery", "query"],
    ["useInfiniteQuery", "query"],
    ["useSuspenseQuery", "query"],
    ["useSWR", "query"],
    ["useSWRInfinite", "query"],
]);
const LOADER_EXPORT_KINDS = new Map([
    ["generateStaticParams", "static-params"],
    ["generateMetadata", "metadata"],
]);
function jsonAttributes(value) {
    return value;
}
function normalized(path) {
    return path.replaceAll("\\", "/").replace(/^\.\//, "");
}
function entityId(namespace, sourceId, kind, key) {
    return makeUrn(namespace, kind, `${sourceId}:${key || "root"}`);
}
function mappingId(namespace, sourceId, relation, key) {
    return makeUrn(namespace, "mapping", `${sourceId}:${relation.replace(":", "-")}:${key}`);
}
function directoryKey(path) {
    return normalized(path) || ".";
}
function segmentKind(segment) {
    if (/^\[\[\.\.\..+\]\]$/.test(segment))
        return "optional-catch-all";
    if (/^\[\.\.\..+\]$/.test(segment))
        return "catch-all";
    if (/^\[[^\]]+\]$/.test(segment))
        return "dynamic";
    if (segment.startsWith("@"))
        return "parallel";
    if (/^\(.+\)$/.test(segment))
        return "group";
    if (/^\((?:\.|\.\.|\.\.\.)+\)/.test(segment))
        return "intercepted";
    return "static";
}
function urlSegment(segment) {
    const kind = segmentKind(segment);
    if (kind === "group" || kind === "parallel")
        return undefined;
    if (kind === "dynamic")
        return `:${segment.slice(1, -1)}`;
    if (kind === "catch-all")
        return `*${segment.slice(4, -1)}`;
    if (kind === "optional-catch-all")
        return `*${segment.slice(5, -2)}?`;
    if (kind === "intercepted")
        return segment.replace(/^\((?:\.|\.\.|\.\.\.)+\)/, "");
    return segment;
}
function routePath(directoryPath) {
    const segments = normalized(directoryPath)
        .split("/")
        .filter(Boolean)
        .map(urlSegment)
        .filter((entry) => entry !== undefined && entry !== "");
    return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}
function dynamicParameters(directoryPath) {
    const parameters = [];
    for (const segment of normalized(directoryPath).split("/").filter(Boolean)) {
        const kind = segmentKind(segment);
        if (kind === "dynamic") {
            parameters.push({
                name: segment.slice(1, -1),
                cardinality: "one",
                optional: false,
            });
        }
        else if (kind === "catch-all") {
            parameters.push({
                name: segment.slice(4, -1),
                cardinality: "many",
                optional: false,
            });
        }
        else if (kind === "optional-catch-all") {
            parameters.push({
                name: segment.slice(5, -2),
                cardinality: "many",
                optional: true,
            });
        }
    }
    return parameters;
}
function hasExportModifier(node) {
    return (node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true);
}
function sourceObservations(source, path) {
    const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const client = sourceFile.statements.some((statement) => ts.isExpressionStatement(statement) &&
        ts.isStringLiteral(statement.expression) &&
        statement.expression.text === "use client");
    const methods = new Set();
    const imports = new Map();
    const loaders = new Map();
    const loaderCalls = new Map(LOADER_CALL_KINDS);
    const observeLoader = (kind, name, node) => {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const line = position.line + 1;
        const column = position.character + 1;
        loaders.set(`${kind}:${name}:${line}:${column}`, {
            kind,
            name,
            line,
            column,
        });
    };
    for (const statement of sourceFile.statements) {
        if (ts.isImportDeclaration(statement) &&
            ts.isStringLiteral(statement.moduleSpecifier)) {
            const module = statement.moduleSpecifier.text;
            const clause = statement.importClause;
            if (clause?.name) {
                imports.set(clause.name.text, { exportedName: "default", module });
                if (module === "swr")
                    loaderCalls.set(clause.name.text, "query");
            }
            const bindings = clause?.namedBindings;
            if (bindings && ts.isNamedImports(bindings)) {
                for (const element of bindings.elements) {
                    imports.set(element.name.text, {
                        exportedName: element.propertyName?.text ?? element.name.text,
                        module,
                    });
                    const loaderKind = LOADER_CALL_KINDS.get(element.propertyName?.text ?? element.name.text);
                    if (loaderKind)
                        loaderCalls.set(element.name.text, loaderKind);
                }
            }
        }
        if (ts.isFunctionDeclaration(statement) &&
            statement.name &&
            hasExportModifier(statement)) {
            const name = statement.name.text;
            if (HTTP_METHODS.has(name))
                methods.add(name);
            const loaderKind = LOADER_EXPORT_KINDS.get(name);
            if (loaderKind)
                observeLoader(loaderKind, name, statement.name);
        }
        if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
            for (const declaration of statement.declarationList.declarations) {
                if (ts.isIdentifier(declaration.name) &&
                    HTTP_METHODS.has(declaration.name.text)) {
                    methods.add(declaration.name.text);
                }
                if (ts.isIdentifier(declaration.name)) {
                    const name = declaration.name.text;
                    const loaderKind = LOADER_EXPORT_KINDS.get(name);
                    if (loaderKind)
                        observeLoader(loaderKind, name, declaration.name);
                }
            }
        }
    }
    const providers = new Map();
    const visit = (node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
            const tag = node.tagName.getText(sourceFile);
            const localName = tag.split(".").at(-1) ?? tag;
            if (localName.endsWith("Provider")) {
                const imported = imports.get(localName);
                const position = sourceFile.getLineAndCharacterOfPosition(node.tagName.getStart(sourceFile));
                const line = position.line + 1;
                const column = position.character + 1;
                providers.set(`${imported?.module ?? path}:${localName}:${line}:${column}`, {
                    localName,
                    exportedName: imported?.exportedName ?? localName,
                    module: imported?.module ?? path,
                    line,
                    column,
                });
            }
        }
        if (ts.isCallExpression(node)) {
            const expression = node.expression;
            const name = ts.isIdentifier(expression)
                ? expression.text
                : ts.isPropertyAccessExpression(expression)
                    ? expression.name.text
                    : undefined;
            const loaderKind = name
                ? ts.isPropertyAccessExpression(expression) && name === "fetch"
                    ? undefined
                    : loaderCalls.get(name)
                : undefined;
            if (name && loaderKind)
                observeLoader(loaderKind, name, expression);
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return {
        client,
        methods: [...methods].sort(),
        providers: [...providers.values()].sort((left, right) => `${left.line.toString().padStart(8, "0")}:${left.column.toString().padStart(8, "0")}:${left.module}:${left.localName}`.localeCompare(`${right.line.toString().padStart(8, "0")}:${right.column.toString().padStart(8, "0")}:${right.module}:${right.localName}`)),
        loaders: [...loaders.values()].sort((left, right) => `${left.line.toString().padStart(8, "0")}:${left.column.toString().padStart(8, "0")}:${left.kind}:${left.name}`.localeCompare(`${right.line.toString().padStart(8, "0")}:${right.column.toString().padStart(8, "0")}:${right.kind}:${right.name}`)),
    };
}
async function collectFiles(config, context) {
    const root = resolve(context.repositoryRoot, config.root);
    const extensions = new Set(config.extensions ?? DEFAULT_EXTENSIONS);
    const files = [];
    const visit = async (directory) => {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
            const absolutePath = resolve(directory, entry.name);
            if (entry.isDirectory()) {
                await visit(absolutePath);
                continue;
            }
            if (!entry.isFile())
                continue;
            const dot = entry.name.lastIndexOf(".");
            if (dot <= 0)
                continue;
            const role = entry.name.slice(0, dot);
            const extension = entry.name.slice(dot + 1);
            if (!SPECIAL_ROLES.has(role) || !extensions.has(extension))
                continue;
            files.push({
                absolutePath,
                relativePath: normalized(relative(root, absolutePath)),
            });
        }
    };
    await visit(root);
    return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}
async function observeFiles(config, context) {
    const configured = new Map();
    const diagnostics = [];
    for (const exclusion of config.exclusions ?? []) {
        const path = normalized(exclusion.path);
        if (configured.has(path)) {
            diagnostics.push({
                severity: "error",
                code: "DUPLICATE_TOPOLOGY_EXCLUSION",
                message: `Topology exclusion ${path} is declared more than once`,
                path,
            });
        }
        configured.set(path, exclusion);
    }
    const observations = [];
    for (const file of await collectFiles(config, context)) {
        const source = await readFile(file.absolutePath, "utf8");
        const name = file.relativePath.split("/").at(-1) ?? file.relativePath;
        const dot = name.lastIndexOf(".");
        const repositoryPath = normalized(relative(context.repositoryRoot, file.absolutePath));
        const parsed = sourceObservations(source, repositoryPath);
        observations.push({
            ...file,
            repositoryPath,
            directoryPath: normalized(dirname(file.relativePath)).replace(/^\.$/, ""),
            role: name.slice(0, dot),
            extension: name.slice(dot + 1),
            digest: contentDigest(source),
            source,
            ...parsed,
            exclusion: configured.get(repositoryPath),
        });
        configured.delete(repositoryPath);
    }
    for (const [path] of configured) {
        diagnostics.push({
            severity: "error",
            code: "STALE_TOPOLOGY_EXCLUSION",
            message: `Topology exclusion ${path} does not match a discovered Next.js special file`,
            path,
        });
    }
    return { observations, diagnostics };
}
function addMapping(mappings, mapping) {
    if (!mappings.has(mapping.id))
        mappings.set(mapping.id, mapping);
}
function structureAttributes(config, observation, extra = {}) {
    return jsonAttributes({
        adapter: "nextjs-app-router",
        sourceId: config.id,
        structureKind: observation.role,
        repositoryPath: observation.repositoryPath,
        routePath: routePath(observation.directoryPath),
        runtime: observation.client ? "client" : "server",
        ...extra,
        ...(observation.exclusion
            ? {
                topologyDisposition: "excluded",
                exclusionReason: observation.exclusion.reason,
                exclusionOwner: observation.exclusion.assertedBy,
                exclusionRelations: observation.exclusion.relations ?? [
                    "topology:implemented_by",
                ],
            }
            : {}),
    });
}
/**
 * Deterministically discovers the structural surface of a Next.js App Router.
 * It observes framework facts only; semantic route equivalence and context
 * requirements remain explicit overlays owned by the consuming application.
 */
export class NextjsAppRouterAdapter {
    id = "nextjs-app-router";
    version = ADAPTER_VERSION;
    async fingerprint(config, context) {
        const { observations } = await observeFiles(config, context);
        return observations.map((entry) => ({
            path: entry.repositoryPath,
            digest: entry.digest,
        }));
    }
    async discover(config, context) {
        const { observations, diagnostics } = await observeFiles(config, context);
        const inputs = observations.map((entry) => ({
            path: entry.repositoryPath,
            digest: entry.digest,
        }));
        const provenance = {
            status: "observed",
            assertedBy: `adapter:${this.id}@${this.version}`,
            sourceRevision: valueDigest(inputs),
        };
        const entities = new Map();
        const mappings = new Map();
        const applicationId = entityId(context.namespace, config.id, "topology-application", "application");
        const rootSegmentId = entityId(context.namespace, config.id, "topology-segment", ".");
        entities.set(applicationId, {
            id: applicationId,
            kind: "topology:application",
            label: config.id,
            locators: [
                {
                    uri: makeRepositoryUri(config.root, context.repository),
                    mediaType: "inode/directory",
                },
            ],
            attributes: jsonAttributes({
                adapter: this.id,
                sourceId: config.id,
                structureKind: "application",
                framework: "nextjs-app-router",
            }),
            provenance,
        });
        const ensureSegment = (directoryPath) => {
            const key = directoryKey(directoryPath);
            const id = entityId(context.namespace, config.id, "topology-segment", key);
            if (entities.has(id))
                return id;
            const name = key === "." ? "root" : (key.split("/").at(-1) ?? key);
            entities.set(id, {
                id,
                kind: "topology:segment",
                label: name,
                attributes: jsonAttributes({
                    adapter: this.id,
                    sourceId: config.id,
                    structureKind: "segment",
                    segmentKind: key === "." ? "root" : segmentKind(name),
                    segment: name,
                    routePath: routePath(directoryPath),
                }),
                provenance,
            });
            if (key === ".")
                return id;
            const parentPath = normalized(dirname(directoryPath)).replace(/^\.$/, "");
            const parentId = ensureSegment(parentPath);
            if (name.startsWith("@")) {
                const outletId = entityId(context.namespace, config.id, "topology-outlet", key);
                entities.set(outletId, {
                    id: outletId,
                    kind: "topology:outlet",
                    label: name.slice(1),
                    attributes: jsonAttributes({
                        adapter: this.id,
                        sourceId: config.id,
                        structureKind: "parallel-outlet",
                        name: name.slice(1),
                        routePath: routePath(parentPath),
                    }),
                    provenance,
                });
                addMapping(mappings, {
                    id: mappingId(context.namespace, config.id, "contains", `${directoryKey(parentPath)}:outlet:${name}`),
                    relation: "topology:contains",
                    sources: [parentId],
                    targets: [outletId],
                    cardinality: "one-to-one",
                    lossiness: "lossless",
                    provenance,
                });
                addMapping(mappings, {
                    id: mappingId(context.namespace, config.id, "contains", `${name}:segment:${key}`),
                    relation: "topology:contains",
                    sources: [outletId],
                    targets: [id],
                    cardinality: "one-to-one",
                    lossiness: "lossless",
                    provenance,
                });
            }
            else {
                addMapping(mappings, {
                    id: mappingId(context.namespace, config.id, "contains", `${directoryKey(parentPath)}:segment:${key}`),
                    relation: "topology:contains",
                    sources: [parentId],
                    targets: [id],
                    cardinality: "one-to-one",
                    lossiness: "lossless",
                    provenance,
                });
            }
            return id;
        };
        entities.set(rootSegmentId, {
            id: rootSegmentId,
            kind: "topology:segment",
            label: "root",
            attributes: jsonAttributes({
                adapter: this.id,
                sourceId: config.id,
                structureKind: "segment",
                segmentKind: "root",
                segment: "root",
                routePath: "/",
            }),
            provenance,
        });
        addMapping(mappings, {
            id: mappingId(context.namespace, config.id, "contains", "application:root"),
            relation: "topology:contains",
            sources: [applicationId],
            targets: [rootSegmentId],
            cardinality: "one-to-one",
            lossiness: "lossless",
            provenance,
        });
        const emitLoaders = (ownerId, ownerKey, observation) => {
            for (const loader of observation.loaders) {
                const loaderKey = `${observation.repositoryPath}:${loader.kind}:${loader.name}:${loader.line}:${loader.column}`;
                const loaderId = entityId(context.namespace, config.id, "topology-loader", loaderKey);
                entities.set(loaderId, {
                    id: loaderId,
                    kind: "topology:loader",
                    label: `${loader.name} at ${observation.repositoryPath}:${loader.line}:${loader.column}`,
                    locators: [
                        {
                            uri: `${makeRepositoryUri(observation.repositoryPath, context.repository)}#L${loader.line}C${loader.column}`,
                            mediaType: "text/typescript",
                            digest: observation.digest,
                        },
                    ],
                    attributes: structureAttributes(config, observation, {
                        structureKind: "loader",
                        loaderKind: loader.kind,
                        symbol: loader.name,
                        line: loader.line,
                        column: loader.column,
                    }),
                    provenance,
                });
                addMapping(mappings, {
                    id: mappingId(context.namespace, config.id, "loads", `${ownerKey}:${loaderKey}`),
                    relation: "topology:loads",
                    sources: [ownerId],
                    targets: [loaderId],
                    cardinality: "one-to-one",
                    lossiness: "lossless",
                    provenance,
                });
            }
        };
        const containers = [];
        const pages = [];
        for (const observation of observations) {
            const segmentId = ensureSegment(observation.directoryPath);
            if (observation.role === "route") {
                if (observation.methods.length === 0) {
                    diagnostics.push({
                        severity: "error",
                        code: "NEXT_ROUTE_METHOD_MISSING",
                        message: `${observation.repositoryPath} exports no supported HTTP method`,
                        path: observation.repositoryPath,
                    });
                }
                for (const method of observation.methods) {
                    const key = `${directoryKey(observation.directoryPath)}:${method}`;
                    const routeId = entityId(context.namespace, config.id, "next-route", key);
                    const handlerId = entityId(context.namespace, config.id, "next-handler", key);
                    const endpointId = entityId(context.namespace, config.id, "next-endpoint", key);
                    entities.set(routeId, {
                        id: routeId,
                        kind: "routing:route",
                        label: `${method} ${routePath(observation.directoryPath)}`,
                        attributes: structureAttributes(config, observation, {
                            topologySurface: "route-handler",
                            method,
                        }),
                        provenance,
                    });
                    entities.set(handlerId, {
                        id: handlerId,
                        kind: "routing:handler",
                        label: `${method} handler`,
                        locators: [
                            {
                                uri: `typescript:${observation.repositoryPath}#${method}`,
                                mediaType: "text/typescript",
                                digest: observation.digest,
                            },
                        ],
                        attributes: structureAttributes(config, observation, { method }),
                        provenance,
                    });
                    entities.set(endpointId, {
                        id: endpointId,
                        kind: "routing:endpoint",
                        label: `${method} ${routePath(observation.directoryPath)}`,
                        attributes: jsonAttributes({
                            adapter: this.id,
                            sourceId: config.id,
                            structureKind: "endpoint",
                            path: routePath(observation.directoryPath),
                            method,
                        }),
                        provenance,
                    });
                    addMapping(mappings, {
                        id: mappingId(context.namespace, config.id, "contains", `segment:${key}`),
                        relation: "topology:contains",
                        sources: [segmentId],
                        targets: [routeId],
                        cardinality: "one-to-one",
                        lossiness: "lossless",
                        provenance,
                    });
                    for (const [relation, target] of [
                        ["routing:handled_by", handlerId],
                        ["routing:exposed_as", endpointId],
                    ]) {
                        addMapping(mappings, {
                            id: mappingId(context.namespace, config.id, relation, key),
                            relation,
                            sources: [routeId],
                            targets: [target],
                            cardinality: "one-to-one",
                            lossiness: "lossless",
                            provenance,
                        });
                    }
                    emitLoaders(routeId, key, observation);
                }
                continue;
            }
            const kind = observation.role === "page"
                ? "topology:page"
                : observation.role === "layout" || observation.role === "template"
                    ? "topology:container"
                    : "topology:boundary";
            const key = `${directoryKey(observation.directoryPath)}:${observation.role}`;
            const id = entityId(context.namespace, config.id, kind.replace(":", "-"), key);
            entities.set(id, {
                id,
                kind,
                label: `${observation.role} ${routePath(observation.directoryPath)}`,
                locators: [
                    {
                        uri: makeRepositoryUri(observation.repositoryPath, context.repository),
                        mediaType: "text/typescript",
                        digest: observation.digest,
                    },
                ],
                attributes: structureAttributes(config, observation, {
                    ...(kind === "topology:boundary"
                        ? { boundaryKind: observation.role }
                        : {}),
                    ...(kind === "topology:page"
                        ? {
                            dynamic: dynamicParameters(observation.directoryPath).length > 0,
                        }
                        : {}),
                }),
                provenance,
            });
            addMapping(mappings, {
                id: mappingId(context.namespace, config.id, "contains", `segment:${key}`),
                relation: "topology:contains",
                sources: [segmentId],
                targets: [id],
                cardinality: "one-to-one",
                lossiness: "lossless",
                provenance,
            });
            if (kind === "topology:container") {
                containers.push({
                    id,
                    directoryPath: observation.directoryPath,
                    role: observation.role,
                });
            }
            else if (kind === "topology:page") {
                pages.push({ id, observation });
            }
            else {
                addMapping(mappings, {
                    id: mappingId(context.namespace, config.id, "fallback-for", key),
                    relation: "topology:fallback_for",
                    sources: [id],
                    targets: [segmentId],
                    cardinality: "one-to-one",
                    lossiness: "lossless",
                    provenance,
                });
            }
            if (observation.client &&
                ["topology:page", "topology:container", "topology:boundary"].includes(kind)) {
                const hydrationId = entityId(context.namespace, config.id, "hydration-boundary", key);
                entities.set(hydrationId, {
                    id: hydrationId,
                    kind: "topology:hydration-boundary",
                    label: `Hydration boundary for ${observation.repositoryPath}`,
                    locators: [
                        {
                            uri: makeRepositoryUri(observation.repositoryPath, context.repository),
                            mediaType: "text/typescript",
                            digest: observation.digest,
                        },
                    ],
                    attributes: structureAttributes(config, observation, {
                        structureKind: "hydration-boundary",
                    }),
                    provenance,
                });
                addMapping(mappings, {
                    id: mappingId(context.namespace, config.id, "contains", `hydration:${key}`),
                    relation: "topology:contains",
                    sources: [segmentId],
                    targets: [hydrationId],
                    cardinality: "one-to-one",
                    lossiness: "lossless",
                    provenance,
                });
                addMapping(mappings, {
                    id: mappingId(context.namespace, config.id, "hydrates", key),
                    relation: "topology:hydrates",
                    sources: [hydrationId],
                    targets: [id],
                    cardinality: "one-to-one",
                    lossiness: "lossless",
                    provenance,
                });
            }
            for (const provider of observation.providers) {
                const providerKey = `${provider.module}:${provider.exportedName}`;
                const mountKey = `${observation.repositoryPath}:${providerKey}:${provider.line}:${provider.column}`;
                const providerId = entityId(context.namespace, config.id, "context-provider", mountKey);
                const contextId = entityId(context.namespace, config.id, "context", providerKey);
                entities.set(providerId, {
                    id: providerId,
                    kind: "topology:context-provider",
                    label: provider.localName,
                    locators: [
                        {
                            uri: `${makeRepositoryUri(observation.repositoryPath, context.repository)}#L${provider.line}C${provider.column}`,
                            mediaType: "text/typescript",
                            digest: observation.digest,
                        },
                        {
                            uri: `typescript:${provider.module}#${provider.exportedName}`,
                            mediaType: "text/typescript",
                        },
                    ],
                    attributes: jsonAttributes({
                        adapter: this.id,
                        sourceId: config.id,
                        structureKind: "context-provider-mount",
                        module: provider.module,
                        symbol: provider.exportedName,
                        repositoryPath: observation.repositoryPath,
                        line: provider.line,
                        column: provider.column,
                    }),
                    provenance,
                });
                entities.set(contextId, {
                    id: contextId,
                    kind: "topology:context",
                    label: provider.localName.replace(/Provider$/, ""),
                    attributes: jsonAttributes({
                        adapter: this.id,
                        sourceId: config.id,
                        structureKind: "context",
                        module: provider.module,
                        symbol: provider.exportedName,
                    }),
                    provenance,
                });
                addMapping(mappings, {
                    id: mappingId(context.namespace, config.id, "hosts-provider", `${key}:${mountKey}`),
                    relation: "topology:hosts_provider",
                    sources: [id],
                    targets: [providerId],
                    cardinality: "one-to-one",
                    lossiness: "lossless",
                    provenance,
                });
                addMapping(mappings, {
                    id: mappingId(context.namespace, config.id, "provides-context", mountKey),
                    relation: "topology:provides_context",
                    sources: [providerId],
                    targets: [contextId],
                    cardinality: "one-to-one",
                    lossiness: "lossless",
                    provenance,
                });
            }
            emitLoaders(id, key, observation);
        }
        const containerRank = (entry) => `${entry.directoryPath.split("/").filter(Boolean).length.toString().padStart(6, "0")}:${entry.directoryPath}:${entry.role === "layout" ? "0" : "1"}`;
        for (const page of pages) {
            const ancestors = containers
                .filter((container) => {
                const prefix = normalized(container.directoryPath);
                const pageDirectory = normalized(page.observation.directoryPath);
                return (prefix === "" ||
                    pageDirectory === prefix ||
                    pageDirectory.startsWith(`${prefix}/`));
            })
                .sort((left, right) => containerRank(left).localeCompare(containerRank(right)));
            for (let index = 1; index < ancestors.length; index += 1) {
                const parent = ancestors[index - 1];
                const child = ancestors[index];
                addMapping(mappings, {
                    id: mappingId(context.namespace, config.id, "wraps", `${parent.id}:${child.id}`),
                    relation: "topology:wraps",
                    sources: [parent.id],
                    targets: [child.id],
                    cardinality: "one-to-one",
                    lossiness: "lossless",
                    provenance,
                });
            }
            const nearest = ancestors.at(-1);
            if (nearest) {
                addMapping(mappings, {
                    id: mappingId(context.namespace, config.id, "wraps", `${nearest.id}:${page.id}`),
                    relation: "topology:wraps",
                    sources: [nearest.id],
                    targets: [page.id],
                    cardinality: "one-to-one",
                    lossiness: "lossless",
                    provenance,
                });
                addMapping(mappings, {
                    id: mappingId(context.namespace, config.id, "rendered-in", page.id),
                    relation: "topology:rendered_in",
                    sources: [page.id],
                    targets: [nearest.id],
                    cardinality: "one-to-one",
                    lossiness: "lossless",
                    provenance,
                });
            }
            const parameters = dynamicParameters(page.observation.directoryPath);
            if (parameters.length > 0) {
                const schemaId = entityId(context.namespace, config.id, "route-parameter-schema", directoryKey(page.observation.directoryPath));
                entities.set(schemaId, {
                    id: schemaId,
                    kind: "routing:schema",
                    label: `Parameters for ${routePath(page.observation.directoryPath)}`,
                    attributes: jsonAttributes({
                        adapter: this.id,
                        sourceId: config.id,
                        structureKind: "route-parameter-schema",
                        routePath: routePath(page.observation.directoryPath),
                        parameters,
                    }),
                    provenance,
                });
                addMapping(mappings, {
                    id: mappingId(context.namespace, config.id, "parameterized-by", page.id),
                    relation: "topology:parameterized_by",
                    sources: [page.id],
                    targets: [schemaId],
                    cardinality: "one-to-one",
                    lossiness: "lossless",
                    provenance,
                });
            }
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
                label: `Next.js App Router topology: ${config.id}`,
                revision: valueDigest(inputs),
                relationPacks: [
                    { id: CORE_RELATION_PACK_ID, version: CORE_RELATION_PACK_VERSION },
                    { id: "urn:metamap:relation-pack:routing", version: "1.0.0" },
                    {
                        id: APPLICATION_TOPOLOGY_RELATION_PACK_ID,
                        version: APPLICATION_TOPOLOGY_RELATION_PACK_VERSION,
                    },
                ],
                entities: [...entities.values()].sort((left, right) => left.id.localeCompare(right.id)),
                mappings: [...mappings.values()].sort((left, right) => left.id.localeCompare(right.id)),
                authorities: [],
                metadata: jsonAttributes({
                    adapter: this.id,
                    adapterVersion: this.version,
                    sourceId: config.id,
                    applicationId,
                    rootSegmentId,
                    discoveredFiles: observations.length,
                    excludedFiles: observations.filter((entry) => entry.exclusion).length,
                }),
            },
        };
    }
}
export const nextjsAppRouterAdapterVersion = ADAPTER_VERSION;
//# sourceMappingURL=nextjs-app-router.js.map