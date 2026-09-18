import type { ValidationReport, ValidationSummary } from "./validation";

export type ValidationRuleDelta = {
  rule_id: string;
  before: number;
  after: number;
  delta: number;
};

export type ValidationComparison = {
  scope: "semantic+iiif";
  before: ValidationSummary;
  after: ValidationSummary;
  delta: ValidationSummary;
  by_rule: ValidationRuleDelta[];
};

function countRules(report: ValidationReport): Map<string, number> {
  const counts = new Map<string, number>();
  for (const finding of report.findings) {
    counts.set(finding.rule_id, (counts.get(finding.rule_id) ?? 0) + 1);
  }
  return counts;
}

function deltaSummary(before: ValidationSummary, after: ValidationSummary): ValidationSummary {
  return {
    errors: after.errors - before.errors,
    warnings: after.warnings - before.warnings,
    info: after.info - before.info,
    total: after.total - before.total,
  };
}

export function compareValidationReports(before: ValidationReport, after: ValidationReport): ValidationComparison {
  const beforeRules = countRules(before);
  const afterRules = countRules(after);
  const ruleIds = [...new Set([...beforeRules.keys(), ...afterRules.keys()])].sort();

  return {
    scope: "semantic+iiif",
    before: { ...before.summary },
    after: { ...after.summary },
    delta: deltaSummary(before.summary, after.summary),
    by_rule: ruleIds.map((rule_id) => {
      const beforeCount = beforeRules.get(rule_id) ?? 0;
      const afterCount = afterRules.get(rule_id) ?? 0;
      return {
        rule_id,
        before: beforeCount,
        after: afterCount,
        delta: afterCount - beforeCount,
      };
    }),
  };
}
