import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { analyzeImpact } from "./impact.js";
import { stableJson } from "./stable.js";
import { GovernanceError, parseGovernedActivationRequestJson, } from "./governance.js";
import { promoteProtectedGovernedActivation } from "./protected-activation.js";
export { readProtectedGovernedActivation } from "./protected-activation.js";
import { compileMetamap, parseViableGeneration, } from "./viability.js";
/** Bounded, strict data transport shared by the CLI and fixed owner wrapper. */
export async function readGovernedActivationRequestStream(input) {
    const chunks = [];
    let size = 0;
    for await (const chunk of input) {
        const bytes = Buffer.from(chunk);
        size += bytes.length;
        if (size > 64 * 1024 * 1024)
            throw new GovernanceError("GOVERNANCE_REQUEST_TOO_LARGE", "stdin exceeds 64 MiB");
        chunks.push(bytes);
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    return parseGovernedActivationRequestJson(text);
}
async function currentGeneration(path) {
    try {
        return parseViableGeneration(JSON.parse(await readFile(path, "utf8")));
    }
    catch (error) {
        if (typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "ENOENT") {
            return undefined;
        }
        throw error;
    }
}
export async function promoteMetamapGeneration(value, policyOrHost, outputPath, options = {}) {
    if (outputPath === undefined)
        return promoteProtectedGovernedActivation(value, policyOrHost);
    const document = value;
    const policy = policyOrHost;
    const path = resolve(outputPath);
    const previous = await currentGeneration(path);
    const previousDigest = previous?.digest;
    if (policy.schemaVersion !== "1.0.0") {
        const impact = analyzeImpact(document, {
            changedSubjects: options.changedSubjects ?? [],
            registry: options.relationRegistry,
        });
        return {
            activated: false,
            path,
            previousDigest,
            compilation: {
                status: "rejected",
                issues: [
                    {
                        severity: "error",
                        code: "PROTECTED_ACTIVATION_REQUIRED",
                        message: "Version 2 candidates require the protected activation boundary",
                        subjectId: policy.id,
                    },
                ],
                impact,
                quarantinedSubjects: impact.affectedSubjects,
            },
        };
    }
    const compilation = compileMetamap(document, policy, options);
    if (compilation.status === "rejected") {
        return {
            activated: false,
            path,
            previousDigest,
            compilation,
        };
    }
    const directory = dirname(path);
    await mkdir(directory, { recursive: true });
    const temporaryPath = resolve(directory, `.${basename(path)}.${randomUUID()}.tmp`);
    let handle;
    try {
        handle = await open(temporaryPath, "wx", 0o600);
        await handle.writeFile(stableJson(compilation.generation, true), "utf8");
        await handle.sync();
        await handle.close();
        handle = undefined;
        await rename(temporaryPath, path);
    }
    catch (error) {
        await handle?.close().catch(() => undefined);
        await unlink(temporaryPath).catch(() => undefined);
        throw error;
    }
    return {
        activated: true,
        path,
        previousDigest,
        current: compilation.generation,
        compilation,
    };
}
//# sourceMappingURL=activation.js.map