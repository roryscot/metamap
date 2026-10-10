import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  promoteMetamapGeneration,
  readGovernedActivationRequestStream,
  readProtectedGovernedActivation,
} from "../activation.js";
import type {
  GovernedActivationRequest,
  GovernedActivationState,
} from "../activation-model.js";
import { governanceFixture } from "./helpers/governance-fixture.js";

const sourceHost = fileURLToPath(
  new URL("fixtures/protected-host.mjs", import.meta.url),
);
const root = "/tmp/metamap-protected-" + randomUUID();
const installedHost = join(root, "install/protected-host.mjs");
const trustPath = join(root, "install/examples/activation/trust.json");
const privileged = (args: string[]) =>
  process.geteuid!() === 0
    ? { command: process.execPath, args }
    : { command: "/usr/bin/sudo", args: ["-n", process.execPath, ...args] };
function call(
  action: string,
  input?: unknown,
  phase?: string,
  behavior?: string,
) {
  const invocation = privileged([
    action === "install" || action === "cleanup" ? sourceHost : installedHost,
    action,
    root,
    ...(phase ? [phase] : []),
    ...(behavior ? [behavior] : []),
  ]);
  const result = spawnSync(invocation.command, invocation.args, {
    input:
      input === undefined
        ? undefined
        : typeof input === "string"
          ? input
          : JSON.stringify(input),
    encoding: "utf8",
    timeout: 45000,
    maxBuffer: 16 * 1024 * 1024,
  });
  expect(result.status, result.stderr + result.stdout).toBe(0);
  const lines = result.stdout.trim().split("\n");
  return JSON.parse(lines.at(-1)!) as any;
}
function signal(pid: number, name: string) {
  const command = process.geteuid!() === 0 ? "/bin/kill" : "/usr/bin/sudo";
  const args =
    process.geteuid!() === 0
      ? ["-" + name, String(pid)]
      : ["-n", "/bin/kill", "-" + name, String(pid)];
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 10000 });
  expect(result.status, result.stderr).toBe(0);
}
function live(request: GovernedActivationRequest, phase: string) {
  const invocation = privileged([
    installedHost,
    "promote",
    root,
    phase,
    "pause",
  ]);
  const child = spawn(invocation.command, invocation.args, {
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end(JSON.stringify(request));
  let text = "",
    error = "";
  let ready: (value: { phase: string; pid: number }) => void;
  let failed: (error: Error) => void;
  const phaseReached = new Promise<{ phase: string; pid: number }>(
    (resolve, reject) => {
      ready = resolve;
      failed = reject;
    },
  );
  const timeout = setTimeout(() => {
    child.kill();
    failed(new Error("Real promoter did not reach " + phase));
  }, 20000);
  child.stdout.on("data", (bytes) => {
    text += bytes.toString();
    for (const line of text.split("\n").slice(0, -1)) {
      const message = JSON.parse(line);
      if (message.phase === phase) {
        clearTimeout(timeout);
        ready(message);
      }
    }
  });
  child.stderr.on("data", (bytes) => {
    error += bytes.toString();
  });
  child.on("error", (err) => {
    clearTimeout(timeout);
    failed(err);
  });
  const done = new Promise<{ code: number | null; result?: any }>((resolve) =>
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (!text.includes('"phase"'))
        failed(
          new Error(
            error || text || "Promoter exited before the requested phase",
          ),
        );
      const messages = text
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      resolve({
        code,
        result: messages.find((message) => message.result)?.result,
      });
    }),
  );
  return { phaseReached, done };
}
async function* bytes(...values: Uint8Array[]) {
  yield* values;
}

