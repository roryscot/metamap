import {
  readFile,
  realpath,
  mkdir,
  writeFile,
  rename,
  rm,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { format } from "prettier";

export const exampleRoot = fileURLToPath(new URL("./", import.meta.url));
const routingPackPath = fileURLToPath(
  new URL("../../../relation-packs/routing.json", import.meta.url),
);
const evaluatedAt = "2026-10-09T00:00:00.000Z";

export class BindingBuildError extends Error {
  constructor(issues) {
    super(issues.map((issue) => `${issue.code}: ${issue.message}`).join("; "));
    this.name = "BindingBuildError";
    this.issues = issues;
  }
}

function reject(code, message, subjectId) {
  throw new BindingBuildError([{ code, message, subjectId }]);
}

function requireSuccess(result) {
  if (result.status === "rejected") throw new BindingBuildError(result.issues);
  return result;
}

function within(root, path) {
  const child = relative(root, path);
  return (
    child === "" ||
    (!isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`))
  );
}

/** A deliberately narrow consumer profile, never executed by the generic kernel. */
async function readNativeInput(root, entity, source) {
  const locators = (entity.locators ?? []).filter((locator) =>
    locator.uri.startsWith("javascript:"),
  );
  if (locators.length !== 1)
    reject(
      "INVALID_NATIVE_LOCATOR",
      "Expected one JavaScript locator",
      entity.id,
    );
  const locator = locators[0];
  const match = /^javascript:([^#]+)#([A-Za-z_$][A-Za-z0-9_$]*)$/.exec(
    locator.uri,
  );
  if (
    !match ||
    !match[1].endsWith(".mjs") ||
    /[%\\\u0000-\u001f]/.test(match[1])
  ) {
    reject(
      "INVALID_NATIVE_LOCATOR",
      "Expected a plain .mjs path and named export",
      entity.id,
    );
  }
  const rootPath = await realpath(root);
  const ownedPath = resolve(root, source.ownedDirectory);
  const ownedRealPath = await realpath(ownedPath);
  const modulePath = resolve(root, match[1]);
  if (!within(rootPath, ownedRealPath) || !within(ownedPath, modulePath)) {
    reject(
      "NATIVE_LOCATOR_OUTSIDE_OWNER",
      "Native path escapes its owned source directory",
      entity.id,
    );
  }
  const moduleRealPath = await realpath(modulePath);
  if (!within(ownedRealPath, moduleRealPath)) {
    reject(
      "NATIVE_LOCATOR_OUTSIDE_OWNER",
      "Native symlink escapes its owned source directory",
      entity.id,
    );
  }
  return {
    entity,
    path: relative(root, modulePath).split(sep).join("/"),
    exportName: match[2],
    locator,
    bytes: await readFile(moduleRealPath),
  };
}

function validateNativeInput(input, kernel) {
  if (!Buffer.from(input.bytes.toString("utf8"), "utf8").equals(input.bytes)) {
    reject(
      "INVALID_NATIVE_MODULE",
      "This example profile requires valid UTF-8 module bytes",
      input.entity.id,
    );
  }
  if (input.locator.digest !== kernel.contentDigest(input.bytes)) {
    reject(
      "NATIVE_INPUT_DIGEST_MISMATCH",
      "Owner's native byte digest does not match",
      input.entity.id,
    );
  }
  const ast = ts.createSourceFile(
    input.path,
    input.bytes.toString("utf8"),
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.JS,
  );
  if (ast.parseDiagnostics.length !== 0)
    reject(
      "INVALID_NATIVE_MODULE",
      "Native module has syntax errors",
      input.entity.id,
    );
  let importsCode = false;
  const visit = (node) => {
    if (
      ts.isImportDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      (ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require")))
    )
      importsCode = true;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (importsCode)
    reject(
      "UNSUPPORTED_NATIVE_MODULE",
      "This example profile requires self-contained modules",
      input.entity.id,
    );
  const exported = ast.statements.some(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === input.exportName &&
      node.body !== undefined &&
      node.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      ) &&
      !node.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
      ),
  );
  if (!exported)
    reject(
      "UNRESOLVED_NATIVE_EXPORT",
      `Missing named function ${input.exportName}`,
      input.entity.id,
    );
}

/** Reuse the existing shard adapter and byte-input receipt shape. */
function ownedShardAdapter(kernel) {
  const shardAdapter = new kernel.MetamapShardAdapter();
  const discover = async (source, context) => {
    const result = await shardAdapter.discover(
      { ...source, adapter: "metamap-shard" },
      context,
    );
    const nativeInputs = new Map();
    for (const entity of result.document.entities) {
      if (
        !(entity.locators ?? []).some((locator) =>
          locator.uri.startsWith("javascript:"),
        )
      )
        continue;
      const input = await readNativeInput(
        context.repositoryRoot,
        entity,
        source,
      );
      nativeInputs.set(input.path, {
        path: input.path,
        digest: kernel.contentDigest(input.bytes),
      });
    }
    return {
      ...result,
      adapter: "owned-routing-shard",
      inputs: [...result.inputs, ...nativeInputs.values()],
    };
  };
  return {
    id: "owned-routing-shard",
    version: "1.0.0",
    fingerprint: async (source, context) =>
      (await discover(source, context)).inputs,
    discover,
  };
}

function coverageRecords(discovery, sources) {
  const records = [];
  for (const adapter of discovery.adapters) {
    const source = sources.find((entry) => entry.id === adapter.sourceId);
    const usedExclusions = new Set();
    for (const entity of adapter.document.entities) {
      const requirement = (source.coverage ?? []).find(
        (item) => item.kind === entity.kind,
      );
      if (!requirement) continue;
      const mappings = discovery.graph.mappings.filter(
        (mapping) =>
          mapping.relation === requirement.relation &&
          mapping.targets.includes(entity.id),
      );
      const exclusion = (source.exclusions ?? []).find(
        (item) =>
          item.entity === entity.id && item.relation === requirement.relation,
      );
      if (exclusion) {
        if (
          mappings.length !== 0 ||
          exclusion.assertedBy !== source.owner ||
          !exclusion.reason?.trim()
        ) {
          reject(
            "INVALID_OWNED_EXCLUSION",
            "Exclusion requires the declared owner, a reason, and no matching binding",
            entity.id,
          );
        }
        usedExclusions.add(exclusion);
      } else if (mappings.length === 0) {
        reject(
          "UNMAPPED_OWNED_LEAF",
          `Owned ${entity.kind} has no ${requirement.relation} binding or consumer-reviewed exclusion`,
          entity.id,
        );
      }
      records.push({
        sourceId: source.id,
        owner: source.owner,
        entityId: entity.id,
        relation: requirement.relation,
        mappings: mappings.map((item) => item.id),
        ...(exclusion ? { exclusion } : {}),
      });
    }
    if (usedExclusions.size !== (source.exclusions ?? []).length) {
      reject(
        "STALE_OWNED_EXCLUSION",
        "An exclusion is duplicate, missing, or outside the configured source coverage",
        source.id,
      );
    }
  }
  return records;
}

async function renderConsumer(projection, nativeInputs, kernel) {
  const imports = [];
  const entries = [];
  const endpointKeys = new Set();
  const files = {};
  const runtimeArtifacts = [];
  for (const [index, entry] of projection.entries.entries()) {
    const target = (name) =>
      entry.slots.find((slot) => slot.name === name).targets[0];
    for (const name of ["handler", "input"]) {
      const input = nativeInputs.get(target(name).id);
      if (!input)
        reject(
          "UNRESOLVED_NATIVE_INPUT",
          `No owned native input for ${name}`,
          target(name).id,
        );
      const digest = kernel.contentDigest(input.bytes);
      const artifactPath = `inputs/${input.path.slice(0, -4)}.${digest.slice(7)}.mjs`;
      if (!Object.hasOwn(files, artifactPath)) {
        files[artifactPath] = input.bytes.toString("utf8");
        runtimeArtifacts.push({
          path: artifactPath,
          digest,
          sourcePath: input.path,
        });
      }
      imports.push(
        `import { ${input.exportName} as ${name}${index} } from ${JSON.stringify(`./${artifactPath}`)};`,
      );
    }
    const endpoint = target("endpoint");
    const { method, path } = endpoint.attributes ?? {};
    if (
      typeof method !== "string" ||
      !/^[A-Z]+$/.test(method) ||
      typeof path !== "string" ||
      !path.startsWith("/") ||
      path.includes("\u0000")
    ) {
      reject(
        "INVALID_ENDPOINT_DESCRIPTOR",
        "Endpoint requires a method and absolute path",
        endpoint.id,
      );
    }
    const endpointKey = `${method} ${path}`;
    if (endpointKeys.has(endpointKey))
      reject(
        "AMBIGUOUS_NATIVE_ENDPOINT",
        `Repeated endpoint ${endpointKey}`,
        endpoint.id,
      );
    endpointKeys.add(endpointKey);
    const locators = {
      handler: nativeInputs.get(target("handler").id).locator.uri,
      input: nativeInputs.get(target("input").id).locator.uri,
    };
    entries.push(
      `${JSON.stringify(entry.subject.id)}: Object.freeze({ handler: handler${index}, input: input${index}, locators: Object.freeze(${JSON.stringify(locators)}), endpoint: Object.freeze(${JSON.stringify({ id: endpoint.id, method, path })}) })`,
    );
  }
  const ids = projection.entries.map((entry) => entry.subject.id);
  const module = `${imports.join("\n")}
export const bindingDigest = ${JSON.stringify(projection.digest)};
export const bindings = Object.freeze({ ${entries.join(",\n")} });
export function invoke(id, input) {
  if (!Object.hasOwn(bindings, id)) throw new Error("UNKNOWN_OPERATION");
  const binding = bindings[id];
  return binding.handler(binding.input(input));
}
export function handleRequest(method, path, input) {
  const id = Object.keys(bindings).find((key) => bindings[key].endpoint.method === method && bindings[key].endpoint.path === path);
  if (id === undefined) throw new Error("UNKNOWN_ENDPOINT");
  return invoke(id, input);
}
`;
  const declaration = `export type OperationId = ${ids.length === 0 ? "never" : ids.map((id) => JSON.stringify(id)).join(" | ")};
export declare const bindingDigest: string;
export declare const bindings: Readonly<Record<OperationId, Readonly<{handler: (input: unknown) => unknown; input: (input: unknown) => unknown; endpoint: Readonly<{id: string; method: string; path: string}>}>>>;
export declare function invoke(id: OperationId, input: unknown): unknown;
export declare function handleRequest(method: string, path: string, input: unknown): unknown;
`;
  return {
    runtimeArtifacts,
    files: {
      ...files,
      "consumer.mjs": await format(module, { parser: "babel" }),
      "consumer.d.mts": await format(declaration, { parser: "typescript" }),
    },
  };
}

export async function prepareBindings(root = exampleRoot, options = {}) {
  const kernel = options.kernel ?? (await import("../../../dist/index.js"));
  const loaded = await kernel.loadMetamapConfig(
    resolve(root, "metamap.config.json"),
  );
  const registry = new kernel.RelationRegistry();
  registry.registerPack(JSON.parse(await readFile(routingPackPath, "utf8")));
  const adapters = new kernel.AdapterRegistry().register(
    ownedShardAdapter(kernel),
  );
  let discovery;
  try {
    discovery = await kernel.discoverWorkspace(loaded, {
      useCache: false,
      adapterRegistry: adapters,
      relationRegistry: registry,
    });
  } catch (error) {
    if (error instanceof kernel.MetamapCompositionError)
      reject("SHARD_COMPOSITION_CONFLICT", error.message, error.identifier);
    throw error;
  }
  const template = JSON.parse(
    await readFile(resolve(root, "consumer/viability-template.json"), "utf8"),
  );
  if (
    template.templateVersion !== "1.0.0" ||
    template.graphId !== discovery.graph.id ||
    Object.hasOwn(template.policy, "graph")
  ) {
    reject(
      "INVALID_CONSUMER_POLICY_TEMPLATE",
      "Expected a versioned consumer template for this graph",
    );
  }
  const policy = {
    ...template.policy,
    graph: {
      id: template.graphId,
      digest: kernel.valueDigest(discovery.graph),
    },
  };
  const spec = JSON.parse(
    await readFile(resolve(root, "consumer/projection.json"), "utf8"),
  );
  const compilation = requireSuccess(
    kernel.compileMetamap(discovery.graph, policy, {
      context: options.context ?? { environment: "production" },
      evaluatedAt,
      relationRegistry: registry,
    }),
  );
  const projected = requireSuccess(
    kernel.compileProjection(discovery.graph, compilation.generation, spec, {
      relationRegistry: registry,
    }),
  );
  if (projected.projection.entries.length === 0)
    reject(
      "EMPTY_CONSUMER_SELECTION",
      "No operations selected by the consumer",
    );
  const coverage = coverageRecords(discovery, loaded.config.sources);
  const nativeInputs = new Map();
  for (const adapter of discovery.adapters) {
    const source = loaded.config.sources.find(
      (entry) => entry.id === adapter.sourceId,
    );
    for (const entity of adapter.document.entities) {
      if (
        !(entity.locators ?? []).some((locator) =>
          locator.uri.startsWith("javascript:"),
        )
      )
        continue;
      const input = await readNativeInput(root, entity, source);
      validateNativeInput(input, kernel);
      nativeInputs.set(entity.id, input);
    }
  }
  const { files, runtimeArtifacts } = await renderConsumer(
    projected.projection,
    nativeInputs,
    kernel,
  );
  const report = {
    status: "admitted",
    authorization: "legacy-ungoverned",
    policy,
    generation: compilation.generation,
    projection: projected.projection,
    snapshot: discovery.snapshot,
    coverage,
    runtimeArtifacts,
  };
  files["build.json"] = await format(kernel.stableJson(report, true), {
    parser: "json",
  });
  return { ...report, graph: discovery.graph, registry, files };
}

/** Validate every candidate before replacing any accepted consumer artifact. */
export async function generateBindings(root = exampleRoot, options = {}) {
  const prepared = await prepareBindings(root, options);
  const output = resolve(root, "generated");
  await mkdir(output, { recursive: true });
  // Verify previously captured code before writing any accepted consumer file.
  for (const artifact of prepared.runtimeArtifacts) {
    try {
      const bytes = await readFile(resolve(output, artifact.path));
      if (prepared.files[artifact.path] !== bytes.toString("utf8"))
        reject(
          "NATIVE_ARTIFACT_COLLISION",
          "Previously captured runtime bytes were altered",
          artifact.path,
        );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  // Each file replacement is atomic; governed multi-artifact promotion belongs to M4.
  for (const [name, content] of Object.entries(prepared.files)) {
    const target = resolve(output, name);
    await mkdir(dirname(target), { recursive: true });
    if (name.startsWith("inputs/")) {
      try {
        await writeFile(target, content, { encoding: "utf8", flag: "wx" });
      } catch (error) {
        if (
          error.code !== "EEXIST" ||
          (await readFile(target, "utf8")) !== content
        )
          throw error;
      }
      continue;
    }
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, content, "utf8");
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return prepared;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const built = await generateBindings();
  const consumer = await import(
    pathToFileURL(resolve(exampleRoot, "generated/consumer.mjs")).href
  );
  const result = consumer.handleRequest("POST", "/users", { name: "Ada" });
  process.stdout.write(
    `${JSON.stringify({ status: built.status, operationIds: Object.keys(consumer.bindings), result })}\n`,
  );
}
