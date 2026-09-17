import type {
  PageDocumentDTO,
  ReadingOrderGroupDTO,
  SourceRefDTO,
  TextAlternativeDTO,
} from "./types";
import type {
  ValidationFinding,
  ValidationReport,
  ValidationSummary,
  ValidationTarget,
} from "./validation";

export const EXTENDED_SEMANTIC_VALIDATOR_VERSION = "0.2.0";

type RecordKind = "page" | "region" | "line" | "word" | "glyph" | "metadata" | "processing" | "extension" | "reading_order";

type SourceRecord = {
  pageIndex: number | null;
  kind: RecordKind;
  elementId: string | null;
  nodeKey: string | null;
  sourceRef: SourceRefDTO | null;
  textAlternatives: TextAlternativeDTO[];
};

function selectionKey(kind: RecordKind, sourceRef: SourceRefDTO | null, elementId: string | null): string | null {
  if (!elementId || !["region", "line", "word", "glyph"].includes(kind)) return null;
  return `${kind}:${sourceRef?.path ?? elementId}`;
}

function recordTarget(record: SourceRecord): ValidationTarget {
  return {
    page_index: record.pageIndex,
    element_id: record.elementId,
    node_key: record.nodeKey,
    source_path: record.sourceRef?.path ?? null,
  };
}

function globalTarget(sourceRef: SourceRefDTO | null = null): ValidationTarget {
  return {
    page_index: null,
    element_id: sourceRef?.xml_id ?? null,
    node_key: null,
    source_path: sourceRef?.path ?? null,
  };
}

function finding(
  ruleId: string,
  severity: "error" | "warning" | "info",
  message: string,
  target: ValidationTarget,
  evidence: Record<string, unknown>,
  remediation: string | null,
): ValidationFinding {
  return { rule_id: ruleId, severity, message, target, evidence, remediation };
}

function collectRecords(document: PageDocumentDTO): SourceRecord[] {
  const records: SourceRecord[] = [];

  document.pages.forEach((page, pageIndex) => {
    records.push({
      pageIndex,
      kind: "page",
      elementId: page.element_id,
      nodeKey: null,
      sourceRef: page.source_ref,
      textAlternatives: [],
    });

    const addRegion = (region: PageDocumentDTO["pages"][number]["regions"][number]): void => {
      records.push({
        pageIndex,
        kind: "region",
        elementId: region.element_id,
        nodeKey: selectionKey("region", region.source_ref, region.element_id),
        sourceRef: region.source_ref,
        textAlternatives: region.text_alternatives,
      });
      for (const line of region.lines) {
        records.push({
          pageIndex,
          kind: "line",
          elementId: line.element_id,
          nodeKey: selectionKey("line", line.source_ref, line.element_id),
          sourceRef: line.source_ref,
          textAlternatives: line.text_alternatives,
        });
        for (const word of line.words) {
          records.push({
            pageIndex,
            kind: "word",
            elementId: word.element_id,
            nodeKey: selectionKey("word", word.source_ref, word.element_id),
            sourceRef: word.source_ref,
            textAlternatives: word.text_alternatives,
          });
          for (const glyph of word.glyphs) {
            records.push({
              pageIndex,
              kind: "glyph",
              elementId: glyph.element_id,
              nodeKey: selectionKey("glyph", glyph.source_ref, glyph.element_id),
              sourceRef: glyph.source_ref,
              textAlternatives: glyph.text_alternatives,
            });
          }
        }
      }
      region.regions.forEach(addRegion);
    };
    page.regions.forEach(addRegion);

    const addReadingOrder = (group: ReadingOrderGroupDTO): void => {
      records.push({
        pageIndex,
        kind: "reading_order",
        elementId: group.element_id,
        nodeKey: null,
        sourceRef: group.source_ref,
        textAlternatives: [],
      });
      group.groups.forEach(addReadingOrder);
    };
    if (page.reading_order) addReadingOrder(page.reading_order);
  });

  document.metadata.forEach((entry) => records.push({
    pageIndex: null,
    kind: "metadata",
    elementId: entry.source_ref?.xml_id ?? null,
    nodeKey: null,
    sourceRef: entry.source_ref,
    textAlternatives: [],
  }));
  document.processing_steps.forEach((step) => records.push({
    pageIndex: null,
    kind: "processing",
    elementId: step.identifier,
    nodeKey: null,
    sourceRef: step.source_ref,
    textAlternatives: [],
  }));
  document.extensions.forEach((extension) => records.push({
    pageIndex: null,
    kind: "extension",
    elementId: extension.identifier,
    nodeKey: null,
    sourceRef: extension.source_ref,
    textAlternatives: [],
  }));

  return records;
}

