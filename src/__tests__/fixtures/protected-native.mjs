import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
const root = process.argv[2];
assert.equal(process.geteuid(), 65534);
const bindings = await import(
  pathToFileURL(join(root, "consumer/bindings-0.js"))
);
const tree = await import(pathToFileURL(join(root, "consumer/path-tree-0.js")));
const projection = bindings.resolveMetamapProjection("urn:example:consumer");
assert.equal(projection.slots.schema.id, "urn:example:schema");
assert.equal(
  tree.hydratePathTree({ networkId: "protected" }).network[":networkId"]._,
  "/network/protected",
);
await assert.rejects(
  writeFile(join(root, "consumer/bindings-0.js"), "unapproved"),
  { code: "EACCES" },
);
process.stdout.write(
  JSON.stringify({
    native: "verified",
    consumerUid: process.geteuid(),
    schema: projection.slots.schema.id,
    path: "/network/protected",
    compiledOutputsProtected: true,
  }) + "\n",
);
