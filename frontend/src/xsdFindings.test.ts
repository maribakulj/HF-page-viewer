import { describe, expect, it } from "vitest";

import type { ValidationReport } from "./validation";
import { combineValidationReport, COMBINED_VALIDATOR_VERSION } from "./xsdFindings";

const base: ValidationReport = {
  validator_version: "0.1.0",
  source_format: "alto",
  source_version: "4.4",
  page_count: 1,
  summary: { errors: 0, warnings: 0, info: 0, total: 0 },
  findings: [],
};

describe("combined validation report", () => {
  it("turns XSD diagnostics into XML.SCHEMA_INVALID findings", () => {
    const report = combineValidationReport(base, {
      status: "invalid",
      schemaId: "alto-4.4",
      schemaLabel: "ALTO 4.4",
      diagnostics: [{
        message: "Element String: The attribute CONTENT is required.",
        file: "input.xml",
        level: 2,
        line: 12,
        column: null,
        xpath: "/*/*[2]/*/*/*/*",
      }],
    });

    expect(report.validator_version).toBe(COMBINED_VALIDATOR_VERSION);
    expect(report.schema_validation).toEqual({
      status: "invalid",
      schema_id: "alto-4.4",
      schema_label: "ALTO 4.4",
      diagnostic_count: 1,
    });
    expect(report.summary.errors).toBe(1);
    expect(report.findings[0]).toMatchObject({
      rule_id: "XML.SCHEMA_INVALID",
      severity: "error",
      target: { source_path: "/*/*[2]/*/*/*/*" },
      evidence: { line: 12, schema_id: "alto-4.4" },
    });
  });

  it("records unsupported XSD versions without inventing an error finding", () => {
    const report = combineValidationReport(base, {
      status: "unsupported",
      reason: "No pinned XSD is registered for ALTO 3.1.",
    });
    expect(report.findings).toEqual([]);
    expect(report.schema_validation.status).toBe("unsupported");
    expect(report.schema_validation.reason).toContain("No pinned XSD");
  });
});
