#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { adaptLegacySourcesOfTruth, isLegacySourceOfTruthDocument, } from "./adapters/source-of-truth.js";
import { MetamapGraph, MetamapValidationError } from "./graph.js";
import { parseEvaluationContext } from "./context.js";
import { promoteMetamapGeneration } from "./activation.js";
import { loadMetamapConfig } from "./config.js";
import { diffMetamapDocuments } from "./diff.js";
import { loadRelationPack } from "./relation-pack.js";
import { RelationRegistry } from "./relations.js";
import { renderDriftReport } from "./report.js";
import { stableJson } from "./stable.js";
import { canonicalJson, parseStrictJson } from "./canonical.js";
import { composeCorrespondences, parseCompositionRequestJson, } from "./derivation.js";
import { parseSemanticPolicy } from "./semantic.js";
import { captureReplayBundle, replayMetamap } from "./replay.js";
import { compareMetamapBundles } from "./counterfactual.js";
import { validateMetamapDocument } from "./validator.js";
import { compileMetamap, parseViabilityPolicy, parseViableGeneration, } from "./viability.js";
import { compilePathTree, emitTypeScriptPathTree } from "./path-tree.js";
import { compileProjection, emitTypeScriptProjection, parseProjectionSpec, } from "./projection.js";
import { checkWorkspace, discoverWorkspace, workspaceHasErrors, writeWorkspaceOutputs, } from "./workspace.js";
function usage() {
    return `Usage:
  metamap validate <graph.json> [--relation-pack pack.json]...
  metamap compose <graph.json> <composition-request.json> [proposal.json] [--relation-pack pack.json]...
  metamap compile <graph.json> <policy.json> [output.json] [--context context.json] [--as-of timestamp] [--changed id]... [--relation-pack pack.json]...
  metamap promote <graph.json> <policy.json> <current-generation.json> [--context context.json] [--as-of timestamp] [--changed id]... [--relation-pack pack.json]...
  metamap impact <graph.json> <policy.json> <subject-id...> [--context context.json] [--as-of timestamp] [--relation-pack pack.json]...
  metamap link <graph.json> <generation.json> <projection-spec.json> [output] [--format json|typescript|path-tree|path-tree-typescript] [--export name] [--relation-pack pack.json]...
  metamap capture <graph.json> <policy.json> [bundle.json] --as-of timestamp [--context context.json] [--changed id]... [--projection spec.json]... [--relation-pack pack.json]...
  metamap replay <bundle.json>
  metamap compare <before.replay.json> <after.replay.json> [report.json]
  metamap generate <metamap.config.json> [--no-cache]
  metamap check <metamap.config.json> [--no-cache]
  metamap diff <before.json> <after.json> [--relation-pack pack.json]...
  metamap migrate-sources <sources-of-truth.json> [output.json]
  metamap trace <graph.json> <entity-id> [incoming|outgoing|both] [max-depth] [relation] [--relation-pack pack.json]...
  metamap authority <graph.json> <concept-id> <fact> [--relation-pack pack.json]...
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
async function relationRegistryFrom(parsed) {
    const registry = new RelationRegistry();
    for (const path of parsed.options.get("--relation-pack") ?? []) {
        registry.registerPack(await loadRelationPack(path));
    }
    return registry;
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
function printProjectionIssues(issues) {
    for (const entry of issues) {
        const location = entry.path ? ` ${entry.path}` : "";
        const subject = entry.subjectId ? ` [${entry.subjectId}]` : "";
        const slot = entry.slot ? ` slot=${entry.slot}` : "";
        console.error(`${entry.severity.toUpperCase()} ${entry.code}${location}${subject}${slot}: ${entry.message}`);
    }
}
async function main(args) {
    const [command, ...rest] = args;
    if (command === "compose") {
        const parsed = parseArguments(rest, new Set(["--relation-pack"]));
        const [graphPath, requestPath, outputPath, ...extra] = parsed.positionals;
        if (!graphPath || !requestPath || extra.length > 0) {
            console.error(usage());
            return 2;
        }
        const registry = await relationRegistryFrom(parsed);
        const graph = parseStrictJson(await readFile(resolve(graphPath), "utf8"));
        const request = parseCompositionRequestJson(await readFile(resolve(requestPath), "utf8"));
        const result = composeCorrespondences(graph, request, registry);
        if (result.status !== "proposed") {
            for (const issue of result.issues)
                console.error(`${result.status.toUpperCase()} ${issue.code}: ${issue.message}`);
            if (!outputPath)
                process.stdout.write(`${canonicalJson(result)}\n`);
            return 1;
        }
        const serialized = `${canonicalJson(result)}\n`;
        if (outputPath)
            await writeFile(resolve(outputPath), serialized, "utf8");
        else
            process.stdout.write(serialized);
        return 0;
    }
    if (command === "compare") {
        const parsed = parseArguments(rest, new Set());
        const [beforePath, afterPath, outputPath] = parsed.positionals;
        if (!beforePath || !afterPath || parsed.positionals.length > 3) {
            console.error(usage());
            return 2;
        }
        const result = compareMetamapBundles(await readJson(beforePath), await readJson(afterPath));
        const serialized = stableJson(result, true);
        if (outputPath)
            await writeFile(resolve(outputPath), serialized, {
                encoding: "utf8",
                flag: "wx",
            });
        else
            process.stdout.write(serialized);
        return result.status === "compared" && result.report.after.admitted ? 0 : 1;
    }
    if (command === "capture") {
        const parsed = parseArguments(rest, new Set([
            "--as-of",
            "--context",
            "--changed",
            "--projection",
            "--relation-pack",
        ]));
        const [graphPath, policyPath, outputPath] = parsed.positionals;
        const evaluatedAt = parsed.options.get("--as-of")?.[0];
        if (!graphPath ||
            !policyPath ||
            !evaluatedAt ||
            parsed.positionals.length > 3 ||
            (parsed.options.get("--as-of")?.length ?? 0) !== 1 ||
            (parsed.options.get("--context")?.length ?? 0) > 1) {
            console.error(usage());
            return 2;
        }
        const relationRegistry = await relationRegistryFrom(parsed);
        const contextPath = parsed.options.get("--context")?.[0];
        const bundle = captureReplayBundle((await readJson(graphPath)), (await readJson(policyPath)), {
            evaluatedAt,
            relationRegistry,
            context: contextPath
                ? parseEvaluationContext(await readJson(contextPath))
                : {},
            changedSubjects: parsed.options.get("--changed") ?? [],
            projections: await Promise.all((parsed.options.get("--projection") ?? []).map(async (path) => parseProjectionSpec(await readJson(path)))),
        });
        const serialized = stableJson(bundle, true);
        if (outputPath) {
            await writeFile(resolve(outputPath), serialized, {
                encoding: "utf8",
                flag: "wx",
            });
            console.error(`Captured compiler evaluation ${outputPath}`);
        }
        else
            process.stdout.write(serialized);
        const result = bundle.expected;
        return result.compilation.status === "viable" &&
            result.projections.every((entry) => entry.result.status === "projected" &&
                (!entry.pathTree || entry.pathTree.status === "projected"))
            ? 0
            : 1;
    }
    if (command === "replay") {
        const parsed = parseArguments(rest, new Set());
        if (parsed.positionals.length !== 1) {
            console.error(usage());
            return 2;
        }
        const result = replayMetamap(await readJson(parsed.positionals[0]));
        process.stdout.write(stableJson(result, true));
        return result.status === "verified" && result.admitted ? 0 : 1;
    }
    if (command === "validate") {
        const parsed = parseArguments(rest, new Set(["--relation-pack"]));
        const [path] = parsed.positionals;
        if (!path || parsed.positionals.length !== 1) {
            console.error(usage());
            return 2;
        }
        const registry = await relationRegistryFrom(parsed);
        const result = validateMetamapDocument(await readJson(path), registry);
        printIssues(result.issues);
        const errors = result.issues.filter((entry) => entry.severity === "error").length;
        const warnings = result.issues.length - errors;
        console.log(`${result.valid ? "VALID" : "INVALID"}: ${errors} error(s), ${warnings} warning(s)`);
        return result.valid ? 0 : 1;
    }
    if (command === "compile" || command === "promote" || command === "impact") {
        const parsed = parseArguments(rest, new Set(["--context", "--as-of", "--changed", "--relation-pack"]));
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
        const relationRegistry = await relationRegistryFrom(parsed);
        const graphValue = await readJson(graphPath);
        const graphValidation = validateMetamapDocument(graphValue, relationRegistry);
        if (!graphValidation.valid) {
            printIssues(graphValidation.issues);
            return 1;
        }
        const policyText = await readFile(resolve(policyPath), "utf8");
        const policyValue = JSON.parse(policyText);
        const policy = policyValue.schemaVersion === "2.0.0"
            ? parseSemanticPolicy(parseStrictJson(policyText))
            : parseViabilityPolicy(policyValue);
        const contextPath = parsed.options.get("--context")?.[0];
        const context = contextPath
            ? parseEvaluationContext(await readJson(contextPath))
            : {};
        const evaluatedAt = parsed.options.get("--as-of")?.[0];
        if (command === "promote") {
            if (policy.schemaVersion !== "1.0.0") {
                console.error("PROTECTED_ACTIVATION_REQUIRED: version 2 candidates require the protected promoter");
                return 1;
            }
            const promoted = await promoteMetamapGeneration(graphValue, policy, outputPath, { context, evaluatedAt, changedSubjects, relationRegistry });
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
            relationRegistry,
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
        const serialized = result.generation.schemaVersion === "2.0.0"
            ? `${canonicalJson(result.generation)}\n`
            : stableJson(result.generation, true);
        if (outputPath) {
            await writeFile(resolve(outputPath), serialized, "utf8");
            console.error(`Wrote viable generation ${outputPath}`);
        }
        else {
            process.stdout.write(serialized);
        }
        return 0;
    }
    if (command === "link") {
        const parsed = parseArguments(rest, new Set(["--format", "--export", "--relation-pack"]));
        const [graphPath, generationPath, specPath, outputPath] = parsed.positionals;
        if (!graphPath ||
            !generationPath ||
            !specPath ||
            parsed.positionals.length > 4) {
            console.error(usage());
            return 2;
        }
        const format = parsed.options.get("--format")?.[0] ?? "json";
        if (!new Set(["json", "typescript", "path-tree", "path-tree-typescript"]).has(format)) {
            throw new Error(`Unsupported link format ${format}`);
        }
        const exportName = parsed.options.get("--export")?.[0];
        const relationRegistry = await relationRegistryFrom(parsed);
        const graph = (await readJson(graphPath));
        const generation = parseViableGeneration(await readJson(generationPath));
        const spec = parseProjectionSpec(await readJson(specPath));
        const result = compileProjection(graph, generation, spec, {
            relationRegistry,
        });
        printProjectionIssues(result.issues);
        if (result.status === "rejected") {
            console.error(`REJECTED: static projection has ${result.issues.length} error(s)`);
            return 1;
        }
        let serialized;
        if (format === "path-tree" || format === "path-tree-typescript") {
            const tree = compilePathTree(result.projection, spec);
            printProjectionIssues(tree.issues);
            if (tree.status === "rejected") {
                console.error(`REJECTED: path tree has ${tree.issues.length} error(s)`);
                return 1;
            }
            serialized =
                format === "path-tree-typescript"
                    ? emitTypeScriptPathTree(tree.pathTree, { exportName })
                    : stableJson(tree.pathTree, true);
        }
        else {
            serialized =
                format === "typescript"
                    ? emitTypeScriptProjection(result.projection, { exportName })
                    : stableJson(result.projection, true);
        }
        if (outputPath) {
            await writeFile(resolve(outputPath), serialized, "utf8");
            console.error(`Wrote static ${format} projection ${outputPath}`);
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
        const parsed = parseArguments(rest, new Set(["--relation-pack"]));
        const [beforePath, afterPath] = parsed.positionals;
        if (!beforePath || !afterPath || parsed.positionals.length !== 2) {
            console.error(usage());
            return 2;
        }
        const relationRegistry = await relationRegistryFrom(parsed);
        const before = await readJson(beforePath);
        const after = await readJson(afterPath);
        const beforeValidation = validateMetamapDocument(before, relationRegistry);
        const afterValidation = validateMetamapDocument(after, relationRegistry);
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
        const parsed = parseArguments(rest, new Set(["--relation-pack"]));
        const [path, entityId, direction = "both", depth = "1", relation] = parsed.positionals;
        if (!path ||
            !entityId ||
            !["incoming", "outgoing", "both"].includes(direction)) {
            console.error(usage());
            return 2;
        }
        try {
            const registry = await relationRegistryFrom(parsed);
            const graph = MetamapGraph.from(await readJson(path), { registry });
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
        const parsed = parseArguments(rest, new Set(["--relation-pack"]));
        const [path, conceptId, fact] = parsed.positionals;
        if (!path || !conceptId || !fact || parsed.positionals.length !== 3) {
            console.error(usage());
            return 2;
        }
        const registry = await relationRegistryFrom(parsed);
        const graph = MetamapGraph.from(await readJson(path), { registry });
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