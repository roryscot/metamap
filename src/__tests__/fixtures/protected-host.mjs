// Test-only trusted owner host. It is not shipped in the package or wire protocol.
import assert from "node:assert/strict";
import { createPrivateKey, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
  chmod,
  chown,
  link,
  rename,
  symlink,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const [action, root, phase, behavior] = process.argv.slice(2);
assert.match(root, /^\/tmp\/metamap-protected-[a-f0-9-]{36}$/);
assert.equal(
  process.geteuid(),
  0,
  "Independent UID acceptance requires a trusted root test host",
);
const repository = fileURLToPath(new URL("../../../", import.meta.url));
const installation = join(root, "install");
const trustPath = join(installation, "examples/activation/trust.json");
const output = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const stdin = async () => {
  const chunks = [];
  for await (const bytes of process.stdin) chunks.push(Buffer.from(bytes));
  return Buffer.concat(chunks).toString("utf8");
};
if (action === "install") {
  await mkdir(root, { mode: 0o755 });
  await mkdir(installation, { mode: 0o755 });
  for (const path of [
    "dist",
    "schemas",
    "relation-packs",
    "node_modules",
    "package.json",
  ])
    await cp(join(repository, path), join(installation, path), {
      recursive: true,
      dereference: true,
    });
  await mkdir(join(installation, "examples/activation"), {
    recursive: true,
    mode: 0o755,
  });
  await cp(
    join(repository, "examples/activation/promoter.mjs"),
    join(installation, "examples/activation/promoter.mjs"),
  );
  for (const path of [
    "protected-host.mjs",
    "protected-probe.mjs",
    "protected-native.mjs",
  ])
    await cp(new URL(path, import.meta.url), join(installation, path));
  const protect = async (directory) => {
    await chmod(directory, 0o755);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) await protect(join(directory, entry.name));
      else await chmod(join(directory, entry.name), 0o644);
    }
  };
  await protect(installation);
  output({ installed: true, uid: process.geteuid() });
} else if (action === "cleanup") {
  await rm(root, { recursive: true, force: true });
  output({ cleaned: true });
} else if (action === "setup") {
  const data = JSON.parse(await stdin());
  for (const name of ["state", "proposals", "private", "consumer"])
    await rm(join(root, name), { recursive: true, force: true });
  await mkdir(join(root, "state"), { mode: 0o755 });
  await mkdir(join(root, "proposals"), { mode: 0o755 });
  await chown(join(root, "proposals"), 65534, 65534);
  await mkdir(join(root, "private"), { mode: 0o700 });
  for (const [principal, key] of Object.entries(data.syntheticPrivateKeys))
    await writeFile(
      join(root, "private/" + principal + "-key.der"),
      Buffer.from(key, "base64"),
      { mode: 0o600 },
    );
  await writeFile(trustPath, JSON.stringify(data.trust) + "\n", {
    mode: 0o644,
  });
  await writeFile(
    join(root, "legacy.json"),
    JSON.stringify(data.legacy) + "\n",
    { mode: 0o644 },
  );
  output({ configured: true, uid: process.geteuid() });
} else {
  const sdk = await import(join(installation, "dist/index.js"));
  if (action === "prepare") {
    const data = JSON.parse(await stdin());
    const trust = sdk.parseTrustedConsumerConfigurationJson(
      await readFile(trustPath, "utf8"),
    );
    const current = await sdk.readProtectedGovernedActivation(trustPath);
    const candidate = sdk.captureReplayBundle(data.graph, data.policy, {
      context: data.context,
      evaluatedAt: data.evaluatedAt,
      changedSubjects: data.changedSubjects,
      sourceCapture: data.sourceCapture,
      relationRegistry: new sdk.RelationRegistry(
        data.sourceCapture.relationPacks,
      ),
      projections: [data.spec],
    });
    const prepared = sdk.createGovernedChangeProposal(candidate, {
      consumer: trust.consumer,
      environment: trust.environment,
      proposer: "agent",
      baseline: sdk.governedActivationBaseline(current),
      intent: data.intent ?? "deploy",
      trustedConfiguration: trust,
    });
    const principal = data.principal ?? "owner";
    const now = Date.now();
    const payload = sdk.createApprovalPayload(prepared.proposal, {
      principal,
      key: principal + "-key",
      grants: [principal + "-grant"],
      issuedAt:
        data.issuedAt ??
        (data.wallClock
          ? new Date(now - 300000).toISOString()
          : "2026-10-10T00:30:00.000Z"),
      expiresAt:
        data.expiresAt ??
        (data.wallClock
          ? new Date(now + 1200000).toISOString()
          : "2026-10-10T02:00:00.000Z"),
    });
    const key = createPrivateKey({
      key: await readFile(join(root, "private/" + principal + "-key.der")),
      format: "der",
      type: "pkcs8",
    });
    output({
      request: {
        schemaVersion: "1.0.0",
        ...prepared,
        approval: sdk.attachGovernedApprovalSignature(
          payload,
          sign(null, sdk.governedApprovalSigningBytes(payload), key),
        ),
      },
    });
  } else if (action === "active") {
    output({
      current: (await sdk.readProtectedGovernedActivation(trustPath)) ?? null,
    });
  } else if (action === "promote") {
    const request = await sdk.readGovernedActivationRequestStream(
      process.stdin,
    );
    let now = "2026-10-10T01:00:00.000Z";
    const result = await sdk.promoteMetamapGeneration(request, {
      mode: "governed",
      trustPath,
      clock: () => now,
      onPhase: async (observed) => {
        if (phase !== observed) return;
        output({ phase: observed, pid: process.pid });
        if (behavior === "pause")
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(
              () =>
                reject(new Error("Test host phase wait exceeded 20 seconds")),
              20000,
            );
            process.once("SIGUSR1", () => {
              clearTimeout(timeout);
              resolve();
            });
          });
        if (behavior === "throw")
          throw new Error("Injected trusted host failure at " + observed);
        if (behavior === "expire") now = "2026-10-10T02:00:00.000Z";
        if (behavior === "revoke") {
          const trust = JSON.parse(await readFile(trustPath, "utf8"));
          trust.keys[0].revoked = true;
          await writeFile(trustPath, JSON.stringify(trust) + "\n");
        }
        if (behavior === "swap") {
          const path = join(
            root,
            "state/artifacts",
            request.proposal.artifacts.digest.slice(7),
            "bindings-0.ts",
          );
          await chmod(path, 0o644);
          await writeFile(path, "export default 'swapped after review';\n");
          await chmod(path, 0o444);
        }
        if (behavior === "lose-lock") {
          const children = (
            await readFile(
              "/proc/" + process.pid + "/task/" + process.pid + "/children",
              "utf8",
            )
          )
            .trim()
            .split(/\s+/)
            .filter(Boolean);
          assert.equal(
            children.length,
            1,
            "The fixed lock helper is the only child",
          );
          process.kill(Number(children[0]), "SIGKILL");
          await new Promise((done) => setTimeout(done, 30));
        }
      },
    });
    output({ result });
  } else if (action === "permissions") {
    const result = spawnSync(
      "/usr/sbin/runuser",
      [
        "-u",
        "nobody",
        "--",
        process.execPath,
        join(installation, "protected-probe.mjs"),
        root,
      ],
      { encoding: "utf8", timeout: 30000 },
    );
    assert.equal(result.status, 0, result.stderr + result.stdout);
    output(JSON.parse(result.stdout));
  } else if (action === "native") {
    const current = await sdk.readProtectedGovernedActivation(trustPath);
    assert.ok(current);
    const directory = join(
      root,
      "state/artifacts",
      current.manifest.artifacts.digest.slice(7),
    );
    await mkdir(join(root, "consumer"), { mode: 0o755 });
    await writeFile(join(root, "consumer/package.json"), '{"type":"module"}\n');
    const compile = spawnSync(
      process.execPath,
      [
        join(installation, "node_modules/typescript/bin/tsc"),
        "--target",
        "ES2022",
        "--module",
        "NodeNext",
        "--moduleResolution",
        "NodeNext",
        "--outDir",
        join(root, "consumer"),
        join(directory, "bindings-0.ts"),
        join(directory, "path-tree-0.ts"),
      ],
      { encoding: "utf8", timeout: 25000 },
    );
    assert.equal(compile.status, 0, compile.stderr + compile.stdout);
    const result = spawnSync(
      "/usr/sbin/runuser",
      [
        "-u",
        "nobody",
        "--",
        process.execPath,
        join(installation, "protected-native.mjs"),
        root,
      ],
      { encoding: "utf8", timeout: 25000 },
    );
    assert.equal(result.status, 0, result.stderr + result.stdout);
    output(JSON.parse(result.stdout));
  } else if (action === "cli" || action === "wrapper") {
    const text = await stdin();
    const args =
      action === "wrapper"
        ? [join(installation, "examples/activation/promoter.mjs")]
        : [
            join(installation, "dist/cli.js"),
            phase,
            trustPath,
            ...(behavior ? [behavior] : []),
          ];
    const result = spawnSync(process.execPath, args, {
      input: text,
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
    });
    output({
      code: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } else if (action === "modify") {
    const data = JSON.parse(await stdin());
    if (phase === "trust-mode") await chmod(trustPath, data.mode);
    else if (phase === "state-mode")
      await chmod(join(root, "state"), data.mode);
    else if (phase === "trust-content")
      await writeFile(trustPath, JSON.stringify(data) + "\n");
    else if (phase === "trust-hardlink") {
      if (data.enabled) await link(trustPath, join(root, "trust-linked.json"));
      else await unlink(join(root, "trust-linked.json"));
    } else if (phase === "trust-symlink") {
      if (data.enabled) {
        await rename(trustPath, trustPath + ".real");
        await symlink(trustPath + ".real", trustPath);
      } else {
        await unlink(trustPath);
        await rename(trustPath + ".real", trustPath);
      }
    } else throw new Error("Unknown test-only mutation");
    output({ modified: true });
  } else throw new Error("Unknown test host action");
}
