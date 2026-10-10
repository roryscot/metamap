import {
  cp,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import * as kernel from "../index.js";
import {
  BindingBuildError,
  exampleRoot,
  generateBindings,
  type BindingBuildResult,
} from "../../examples/routing/bindings/build.mjs";

const operation = "urn:bindings:command:create-user";
const handler = "urn:bindings:handler:create-user";
const directories: string[] = [];
const corpus = JSON.parse(
  await readFile(
    new URL("../../evaluation/capability-corpus.json", import.meta.url),
    "utf8",
  ),
) as {
  consumerBindings: Array<{
    id: string;
    expected: "executed" | "rejected" | "runtime-rejected";
    code?: string;
    endpoint?: string;
    displayName?: string;
    preserveArtifacts?: boolean;
  }>;
};

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function workspace() {
  const root = await mkdtemp(resolve(tmpdir(), "metamap-bindings-"));
  directories.push(root);
  await cp(exampleRoot, root, {
    recursive: true,
    filter: (path) => !path.includes("/.cache") && !path.includes("/generated"),
  });
  return root;
}

async function edit<T>(root: string, path: string, update: (value: T) => void) {
  const file = resolve(root, path);
  const value = JSON.parse(await readFile(file, "utf8")) as T;
  update(value);
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function editShard(
  root: string,
  owner: string,
  update: (graph: kernel.MetamapDocument) => void,
) {
  return edit(root, `${owner}/graph.json`, update);
}

interface Template {
  policy: Omit<kernel.MetamapViabilityPolicy, "graph">;
}
function editPolicy(
  root: string,
  update: (policy: Template["policy"]) => void,
) {
  return edit<Template>(root, "consumer/viability-template.json", (template) =>
    update(template.policy),
  );
}

async function artifactBytes(root: string) {
  return Promise.all(
    ["consumer.mjs", "consumer.d.mts", "build.json"].map((name) =>
      readFile(resolve(root, "generated", name), "utf8"),
    ),
  );
}

async function consumer(root: string, built: BindingBuildResult) {
  return import(
    `${pathToFileURL(resolve(root, "generated/consumer.mjs")).href}?digest=${built.projection.digest}`
  ) as Promise<{
    bindings: Record<string, { endpoint: { path: string } }>;
    invoke(id: string, input: unknown): unknown;
    handleRequest(method: string, path: string, input: unknown): unknown;
  }>;
}

async function addBinding(root: string, kind: "handler" | "endpoint") {
  const id = `urn:bindings:${kind}:alternative`;
  await editShard(root, "service", (graph) => {
    const entity = graph.entities.find(
      (item) => item.kind === `routing:${kind}`,
    )!;
    graph.entities.push({ ...structuredClone(entity), id });
  });
  await editShard(root, "consumer", (graph) => {
    const mapping = graph.mappings.find(
      (item) =>
        item.relation ===
        (kind === "handler" ? "routing:handled_by" : "routing:exposed_as"),
    )!;
    graph.mappings.push({
      ...structuredClone(mapping),
      id: `urn:bindings:mapping:alternative-${kind}`,
      targets: [id],
    });
  });
  await editPolicy(root, (policy) => {
    const original = policy.mappings.find(
      (item) =>
        item.mapping ===
        `urn:bindings:mapping:${kind === "handler" ? "handler" : "endpoint-production"}`,
    )!;
    policy.mappings.push({
      coverage: original.coverage,
      determinism: original.determinism,
      reversibility: original.reversibility,
      ...(original.applicability
        ? { applicability: structuredClone(original.applicability) }
        : {}),
      mapping: `urn:bindings:mapping:alternative-${kind}`,
    });
  });
}

async function mutate(root: string, id: string) {
  if (id === "missing-handler" || id === "missing-endpoint") {
    const relation =
      id === "missing-handler" ? "routing:handled_by" : "routing:exposed_as";
    const removed: string[] = [];
    await editShard(root, "consumer", (graph) => {
      graph.mappings = graph.mappings.filter((mapping) => {
        if (mapping.relation !== relation) return true;
        removed.push(mapping.id);
        return false;
      });
    });
    await editPolicy(root, (policy) => {
      policy.mappings = policy.mappings.filter(
        (mapping) => !mapping.mapping || !removed.includes(mapping.mapping),
      );
    });
  } else if (id === "ambiguous-handler" || id === "ambiguous-endpoint") {
    await addBinding(root, id === "ambiguous-handler" ? "handler" : "endpoint");
  } else if (id === "conflicting-owners") {
    await editShard(root, "consumer", (graph) => {
      graph.authorities.push({
        id: "urn:bindings:authority:conflicting-owner",
        concept: operation,
        source: "urn:bindings:consumer:api",
        facts: ["implementation"],
        mode: "canonical",
        provenance: { status: "declared", assertedBy: "team:consumer" },
      });
    });
  } else if (id === "narrow-delegation" || id === "widened-delegation") {
    await editShard(root, "consumer", (graph) => {
      graph.authorities.push({
        id: "urn:bindings:authority:delegated",
        concept: operation,
        source: "urn:bindings:consumer:api",
        facts:
          id === "narrow-delegation"
            ? ["implementation"]
            : ["implementation", "security"],
        mode: "delegated",
        delegatedFrom: "urn:bindings:authority:implementation",
        provenance: { status: "declared", assertedBy: "team:service" },
      });
    });
  } else if (id === "conflicting-shards") {
    await editShard(root, "consumer", (graph) => {
      graph.entities.push({
        id: operation,
        kind: "routing:command",
        label: "A contradictory declaration",
      });
    });
  } else if (id === "unmapped-leaf" || id === "owned-exclusion") {
    await editShard(root, "service", (graph) => {
      graph.entities.push({
        ...structuredClone(graph.entities[0]),
        id: "urn:bindings:handler:unbound",
      });
    });
    if (id === "owned-exclusion") {
      await edit<kernel.MetamapConfig>(
        root,
        "metamap.config.json",
        (config) => {
          const source = config.sources.find((item) => item.id === "service")!;
          config.sources[config.sources.indexOf(source)] = {
            ...source,
            exclusions: [
              {
                entity: "urn:bindings:handler:unbound",
                relation: "routing:handled_by",
                reason: "Internal helper is outside the API consumer",
                assertedBy: "team:service",
              },
            ],
          };
        },
      );
    }
  } else if (id === "invalid-native-export" || id === "locator-escape") {
    await editShard(root, "service", (graph) => {
      graph.entities[0].locators![0].uri =
        id === "invalid-native-export"
          ? "javascript:service/handlers/create-user.mjs#notExported"
          : "javascript:../outside.mjs#createUser";
    });
  } else if (id === "symlink-escape") {
    const module = resolve(root, "service/handlers/create-user.mjs");
    const outside = resolve(root, "outside-owner.mjs");
    await rename(module, outside);
    await symlink(outside, module);
  } else if (id === "native-byte-drift") {
    await writeFile(
      resolve(root, "service/handlers/create-user.mjs"),
      'export function createUser() { return "drifted"; }\n',
    );
  } else if (id === "moved-implementation") {
    await mkdir(resolve(root, "service/relocated"));
    await rename(
      resolve(root, "service/handlers/create-user.mjs"),
      resolve(root, "service/relocated/create-user.mjs"),
    );
    await editShard(root, "service", (graph) => {
      graph.entities[0].locators![0].uri =
        "javascript:service/relocated/create-user.mjs#createUser";
    });
  } else if (id === "new-implementation-identity") {
    await editShard(root, "service", (graph) => {
      graph.entities[0].id = "urn:bindings:handler:new-implementation";
      for (const authority of graph.authorities)
        if (authority.source === handler)
          authority.source = graph.entities[0].id;
    });
    await editShard(root, "consumer", (graph) => {
      for (const mapping of graph.mappings)
        mapping.targets = mapping.targets.map((target) =>
          target === handler
            ? "urn:bindings:handler:new-implementation"
            : target,
        );
    });
  } else if (
    ![
      "normal-binding",
      "development-context",
      "missing-context",
      "stale-generation",
      "invalid-runtime-input",
      "runtime-structure-change",
    ].includes(id)
  ) {
    throw new Error(`Missing corpus mutation: ${id}`);
  }
}

describe("independently owned native consumer bindings", () => {
  it.each(corpus.consumerBindings)("$id", async (expectation) => {
    const root = await workspace();
    const baseline = await generateBindings(root, { kernel });
    const accepted = await artifactBytes(root);
    await mutate(root, expectation.id);

    if (expectation.id === "stale-generation") {
      const graph = structuredClone(baseline.graph);
      graph.entities.find((entity) => entity.id === handler)!.label =
        "Changed after admission";
      const spec = JSON.parse(
        await readFile(resolve(root, "consumer/projection.json"), "utf8"),
      ) as kernel.MetamapProjectionSpec;
      const result = kernel.compileProjection(
        graph,
        baseline.generation,
        spec,
        { relationRegistry: baseline.registry as kernel.RelationRegistry },
      );
      expect(result.status).toBe("rejected");
      expect(result.issues.map((issue) => issue.code)).toContain(
        expectation.code,
      );
      expect(await artifactBytes(root)).toEqual(accepted);
      return;
    }

    const context: kernel.EvaluationContext =
      expectation.id === "missing-context"
        ? {}
        : {
            environment:
              expectation.id === "development-context"
                ? "development"
                : "production",
          };
    if (expectation.expected === "rejected") {
      let failure: unknown;
      try {
        await generateBindings(root, { kernel, context });
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(BindingBuildError);
      expect(
        (failure as BindingBuildError).issues.map((issue) => issue.code),
      ).toContain(expectation.code);
      expect(await artifactBytes(root)).toEqual(accepted);
      const preserved = await consumer(root, baseline);
      expect(
        preserved.handleRequest("POST", "/users", { name: "Ada" }),
      ).toEqual({ operation: "create-user", displayName: "Ada" });
      return;
    }

    const built = await generateBindings(root, { kernel, context });
    const current = await consumer(root, built);
    expect(Object.isFrozen(current.bindings)).toBe(true);
    if (expectation.expected === "runtime-rejected") {
      if (expectation.id === "invalid-runtime-input") {
        expect(() => current.invoke(operation, { name: 1 })).toThrow(
          expectation.code,
        );
      } else {
        expect(() =>
          current.invoke("urn:bindings:command:injected", {
            handler: "arbitrary",
          }),
        ).toThrow(expectation.code);
        expect(
          current.invoke(operation, {
            name: "Ada",
            handler: "arbitrary",
            endpoint: "/new",
          }),
        ).toEqual({ operation: "create-user", displayName: "Ada" });
        expect(current.bindings[operation].endpoint.path).toBe("/users");
      }
      return;
    }

    const endpoint = expectation.endpoint ?? "/users";
    expect(current.handleRequest("POST", endpoint, { name: " Ada " })).toEqual({
      operation: "create-user",
      displayName: expectation.displayName,
    });
    expect(current.invoke(operation, { name: "Ada" })).toEqual({
      operation: "create-user",
      displayName: "Ada",
    });
    expect(Object.keys(current.bindings)).toEqual([operation]);
    if (expectation.id === "moved-implementation") {
      const target = built.projection.entries[0].slots.find(
        (slot) => slot.name === "handler",
      )!.targets[0];
      expect(target.id).toBe(handler);
      expect(target.locators![0].uri).toContain("service/relocated/");
      expect(built.files["consumer.mjs"]).toContain(
        "./inputs/service/relocated/create-user.",
      );
      expect(built.files["consumer.mjs"]).toContain(
        "javascript:service/relocated/create-user.mjs#createUser",
      );
      expect(built.projection.digest).not.toBe(baseline.projection.digest);
    }
    if (expectation.id === "new-implementation-identity") {
      expect(
        built.projection.entries[0].slots.find(
          (slot) => slot.name === "handler",
        )!.targets[0].id,
      ).toBe("urn:bindings:handler:new-implementation");
      expect(built.graph.entities.some((entity) => entity.id === handler)).toBe(
        false,
      );
    }
    if (expectation.id === "narrow-delegation") {
      const resolution = new kernel.MetamapGraph(built.graph, {
        registry: built.registry as kernel.RelationRegistry,
      }).resolveAuthority(operation, "implementation");
      expect(resolution.status).toBe("resolved");
      expect(resolution.effective!.id).toBe("urn:bindings:authority:delegated");
    }
    if (expectation.id === "owned-exclusion") {
      expect(
        built.coverage.find(
          (record) => record.entityId === "urn:bindings:handler:unbound",
        )!.exclusion,
      ).toEqual({
        entity: "urn:bindings:handler:unbound",
        relation: "routing:handled_by",
        reason: "Internal helper is outside the API consumer",
        assertedBy: "team:service",
      });
    }
  });

  it("records native source bytes through the existing snapshot inputs without modifying owned sources", async () => {
    const root = await workspace();
    const paths = [
      "contract/graph.json",
      "service/graph.json",
      "consumer/graph.json",
      "contract/input-schema.mjs",
      "service/handlers/create-user.mjs",
      "consumer/viability-template.json",
      "consumer/projection.json",
      "metamap.config.json",
    ];
    const before = await Promise.all(
      paths.map((path) => readFile(resolve(root, path))),
    );
    const built = await generateBindings(root, { kernel });
    expect(
      await Promise.all(paths.map((path) => readFile(resolve(root, path)))),
    ).toEqual(before);
    const inputs = built.snapshot.sources.flatMap((source) => source.inputs);
    for (const path of [
      "contract/input-schema.mjs",
      "service/handlers/create-user.mjs",
    ]) {
      expect(inputs).toContainEqual({
        path,
        digest: kernel.contentDigest(await readFile(resolve(root, path))),
      });
    }
    expect(built.authorization).toBe("legacy-ungoverned");
    expect(built.generation.policy.digest).toBe(
      kernel.valueDigest(built.policy),
    );
  });

  it("rejects a changed captured module before replacing consumer artifacts", async () => {
    const root = await workspace();
    const built = await generateBindings(root, { kernel });
    const accepted = await artifactBytes(root);
    const captured = built.runtimeArtifacts.find((artifact) =>
      artifact.sourcePath.startsWith("service/"),
    )!;
    await writeFile(
      resolve(root, "generated", captured.path),
      'export function createUser() { return "tampered"; }\n',
    );
    await expect(generateBindings(root, { kernel })).rejects.toMatchObject({
      issues: [{ code: "NATIVE_ARTIFACT_COLLISION" }],
    });
    expect(await artifactBytes(root)).toEqual(accepted);
  });

  it("parses native inputs without executing their top-level code during generation", async () => {
    const root = await workspace();
    const path = resolve(root, "service/handlers/create-user.mjs");
    const source = `throw new Error("SOURCE_CODE_EXECUTED");\n${await readFile(path, "utf8")}`;
    await writeFile(path, source);
    await editShard(root, "service", (graph) => {
      graph.entities[0].locators![0].digest = kernel.contentDigest(source);
    });
    const built = await generateBindings(root, { kernel });
    expect(built.status).toBe("admitted");
    await expect(consumer(root, built)).rejects.toThrow("SOURCE_CODE_EXECUTED");
  });
});
