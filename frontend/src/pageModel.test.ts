import { describe, expect, it } from "vitest";

import { assessAlignment, countPageElements, flattenPage, flattenReadingOrderRefs } from "./pageModel";
import type { ImageInfo, PageDTO, RegionDTO } from "./types";

const sourceRef = (path: string) => ({
  element_name: "node",
  path,
  xml_id: null,
  attributes: {},
});

function makePage(unit: PageDTO["measurement_unit"] = "pixel"): PageDTO {
  const region: RegionDTO = {
    element_id: "r1",
    region_type: "text",
    geometry: { kind: "bbox", x: 10, y: 20, width: 100, height: 50 },
    text_alternatives: [],
    source_ref: sourceRef("/alto/Layout/Page/TextBlock"),
    regions: [],
    lines: [
      {
        element_id: "l1",
        geometry: { kind: "bbox", x: 10, y: 20, width: 100, height: 20 },
        baseline: { kind: "polyline", points: [{ x: 10, y: 38 }, { x: 110, y: 38 }] },
        text_alternatives: [{ text: "hello", confidence: null, kind: "reconstructed" }],
        source_ref: sourceRef("/alto/Layout/Page/TextBlock/TextLine"),
        words: [
          {
            element_id: "w1",
            geometry: { kind: "bbox", x: 10, y: 20, width: 40, height: 20 },
            text_alternatives: [{ text: "hello", confidence: 0.9, kind: "primary" }],
            confidence: 0.9,
            source_ref: sourceRef("/alto/Layout/Page/TextBlock/TextLine/String"),
            glyphs: [
              {
                element_id: "g1",
                geometry: { kind: "bbox", x: 10, y: 20, width: 8, height: 20 },
                text_alternatives: [{ text: "h", confidence: 0.8, kind: "primary" }],
                confidence: 0.8,
                source_ref: sourceRef("/alto/Layout/Page/TextBlock/TextLine/String/Glyph"),
              },
            ],
          },
        ],
      },
    ],
  };

  return {
    element_id: "p1",
    width: 1000,
    height: 1500,
    measurement_unit: unit,
    image_reference: null,
    language: "fr",
    other_languages: [],
    rotation: null,
    regions: [region],
    reading_order: {
      element_id: "ro1",
      ordered: true,
      refs: ["r1"],
      groups: [
        { element_id: "ro2", ordered: true, refs: ["l1"], groups: [], source_ref: null },
      ],
      source_ref: null,
    },
    source_ref: sourceRef("/alto/Layout/Page"),
  };
}

const image = (width: number, height: number): ImageInfo => ({
  url: "blob:test",
  name: "page.jpg",
  width,
  height,
});

describe("page model", () => {
  it("flattens a page while preserving stable source-path keys", () => {
    const nodes = flattenPage(makePage());
    expect(nodes.map((node) => node.kind)).toEqual(["region", "line", "word", "glyph"]);
    expect(nodes[2].key).toContain("/alto/Layout/Page/TextBlock/TextLine/String");
    expect(nodes[2].text).toBe("hello");
  });

  it("counts nested page elements", () => {
    expect(countPageElements(makePage())).toEqual({ regions: 1, lines: 1, words: 1, glyphs: 1 });
  });

  it("distinguishes exact, proportional and non-proportional dimensions", () => {
    expect(assessAlignment(makePage(), image(1000, 1500)).kind).toBe("ready");
    expect(assessAlignment(makePage(), image(2000, 3000)).kind).toBe("scaled");
    expect(assessAlignment(makePage(), image(2000, 2500)).kind).toBe("warning");
  });

  it("blocks non-pixel coordinate systems until conversion metadata exists", () => {
    const status = assessAlignment(makePage("mm10"), image(1000, 1500));
    expect(status.canRender).toBe(false);
    expect(status.kind).toBe("blocked");
  });

  it("flattens reading-order group references", () => {
    expect(flattenReadingOrderRefs(makePage().reading_order)).toEqual(["r1", "l1"]);
  });
});