function preferredText(alternatives: TextAlternativeDTO[]): string | null {
  const preferred = alternatives.find((alternative) => alternative.kind === "primary")
    ?? alternatives.find((alternative) => alternative.kind === "reconstructed")
    ?? alternatives[0];
  const text = preferred?.text.trim() ?? "";
  return text || null;
}

function normalizedText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function textEmptyContent(document: PageDocumentDTO, records: SourceRecord[]): ValidationFinding[] {
  return records.flatMap((record) => {
    if (record.kind !== "word") return [];
    if (preferredText(record.textAlternatives)) return [];
    return [finding(
      "TEXT.EMPTY_CONTENT",
      "warning",
      `Word ${record.elementId ?? "without ID"} has geometry/structure but no non-empty text content.`,
      recordTarget(record),
      { alternatives: record.textAlternatives },
      "Encode a primary word transcription when OCR/text content is expected, or verify that this is intentionally layout-only data.",
    )];
  });
}

function hierarchyMismatch(document: PageDocumentDTO): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  document.pages.forEach((page, pageIndex) => {
    const inspectRegion = (region: PageDocumentDTO["pages"][number]["regions"][number]): void => {
      for (const line of region.lines) {
        const explicitLine = line.text_alternatives.find((alternative) => alternative.kind === "primary");
        if (!explicitLine || line.words.length === 0) continue;
        const wordTexts = line.words.map((word) => preferredText(word.text_alternatives));
        if (wordTexts.some((value) => value == null)) continue;
        const joinedWords = normalizedText((wordTexts as string[]).join(" "));
        const lineText = normalizedText(explicitLine.text);
        if (!lineText || lineText === joinedWords) continue;
        const record: SourceRecord = {
          pageIndex,
          kind: "line",
          elementId: line.element_id,
          nodeKey: selectionKey("line", line.source_ref, line.element_id),
          sourceRef: line.source_ref,
          textAlternatives: line.text_alternatives,
        };
        findings.push(finding(
          "TEXT.HIERARCHY_MISMATCH",
          "warning",
          `Line ${line.element_id} text differs from the concatenated word transcription.`,
          recordTarget(record),
          { line_text: lineText, word_text: joinedWords, word_count: line.words.length },
          "Inspect line- and word-level TextEquiv/content values and correct the hierarchy if they are intended to represent the same transcription.",
        ));
      }
      region.regions.forEach(inspectRegion);
    };
    page.regions.forEach(inspectRegion);
  });

  return findings;
}

function hyphenationInconsistency(document: PageDocumentDTO, records: SourceRecord[]): ValidationFinding[] {
  if (document.source_format !== "alto") return [];
  const findings: ValidationFinding[] = [];
  for (const record of records) {
    if (record.kind !== "word" || !record.sourceRef) continue;
    const type = record.sourceRef.attributes.SUBS_TYPE?.trim() ?? "";
    const content = record.sourceRef.attributes.SUBS_CONTENT?.trim() ?? "";
    if (Boolean(type) === Boolean(content)) continue;
    findings.push(finding(
      "TEXT.HYPHENATION_INCONSISTENT",
      "warning",
      `Word ${record.elementId ?? "without ID"} encodes ${type ? "SUBS_TYPE" : "SUBS_CONTENT"} without its companion substitution attribute.`,
      recordTarget(record),
      { SUBS_TYPE: type || null, SUBS_CONTENT: content || null },
      "Encode SUBS_TYPE and SUBS_CONTENT together when using ALTO substitution/hyphenation semantics.",
    ));
  }
  return findings;
}

