import type { ValidationFinding, ValidationReport, ValidationSummary } from "./validation";
import type { BrowserXsdValidation } from "./xsdValidationProtocol";

export const COMBINED_VALIDATOR_VERSION = "0.2.0";

export type SchemaValidationExport = {
  status: Exclude<BrowserXsdValidation["status"], "idle" | "validating"> | "pending";
  schema_id: string | null;
  schema_label: string | null;
  reason?: string;
  stage?: string;
  diagnostic_count: number;
};

export type CombinedValidationReport = ValidationReport & {
  schema_validation: SchemaValidationExport;
};

function summarize(findings: ValidationFinding[]): ValidationSummary {
  const summary: ValidationSummary = { errors: 0, warnings: 0, info: 0, total: findings.length };
  for (const finding of findings) {
    if (finding.severity === "error") summary.errors += 1;
    else if (finding.severity === "warning") summary.warnings += 1;
    else summary.info += 1;
  }
  return summary;
}

function invalidSchemaFindings(validation: Extract<BrowserXsdValidation, { status: "invalid" }>): ValidationFinding[] {
  if (validation.diagnostics.length === 0) {
    return [{
      rule_id: "XML.SCHEMA_INVALID",
      severity: "error",
      message: `The document does not conform to the pinned ${validation.schemaLabel} schema.`,
      target: { page_index: null, element_id: null, node_key: null, source_path: null },
      evidence: { schema_id: validation.schemaId, schema_label: validation.schemaLabel },
      remediation: `Correct the XML so it conforms to ${validation.schemaLabel}.`,
    }];
  }

  return validation.diagnostics.map((diagnostic) => ({
    rule_id: "XML.SCHEMA_INVALID",
    severity: "error" as const,
    message: diagnostic.message,
    target: {
      page_index: null,
      element_id: null,
      node_key: null,
      source_path: diagnostic.xpath,
    },
    evidence: {
      schema_id: validation.schemaId,
      schema_label: validation.schemaLabel,
      file: diagnostic.file,
      line: diagnostic.line,
      column: diagnostic.column,
      xpath: diagnostic.xpath,
      libxml2_level: diagnostic.level,
    },
    remediation: `Correct the XML so it conforms to ${validation.schemaLabel}.`,
  }));
}

function schemaExport(validation: BrowserXsdValidation): SchemaValidationExport {
  if (validation.status === "idle" || validation.status === "validating") {
    return {
      status: "pending",
      schema_id: validation.status === "validating" ? validation.schemaId : null,
      schema_label: validation.status === "validating" ? validation.schemaLabel : null,
      diagnostic_count: 0,
    };
  }
  if (validation.status === "unsupported") {
    return {
      status: "unsupported",
      schema_id: null,
      schema_label: null,
      reason: validation.reason,
      diagnostic_count: 0,
    };
  }
  if (validation.status === "error") {
    return {
      status: "error",
      schema_id: validation.schemaId,
      schema_label: validation.schemaLabel,
      reason: validation.message,
      stage: validation.stage,
      diagnostic_count: validation.diagnostics.length,
    };
  }
  return {
    status: validation.status,
    schema_id: validation.schemaId,
    schema_label: validation.schemaLabel,
    diagnostic_count: validation.diagnostics.length,
  };
}

export function combineValidationReport(base: ValidationReport, xsd: BrowserXsdValidation): CombinedValidationReport {
  const extra = xsd.status === "invalid" ? invalidSchemaFindings(xsd) : [];
  const findings = [...extra, ...base.findings];
  return {
    ...base,
    validator_version: COMBINED_VALIDATOR_VERSION,
    summary: summarize(findings),
    findings,
    schema_validation: schemaExport(xsd),
  };
}
