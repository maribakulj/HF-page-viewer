import { describe, expect, it } from "vitest";

import type { PageDocumentDTO, SourceRefDTO } from "./types";
import { validateDocument, VALIDATION_RULES, VALIDATOR_VERSION } from "./validation";

function source(xmlId: string | null, path: string): SourceRefDTO {
  return { element_name: path.split("/").at(-1) ?? "node", path, xml_id: xmlId, attributes: {} };
}

function validDocument(): PageDocumentDTO {
  return {
    source_format: "alto",
    source_version: "4.4",
    namespace: "http://www.loc.gov/standards/alto/ns-v4#",
    pages: [{
      element_id: "p1",
      width: 100,
      height: 100,
      measurement_unit: "pixel",
      image_reference: "page.jpg",
      language: "fr",
      other_languages: [],
      rotation: null,
      source_ref: source("p1", "/alto/Layout/Page"),
      reading_order: {
        element_id: "ro1",
        ordered: true,
        refs: ["r1"],
        groups: [],
        source_ref: source("ro1", "/alto/Layout/Page/ReadingOrder/OrderedGroup"),
      },
      regions: [{
        element_id: "r1",
        region_type: "TextBlock",
        geometry: { kind: "bbox", x: 10, y: 10, width: 80, height: 80 },
        text_alternatives: [],
        source_ref: source("r1", "/alto/Layout/Page/PrintSpace/TextBlock"),
        regions: [],
        lines: [{
          element_id: "l1",
          geometry: { kind: "bbox", x: 10, y: 10, width: 80, height: 20 },
          baseline: null,
          text_alternatives: [{ text: "hello", confidence: 0.99, kind: "primary" }],
          source_ref: source("l1", "/alto/Layout/Page/PrintSpace/TextBlock/TextLine"),
          words: [{
            element_id: "w1",
            geometry: { kind: "bbox", x: 15, y: 15, width: 20, height: 10 },
            confidence: 0.95,
            text_alternatives: [{ text: "hello", confidence: 0.95, kind: "primary" }],
            source_ref: source("w1", "/alto/Layout/Page/PrintSpace/TextBlock/TextLine/String"),
            glyphs: [],
          }],
        }],
      }],
    }],
    metadata: [],
    processing_steps: [],
    extensions: [],
    notices: [],
    source_attributes: {},
  };
}

function brokenDocument(): PageDocumentDTO {
  const document = validDocument();
  const page = document.pages[0];
  page.image_reference = null;
  page.reading_order = {
    element_id: "ro1",
    ordered: true,
    refs: ["w1", "w1", "missing"],
    groups: [],
    source_ref: source("ro1", "/alto/Layout/Page/ReadingOrder/OrderedGroup"),
  };
  const line = page.regions[0].lines[0];
  line.words.push({
    element_id: "w2",
    geometry: { kind: "bbox", x: 95, y: 15, width: 20, height: 10 },
    confidence: 1.2,
    text_alternatives: [{ text: "bad", confidence: null, kind: "primary" }],
    source_ref: source("w1", "/alto/Layout/Page/PrintSpace/TextBlock/TextLine/String[2]"),
    glyphs: [{
      element_id: "g1",
      geometry: { kind: "bbox", x: 98, y: 16, width: 0, height: 5 },
      confidence: 0.8,
      text_alternatives: [{ text: "b", confidence: 0.8, kind: "primary" }],
      source_ref: source("g1", "/alto/Layout/Page/PrintSpace/TextBlock/TextLine/String[2]/Glyph"),
    }],
  });
  return document;
}

describe("validation engine", () => {
  it("keeps valid geometry and references clean", () => {
    const report = validateDocument(validDocument(), {
      image: { url: "blob:test", name: "page.jpg", width: 100, height: 100 },
      imagePageIndex: 0,
    });
    expect(report.validator_version).toBe(VALIDATOR_VERSION);
    expect(report.findings).toEqual([]);
    expect(report.summary).toEqual({ errors: 0, warnings: 0, info: 0, total: 0 });
  });

  it("emits stable rule ids for independent broken invariants", () => {
    const report = validateDocument(brokenDocument(), {
      image: { url: "blob:test", name: "other.jpg", width: 120, height: 100 },
      imagePageIndex: 0,
    });
    const ruleIds = new Set(report.findings.map((item) => item.rule_id));

    expect(ruleIds).toEqual(new Set([
      "GEOM.ZERO_AREA",
      "GEOM.OUT_OF_BOUNDS",
      "GEOM.CHILD_OUTSIDE_PARENT",
      "TEXT.CONFIDENCE_RANGE",
      "XML.DUPLICATE_ID",
      "ORDER.DANGLING_REFERENCE",
      "ORDER.DUPLICATE_REFERENCE",
      "META.MISSING_SOURCE_IMAGE",
      "GEOM.IMAGE_DIMENSION_MISMATCH",
    ]));
    expect(report.findings.some((item) => item.target.node_key?.startsWith("word:"))).toBe(true);
    expect(report.summary.total).toBe(report.findings.length);
  });

  it("reports invalid boxes and polygons without preventing other rules", () => {
    const document = validDocument();
    document.pages[0].regions[0].geometry = { kind: "bbox", x: 10, y: 10, width: -2, height: 20 };
    document.pages[0].regions[0].lines[0].geometry = {
      kind: "polygon",
      points: [{ x: 10, y: 10 }, { x: 20, y: 10 }],
    };
    const report = validateDocument(document);
    const ruleIds = report.findings.map((item) => item.rule_id);
    expect(ruleIds).toContain("GEOM.INVALID_BOX");
    expect(ruleIds).toContain("GEOM.INVALID_POLYGON");
    expect(ruleIds).not.toContain("VALIDATOR.RULE_FAILURE");
  });

  it("is deterministic for identical normalized input and context", () => {
    const document = brokenDocument();
    const context = { image: { url: "blob:test", name: "other.jpg", width: 120, height: 100 }, imagePageIndex: 0 };
    expect(validateDocument(document, context)).toEqual(validateDocument(document, context));
  });

  it("exposes a unique registry of stable rule ids", () => {
    const ids = VALIDATION_RULES.map((rule) => rule.rule_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("GEOM.OUT_OF_BOUNDS");
    expect(ids).toContain("ORDER.DANGLING_REFERENCE");
  });
});
