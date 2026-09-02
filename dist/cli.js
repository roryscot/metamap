#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { adaptLegacySourcesOfTruth, isLegacySourceOfTruthDocument, } from "./adapters/source-of-truth.js";
import { MetamapGraph, MetamapValidationError } from "./graph.js";
import { parseEvaluationContext } from "./context.js";
import { promoteMetamapGeneration } from "./activation.js";
import { loadMetamapConfig } from "./config.js";
import { diffMetamapDocuments } from "./diff.js";
import { renderDriftReport } from "./report.js";
import { stableJson } from "./stable.js";
import { validateMetamapDocument } from "./validator.js";
import { compileMetamap, parseViabilityPolicy } from "./viability.js";
import { checkWorkspace, discoverWorkspace, workspaceHasErrors, writeWorkspaceOutputs, } from "./workspace.js";
function usage() {
    return `Usage:
  metamap validate <graph.json>
  metamap compile <graph.json> <policy.json> [output.json] [--context context.json] [--as-of timestamp] [--changed id]...
  metamap promote <graph.json> <policy.json> <current-generation.json> [--context context.json] [--as-of timestamp] [--changed id]...
  metamap impact <graph.json> <policy.json> <subject-id...> [--context context.json] [--as-of timestamp]
  metamap generate <metamap.config.json> [--no-cache]
  metamap check <metamap.config.json> [--no-cache]
  metamap diff <before.json> <after.json>
  metamap migrate-sources <sources-of-truth.json> [output.json]
  metamap trace <graph.json> <entity-id> [incoming|outgoing|both] [max-depth] [relation]
  metamap authority <graph.json> <concept-id> <fact>
`;
}
function parseArguments(args, valuedOptions) {
    const positionals = [];
    const options = new Map();
    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        if (!argument.startsWith("--")) {
            positionals.push(argument);
            continue;
        }
        if (!valuedOptions.has(argument)) {
            throw new Error(`Unknown option ${argument}`);
        }
        const value = args[index + 1];
        if (!value || value.startsWith("--")) {
            throw new Error(`${argument} requires a value`);
        }
        const values = options.get(argument) ?? [];
        values.push(value);
        options.set(argument, values);
        index += 1;
    }
    return { positionals, options };
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
function printViabilityIssues(issues) {
    for (const entry of issues) {
        const location = entry.path ? ` ${entry.path}` : "";
        const subject = entry.subjectId ? ` [${entry.subjectId}]` : "";
        const causalPath = entry.causalPath
            ? ` via ${entry.causalPath.join(" -> ")}`
            : "";
        const waiver = entry.waivedBy ? ` waived by ${entry.waivedBy}` : "";
        console.error(`${entry.severity.toUpperCase()} ${entry.code}${location}${subject}: ${entry.message}${causalPath}${waiver}`);
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
    if (command === "compile" || command === "promote" || command === "impact") {
        const parsed = parseArguments(rest, new Set(["--context", "--as-of", "--changed"]));
        const [graphPath, policyPath, ...remaining] = parsed.positionals;
        const outputPath = command === "impact" ? undefined : remaining[0];
        const changedSubjects = command === "impact"
            ? remaining
            : (parsed.options.get("--changed") ?? []);
        if (!graphPath ||
            !policyPath ||
            (command === "impact" && changedSubjects.length === 0) ||
            (command === "compile" && remaining.length > 1) ||
            (command === "promote" && remaining.length !== 1)) {
            console.error(usage());
            return 2;
        }
        const graphValue = await readJson(graphPath);
        const graphValidation = validateMetamapDocument(graphValue);
        if (!graphValidation.valid) {
            printIssues(graphValidation.issues);
            return 1;
        }
        const policy = parseViabilityPolicy(await readJson(policyPath));
        const contextPath = parsed.options.get("--context")?.[0];
        const context = contextPath
            ? parseEvaluationContext(await readJson(contextPath))
            : {};
        const evaluatedAt = parsed.options.get("--as-of")?.[0];
        if (command === "promote") {
            const promoted = await promoteMetamapGeneration(graphValue, policy, outputPath, { context, evaluatedAt, changedSubjects });
            printViabilityIssues(promoted.compilation.issues);
            if (!promoted.activated) {
                console.error(`REJECTED: retained ${promoted.previousDigest ?? "no previous generation"} at ${promoted.path}`);
                return 1;
            }
            console.error(`ACTIVATED ${promoted.current?.digest ?? "generation"} at ${promoted.path}`);
            return 0;
        }
        const result = compileMetamap(graphValue, policy, {
            context,
            evaluatedAt,
            changedSubjects,
        });
        printViabilityIssues(result.issues);
        if (command === "impact") {
            process.stdout.write(stableJson(result.impact, true));
            return result.status === "viable" ? 0 : 1;
        }
        if (result.status === "rejected") {
            console.error(`REJECTED: ${result.issues.filter((entry) => entry.severity === "error").length} error(s); ${result.quarantinedSubjects.length} subject(s) quarantined`);
            return 1;
        }
        const serialized = stableJson(result.generation, true);
        if (outputPath) {
            await writeFile(resolve(outputPath), serialized, "utf8");
            console.error(`Wrote viable generation ${outputPath}`);
        }
        else {
            process.stdout.write(serialized);
        }
        return 0;
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