import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  compileMetamap,
  composeCorrespondences,
  parseCompositionRequest,
  parseRelationPack,
  parseSemanticPolicy,
  RelationRegistry,
  valueDigest,
} from "../../dist/index.js";

const read = async (name) =>
  JSON.parse(
    await readFile(new URL(`./${name}.json`, import.meta.url), "utf8"),
  );
const graph = await read("graph");
const pack = parseRelationPack(await read("pack"));
const request = parseCompositionRequest(await read("request"));
const registry = new RelationRegistry();
registry.registerPack(pack);
const proposal = composeCorrespondences(graph, request, registry);
if (proposal.status !== "proposed") throw new Error(JSON.stringify(proposal));

// Explicitly accept the returned proposal into this example's candidate graph.
// The generic law engine performs no mutation or authority grant.
const candidate = { ...graph, mappings: [...graph.mappings, proposal.mapping] };
const policy = parseSemanticPolicy({
  schemaVersion: "2.0.0",
  id: "urn:metamap:example:dependency-policy",
  graph: { id: candidate.id, digest: valueDigest(candidate) },
  mappings: [
    {
      select: { relations: ["example:depends"] },
      coverage: "total",
      determinism: "deterministic",
      reversibility: "reversible",
    },
  ],
  constraints: [],
  evidence: [],
  derivations: [proposal.derivation],
  derivationLimits: request.bounds,
  assessments: [],
  uncertaintyRequirements: [],
  riskBudgets: [],
});
const compilation = compileMetamap(candidate, policy, {
  relationRegistry: registry,
  context: request.context,
  evaluatedAt: "2026-10-09T00:00:00.000Z",
});
if (compilation.status !== "viable")
  throw new Error(JSON.stringify(compilation));
const directory = new URL("./generated/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, value] of Object.entries({
  proposal,
  graph: candidate,
  policy,
  generation: compilation.generation,
})) {
  await writeFile(
    new URL(`${name}.json`, directory),
    `${canonicalJson(value)}\n`,
  );
}
console.log(
  JSON.stringify({
    status: "admitted",
    generation: compilation.generation.id,
    proof: proposal.derivation.id,
    authorization: "not-evaluated",
    directory: fileURLToPath(directory),
  }),
);
