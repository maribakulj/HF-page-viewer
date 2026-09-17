import { describe, expect, it } from "vitest";

import { additionalValidationFindings, applyAdditionalValidation, ADDITIONAL_RULE_IDS, EXTENDED_SEMANTIC_VALIDATOR_VERSION } from "./additionalValidation";
import type { PageDocumentDTO, SourceRefDTO } from "./types";
import type { ValidationReport } from "./validation";

function source(path: string, xmlId: string | null, attributes: Record<string, string> = {}): SourceRefDTO {
  return { element_name: path.split("/").at(-1) ?? "node", path, xml_id: xmlId, attributes };
}

function altoDocument(): PageDocumentDTO {
  return {
    source_format: "alto",
    source_version: "4.4",
    namespace: "http://www.loc.gov/standards/alto/ns-v4#",
    pages: [{
      element_id: "p1",
      width: 1000,
      height: 1000,
      measurement_unit: "pixel",
      image_reference: "page.jpg",
      language: null,
      other_languages: [],
      rotation: null,
      source_ref: source("/alto/Layout/Page", "p1"),
      reading_order: null,
      regions: [{
        element_id: "b1",
        region_type: "text",
        geometry: null,
        text_alternatives: [],
        source_ref: source("/alto/Layout/Page/PrintSpace/TextBlock", "b1"),
        regions: [],
        lines: [{
          element_id: "l1",
          geometry: null,
          baseline: null,
          text_alternatives: [{ text: "hello world", confidence: null, kind: "reconstructed" }],
          source_ref: source("/alto/Layout/Page/PrintSpace/TextBlock/TextLine", "l1"),
          words: [
            {
              element_id: "w1",
              geometry: null,
              confidence: 0.9,
              text_alternatives: [{ text: "hello", confidence: 0.9, kind: "primary" }],
              source_ref: source("/alto/Layout/Page/PrintSpace/TextBlock/TextLine/String[1]", "w1", { CONTENT: "hello", IDNEXT: "w2" }),
              glyphs: [],
            },
            {
              element_id: "w2",
              geometry: null,
              confidence: 0.9,
              text_alternatives: [{ text: "world", confidence: 0.9, kind: "primary" }],
              source_ref: source("/alto/Layout/Page/PrintSpace/TextBlock/TextLine/String[2]", "w2", { CONTENT: "world" }),
              glyphs: [],
            },
          ],
        }],
      }],
    }],
    metadata: [],
    processing_steps: [{
      identifier: "proc1",
      software_name: "OCR Engine",
      software_version: "1.0",
      timestamp: "2026-09-17T12:00:00Z",
      attributes: {},
      source_ref: source("/alto/Description/OCRProcessing/ocrProcessingStep", "proc1"),
    }],
    extensions: [],
    notices: [],
    source_attributes: {},
  };
}

function pageDocument(): PageDocumentDTO {
  return {
    source_format: "page_xml",
    source_version: "2019-07-15",
    namespace: "http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15",
    pages: [{
      element_id: "page:1",
      width: 1000,
      height: 1000,
      measurement_unit: "pixel",
      image_reference: "page.jpg",
      language: null,
      other_languages: [],
      rotation: null,
      source_ref: source("/PcGts/Page", null),
      reading_order: null,
      regions: [{
        element_id: "r1",
        region_type: "text:paragraph",
        geometry: null,
        text_alternatives: [],
        source_ref: source("/PcGts/Page/TextRegion", "r1"),
        regions: [],
        lines: [{
          element_id: "l1",
          geometry: null,
          baseline: null,
          text_alternatives: [{ text: "Bonjour monde", confidence: 0.9, kind: "primary" }],
          source_ref: source("/PcGts/Page/TextRegion/TextLine", "l1"),
          words: [
            {
              element_id: "w1",
              geometry: null,
              confidence: 0.9,
              text_alternatives: [{ text: "Bonjour", confidence: 0.9, kind: "primary" }],
              source_ref: source("/PcGts/Page/TextRegion/TextLine/Word[1]", "w1"),
              glyphs: [],
            },
            {
              element_id: "w2",
              geometry: null,
              confidence: 0.9,
              text_alternatives: [{ text: "monde", confidence: 0.9, kind: "primary" }],
              source_ref: source("/PcGts/Page/TextRegion/TextLine/Word[2]", "w2"),
              glyphs: [],
            },
          ],
        }],
      }],
    }],
    metadata: [
      { label: "page.metadata.created", value: "2026-09-17T10:00:00Z", source_ref: source("/PcGts/Metadata/Created", null) },
      { label: "page.metadata.lastchange", value: "2026-09-17T11:00:00Z", source_ref: source("/PcGts/Metadata/LastChange", null) },
    ],
    processing_steps: [],
    extensions: [],
    notices: [],
    source_attributes: {},
  };
}

