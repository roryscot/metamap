import { canonicalDigest } from "./canonical.js";
import type { DerivationIssue } from "./derivation-model.js";
import type { MetamapDocument } from "./model.js";
import type {
  ConsumerRiskBudget,
  SemanticGeneration,
} from "./semantic-model.js";
import type {
  ProjectionRiskSummary,
  SemanticProjectionSpec,
} from "./semantic-projection-model.js";
import { selectorMatches } from "./viability.js";

const issue = (
  code: string,
  message: string,
  subjectId: string,
): DerivationIssue => ({ code, message, subjectId });
/** Budget rules use the same selectors as viability declarations. */
export function consumerBudgetIssues(
  graph: MetamapDocument,
  budgets: readonly ConsumerRiskBudget[],
): DerivationIssue[] {
  const issues: DerivationIssue[] = [],
    ids = new Set<string>();
  const mappings = new Set(graph.mappings.map((mapping) => mapping.id));
  const kinds = new Map(
    graph.entities.map((entity) => [entity.id, entity.kind]),
  );
  for (const budget of budgets) {
    if (ids.has(budget.id))
      issues.push(
        issue(
          "DUPLICATE_CONSUMER_BUDGET",
          "Budget identity must be unique",
          budget.id,
        ),
      );
    ids.add(budget.id);
    const rules = new Set<string>();
    for (const rule of budget.classifications) {
      if (rules.has(rule.id))
        issues.push(
          issue(
            "DUPLICATE_RISK_CLASSIFICATION",
            "Classification identity must be unique within its budget",
            rule.id,
          ),
        );
      rules.add(rule.id);
      if (!Number.isSafeInteger(rule.cost) || rule.cost < 0)
        issues.push(
          issue(
            "INVALID_RISK_COST",
            "Classification cost must be a nonnegative safe integer",
            rule.id,
          ),
        );
      for (const id of rule.select.ids ?? [])
        if (!mappings.has(id))
          issues.push(
            issue(
              "UNKNOWN_RISK_SELECTOR_MAPPING",
              `Risk selector references missing mapping ${id}`,
              rule.id,
            ),
          );
      if (
        !graph.mappings.some((mapping) =>
          selectorMatches(mapping, rule.select, kinds),
        )
      )
        issues.push(
          issue(
            "STALE_RISK_CLASSIFICATION",
            "Risk selector matches no graph mappings",
            rule.id,
          ),
        );
    }
    for (const limit of [
      budget.maximumTotalCost,
      budget.maximumLossyMappings,
      budget.maximumInferredMappings,
    ])
      if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0))
        issues.push(
          issue(
            "INVALID_RISK_LIMIT",
            "Budget limits must be nonnegative safe integers",
            budget.id,
          ),
        );
  }
  return issues;
}

