import { describe, expect, it } from "vitest";

import { compareValidationReports } from "./validationComparison";
import type { ValidationFinding, ValidationReport } from "./validation";

function finding(rule_id: string, severity: ValidationFinding["severity"]): ValidationFinding {
  return {
    rule_id,
    severity,
    message: rule_id,
    target: { page_index: 0, element_id: null, node_key: null, source_path: null },
    evidence: {},
    remediation: null,
  };
}

function report(findings: ValidationFinding[]): ValidationReport {
  const summary = { errors: 0, warnings: 0, info: 0, total: findings.length };
  for (const item of findings) {
    if (item.severity === "error") summary.errors += 1;
    else if (item.severity === "warning") summary.warnings += 1;
    else summary.info += 1;
  }
  return {
    validator_version: "test",
    source_format: "alto",
    source_version: "4.4",
    page_count: 1,
    summary,
    findings,
  };
}

describe("compareValidationReports", () => {
  it("computes severity and per-rule deltas deterministically", () => {
    const before = report([
      finding("GEOM.OUT_OF_BOUNDS", "error"),
      finding("GEOM.OUT_OF_BOUNDS", "error"),
      finding("META.MISSING_SOURCE_IMAGE", "info"),
    ]);
    const after = report([
      finding("GEOM.OUT_OF_BOUNDS", "error"),
      finding("GEOM.CHILD_OUTSIDE_PARENT", "warning"),
    ]);

    const comparison = compareValidationReports(before, after);

    expect(comparison.scope).toBe("semantic+iiif");
    expect(comparison.delta).toEqual({ errors: -1, warnings: 1, info: -1, total: -1 });
    expect(comparison.by_rule).toEqual([
      { rule_id: "GEOM.CHILD_OUTSIDE_PARENT", before: 0, after: 1, delta: 1 },
      { rule_id: "GEOM.OUT_OF_BOUNDS", before: 2, after: 1, delta: -1 },
      { rule_id: "META.MISSING_SOURCE_IMAGE", before: 1, after: 0, delta: -1 },
    ]);
  });

  it("returns zero deltas for identical reports", () => {
    const value = report([finding("TEXT.EMPTY_CONTENT", "warning")]);
    expect(compareValidationReports(value, value).delta).toEqual({ errors: 0, warnings: 0, info: 0, total: 0 });
  });
});
