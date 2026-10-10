import { readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMetamapConfig } from "../config.js";
import { discoverWorkspace } from "../workspace.js";
import {
  createSourceCapture,
  captureWorkspaceSources,
  inspectCurrentSources,
} from "../provenance.js";
import { captureReplayBundle, replayMetamap } from "../replay.js";
import { composeCorrespondences } from "../derivation.js";
import { verifyGovernedApproval } from "../governance.js";
import { RelationRegistry, coreRelationPack } from "../relations.js";
import { scientificSkosRelationPack } from "../scientific-relations.js";
import type { MetamapSemanticPolicy } from "../semantic-model.js";
import type { SemanticProjectionSpec } from "../semantic-projection-model.js";
import { exportSssomTsv } from "../sssom.js";
import { valueDigest } from "../stable.js";
import { writeSssomWorkspace } from "./helpers/sssom-fixture.js";
import { governanceFixture } from "./helpers/governance-fixture.js";

const roots: string[] = [];
beforeEach(() => setImmediate());
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture(external = false) {
  const f = await writeSssomWorkspace(external);
  roots.push(f.root);
  return f;
}
async function discover(f: Awaited<ReturnType<typeof fixture>>) {
  const registry = new RelationRegistry();
  const discovery = await discoverWorkspace(
    await loadMetamapConfig(f.configPath),
    {
      relationRegistry: registry,
      useCache: false,
      writeCache: false,
      portablePackUris: true,
    },
  );
  const capture = createSourceCapture(f.config, discovery, registry);
  const policy: MetamapSemanticPolicy = {
    schemaVersion: "2.0.0",
    id: "urn:test:scientific-policy",
    graph: { id: discovery.graph.id, digest: valueDigest(discovery.graph) },
    mappings: [
      {
        select: { ids: discovery.graph.mappings.map((m) => m.id) },
        coverage: "partial",
        determinism: "deterministic",
        reversibility: "irreversible",
      },
    ],
    constraints: [],
    evidence: [],
    derivations: [],
    derivationLimits: { maxDepth: 8, maxDerivations: 32 },
    assessments: [],
    uncertaintyRequirements: [],
    riskBudgets: [],
  };
  const bundle = (consumer?: string, candidateLossiness?: "lossy") => {
    const spec: SemanticProjectionSpec = {
      schemaVersion: "2.0.0",
      id: "urn:test:scientific-source-view",
      consumer: consumer ?? "urn:test:scientific-source-consumer",
      budget: null,
      select: { ids: [discovery.graph.entities[0].id] },
      slots: [
        {
          name: "exact",
          relation: "scientific:exact-match",
          direction: "outgoing",
          cardinality: "many",
          allowLossy: true,
        },
      ],
    };
    // The source retains unknown lossiness. An explicit consumer candidate can
    // declare a conservative approximation without editing captured source data.
    const candidate = structuredClone(discovery.graph);
    if (candidateLossiness !== undefined)
      for (const mapping of candidate.mappings)
        mapping.lossiness = candidateLossiness;
    const candidatePolicy = {
      ...policy,
      graph: { id: candidate.id, digest: valueDigest(candidate) },
    };
    const captured = captureReplayBundle(candidate, candidatePolicy, {
      evaluatedAt: "2026-10-10T00:00:00.000Z",
      relationRegistry: registry,
      sourceCapture: capture,
      projections: [spec],
    });
    return captured;
  };
  return { ...f, discovery, capture, registry, policy, bundle };
}
describe("SSSOM discovery through complete source-bound replay", () => {
  it.each([false, true])(
    "captures and replays %s external metadata without source edits or cache creation",
    async (external) => {
      const f = await fixture(external),
        before = await readFile(join(f.root, f.source.path));
      const found = await discover(f);
      expect(
        await captureWorkspaceSources(f.configPath, {
          permittedRoots: [f.root],
        }),
      ).toEqual(found.capture);
      expect(found.bundle().inputs.sourceReceipts[0].inputs).toHaveLength(
        external ? 2 : 1,
      );
      expect(found.bundle().schemaVersion).toBe("3.0.0");
      expect(replayMetamap(found.bundle())).toMatchObject({
        status: "verified",
        admitted: false,
      });
      expect(found.bundle().expected.compilation).toMatchObject({
        status: "rejected",
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "UNDECLARED_LOSSINESS" }),
        ]),
      });
      expect(
        await inspectCurrentSources(found.capture, f.configPath, {
          permittedRoots: [f.root],
        }),
      ).toMatchObject({
        sourceRediscovery: { status: "current", changes: [] },
      });
      expect(await readFile(join(f.root, f.source.path))).toEqual(before);
      await expect(
        readFile(join(f.root, ".cache/manifest.json")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    },
  );
  it("reports changed raw metadata bytes while captured historical replay remains independent of live reads", async () => {
    const f = await discover(await fixture(true));
    await writeFile(
      join(f.root, f.source.metadataPath!),
      (await readFile(join(f.root, f.source.metadataPath!), "utf8")) + "\n",
    );
    const result = await inspectCurrentSources(f.capture, f.configPath, {
      permittedRoots: [f.root],
    });
    expect(result.sourceRediscovery).toMatchObject({
      status: "changed",
      changes: expect.arrayContaining([
        expect.objectContaining({ component: "inputs" }),
      ]),
    });
    expect(replayMetamap(f.bundle())).toMatchObject({
      status: "verified",
      admitted: false,
    });
  });
  it("binds source revision and declared selection context without changing ontology entity IDs or granting authority", async () => {
    const f = await discover(await fixture());
    f.config.sources[0] = {
      ...f.config.sources[0],
      sourceRevision: "synthetic-r2",
      provenance: {
        selectedRecordCount: 2,
        originalRecordCount: 1564,
        principal: "owner",
        context: "declared-only",
      },
    };
    await writeFile(f.configPath, JSON.stringify(f.config));
    const after = await discover(f);
    expect(after.discovery.graph.entities.map((e) => e.id)).toEqual(
      f.discovery.graph.entities.map((e) => e.id),
    );
    expect(after.bundle().inputs.sourceReceipts[0]).not.toEqual(
      f.bundle().inputs.sourceReceipts[0],
    );
    expect(after.bundle().inputs.sourceReceipts[0].sourceRevision).toBe(
      "synthetic-r2",
    );
    expect(after.discovery.graph.authorities).toEqual([]);
    expect(after.discovery.adapters[0].document.metadata!.sssom).toMatchObject({
      observedRecordCount: 2,
      setCompleteness: "not-established-by-TSV",
      declaredProvenance: { context: "declared-only" },
    });
    expect(
      (
        await inspectCurrentSources(f.capture, f.configPath, {
          permittedRoots: [f.root],
        })
      ).sourceRediscovery.status,
    ).toBe("changed");
  });
  it("rejects a valid prior signature after source revision/context substitution", async () => {
    const f = await discover(await fixture()),
      signer = governanceFixture();
    const old = signer.propose(f.bundle(signer.trust.consumer, "lossy")),
      approval = signer.approve(old.proposal);
    expect(
      verifyGovernedApproval(old.proposal, approval, signer.context()).status,
    ).toBe("authorized");
    f.config.sources[0] = {
      ...f.config.sources[0],
      sourceRevision: "synthetic-r2",
    };
    await writeFile(f.configPath, JSON.stringify(f.config));
    const next = await discover(f),
      proposal = signer.propose(next.bundle(signer.trust.consumer, "lossy"));
    expect(
      verifyGovernedApproval(proposal.proposal, approval, signer.context())
        .status,
    ).toBe("rejected");
    expect(old.proposal.digest).not.toBe(proposal.proposal.digest);
  }, 15000);
  it("rejects a symlink escape through the external metadata path before adapter reading", async () => {
    const f = await fixture(true),
      outside = await fixture(true);
    await unlink(join(f.root, f.source.metadataPath!));
    await symlink(
      join(outside.root, outside.source.metadataPath!),
      join(f.root, f.source.metadataPath!),
    );
    await expect(
      captureWorkspaceSources(f.configPath, { permittedRoots: [f.root] }),
    ).rejects.toThrow(/SOURCE_LOCATOR_DENIED/);
  });
});
describe("bounded normative SKOS laws without pragmatic chaining or identity inference", () => {
  async function graph(predicate: string) {
    const f = await fixture();
    f.raw.rows[0][2] = "A:2";
    f.raw.rows[1][0] = "A:2";
    f.raw.rows[1][2] = "A:3";
    f.raw.rows[0][1] = predicate;
    f.raw.rows[1][1] = predicate;
    await writeFile(join(f.root, f.source.path), exportSssomTsv(f.raw).text);
    return (await discover(f)).discovery.graph;
  }
  it("records exact-chain proof with all six uncertainty dimensions unknown and no derived authority", async () => {
    const value = await graph("skos:exactMatch"),
      registry = new RelationRegistry([
        coreRelationPack,
        scientificSkosRelationPack(),
      ]);
    const result = composeCorrespondences(
      value,
      {
        schemaVersion: "1.0.0",
        law: "urn:metamap:scientific:law:exact-chain",
        premises: value.mappings.map((m) => m.id),
        context: {},
        bounds: { maxDepth: 8, maxDerivations: 32 },
        derivations: [],
        assessments: [],
        evidence: [],
      },
      registry,
    );
    expect(result.status).toBe("proposed");
    if (result.status !== "proposed") throw new Error(JSON.stringify(result));
    expect(result.mapping).toMatchObject({
      relation: "scientific:exact-match",
      sources: ["https://example.test/A/1"],
      targets: ["https://example.test/A/3"],
      lossiness: "unknown",
    });
    expect(result.derivation.uncertainty).toHaveLength(6);
    expect(
      result.derivation.uncertainty.every(
        (dimension) => dimension.status === "unknown",
      ),
    ).toBe(true);
    expect(value.authorities).toEqual([]);
  });
  it.each(["close", "broad", "narrow", "related"])(
    "does not invent an executable %s transitivity rule",
    async (kind) => {
      const value = await graph(`skos:${kind}Match`),
        registry = new RelationRegistry([
          coreRelationPack,
          scientificSkosRelationPack(),
        ]);
      const result = composeCorrespondences(
        value,
        {
          schemaVersion: "1.0.0",
          law: `urn:metamap:scientific:law:${kind}-chain`,
          premises: value.mappings.map((m) => m.id),
          context: {},
          bounds: { maxDepth: 8, maxDerivations: 32 },
          derivations: [],
          assessments: [],
          evidence: [],
        },
        registry,
      );
      expect(result.status).toBe("unsupported");
      expect(result).not.toHaveProperty("mapping");
    },
  );
  it("reverses broad as narrow and retains the original direction of both raw assertions", async () => {
    const value = await graph("skos:broadMatch"),
      registry = new RelationRegistry([
        coreRelationPack,
        scientificSkosRelationPack(),
      ]);
    const result = composeCorrespondences(
      value,
      {
        schemaVersion: "1.0.0",
        law: "urn:metamap:scientific:law:reverse-broad",
        premises: [value.mappings[0].id],
        context: {},
        bounds: { maxDepth: 8, maxDerivations: 32 },
        derivations: [],
        assessments: [],
        evidence: [],
      },
      registry,
    );
    expect(result).toMatchObject({
      status: "proposed",
      mapping: {
        relation: "scientific:narrow-match",
        sources: value.mappings[0].targets,
        targets: value.mappings[0].sources,
      },
    });
    expect(value.mappings[0].relation).toBe("scientific:broad-match");
  });
});