function danglingIdNext(document: PageDocumentDTO, records: SourceRecord[]): ValidationFinding[] {
  if (document.source_format !== "alto") return [];
  const knownIds = new Set<string>();
  for (const record of records) {
    if (record.sourceRef?.xml_id) knownIds.add(record.sourceRef.xml_id);
    if (record.elementId && !record.elementId.startsWith("anon:")) knownIds.add(record.elementId);
  }

  const findings: ValidationFinding[] = [];
  for (const record of records) {
    const targetId = record.sourceRef?.attributes.IDNEXT?.trim();
    if (!targetId || knownIds.has(targetId)) continue;
    findings.push(finding(
      "XML.DANGLING_REFERENCE",
      "error",
      `IDNEXT reference ${JSON.stringify(targetId)} does not resolve to a known XML ID.`,
      recordTarget(record),
      { relation: "IDNEXT", reference: targetId },
      "Correct IDNEXT or restore the missing target element.",
    ));
  }
  return findings;
}

function missingOcrProcessing(document: PageDocumentDTO): ValidationFinding[] {
  if (document.source_format !== "alto" || document.processing_steps.length > 0) return [];
  return [finding(
    "META.MISSING_OCR_PROCESSING",
    "info",
    "ALTO document contains no normalized OCR/processing provenance step.",
    globalTarget(),
    {},
    "Encode OCRProcessing/Processing provenance when the producing workflow can provide it.",
  )];
}

function unknownSoftwareVersion(document: PageDocumentDTO): ValidationFinding[] {
  return document.processing_steps.flatMap((step) => {
    if (!step.software_name?.trim() || step.software_version?.trim()) return [];
    return [finding(
      "META.UNKNOWN_SOFTWARE_VERSION",
      "info",
      `Processing software ${JSON.stringify(step.software_name)} has no encoded version.`,
      globalTarget(step.source_ref),
      { processing_step: step.identifier, software_name: step.software_name },
      "Record the producing software version when available so results remain reproducible.",
    )];
  });
}

function timestampInconsistency(document: PageDocumentDTO): ValidationFinding[] {
  if (document.source_format !== "page_xml") return [];
  const created = document.metadata.find((entry) => entry.label === "page.metadata.created");
  const lastChange = document.metadata.find((entry) => entry.label === "page.metadata.lastchange");
  if (!created || !lastChange) return [];
  const createdTime = Date.parse(created.value);
  const lastChangeTime = Date.parse(lastChange.value);
  if (!Number.isFinite(createdTime) || !Number.isFinite(lastChangeTime) || lastChangeTime >= createdTime) return [];
  return [finding(
    "META.TIMESTAMP_INCONSISTENT",
    "warning",
    "PAGE Metadata LastChange is earlier than Created.",
    globalTarget(lastChange.source_ref),
    { created: created.value, last_change: lastChange.value },
    "Correct the PAGE metadata chronology so LastChange is not earlier than Created.",
  )];
}

export const ADDITIONAL_RULE_IDS = [
  "XML.DANGLING_REFERENCE",
  "TEXT.EMPTY_CONTENT",
  "TEXT.HIERARCHY_MISMATCH",
  "TEXT.HYPHENATION_INCONSISTENT",
  "META.MISSING_OCR_PROCESSING",
  "META.UNKNOWN_SOFTWARE_VERSION",
  "META.TIMESTAMP_INCONSISTENT",
] as const;

function summarize(findings: ValidationFinding[]): ValidationSummary {
  const summary: ValidationSummary = { errors: 0, warnings: 0, info: 0, total: findings.length };
  for (const item of findings) {
    if (item.severity === "error") summary.errors += 1;
    else if (item.severity === "warning") summary.warnings += 1;
    else summary.info += 1;
  }
  return summary;
}

export function additionalValidationFindings(document: PageDocumentDTO): ValidationFinding[] {
  const records = collectRecords(document);
  return [
    ...danglingIdNext(document, records),
    ...textEmptyContent(document, records),
    ...hierarchyMismatch(document),
    ...hyphenationInconsistency(document, records),
    ...missingOcrProcessing(document),
    ...unknownSoftwareVersion(document),
    ...timestampInconsistency(document),
  ];
}

export function applyAdditionalValidation(base: ValidationReport, document: PageDocumentDTO): ValidationReport {
  const findings = [...base.findings, ...additionalValidationFindings(document)];
  return {
    ...base,
    validator_version: EXTENDED_SEMANTIC_VALIDATOR_VERSION,
    summary: summarize(findings),
    findings,
  };
}
