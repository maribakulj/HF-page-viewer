import { describe, expect, it } from "vitest";

import type { PageDocumentDTO } from "./types";
import { applyWordTextEdits, createWordTextEdit } from "./wordEdits";

const document: PageDocumentDTO = {
  source_format: "alto",
  source_version: "4.4",
  namespace: null,
  pages: [{
    element_id: "p1", width: 100, height: 100, measurement_unit: "pixel", image_reference: null,
    language: null, other_languages: [], rotation: null, reading_order: null, source_ref: null,
    regions: [{
      element_id: "r1", region_type: "text", geometry: null, text_alternatives: [], regions: [], source_ref: null,
      lines: [{
        element_id: "l1", geometry: null, baseline: null, text_alternatives: [], source_ref: null,
        words: [{
          element_id: "w1", geometry: null, confidence: 0.9, glyphs: [],
          text_alternatives: [{ text: "armes", confidence: 0.9, kind: "primary" }],
          source_ref: { element_name: "String", path: "/alto/Layout/Page/TextBlock/TextLine/String[1]", xml_id: "w1", attributes: {} },
        }],
      }],
    }],
  }],
  metadata: [], processing_steps: [], extensions: [], notices: [], source_attributes: {},
};

describe("word text edits", () => {
  it("applies edits without mutating the parsed source document", () => {
    const edit = createWordTextEdit({
      targetKey: "word:/alto/Layout/Page/TextBlock/TextLine/String[1]",
      pageIndex: 0,
      elementId: "w1",
      sourcePath: "/alto/Layout/Page/TextBlock/TextLine/String[1]",
      before: "armes",
      after: "armées",
    });
    expect(edit).not.toBeNull();
    const edited = applyWordTextEdits(document, [edit!]);
    expect(document.pages[0].regions[0].lines[0].words[0].text_alternatives[0].text).toBe("armes");
    expect(edited.pages[0].regions[0].lines[0].words[0].text_alternatives[0].text).toBe("armées");
    expect(edited).not.toBe(document);
  });

  it("returns no operation for a no-op edit", () => {
    expect(createWordTextEdit({ targetKey: "word:w1", pageIndex: 0, elementId: "w1", sourcePath: null, before: "x", after: "x" })).toBeNull();
  });
});
