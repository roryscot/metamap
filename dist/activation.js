import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { stableJson } from "./stable.js";
import { compileMetamap, parseViableGeneration, } from "./viability.js";
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
/**
 * Durably promote a viable generation with a same-directory atomic rename.
 * A rejected compilation performs no write, preserving the previous file.
 */
export async function promoteMetamapGeneration(document, policy, outputPath, options = {}) {
    const path = resolve(outputPath);
    const previous = await currentGeneration(path);
    const previousDigest = previous?.digest;
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