describe("strict protected activation transport", () => {
  it("rejects invalid UTF-8, duplicate JSON and candidate clock/config fields", async () => {
    await expect(
      readGovernedActivationRequestStream(bytes(Buffer.from([0xc3, 0x28]))),
    ).rejects.toThrow();
    await expect(
      readGovernedActivationRequestStream(
        bytes(Buffer.from('{"files":{},"files":{}}')),
      ),
    ).rejects.toThrow(/Duplicate/);
    await expect(
      readGovernedActivationRequestStream(
        bytes(Buffer.from('{"now":"2026-10-10T01:00:00.000Z"}')),
      ),
    ).rejects.toThrow();
  });
  it("bounds the wire before parsing large data", async () => {
    const chunk = Buffer.alloc(1024 * 1024);
    async function* oversized() {
      for (let index = 0; index < 65; index++) yield chunk;
    }
    await expect(
      readGovernedActivationRequestStream(oversized()),
    ).rejects.toMatchObject({ code: "GOVERNANCE_REQUEST_TOO_LARGE" });
  });
  it.skipIf(process.platform === "linux")(
    "fails closed outside the first persistent filesystem profile",
    async () => {
      const result = await promoteMetamapGeneration(
        {} as GovernedActivationRequest,
        { mode: "governed", trustPath },
      );
      expect(result).toMatchObject({
        status: "rejected",
        issues: [{ code: "GOVERNANCE_UNSUPPORTED_HOST" }],
      });
      await expect(
        readProtectedGovernedActivation(trustPath),
      ).rejects.toMatchObject({ code: "GOVERNANCE_UNSUPPORTED_HOST" });
    },
  );
});
describe.skipIf(process.platform !== "linux")(
  "real Linux protected promoter and independent proposer UID",
  () => {
    let f: ReturnType<typeof governanceFixture>;
    const active = () =>
      call("active").current as GovernedActivationState | null;
    const prepare = (options: Record<string, unknown> = {}) =>
      call("prepare", {
        graph: f.inputs.graph,
        policy: f.inputs.policy,
        sourceCapture: f.inputs.sourceCapture,
        context: f.inputs.options.context,
        evaluatedAt: f.inputs.options.evaluatedAt,
        changedSubjects: [],
        spec: f.inputs.spec,
        ...options,
      }).request as GovernedActivationRequest;
    const promote = (
      request: GovernedActivationRequest,
      phase?: string,
      behavior?: string,
    ) => call("promote", request, phase, behavior).result;
    const change = () => {
      f.inputs.graph.entities[2].locators = [
        { uri: "json-schema:schemas/next.json" },
      ];
      f.inputs.rebind();
      return prepare();
    };
    beforeAll(() => {
      expect(call("install")).toMatchObject({ installed: true, uid: 0 });
    }, 60000);
    beforeEach(() => {
      f = governanceFixture();
      f.trust.stateDirectory = join(root, "state");
      f.trust.proposalRoots = [join(root, "proposals")];
      for (const record of [...f.trust.keys, ...f.trust.grants]) {
        record.validFrom = "2020-01-01T00:00:00.000Z";
        record.validUntil = "2100-01-01T00:00:00.000Z";
      }
      const legacy = {
        graph: JSON.parse(
          readFileSync(
            new URL(
              "../../examples/example-authority-graph.json",
              import.meta.url,
            ),
            "utf8",
          ),
        ),
        policy: JSON.parse(
          readFileSync(
            new URL(
              "../../examples/example-viability-policy.json",
              import.meta.url,
            ),
            "utf8",
          ),
        ),
        options: {
          evaluatedAt: "2026-09-02T00:00:00.000Z",
          context: { environment: "production", maintenance: false },
        },
      };
      call("setup", {
        trust: f.trust,
        legacy,
        syntheticPrivateKeys: Object.fromEntries(
          [...f.keys].map(([name, key]) => [
            name,
            key.export({ format: "der", type: "pkcs8" }).toString("base64"),
          ]),
        ),
      });
    }, 30000);
    afterAll(() => {
      call("cleanup");
    }, 30000);
    it("publishes exact bytes, makes authorized retries unchanged, and executes a protected native consumer", () => {
      const request = prepare();
      expect(active()).toBeNull();
      const first = promote(request);
      expect(first.status).toBe("activated");
      expect(active()).toEqual(first.current);
      expect(promote(request)).toMatchObject({
        status: "already-active",
        current: first.current,
      });
      expect(call("native")).toMatchObject({
        native: "verified",
        consumerUid: 65534,
        schema: "urn:example:schema",
        compiledOutputsProtected: true,
      });
      const permissions = call("permissions");
      expect(permissions).toMatchObject({
        proposerUid: 65534,
        proposalWritable: true,
        consumerReadable: true,
        activeDigest: first.current.manifest.digest,
      });
      expect(permissions.denied).toHaveLength(24);
      expect(permissions.denied).toContain("legacy-api-write");
      console.log(
        "P10 actual UID boundary: 24 denied operations, writable proposals, protected native consumer verified",
      );
    }, 60000);
    it("rejects agent approval, swapped request files and owner trust changes without retiring state", () => {
      const request = prepare();
      expect(promote(prepare({ principal: "agent" }))).toMatchObject({
        status: "rejected",
        issues: [{ code: "GOVERNANCE_OWNER_REQUIRED" }],
      });
      const first = promote(request).current;
      const altered = structuredClone(request);
      altered.files["bindings-0.ts"] += "// unapproved";
      const result = call("cli", altered, "protected-promote");
      expect(result.code).toBe(1);
      expect(active()).toEqual(first);
      const revoked = structuredClone(f.trust);
      revoked.keys[0].revoked = true;
      call("modify", revoked, "trust-content");
      expect(promote(request)).toMatchObject({
        status: "rejected",
        issues: [{ code: "GOVERNANCE_STALE_TRUST" }],
      });
      expect(active()).toEqual(first);
    }, 60000);
    it("uses fixed owner wrapper and CLI current clocks; rejects caller options and strict wire duplicates", () => {
      const request = prepare({ wallClock: true });
      const wrapped = call("wrapper", request);
      expect(wrapped.code, wrapped.stderr).toBe(0);
      expect(JSON.parse(wrapped.stdout).status).toBe("activated");
      expect(call("cli", request, "protected-promote").code).toBe(0);
      const expired = prepare({
        issuedAt: new Date(Date.now() - 3600000).toISOString(),
        expiresAt: new Date(Date.now() - 60000).toISOString(),
      });
      const denied = call("cli", expired, "protected-promote");
      expect(denied.code).toBe(1);
      expect(JSON.parse(denied.stdout)).toMatchObject({
        status: "rejected",
        issues: [{ code: "GOVERNANCE_APPROVAL_NOT_CURRENT" }],
      });
      expect(call("cli", "", "active").code).toBe(0);
      expect(call("cli", request, "protected-promote", "--as-of").code).toBe(2);
      expect(
        call("cli", '{"files":{},"files":{}}', "protected-promote").code,
      ).toBe(1);
      const wrong = { ...request, now: "2026-10-10T01:00:00.000Z" };
      expect(call("cli", wrong, "protected-promote").code).toBe(1);
    }, 60000);
    it("rejects unprotected deployment paths and proposal roots overlapping trust/state", () => {
      const request = prepare();
      call("modify", { mode: 0o666 }, "trust-mode");
      expect(promote(request)).toMatchObject({
        status: "rejected",
        issues: [{ code: "GOVERNANCE_UNPROTECTED_FILE" }],
      });
      call("modify", { mode: 0o644 }, "trust-mode");
      call("modify", { mode: 0o777 }, "state-mode");
      expect(promote(request)).toMatchObject({
        status: "rejected",
        issues: [{ code: "GOVERNANCE_UNPROTECTED_PATH" }],
      });
      call("modify", { mode: 0o755 }, "state-mode");
      const overlap = structuredClone(f.trust);
      overlap.proposalRoots = [root];
      call("modify", overlap, "trust-content");
      expect(promote(request)).toMatchObject({
        status: "rejected",
        issues: [{ code: "GOVERNANCE_UNPROTECTED_PATH" }],
      });
      call("modify", f.trust, "trust-content");
      expect(active()).toBeNull();
    }, 30000);
    it("rejects linked configuration files without following them or publishing state", () => {
      const request = prepare();
      call("modify", { enabled: true }, "trust-hardlink");
      expect(promote(request)).toMatchObject({
        status: "rejected",
        issues: [{ code: "GOVERNANCE_UNPROTECTED_FILE" }],
      });
      call("modify", { enabled: false }, "trust-hardlink");
      call("modify", { enabled: true }, "trust-symlink");
      expect(promote(request).status).toBe("rejected");
      call("modify", { enabled: false }, "trust-symlink");
      expect(active()).toBeNull();
    }, 30000);
    it.each(["expire", "revoke", "swap", "lose-lock"])(
      "rejects a %s after preparation and preserves the old pointer",
      (failure) => {
        const first = promote(prepare()).current;
        const next = change();
        const result = promote(
          next,
          failure === "swap" ? "artifacts-ready" : "before-commit",
          failure,
        );
        expect(result.status).toBe("rejected");
        expect(active()).toEqual(first);
      },
      60000,
    );
    it("serializes concurrent stale-base proposals and exposes complete old/new reads", async () => {
      const first = promote(prepare()).current;
      const next = change();
      f.inputs.graph.label = "Other concurrent change";
      f.inputs.rebind();
      const other = prepare();
      const running = live(next, "before-commit");
      const reached = await running.phaseReached;
      expect(active()).toEqual(first);
      expect(promote(other)).toMatchObject({
        status: "rejected",
        issues: [{ code: "GOVERNANCE_PROMOTION_BUSY" }],
      });
      signal(reached.pid, "USR1");
      const completed = await running.done;
      expect(completed.code).toBe(0);
      expect(completed.result.status).toBe("activated");
      expect(active()).toEqual(completed.result.current);
      expect(promote(other)).toMatchObject({
        status: "rejected",
        issues: [{ code: "GOVERNANCE_STALE_BASELINE" }],
      });
    }, 60000);
    it.each([
      "locked",
      "artifacts-ready",
      "manifest-ready",
      "before-commit",
      "committed",
    ])(
      "survives an actual SIGKILL at %s and releases the kernel lock",
      async (phase) => {
        const first = promote(prepare()).current;
        const next = change();
        const running = live(next, phase);
        const reached = await running.phaseReached;
        signal(reached.pid, "KILL");
        await running.done;
        const current = active()!;
        if (phase === "committed") {
          expect(current.files).toEqual(next.files);
          expect(current.manifest.previousManifest).toBe(first.manifest.digest);
          expect(promote(next).status).toBe("already-active");
        } else {
          expect(current).toEqual(first);
          expect(promote(next).status).toBe("activated");
        }
        console.log("P10 actual SIGKILL recovery verified: " + phase);
      },
      60000,
    );
    it("requires fresh current-base owner approval for rollback and reports a post-commit response failure honestly", () => {
      const first = promote(prepare()).current;
      expect(promote(change()).status).toBe("activated");
      const second = active()!;
      const old = {
        graph: first.manifest.proposal.candidate.inputs.graph,
        policy: first.manifest.proposal.candidate.inputs.policy,
      };
      const denied = prepare({
        ...old,
        intent: "rollback",
        principal: "agent",
      });
      expect(promote(denied)).toMatchObject({
        status: "rejected",
        issues: [{ code: "GOVERNANCE_OWNER_REQUIRED" }],
      });
      const rollback = prepare({ ...old, intent: "rollback" });
      const result = promote(rollback, "committed", "throw");
      expect(result).toMatchObject({
        status: "indeterminate",
        activated: null,
      });
      expect(result.current.files).toEqual(first.files);
      expect(result.current.manifest.previousManifest).toBe(
        second.manifest.digest,
      );
      expect(active()).toEqual(result.current);
      expect(promote(rollback).status).toBe("already-active");
    }, 60000);
  },
);
