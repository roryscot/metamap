import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { canonicalJson, parseStrictJson } from "./canonical.js";
import {
  GovernanceError,
  evaluateGovernedActivation,
  governedActivationBaseline,
  parseGovernedActivationManifest,
  parseGovernedActivationRequest,
  parseGovernedActivePointer,
  parseTrustedConsumerConfigurationJson,
  verifyGovernedApproval,
  verifyGovernedArtifactBytes,
} from "./governance.js";
import type { TrustedConsumerConfiguration } from "./governance-model.js";
import type {
  GovernedActivationRequest,
  GovernedActivationResult,
  GovernedActivationState,
  GovernedActivePointer,
  ProtectedPromotionOptions,
} from "./activation-model.js";

function fail(code: string, message: string): never {
  throw new GovernanceError(code, message);
}
function platform(): void {
  if (process.platform !== "linux" || !process.geteuid)
    fail(
      "GOVERNANCE_UNSUPPORTED_HOST",
      "Protected persistence requires the Linux filesystem profile and util-linux flock",
    );
}
function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
function protectedOwner(stat: Stats): boolean {
  return stat.uid === 0 || stat.uid === process.geteuid!();
}
function protectedDirectory(stat: Stats, path: string, ancestor = false): void {
  const sticky = ancestor && (stat.mode & 0o1000) !== 0;
  if (
    !stat.isDirectory() ||
    !protectedOwner(stat) ||
    ((stat.mode & 0o022) !== 0 && !sticky)
  )
    fail(
      "GOVERNANCE_UNPROTECTED_PATH",
      "Expected a protected owner directory: " + path,
    );
}
async function checkDirectory(path: string): Promise<void> {
  protectedDirectory(await lstat(path), path);
}
async function checkAncestors(path: string): Promise<void> {
  if (!isAbsolute(path) || resolve(path) !== path)
    fail(
      "GOVERNANCE_UNPROTECTED_PATH",
      "Trusted paths must be absolute and normalized",
    );
  let current = dirname(path);
  while (true) {
    protectedDirectory(await lstat(current), current, true);
    if (current === dirname(current)) break;
    current = dirname(current);
  }
}
function protectedFile(stat: Stats, path: string, immutable: boolean): void {
  if (
    !stat.isFile() ||
    !protectedOwner(stat) ||
    stat.nlink !== 1 ||
    (stat.mode & (immutable ? 0o222 : 0o022)) !== 0
  )
    fail(
      "GOVERNANCE_UNPROTECTED_FILE",
      "Expected a protected regular file without hard links: " + path,
    );
}
async function readProtectedFile(
  path: string,
  immutable = false,
): Promise<string> {
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    protectedFile(await handle.stat(), path, immutable);
    return new TextDecoder("utf-8", { fatal: true }).decode(
      await handle.readFile(),
    );
  } finally {
    await handle.close();
  }
}
function contains(parent: string, child: string): boolean {
  const suffix = relative(parent, child);
  return (
    suffix === "" ||
    (!suffix.startsWith("../") && suffix !== ".." && !isAbsolute(suffix))
  );
}
async function loadTrust(path: string): Promise<TrustedConsumerConfiguration> {
  platform();
  await checkAncestors(path);
  const config = parseTrustedConsumerConfigurationJson(
    await readProtectedFile(path),
  );
  await checkAncestors(config.stateDirectory);
  await checkDirectory(config.stateDirectory);
  if (contains(config.stateDirectory, path))
    fail(
      "GOVERNANCE_UNPROTECTED_PATH",
      "Trust configuration must be outside mutable activation state",
    );
  for (const proposalRoot of config.proposalRoots) {
    if (!isAbsolute(proposalRoot) || resolve(proposalRoot) !== proposalRoot)
      fail(
        "GOVERNANCE_UNPROTECTED_PATH",
        "Proposal roots must be absolute and normalized",
      );
    const actual = await realpath(proposalRoot);
    for (const root of [proposalRoot, actual])
      if (
        contains(root, path) ||
        contains(root, config.stateDirectory) ||
        contains(config.stateDirectory, root)
      )
        fail(
          "GOVERNANCE_UNPROTECTED_PATH",
          "Proposal roots cannot contain protected trust or overlap active state",
        );
  }
  return config;
}
async function syncDirectory(path: string): Promise<void> {
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_DIRECTORY,
  );
  try {
    protectedDirectory(await handle.stat(), path);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function immutableFile(path: string, text: string): Promise<void> {
  const handle = await open(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(text, "utf8");
    await handle.chmod(0o444);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { mode: 0o755 }).catch((error: unknown) => {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST"))
      throw error;
  });
  await checkDirectory(path);
}
function artifactDirectory(
  config: TrustedConsumerConfiguration,
  digest: string,
): string {
  return join(config.stateDirectory, "artifacts", digest.slice(7));
}
async function readArtifacts(
  directory: string,
  request: Pick<GovernedActivationRequest, "proposal">,
): Promise<Record<string, string>> {
  await checkDirectory(directory);
  const expected = [
    ...request.proposal.artifacts.files.map((file) => file.path),
    "artifact-manifest.json",
  ].sort();
  if (
    canonicalJson((await readdir(directory)).sort()) !== canonicalJson(expected)
  )
    fail(
      "GOVERNANCE_ARTIFACT_BYTES_MISMATCH",
      "Protected artifact directory has a different complete file inventory",
    );
  const recorded = parseStrictJson(
    await readProtectedFile(join(directory, "artifact-manifest.json"), true),
  );
  if (canonicalJson(recorded) !== canonicalJson(request.proposal.artifacts))
    fail(
      "GOVERNANCE_ARTIFACT_MISMATCH",
      "Protected artifact manifest differs from the approved inventory",
    );
  const files: Record<string, string> = {};
  for (const file of request.proposal.artifacts.files)
    files[file.path] = await readProtectedFile(
      join(directory, file.path),
      true,
    );
  verifyGovernedArtifactBytes(request.proposal, files);
  return files;
}
async function readCurrent(
  config: TrustedConsumerConfiguration,
): Promise<GovernedActivationState | undefined> {
  let value: unknown;
  try {
    value = parseStrictJson(
      await readProtectedFile(
        join(config.stateDirectory, "current.json"),
        true,
      ),
    );
  } catch (error) {
    if (missing(error)) return undefined;
    throw error;
  }
  const pointer = parseGovernedActivePointer(value);
  if (
    pointer.consumer !== config.consumer ||
    pointer.environment !== config.environment
  )
    fail(
      "GOVERNANCE_WRONG_ENVIRONMENT",
      "Protected active pointer belongs to a different consumer/environment",
    );
  const manifests = join(config.stateDirectory, "manifests");
  await checkDirectory(manifests);
  const manifest = parseGovernedActivationManifest(
    parseStrictJson(
      await readProtectedFile(
        join(manifests, pointer.manifest.digest.slice(7) + ".json"),
        true,
      ),
    ),
  );
  if (
    manifest.id !== pointer.manifest.id ||
    manifest.digest !== pointer.manifest.digest ||
    manifest.consumer !== config.consumer ||
    manifest.environment !== config.environment
  )
    fail(
      "GOVERNANCE_ACTIVATION_CONTENT_MISMATCH",
      "Protected active pointer does not identify this complete manifest",
    );
  const artifacts = join(config.stateDirectory, "artifacts");
  await checkDirectory(artifacts);
  const files = await readArtifacts(
    artifactDirectory(config, manifest.artifacts.digest),
    manifest,
  );
  Object.freeze(files);
  return Object.freeze({ manifest, files });
}
/** Read one pointer once, then validate its whole immutable historical state. */
export async function readProtectedGovernedActivation(
  trustPath: string,
): Promise<GovernedActivationState | undefined> {
  const config = await loadTrust(trustPath);
  return readCurrent(config);
}

interface PromotionLease {
  assertHeld(): void;
  release(): Promise<void>;
}
/** The kernel lock is held by a fixed helper whose stdin closes on promoter exit. */
async function acquireLease(
  config: TrustedConsumerConfiguration,
): Promise<PromotionLease> {
  const path = join(config.stateDirectory, ".promotion.lock");
  const handle: FileHandle = await open(
    path,
    constants.O_RDWR |
      constants.O_CREAT |
      constants.O_NOFOLLOW |
      constants.O_NONBLOCK,
    0o600,
  );
  try {
    const stat = await handle.stat();
    protectedFile(stat, path, false);
    if ((stat.mode & 0o077) !== 0)
      fail(
        "GOVERNANCE_UNPROTECTED_FILE",
        "The transaction lock must be private to the promoter",
      );
  } catch (error) {
    await handle.close();
    throw error;
  }
  const child = spawn(
    "/usr/bin/flock",
    [
      "--exclusive",
      "--nonblock",
      "--conflict-exit-code",
      "75",
      "--no-fork",
      "/proc/self/fd/3",
      "/bin/sh",
      "-c",
      "printf 'ready\\n'; exec /bin/cat >/dev/null",
    ],
    {
      stdio: ["pipe", "pipe", "pipe", handle.fd],
      env: { PATH: "/usr/bin:/bin", LANG: "C" },
    },
  );
  const input = child.stdin!;
  input.on("error", () => undefined);
  let alive = true;
  let processError: Error | undefined;
  const closed = new Promise<void>((done) => {
    child.once("error", (error) => {
      processError = error;
      alive = false;
    });
    child.once("close", () => {
      alive = false;
      done();
    });
  });
  try {
    await new Promise<void>((ready, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new GovernanceError(
            "GOVERNANCE_LOCK_UNAVAILABLE",
            "Protected lock helper did not become ready",
          ),
        );
      }, 5000);
      let output = "";
      child.stdout!.on("data", (bytes: Buffer) => {
        output += bytes.toString("utf8");
        if (output === "ready\n") {
          clearTimeout(timeout);
          ready();
        } else if (output.length > 6) {
          clearTimeout(timeout);
          reject(
            new GovernanceError(
              "GOVERNANCE_LOCK_UNAVAILABLE",
              "Unexpected lock helper response",
            ),
          );
        }
      });
      child.once("error", () => {
        clearTimeout(timeout);
        reject(
          new GovernanceError(
            "GOVERNANCE_LOCK_UNAVAILABLE",
            "Cannot execute the fixed Linux lock helper",
          ),
        );
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        reject(
          new GovernanceError(
            code === 75
              ? "GOVERNANCE_PROMOTION_BUSY"
              : "GOVERNANCE_LOCK_UNAVAILABLE",
            code === 75
              ? "Another promoter holds the protected transaction lock"
              : "Protected lock helper exited before readiness",
          ),
        );
      });
    });
  } catch (error) {
    input.end();
    child.kill("SIGKILL");
    await closed;
    await handle.close();
    throw error;
  }
  return {
    assertHeld() {
      if (
        !alive ||
        processError ||
        child.exitCode !== null ||
        child.signalCode !== null
      )
        fail(
          "GOVERNANCE_LOCK_LOST",
          "Protected transaction lost its kernel lock helper",
        );
    },
    async release() {
      input.end();
      await closed;
      await handle.close();
    },
  };
}
async function writeManifest(
  config: TrustedConsumerConfiguration,
  state: GovernedActivationState,
): Promise<void> {
  const directory = join(config.stateDirectory, "manifests");
  const path = join(directory, state.manifest.digest.slice(7) + ".json");
  const text = canonicalJson(state.manifest) + "\n";
  try {
    await immutableFile(path, text);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST"))
      throw error;
    if ((await readProtectedFile(path, true)) !== text)
      fail(
        "GOVERNANCE_ACTIVATION_CONTENT_MISMATCH",
        "An existing immutable manifest has different bytes",
      );
  }
  await syncDirectory(directory);
}
function sameBaseline(
  a?: GovernedActivationState,
  b?: GovernedActivationState,
): boolean {
  return (a?.manifest.digest ?? null) === (b?.manifest.digest ?? null);
}
/** Internal governed dispatch for promoteMetamapGeneration; never invokes legacy promotion. */
export async function promoteProtectedGovernedActivation(
  value: unknown,
  options: ProtectedPromotionOptions,
): Promise<GovernedActivationResult> {
  let previous: GovernedActivationState | undefined;
  let config: TrustedConsumerConfiguration | undefined;
  let lease: PromotionLease | undefined;
  let stage: string | undefined;
  let pointerTemporary: string | undefined;
  let committed = false;
  try {
    if (options.mode !== "governed")
      fail("GOVERNANCE_HOST_REQUIRED", "The host must select governed mode");
    config = await loadTrust(options.trustPath);
    const lockedRoot = config.stateDirectory;
    lease = await acquireLease(config);
    await options.onPhase?.("locked");
    lease.assertHeld();
    config = await loadTrust(options.trustPath);
    if (config.stateDirectory !== lockedRoot)
      fail(
        "GOVERNANCE_STALE_TRUST",
        "State location changed after the lock was acquired",
      );
    previous = await readCurrent(config);
    const request = parseGovernedActivationRequest(value);
    const now = () => (options.clock ?? (() => new Date().toISOString()))();
    const initial = evaluateGovernedActivation(
      request,
      { trustedConfiguration: config, now: now() },
      previous,
    );
    if (initial.status !== "activated") return initial;
    const root = config.stateDirectory;
    await ensureDirectory(join(root, "artifacts"));
    await ensureDirectory(join(root, "manifests"));
    await syncDirectory(root);
    const destination = artifactDirectory(
      config,
      request.proposal.artifacts.digest,
    );
    let exists = true;
    try {
      await checkDirectory(destination);
    } catch (error) {
      if (!missing(error)) throw error;
      exists = false;
    }
    if (exists) {
      await readArtifacts(destination, request);
    } else {
      stage = join(root, ".stage-" + randomUUID());
      await mkdir(stage, { mode: 0o700 });
      for (const [name, text] of Object.entries(request.files))
        await immutableFile(join(stage, name), text);
      await immutableFile(
        join(stage, "artifact-manifest.json"),
        canonicalJson(request.proposal.artifacts) + "\n",
      );
      await readArtifacts(stage, request);
      await chmod(stage, 0o555);
      await syncDirectory(stage);
      lease.assertHeld();
      await rename(stage, destination);
      stage = undefined;
      await syncDirectory(join(root, "artifacts"));
    }
    await options.onPhase?.("artifacts-ready");
    lease.assertHeld();
    await readArtifacts(destination, request);
    await writeManifest(config, initial.current);
    await options.onPhase?.("manifest-ready");
    await options.onPhase?.("before-commit");
    lease.assertHeld();
    const fresh = await loadTrust(options.trustPath);
    if (fresh.stateDirectory !== root)
      fail(
        "GOVERNANCE_STALE_TRUST",
        "Protected state location changed during promotion",
      );
    const current = await readCurrent(fresh);
    if (!sameBaseline(previous, current))
      fail(
        "GOVERNANCE_STALE_BASELINE",
        "Protected baseline changed during promotion",
      );
    const stagedFiles = await readArtifacts(destination, request);
    const final = evaluateGovernedActivation(
      { ...request, files: stagedFiles },
      { trustedConfiguration: fresh, now: now() },
      current,
    );
    if (final.status !== "activated") return final;
    await writeManifest(fresh, final.current);
    const pointer: GovernedActivePointer = {
      schemaVersion: "1.0.0",
      consumer: fresh.consumer,
      environment: fresh.environment,
      manifest: {
        id: final.current.manifest.id,
        digest: final.current.manifest.digest,
      },
    };
    pointerTemporary = join(root, ".current-" + randomUUID() + ".tmp");
    await immutableFile(pointerTemporary, canonicalJson(pointer) + "\n");
    await readArtifacts(destination, request);
    // Current trust and clock are sampled again after all durable preparation.
    const commitTrust = await loadTrust(options.trustPath);
    const authorized = verifyGovernedApproval(
      request.proposal,
      request.approval,
      {
        trustedConfiguration: commitTrust,
        baseline: governedActivationBaseline(current),
        now: now(),
      },
    );
    if (authorized.status === "rejected")
      return {
        status: "rejected",
        activated: false,
        issues: authorized.issues,
        ...(current ? { current } : {}),
      };
    lease.assertHeld();
    await rename(pointerTemporary, join(root, "current.json"));
    pointerTemporary = undefined;
    committed = true;
    await syncDirectory(root);
    await options.onPhase?.("committed");
    return final;
  } catch (error) {
    const issues = [
      {
        code:
          error instanceof GovernanceError
            ? error.code
            : "GOVERNANCE_STORAGE_FAILURE",
        message: error instanceof Error ? error.message : String(error),
      },
    ];
    if (committed) {
      const current = config
        ? await readCurrent(config).catch(() => undefined)
        : undefined;
      return {
        status: "indeterminate",
        activated: null,
        issues,
        ...(current ? { current } : {}),
      };
    }
    return {
      status: "rejected",
      activated: false,
      issues,
      ...(previous ? { current: previous } : {}),
    };
  } finally {
    if (pointerTemporary) await unlink(pointerTemporary).catch(() => undefined);
    if (stage) {
      await chmod(stage, 0o700).catch(() => undefined);
      await rm(stage, { recursive: true, force: true }).catch(() => undefined);
    }
    await lease?.release().catch(() => undefined);
  }
}
