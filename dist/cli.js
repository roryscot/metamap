#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { adaptLegacySourcesOfTruth, isLegacySourceOfTruthDocument, } from "./adapters/source-of-truth.js";
import { MetamapGraph, MetamapValidationError } from "./graph.js";
import { loadMetamapConfig } from "./config.js";
import { diffMetamapDocuments } from "./diff.js";
import { renderDriftReport } from "./report.js";
import { stableJson } from "./stable.js";
import { validateMetamapDocument } from "./validator.js";
import { checkWorkspace, discoverWorkspace, workspaceHasErrors, writeWorkspaceOutputs, } from "./workspace.js";
function usage() {
    return `Usage:
  metamap validate <graph.json>
  metamap generate <metamap.config.json> [--no-cache]
  metamap check <metamap.config.json> [--no-cache]
  metamap diff <before.json> <after.json>
  metamap migrate-sources <sources-of-truth.json> [output.json]
  metamap trace <graph.json> <entity-id> [incoming|outgoing|both] [max-depth] [relation]
  metamap authority <graph.json> <concept-id> <fact>
`;
}
async function readJson(path) {
    return JSON.parse(await readFile(resolve(path), "utf8"));
}
function printIssues(issues) {
    for (const entry of issues) {
        const location = entry.path ? ` ${entry.path}` : "";
        console.log(`${entry.severity.toUpperCase()} ${entry.code}${location}: ${entry.message}`);
    }
}
async function main(args) {
    const [command, ...rest] = args;
    if (command === "validate") {
        const [path] = rest;
        if (!path) {
            console.error(usage());
            return 2;
        }
        const result = validateMetamapDocument(await readJson(path));
        printIssues(result.issues);
        const errors = result.issues.filter((entry) => entry.severity === "error").length;
        const warnings = result.issues.length - errors;
        console.log(`${result.valid ? "VALID" : "INVALID"}: ${errors} error(s), ${warnings} warning(s)`);
        return result.valid ? 0 : 1;
    }
    if (command === "generate") {
        const [configPath, cacheOption] = rest;
        if (!configPath) {
            console.error(usage());
            return 2;
        }
        const loaded = await loadMetamapConfig(configPath);
        const discovery = await discoverWorkspace(loaded, {
            useCache: cacheOption !== "--no-cache",
        });
        if (workspaceHasErrors(discovery)) {
            console.error(renderDriftReport({
                ...discovery,
                diff: {
                    changes: [],
                    counts: { added: 0, removed: 0, changed: 0 },
                },
            }));
            console.error("Generation refused because Metamap has errors.");
            return 1;
        }
        await writeWorkspaceOutputs(loaded, discovery);
        console.log(`Generated ${loaded.config.outputs.graph}: ${discovery.graph.entities.length} entities, ${discovery.graph.mappings.length} mappings, ${discovery.graph.authorities.length} authorities`);
        return 0;
    }
    if (command === "check") {
        const [configPath, cacheOption] = rest;
        if (!configPath) {
            console.error(usage());
            return 2;
        }
        const loaded = await loadMetamapConfig(configPath);
        const check = await checkWorkspace(loaded, {
            useCache: cacheOption !== "--no-cache",
        });
        console.log(renderDriftReport(check));
        return workspaceHasErrors(check) ? 1 : 0;
    }
    if (command === "diff") {
        const [beforePath, afterPath] = rest;
        if (!beforePath || !afterPath) {
            console.error(usage());
            return 2;
        }
        const before = await readJson(beforePath);
        const after = await readJson(afterPath);
        const beforeValidation = validateMetamapDocument(before);
        const afterValidation = validateMetamapDocument(after);
        if (!beforeValidation.valid || !afterValidation.valid) {
            printIssues([...beforeValidation.issues, ...afterValidation.issues]);
            return 1;
        }
        console.log(stableJson(diffMetamapDocuments(before, after), true).trimEnd());
        return 0;
    }
    if (command === "migrate-sources") {
        const [inputPath, outputPath] = rest;
        if (!inputPath) {
            console.error(usage());
            return 2;
        }
        const legacy = await readJson(inputPath);
        if (!isLegacySourceOfTruthDocument(legacy)) {
            console.error(`${inputPath} is not a legacy sources-of-truth document`);
            return 1;
        }
        const result = adaptLegacySourcesOfTruth(legacy);
        for (const warning of result.warnings) {
            console.warn(`WARNING ${warning.code} ${warning.entryId}: ${warning.message}`);
        }
        const serialized = `${JSON.stringify(result.document, null, 2)}\n`;
        if (outputPath) {
            await writeFile(resolve(outputPath), serialized, "utf8");
            console.log(`Wrote ${outputPath}`);
        }
        else {
            process.stdout.write(serialized);
        }
        return 0;
    }
    if (command === "trace") {
        const [path, entityId, direction = "both", depth = "1", relation] = rest;
        if (!path ||
            !entityId ||
            !["incoming", "outgoing", "both"].includes(direction)) {
            console.error(usage());
            return 2;
        }
        try {
            const graph = MetamapGraph.from(await readJson(path));
            const visits = graph.trace(entityId, {
                direction: direction,
                maxDepth: Number.parseInt(depth, 10),
                relations: relation ? [relation] : undefined,
            });
            for (const visit of visits) {
                const via = visit.viaMapping
                    ? ` via ${visit.viaMapping.relation} (${visit.viaMapping.id})`
                    : "";
                console.log(`${"  ".repeat(visit.depth)}${visit.entity.id}${via}`);
            }
            return visits.length > 0 ? 0 : 1;
        }
        catch (error) {
            if (error instanceof MetamapValidationError) {
                printIssues(error.issues);
                return 1;
            }
            throw error;
        }
    }
    if (command === "authority") {
        const [path, conceptId, fact] = rest;
        if (!path || !conceptId || !fact) {
            console.error(usage());
            return 2;
        }
        const graph = MetamapGraph.from(await readJson(path));
        console.log(stableJson(graph.resolveAuthority(conceptId, fact), true).trimEnd());
        return 0;
    }
    console.error(usage());
    return 2;
}
main(process.argv.slice(2))
    .then((exitCode) => {
    process.exitCode = exitCode;
})
    .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
//# sourceMappingURL=cli.js.map