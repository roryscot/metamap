import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NextjsAppRouterAdapter } from "../adapters/nextjs-app-router.js";
import type { NextjsAppRouterSourceConfig } from "../config.js";
import type { RelationPack } from "../model.js";
import { coreRelationPack, RelationRegistry } from "../relations.js";
import { validateMetamapDocument } from "../validator.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

function pack(name: string): RelationPack {
  return JSON.parse(
    readFileSync(
      new URL(`../../relation-packs/${name}.json`, import.meta.url),
      "utf8",
    ),
  ) as RelationPack;
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "metamap-nextjs-"));
  temporaryDirectories.push(root);
  await Promise.all([
    mkdir(join(root, "app", "blog", "[slug]"), { recursive: true }),
    mkdir(join(root, "app", "legacy"), { recursive: true }),
    mkdir(join(root, "app", "api", "items"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      join(root, "app", "layout.tsx"),
      `import { AuthProvider } from "@/auth";
export default function Layout({ children }) {
  return (
    <AuthProvider>
      <AuthProvider>{children}</AuthProvider>
    </AuthProvider>
  );
}
`,
    ),
    writeFile(
      join(root, "app", "page.tsx"),
      `"use client";
import useRemote from "swr";
export default function Page() {
  useRemote("/api/home", () => null);
  return <main>Home</main>;
}
`,
    ),
    writeFile(
      join(root, "app", "blog", "[slug]", "page.tsx"),
      `export async function generateStaticParams() { return []; }
export const generateMetadata = async () => ({});
export default async function Page() {
  await Promise.all([fetch("/posts"), fetch("/authors")]);
  return <main>Post</main>;
}
`,
    ),
    writeFile(
      join(root, "app", "legacy", "page.tsx"),
      `export default function Page() { return <main>Legacy</main>; }
`,
    ),
    writeFile(
      join(root, "app", "error.tsx"),
      `"use client";
export default function Error() { return <main>Error</main>; }
`,
    ),
    writeFile(
      join(root, "app", "api", "items", "route.ts"),
      `export async function GET() { return new Response("ok"); }
export const POST = async () => new Response("created");
`,
    ),
  ]);
  const config: NextjsAppRouterSourceConfig = {
    id: "web",
    adapter: "nextjs-app-router",
    root: "app",
    exclusions: [
      {
        path: "app/legacy/page.tsx",
        reason: "Legacy surface pending migration",
        assertedBy: "team:web",
      },
    ],
  };
  const context = {
    namespace: "test",
    repository: "fixture",
    repositoryRoot: root,
  };
  return { root, config, context };
}

describe("Next.js App Router adapter", () => {
  it("discovers pages, containers, providers, loaders, boundaries, hydration, dynamic parameters, and route handlers", async () => {
    const { config, context } = await fixture();
    const result = await new NextjsAppRouterAdapter().discover(config, context);
    const registry = new RelationRegistry([
      coreRelationPack,
      pack("routing"),
      pack("application-topology"),
    ]);

    expect(result.diagnostics).toEqual([]);
    const validation = validateMetamapDocument(result.document, registry);
    expect(validation.valid, JSON.stringify(validation.issues, null, 2)).toBe(
      true,
    );
    expect(result.inputs).toHaveLength(6);
    expect(result.document.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "topology:application" }),
        expect.objectContaining({ kind: "topology:container" }),
        expect.objectContaining({ kind: "topology:context-provider" }),
        expect.objectContaining({ kind: "topology:context" }),
        expect.objectContaining({ kind: "topology:boundary" }),
        expect.objectContaining({ kind: "topology:hydration-boundary" }),
        expect.objectContaining({
          kind: "topology:loader",
          attributes: expect.objectContaining({ loaderKind: "fetch" }),
        }),
        expect.objectContaining({
          kind: "topology:loader",
          attributes: expect.objectContaining({ loaderKind: "static-params" }),
        }),
        expect.objectContaining({
          kind: "topology:loader",
          attributes: expect.objectContaining({ loaderKind: "metadata" }),
        }),
        expect.objectContaining({
          kind: "topology:loader",
          attributes: expect.objectContaining({ loaderKind: "query" }),
        }),
        expect.objectContaining({
          kind: "routing:endpoint",
          attributes: expect.objectContaining({ method: "GET" }),
        }),
        expect.objectContaining({
          kind: "routing:schema",
          attributes: expect.objectContaining({
            parameters: [{ name: "slug", cardinality: "one", optional: false }],
          }),
        }),
        expect.objectContaining({
          kind: "topology:page",
          attributes: expect.objectContaining({
            repositoryPath: "app/legacy/page.tsx",
            topologyDisposition: "excluded",
            exclusionOwner: "team:web",
          }),
        }),
      ]),
    );
    expect(
      result.document.entities.filter(
        (entry) =>
          entry.kind === "topology:loader" &&
          entry.attributes?.loaderKind === "fetch",
      ),
    ).toHaveLength(2);
    expect(
      result.document.entities.filter(
        (entry) => entry.kind === "topology:context-provider",
      ),
    ).toHaveLength(2);
    expect(
      result.document.entities.filter(
        (entry) => entry.kind === "topology:context",
      ),
    ).toHaveLength(1);
    expect(result.document.mappings.map((entry) => entry.relation)).toEqual(
      expect.arrayContaining([
        "topology:contains",
        "topology:wraps",
        "topology:rendered_in",
        "topology:hosts_provider",
        "topology:provides_context",
        "topology:hydrates",
        "topology:parameterized_by",
        "topology:loads",
        "topology:fallback_for",
        "routing:handled_by",
        "routing:exposed_as",
      ]),
    );
  });

  it("reports stale exclusions instead of silently accepting them", async () => {
    const { config, context } = await fixture();
    config.exclusions?.push({
      path: "app/missing/page.tsx",
      reason: "Mistyped path",
      assertedBy: "team:web",
    });
    const result = await new NextjsAppRouterAdapter().discover(config, context);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "STALE_TOPOLOGY_EXCLUSION" }),
    );
  });
});