function ruleIds(document: PageDocumentDTO): string[] {
  return additionalValidationFindings(document).map((item) => item.rule_id);
}

describe("additional semantic validation", () => {
  it("keeps a consistent ALTO sample clean", () => {
    expect(additionalValidationFindings(altoDocument())).toEqual([]);
  });

  it("detects dangling IDNEXT independently from reading order", () => {
    const document = altoDocument();
    document.pages[0].regions[0].lines[0].words[0].source_ref!.attributes.IDNEXT = "missing";
    const findings = additionalValidationFindings(document);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule_id: "XML.DANGLING_REFERENCE",
      severity: "error",
      target: { element_id: "w1" },
      evidence: { relation: "IDNEXT", reference: "missing" },
    });
  });

  it("flags structured words with empty text content", () => {
    const document = altoDocument();
    document.pages[0].regions[0].lines[0].words[1].text_alternatives = [];
    expect(ruleIds(document)).toContain("TEXT.EMPTY_CONTENT");
  });

  it("compares explicit PAGE line text with complete word transcription", () => {
    const document = pageDocument();
    document.pages[0].regions[0].lines[0].text_alternatives[0].text = "Bonjour autre";
    const finding = additionalValidationFindings(document).find((item) => item.rule_id === "TEXT.HIERARCHY_MISMATCH");
    expect(finding).toMatchObject({
      severity: "warning",
      target: { element_id: "l1" },
      evidence: { line_text: "Bonjour autre", word_text: "Bonjour monde", word_count: 2 },
    });
  });

  it("does not compare reconstructed ALTO line text back to its own words", () => {
    const document = altoDocument();
    document.pages[0].regions[0].lines[0].text_alternatives[0].text = "different reconstructed cache";
    expect(ruleIds(document)).not.toContain("TEXT.HIERARCHY_MISMATCH");
  });

  it("requires ALTO substitution type and content to be encoded together", () => {
    const document = altoDocument();
    document.pages[0].regions[0].lines[0].words[0].source_ref!.attributes.SUBS_TYPE = "HypPart1";
    const finding = additionalValidationFindings(document).find((item) => item.rule_id === "TEXT.HYPHENATION_INCONSISTENT");
    expect(finding?.evidence).toEqual({ SUBS_TYPE: "HypPart1", SUBS_CONTENT: null });
  });

  it("adds provenance findings for missing processing and software version", () => {
    const missing = altoDocument();
    missing.processing_steps = [];
    expect(ruleIds(missing)).toContain("META.MISSING_OCR_PROCESSING");

    const unknownVersion = altoDocument();
    unknownVersion.processing_steps[0].software_version = null;
    expect(ruleIds(unknownVersion)).toContain("META.UNKNOWN_SOFTWARE_VERSION");
  });

  it("detects PAGE metadata chronology inversion", () => {
    const document = pageDocument();
    document.metadata[1].value = "2026-09-17T09:00:00Z";
    const finding = additionalValidationFindings(document).find((item) => item.rule_id === "META.TIMESTAMP_INCONSISTENT");
    expect(finding).toMatchObject({
      severity: "warning",
      evidence: {
        created: "2026-09-17T10:00:00Z",
        last_change: "2026-09-17T09:00:00Z",
      },
    });
  });

  it("extends an existing semantic report deterministically", () => {
    const document = altoDocument();
    document.processing_steps = [];
    const base: ValidationReport = {
      validator_version: "0.1.0",
      source_format: "alto",
      source_version: "4.4",
      page_count: 1,
      summary: { errors: 0, warnings: 0, info: 0, total: 0 },
      findings: [],
    };
    const left = applyAdditionalValidation(base, document);
    const right = applyAdditionalValidation(base, document);
    expect(left).toEqual(right);
    expect(left.validator_version).toBe(EXTENDED_SEMANTIC_VALIDATOR_VERSION);
    expect(left.summary.info).toBe(1);
  });

  it("keeps the additional rule id set unique", () => {
    expect(new Set(ADDITIONAL_RULE_IDS).size).toBe(ADDITIONAL_RULE_IDS.length);
  });
});
