import { describe, expect, it } from "vitest";

import { buildQcReport, qcReportFilename } from "./qcReport";
import type { PageDocumentDTO } from "./types";
import type { CombinedValidationReport } from "./xsdFindings";

const document: PageDocumentDTO = {
  source_format: "alto",
  source_version: "4.4",
  namespace: "http://www.loc.gov/standards/alto/ns-v4#",
  pages: [{
    element_id: "page-1", width: 1000, height: 2000, measurement_unit: "pixel", image_reference: "page.jpg",
    language: "fra", other_languages: [], rotation: null,
    regions: [{
      element_id: "r1", region_type: "text", geometry: { kind: "bbox", x: 0, y: 0, width: 500, height: 500 }, text_alternatives: [],
      lines: [{
        element_id: "l1", geometry: { kind: "bbox", x: 10, y: 10, width: 400, height: 40 }, baseline: null,
        text_alternatives: [{ text: "hello", confidence: null, kind: "primary" }],
        words: [{ element_id: "w1", geometry: { kind: "bbox", x: 10, y: 10, width: 80, height: 40 }, text_alternatives: [{ text: "hello", confidence: null, kind: "primary" }], confidence: 0.9, glyphs: [], source_ref: null }],
        source_ref: null,
      }],
      regions: [], source_ref: null,
    }],
    reading_order: null, source_ref: null,
  }],
  metadata: [], processing_steps: [], extensions: [], notices: [], source_attributes: {},
};

const validation: CombinedValidationReport = {
  validator_version: "0.4.0", source_format: "alto", source_version: "4.4", page_count: 1,
  summary: { errors: 0, warnings: 0, info: 0, total: 0 }, findings: [],
  schema_validation: { status: "valid", schema_id: "alto-4.4", schema_label: "ALTO 4.4", diagnostic_count: 0 },
};

const iiif = { loadedUrl: null, inspection: null, selection: { canvasIndex: null, imageIndex: null }, resolvedService: null } as const;

describe("buildQcReport", () => {
  it("builds a stable unmodified report", () => {
    const report = buildQcReport({
      document, validation,
      xmlFingerprint: { algorithm: "sha256", hex: "abc123", bytes: 12, name: "sample.xml", media_type: "application/xml" },
      imageFingerprint: null,
      activeImage: { url: "blob:test", name: "page.jpg", width: 1000, height: 2000, source_kind: "local" },
      pageIndex: 0, iiif, generatedAt: "2026-09-17T18:00:00.000Z",
    });
    expect(report.report_version).toBe("1.4.0");
    expect(report.working_copy).toEqual({ modified: false, word_text_edits: [], bbox_edits: [], corrected_output: null });
    expect(report.document.pages[0]).toMatchObject({ regions: 1, lines: 1, words: 1, glyphs: 0 });
    expect(qcReportFilename(report)).toBe("sample.qc.json");
  });

  it("records text and bbox operations separately", () => {
    const report = buildQcReport({
      document, validation, xmlFingerprint: null, imageFingerprint: null, activeImage: null, pageIndex: 0,
      wordTextEdits: [{ kind: "word_text", target_key: "word:w1", page_index: 0, element_id: "w1", source_path: null, before: "hello", after: "hullo" }],
      bboxEdits: [{ kind: "bbox", target_kind: "word", target_key: "word:w1", page_index: 0, element_id: "w1", source_path: null, before: { kind: "bbox", x: 10, y: 10, width: 80, height: 40 }, after: { kind: "bbox", x: 12, y: 11, width: 82, height: 41 } }],
      iiif, generatedAt: "2026-09-17T18:00:00.000Z",
    });
    expect(report.working_copy.modified).toBe(true);
    expect(report.working_copy.word_text_edits).toHaveLength(1);
    expect(report.working_copy.bbox_edits).toHaveLength(1);
    expect(report.working_copy.corrected_output).toBeNull();
    });

  it("attests a corrected serialized output separately from the source fingerprint", () => {
    const report = buildQcReport({
      document, validation, xmlFingerprint: null, imageFingerprint: null, activeImage: null, pageIndex: 0,
      wordTextEdits: [],
      bboxEdits: [],
      correctedOutput: {
        filename: "sample.corrected.xml",
        fingerprint: { algorithm: "sha256", hex: "deadbeef", bytes: 42, name: "sample.corrected.xml", media_type: "application/xml" },
        xsdValidation: { status: "valid", schemaId: "alto-4.4", schemaLabel: "ALTO 4.4", diagnostics: [] },
        result: {
          xml: "<alto/>",
          applied_word_text_edits: 1,
          applied_bbox_edits: 0,
          skipped_edits: 0,
          warnings: [],
          preservation: { strategy: "patch-original-dom", untouched_elements_preserved: true, byte_identical_roundtrip: false },
        },
      },
      iiif, generatedAt: "2026-09-17T18:00:00.000Z",
    });

    expect(report.working_copy.corrected_output).toMatchObject({
      filename: "sample.corrected.xml",
      fingerprint: { hex: "deadbeef" },
      applied_word_text_edits: 1,
      skipped_edits: 0,
      schema_validation: { status: "valid", schema_id: "alto-4.4" },
    });
  });
});
