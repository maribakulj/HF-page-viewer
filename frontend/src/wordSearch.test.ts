import { describe, expect, it } from "vitest";

import type { PageDocumentDTO, WordDTO } from "./types";
import { searchDocumentWords, wrapSearchIndex } from "./wordSearch";

function word(id: string, text: string, alternatives: string[] = []): WordDTO {
  return {
    element_id: id,
    geometry: { kind: "bbox", x: 10, y: 10, width: 20, height: 10 },
    text_alternatives: [
      { text, confidence: null, kind: "primary" },
      ...alternatives.map((value) => ({ text: value, confidence: null, kind: "alternative" })),
    ],
    confidence: null,
    glyphs: [],
    source_ref: { element_name: "String", path: `/alto/Layout/Page/String[@ID='${id}']`, xml_id: id, attributes: {} },
  };
}

const document: PageDocumentDTO = {
  source_format: "alto",
  source_version: "4.4",
  namespace: "http://www.loc.gov/standards/alto/ns-v4#",
  metadata: [],
  processing_steps: [],
  extensions: [],
  notices: [],
  source_attributes: {},
  pages: [
    {
      element_id: "p1",
      width: 100,
      height: 100,
      measurement_unit: "pixel",
      image_reference: "p1.jpg",
      language: null,
      other_languages: [],
      rotation: null,
      reading_order: null,
      source_ref: null,
      regions: [{
        element_id: "r1",
        region_type: "text",
        geometry: null,
        text_alternatives: [],
        source_ref: null,
        lines: [{
          element_id: "l1",
          geometry: null,
          baseline: null,
          text_alternatives: [],
          source_ref: null,
          words: [word("w1", "Armes,"), word("w2", "AUTRE"), word("w3", "canon", ["pièce"])],
        }],
        regions: [],
      }],
    },
    {
      element_id: "p2",
      width: 100,
      height: 100,
      measurement_unit: "pixel",
      image_reference: "p2.jpg",
      language: null,
      other_languages: [],
      rotation: null,
      reading_order: null,
      source_ref: null,
      regions: [{
        element_id: "r2",
        region_type: "text",
        geometry: null,
        text_alternatives: [],
        source_ref: null,
        lines: [{
          element_id: "l2",
          geometry: null,
          baseline: null,
          text_alternatives: [],
          source_ref: null,
          words: [word("w4", "armes")],
        }],
        regions: [],
      }],
    },
  ],
};

describe("word search", () => {
  it("matches exact words case-insensitively and ignores edge punctuation", () => {
    const matches = searchDocumentWords(document, "armes");
    expect(matches.map((match) => [match.pageIndex, match.elementId])).toEqual([[0, "w1"], [1, "w4"]]);
  });

  it("searches encoded text alternatives", () => {
    const matches = searchDocumentWords(document, "pièce");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ elementId: "w3", text: "canon", matchedText: "pièce" });
  });

  it("does not silently turn exact word search into substring search", () => {
    expect(searchDocumentWords(document, "arm")).toHaveLength(0);
  });

  it("preserves accents while normalizing Unicode and case", () => {
    expect(searchDocumentWords(document, "PIÈCE")).toHaveLength(1);
    expect(searchDocumentWords(document, "piece")).toHaveLength(0);
  });

  it("returns no matches for punctuation-only or blank queries", () => {
    expect(searchDocumentWords(document, "   ")).toEqual([]);
    expect(searchDocumentWords(document, "…")).toEqual([]);
  });

  it("wraps previous/next navigation", () => {
    expect(wrapSearchIndex(2, 2)).toBe(0);
    expect(wrapSearchIndex(-1, 2)).toBe(1);
    expect(wrapSearchIndex(4, 0)).toBe(0);
  });
});
