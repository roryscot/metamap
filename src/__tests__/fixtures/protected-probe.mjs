import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  open,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import {
  promoteMetamapGeneration,
  readProtectedGovernedActivation,
} from "@roryscot/metamap/activation";
const root = process.argv[2];
assert.equal(
  process.geteuid(),
  65534,
  "Proposer must have a distinct unprivileged UID",
);
const trustPath = join(root, "install/examples/activation/trust.json");
const current = await readProtectedGovernedActivation(trustPath);
assert.ok(current);
const denied = [];
const elevation = spawnSync("/usr/bin/sudo", ["-n", "/usr/bin/id", "-u"], {
  encoding: "utf8",
  timeout: 5000,
});
assert.notEqual(
  elevation.status,
  0,
  "The proposer must not have generic privileged command access",
);
denied.push("generic-privileged-command");
const attempt = async (name, work) => {
  try {
    await work();
  } catch (error) {
    assert.ok(
      ["EACCES", "EPERM"].includes(error.code),
      name + ": " + error.message,
    );
    denied.push(name);
    return;
  }
  throw new Error("Unprivileged proposer bypassed " + name);
};
for (const [name, path] of [
  ["trust", trustPath],
  ["installed-code", join(root, "install/dist/activation.js")],
  [
    "installed-promoter",
    join(root, "install/examples/activation/promoter.mjs"),
  ],
  ["installed-dependency", join(root, "install/node_modules/ajv/dist/2020.js")],
  ["active-pointer", join(root, "state/current.json")],
  [
    "active-bindings",
    join(
      root,
      "state/artifacts",
      current.manifest.artifacts.digest.slice(7),
      "bindings-0.ts",
    ),
  ],
]) {
  await attempt(name + "-write", () => writeFile(path, "unapproved"));
  await attempt(name + "-chmod", () => chmod(path, 0o666));
  await attempt(name + "-delete", () => unlink(path));
}
await attempt("private-key-read", () =>
  readFile(join(root, "private/owner-key.der")),
);
await attempt("state-create", () => mkdir(join(root, "state/unapproved")));
await attempt("lock-write", async () => {
  const file = await open(join(root, "state/.promotion.lock"), "r+");
  await file.close();
});
const legacy = JSON.parse(await readFile(join(root, "legacy.json"), "utf8"));
await attempt("legacy-api-write", () =>
  promoteMetamapGeneration(
    legacy.graph,
    legacy.policy,
    join(root, "state/legacy-bypass.json"),
    legacy.options,
  ),
);
const rejected = await promoteMetamapGeneration(
  {
    schemaVersion: "1.0.0",
    proposal: current.manifest.proposal,
    approval: current.manifest.approval,
    files: current.files,
  },
  { mode: "governed", trustPath, clock: () => "2026-10-10T01:00:00.000Z" },
);
assert.equal(rejected.status, "rejected");
assert.equal(rejected.issues[0].code, "GOVERNANCE_STORAGE_FAILURE");
denied.push("governed-api-without-promoter");
await writeFile(
  join(root, "proposals/proposal.json"),
  '{"unapproved":"inspectable"}\n',
);
assert.equal(
  (await readProtectedGovernedActivation(trustPath)).manifest.digest,
  current.manifest.digest,
);
process.stdout.write(
  JSON.stringify({
    proposerUid: process.geteuid(),
    proposalWritable: true,
    consumerReadable: true,
    activeDigest: current.manifest.digest,
    denied,
  }) + "\n",
);
