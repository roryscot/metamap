import type { AdapterDiagnostic, AdapterResult } from "./adapters/types.js";
import type { DriftIssue } from "./correspondence.js";
import type { GraphDiff } from "./diff.js";
import type {
  MetamapDocument,
  ValidationIssue,
  ValidationResult,
} from "./model.js";

export interface MetamapReportInput {
  graph: MetamapDocument;
  adapters: readonly AdapterResult[];
  driftIssues: readonly DriftIssue[];
  validation: ValidationResult;
  diff: GraphDiff;
  cacheHits?: readonly string[];
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function issueTable(
  entries: ReadonlyArray<{
    severity: string;
    code: string;
    message: string;
    subject?: string;
  }>,
): string[] {
  if (entries.length === 0) return ["No issues."];
  if (entries.length > 30) {
    const groups = new Map<
      string,
      { severity: string; code: string; count: number; examples: string[] }
    >();
    for (const entry of entries) {
      const key = `${entry.severity}\u0000${entry.code}`;
      const group = groups.get(key) ?? {
        severity: entry.severity,
        code: entry.code,
        count: 0,
        examples: [],
      };
      group.count += 1;
      if (group.examples.length < 3) {
        group.examples.push(entry.subject ?? entry.message);
      }
      groups.set(key, group);
    }
    return [
      "| Severity | Code | Count | Examples |",
      "| --- | --- | ---: | --- |",
      ...[...groups.values()].map(
        (group) =>
          `| ${group.severity} | ${escapeCell(group.code)} | ${group.count} | ${escapeCell(group.examples.join(", "))} |`,
      ),
    ];
  }
  return [
    "| Severity | Code | Subject | Message |",
    "| --- | --- | --- | --- |",
    ...entries.map(
      (entry) =>
        `| ${entry.severity} | ${escapeCell(entry.code)} | ${escapeCell(entry.subject ?? "")} | ${escapeCell(entry.message)} |`,
    ),
  ];
}

function adapterDiagnostics(
  adapters: readonly AdapterResult[],
): AdapterDiagnostic[] {
  return adapters.flatMap((adapter) => adapter.diagnostics);
}

export function renderDriftReport(input: MetamapReportInput): string {
  const adapterIssues = adapterDiagnostics(input.adapters);
  const errors =
    input.driftIssues.filter((issue) => issue.severity === "error").length +
    adapterIssues.filter((issue) => issue.severity === "error").length +
    input.validation.issues.filter((issue) => issue.severity === "error")
      .length;
  const warnings =
    input.driftIssues.filter((issue) => issue.severity === "warning").length +
    adapterIssues.filter((issue) => issue.severity === "warning").length +
    input.validation.issues.filter((issue) => issue.severity === "warning")
      .length;

  const lines = [
    "# Metamap drift report",
    "",
    `Status: **${errors === 0 ? "PASS" : "FAIL"}** — ${errors} error(s), ${warnings} warning(s).`,
    "",
    "## Graph summary",
    "",
    `- Entities: ${input.graph.entities.length}`,
    `- Mappings: ${input.graph.mappings.length}`,
    `- Authority declarations: ${input.graph.authorities.length}`,
    `- Adapter shards: ${input.adapters.length}`,
    `- Cache hits: ${input.cacheHits?.length ?? 0}`,
    "",
    "## Baseline diff",
    "",
    `- Added: ${input.diff.counts.added}`,
    `- Removed: ${input.diff.counts.removed}`,
    `- Changed: ${input.diff.counts.changed}`,
    "",
  ];

  if (input.diff.changes.length > 0) {
    lines.push(
      "| Change | Kind | ID | Properties |",
      "| --- | --- | --- | --- |",
      ...input.diff.changes.map(
        (change) =>
          `| ${change.change} | ${change.kind} | ${escapeCell(change.id)} | ${escapeCell(change.changedProperties?.join(", ") ?? "")} |`,
      ),
      "",
    );
  }

  lines.push(
    "## Correspondence drift",
    "",
    ...issueTable(
      input.driftIssues.map((issue) => ({
        severity: issue.severity,
        code: issue.code,
        message: issue.message,
        subject: issue.correspondenceId,
      })),
    ),
    "",
    "## Adapter diagnostics",
    "",
    ...issueTable(
      adapterIssues.map((issue) => ({
        severity: issue.severity,
        code: issue.code,
        message: issue.message,
        subject: issue.subjectId ?? issue.path,
      })),
    ),
    "",
    "## Graph validation",
    "",
    ...issueTable(
      input.validation.issues.map((issue: ValidationIssue) => ({
        severity: issue.severity,
        code: issue.code,
        message: issue.message,
        subject: issue.subjectId ?? issue.path,
      })),
    ),
    "",
  );
  return lines.join("\n");
}

export function renderGraphDocumentation(
  graph: MetamapDocument,
  correspondences: readonly { id: string }[],
): string {
  const kinds = new Map<string, number>();
  for (const entity of graph.entities) {
    kinds.set(entity.kind, (kinds.get(entity.kind) ?? 0) + 1);
  }
  const relations = new Map<string, number>();
  for (const mapping of graph.mappings) {
    relations.set(mapping.relation, (relations.get(mapping.relation) ?? 0) + 1);
  }
  const lines = [
    `# ${graph.label ?? "Structural map"}`,
    "",
    "> Generated by Metamap. Edit source structures or `metamap.config.json`, then regenerate.",
    "",
    "## Summary",
    "",
    `- Graph: \`${graph.id}\``,
    `- Revision: \`${graph.revision ?? "unversioned"}\``,
    `- Entities: ${graph.entities.length}`,
    `- Mappings: ${graph.mappings.length}`,
    `- Authorities: ${graph.authorities.length}`,
    "",
    "## Entity kinds",
    "",
    "| Kind | Count |",
    "| --- | ---: |",
    ...[...kinds]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([kind, count]) => `| ${kind} | ${count} |`),
    "",
    "## Relations",
    "",
    "| Relation | Count |",
    "| --- | ---: |",
    ...[...relations]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([relation, count]) => `| ${relation} | ${count} |`),
    "",
    "## Declared correspondences",
    "",
    ...(correspondences.length > 0
      ? correspondences.map((entry) => `- \`${entry.id}\``)
      : ["No declared correspondences."]),
    "",
    "## Authority",
    "",
    ...(graph.authorities.length > 0
      ? [
          "| Concept | Facts | Canonical source |",
          "| --- | --- | --- |",
          ...graph.authorities.map(
            (authority) =>
              `| ${authority.concept} | ${authority.facts.join(", ")} | ${authority.source} |`,
          ),
        ]
      : ["No authority declarations."]),
    "",
  ];
  return lines.join("\n");
}
