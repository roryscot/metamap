import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { contentDigest } from "../stable.js";
const ADAPTER_VERSION = "1.0.0";
const Ajv2020 = Ajv2020Module.default;
const addFormats = addFormatsModule.default;
const graphSchema = JSON.parse(readFileSync(new URL("../../schemas/metamap-graph.schema.json", import.meta.url), "utf8"));
const validateGraphShape = addFormats(new Ajv2020({ allErrors: true, strict: true })).compile(graphSchema);
function schemaMessage(errors) {
    return (errors ?? [])
        .map((error) => `${error.instancePath || "$"} ${error.message ?? "is invalid"}`)
        .join("; ");
}
/**
 * Imports a portable Metamap graph shard emitted by any language or service.
 * Semantic relation validation is intentionally deferred to the composed
 * workspace, whose registry contains all configured relation packs.
 */
export class MetamapShardAdapter {
    id = "metamap-shard";
    version = ADAPTER_VERSION;
    async fingerprint(config, context) {
        const absolutePath = resolve(context.repositoryRoot, config.path);
        const source = await readFile(absolutePath, "utf8");
        return [
            {
                path: relative(context.repositoryRoot, absolutePath).replaceAll("\\", "/"),
                digest: contentDigest(source),
            },
        ];
    }
    async discover(config, context) {
        const absolutePath = resolve(context.repositoryRoot, config.path);
        const source = await readFile(absolutePath, "utf8");
        const repositoryPath = relative(context.repositoryRoot, absolutePath).replaceAll("\\", "/");
        const value = JSON.parse(source);
        if (!validateGraphShape(value)) {
            throw new Error(`${repositoryPath} is not a portable Metamap graph shard: ${schemaMessage(validateGraphShape.errors)}`);
        }
        return {
            sourceId: config.id,
            adapter: this.id,
            adapterVersion: this.version,
            inputs: [{ path: repositoryPath, digest: contentDigest(source) }],
            document: value,
            diagnostics: [],
        };
    }
}
//# sourceMappingURL=metamap-shard.js.map