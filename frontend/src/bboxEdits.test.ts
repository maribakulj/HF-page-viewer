import { describe, expect, it } from "vitest";

import { applyBBoxEdits, createBBoxEdit } from "./bboxEdits";
import type { PageDocumentDTO } from "./types";

const document: PageDocumentDTO = {
  source_format: "alto",
  source_version: "4.4",
  namespace: null,
  pages: [{
    element_id: "p1", width: 1000, height: 2000, measurement_unit: "pixel", image_reference: null,
    language: null, other_languages: [], rotation: null, reading_order: null, source_ref: null,
    regions: [{
      element_id: "r1", region_type: "text", geometry: { kind: "bbox", x: 0, y: 0, width: 500, height: 500 }, text_alternatives: [], source_ref: null,
      regions: [],
      lines: [{
        element_id: "l1", geometry: { kind: "bbox", x: 10, y: 10, width: 400, height: 40 }, baseline: null, text_alternatives: [], source_ref: null,
        words: [{
          element_id: "w1", geometry: { kind: "bbox", x: 20, y: 12, width: 80, height: 30 }, text_alternatives: [], confidence: null, glyphs: [],
          source_ref: { element_name: "String", path: "/alto/Layout/Page/TextBlock/TextLine/String[1]", xml_id: "w1", attributes: {} },
        }],
      }],
    }],
  }],
  metadata: [], processing_steps: [], extensions: [], notices: [], source_attributes: {},
};

describe("bbox edits", () => {
  it("applies a word bbox edit without mutating the source", () => {
    const edit = createBBoxEdit({
      targetKind: "word",
      targetKey: "word:/alto/Layout/Page/TextBlock/TextLine/String[1]",
      pageIndex: 0,
      elementId: "w1",
      sourcePath: "/alto/Layout/Page/TextBlock/TextLine/String[1]",
      before: { kind: "bbox", x: 20, y: 12, width: 80, height: 30 },
      after: { kind: "bbox", x: 22, y: 14, width: 82, height: 31 },
    });
    expect(edit).not.toBeNull();
    const edited = applyBBoxEdits(document, [edit!]);
    expect(document.pages[0].regions[0].lines[0].words[0].geometry).toEqual({ kind: "bbox", x: 20, y: 12, width: 80, height: 30 });
    expect(edited.pages[0].regions[0].lines[0].words[0].geometry).toEqual({ kind: "bbox", x: 22, y: 14, width: 82, height: 31 });
  });

  it("edits line and region bboxes and ignores a no-op", () => {
    expect(createBBoxEdit({
      targetKind: "region", targetKey: "region:r1", pageIndex: 0, elementId: "r1", sourcePath: null,
      before: { kind: "bbox", x: 0, y: 0, width: 500, height: 500 },
      after: { kind: "bbox", x: 0, y: 0, width: 500, height: 500 },
    })).toBeNull();

    const lineEdit = createBBoxEdit({
      targetKind: "line", targetKey: "line:l1", pageIndex: 0, elementId: "l1", sourcePath: null,
      before: { kind: "bbox", x: 10, y: 10, width: 400, height: 40 },
      after: { kind: "bbox", x: 12, y: 10, width: 390, height: 40 },
    })!;
    const regionEdit = createBBoxEdit({
      targetKind: "region", targetKey: "region:r1", pageIndex: 0, elementId: "r1", sourcePath: null,
      before: { kind: "bbox", x: 0, y: 0, width: 500, height: 500 },
      after: { kind: "bbox", x: 0, y: 0, width: 510, height: 510 },
    })!;
    const edited = applyBBoxEdits(document, [lineEdit, regionEdit]);
    expect(edited.pages[0].regions[0].geometry).toMatchObject({ width: 510, height: 510 });
    expect(edited.pages[0].regions[0].lines[0].geometry).toMatchObject({ x: 12, width: 390 });
  });
});