/** Account over the checked unique projection closure; costs are policy values. */
export function evaluateConsumerRisk(
  graph: MetamapDocument,
  generation: SemanticGeneration,
  spec: SemanticProjectionSpec,
  usedMappings: readonly string[],
): { risk: ProjectionRiskSummary; issues: DerivationIssue[] } {
  const issues = consumerBudgetIssues(graph, generation.semantic.riskBudgets);
  const mappings = new Map(
    graph.mappings.map((mapping) => [mapping.id, mapping]),
  );
  const summaries = new Map(
    generation.semantic.uncertainty.map((entry) => [entry.mapping, entry]),
  );
  const used = [...new Set(usedMappings)].sort();
  const risk: ProjectionRiskSummary = {
    status: "not-evaluated",
    budget: null,
    classifications: [],
    totalCost: null,
    lossyMappings: used.filter((id) => mappings.get(id)?.lossiness === "lossy"),
    inferredMappings: used.filter(
      (id) => mappings.get(id)?.provenance.status === "inferred",
    ),
    uncertainty: used.flatMap((id) =>
      summaries.has(id) ? [summaries.get(id)!] : [],
    ),
  };
  for (const id of used)
    if (!mappings.has(id) || !summaries.has(id))
      issues.push(
        issue(
          "INCOMPLETE_PROJECTION_RISK_INPUT",
          "Used mapping and uncertainty input must be available",
          id,
        ),
      );
  if (spec.budget === null) {
    if (
      generation.semantic.riskBudgets.some(
        (budget) => budget.consumer === spec.consumer,
      )
    )
      issues.push(
        issue(
          "CONSUMER_BUDGET_REQUIRED",
          "A consumer with a declared budget must select its matching budget",
          spec.consumer,
        ),
      );
    return { risk, issues };
  }
  const budget = generation.semantic.riskBudgets.find(
    (entry) => entry.id === spec.budget,
  );
  if (!budget)
    return {
      risk,
      issues: [
        ...issues,
        issue(
          "MISSING_CONSUMER_BUDGET",
          "Requested budget is unavailable",
          spec.budget,
        ),
      ],
    };
  if (budget.consumer !== spec.consumer)
    return {
      risk,
      issues: [
        ...issues,
        issue(
          "CONSUMER_BUDGET_MISMATCH",
          "Requested budget belongs to another consumer",
          spec.consumer,
        ),
      ],
    };
  const kinds = new Map(
    graph.entities.map((entity) => [entity.id, entity.kind]),
  );
  let total = 0n;
  for (const id of used) {
    const mapping = mappings.get(id);
    if (!mapping) continue;
    const rules = budget.classifications.filter((rule) =>
      selectorMatches(mapping, rule.select, kinds),
    );
    if (rules.length !== 1) {
      issues.push(
        issue(
          rules.length
            ? "AMBIGUOUS_RISK_CLASSIFICATION"
            : "MISSING_RISK_CLASSIFICATION",
          "Each used mapping must match exactly one consumer classification, including zero cost",
          id,
        ),
      );
      continue;
    }
    if (!Number.isSafeInteger(rules[0].cost) || rules[0].cost < 0) continue;
    risk.classifications.push({
      mapping: id,
      classification: rules[0].classification,
      cost: rules[0].cost,
    });
    total += BigInt(rules[0].cost);
  }
  if (total > BigInt(Number.MAX_SAFE_INTEGER))
    issues.push(
      issue(
        "RISK_COST_OVERFLOW",
        "Unique mapping costs exceed the safe integer range",
        budget.id,
      ),
    );
  else if (
    Number.isSafeInteger(budget.maximumTotalCost) &&
    total > BigInt(budget.maximumTotalCost)
  )
    issues.push(
      issue(
        "CONSUMER_RISK_BUDGET_EXCEEDED",
        `Unique mapping cost ${total} exceeds consumer maximum ${budget.maximumTotalCost}`,
        budget.id,
      ),
    );
  if (
    budget.maximumLossyMappings !== undefined &&
    risk.lossyMappings.length > budget.maximumLossyMappings
  )
    issues.push(
      issue(
        "CONSUMER_LOSSY_LIMIT_EXCEEDED",
        `Used lossy mapping count ${risk.lossyMappings.length} exceeds consumer maximum ${budget.maximumLossyMappings}`,
        budget.id,
      ),
    );
  if (
    budget.maximumInferredMappings !== undefined &&
    risk.inferredMappings.length > budget.maximumInferredMappings
  )
    issues.push(
      issue(
        "CONSUMER_INFERRED_LIMIT_EXCEEDED",
        `Used inferred mapping count ${risk.inferredMappings.length} exceeds consumer maximum ${budget.maximumInferredMappings}`,
        budget.id,
      ),
    );
  if (!issues.length) {
    risk.status = "evaluated";
    risk.budget = { id: budget.id, digest: canonicalDigest(budget) };
    risk.totalCost = Number(total);
  }
  return { risk, issues };
}
