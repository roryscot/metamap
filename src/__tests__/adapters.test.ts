import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PrismaAdapter } from "../adapters/prisma.js";
import { TypeScriptZodAdapter } from "../adapters/typescript-zod.js";
import { JsonCollectionsAdapter } from "../adapters/json-collections.js";

const temporaryDirectories: string[] = [];

async function temporaryRepository(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "metamap-adapter-test-"));
  temporaryDirectories.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("repository adapters", () => {
  it("discovers Prisma models, fields, enums, and stable locators", async () => {
    const root = await temporaryRepository();
    await writeFile(
      join(root, "schema.prisma"),
      `enum State {
  READY
  DONE
}

model Item {
  id String @id
  count Int?
  state State
  children Child[]
}

model Child {
  id String @id
}
`,
    );
    const result = await new PrismaAdapter().discover(
      { id: "db", adapter: "prisma", path: "schema.prisma" },
      { namespace: "test", repository: "fixture", repositoryRoot: root },
    );

    expect(result.diagnostics).toEqual([]);
    const item = result.document.entities.find(
      (entity) => entity.attributes?.name === "Item",
    );
    const count = result.document.entities.find(
      (entity) => entity.attributes?.name === "count",
    );
    const children = result.document.entities.find(
      (entity) => entity.attributes?.name === "children",
    );
    expect(item?.kind).toBe("prisma-model");
    expect(count?.attributes).toMatchObject({
      dataType: "integer",
      nullable: true,
      presenceRequired: true,
    });
    expect(children?.attributes).toMatchObject({
      relation: true,
      cardinality: "many",
    });
    expect(item?.locators?.[0].uri).toContain(
      "repo://fixture/schema.prisma#L6",
    );
  });

  it("discovers Zod object fields, enums, and derivation chains", async () => {
    const root = await temporaryRepository();
    await mkdir(join(root, "schemas"));
    await writeFile(
      join(root, "schemas", "domain.ts"),
      `import { z } from "zod";
export const stateSchema = z.enum(["READY", "DONE"]);
export const itemSchema = z.object({
  id: z.string(),
  count: z.number().int().nullable(),
  tags: z.array(z.string()).optional(),
}).strict();
export const publicItemSchema = itemSchema.omit({ count: true });
`,
    );
    const result = await new TypeScriptZodAdapter().discover(
      {
        id: "schemas",
        adapter: "typescript-zod",
        roots: ["schemas"],
      },
      { namespace: "test", repository: "fixture", repositoryRoot: root },
    );

    expect(result.diagnostics).toEqual([]);
    const tags = result.document.entities.find(
      (entity) => entity.attributes?.name === "tags",
    );
    expect(tags?.attributes).toMatchObject({
      dataType: "array:string",
      cardinality: "many",
      presenceRequired: false,
    });
    expect(
      result.document.mappings.some(
        (entry) =>
          entry.relation === "core:derives_from" &&
          entry.transform?.entrypoint === "omit",
      ),
    ).toBe(true);
    expect(
      result.document.entities.filter(
        (entity) => entity.kind === "zod-enum-value",
      ),
    ).toHaveLength(2);
  });

  it("turns configured JSON records into references without copying domain data", async () => {
    const root = await temporaryRepository();
    await writeFile(
      join(root, "surfaces.json"),
      JSON.stringify({
        surfaces: [
          {
            id: "discover",
            label: "Discover",
            viewIds: ["feed", "search"],
            privatePayload: { ignored: true },
          },
        ],
      }),
    );
    const result = await new JsonCollectionsAdapter().discover(
      {
        id: "surfaces",
        adapter: "json-collections",
        path: "surfaces.json",
        collections: [
          {
            pointer: "/surfaces",
            idProperty: "id",
            labelProperty: "label",
            entityKind: "media-surface",
            references: [{ property: "viewIds", targetKind: "flow-view" }],
          },
        ],
      },
      { namespace: "test", repository: "fixture", repositoryRoot: root },
    );

    expect(result.diagnostics).toEqual([]);
    const surface = result.document.entities.find(
      (entity) => entity.kind === "media-surface",
    );
    expect(surface?.attributes).not.toHaveProperty("privatePayload");
    expect(
      result.document.entities.filter((entity) => entity.kind === "flow-view"),
    ).toHaveLength(2);
    expect(
      result.document.mappings.find(
        (entry) => entry.attributes?.jsonProperty === "viewIds",
      )?.targets,
    ).toHaveLength(2);
  });
});
