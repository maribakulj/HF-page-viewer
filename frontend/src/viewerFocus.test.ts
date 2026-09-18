import { describe, expect, it } from "vitest";

import type { OverlayNode, PageDTO } from "./types";
import { focusImageRectForNode } from "./viewerFocus";

const page: PageDTO = {
  element_id: "p1",
  width: 1000,
  height: 2000,
  measurement_unit: "pixel",
  image_reference: null,
  language: null,
  other_languages: [],
  rotation: null,
  regions: [],
  reading_order: null,
  source_ref: null,
};

function word(geometry: OverlayNode["geometry"]): OverlayNode {
  return {
    key: "word:w1",
    elementId: "w1",
    kind: "word",
    subtype: null,
    geometry,
    baseline: null,
    text: "test",
    confidence: null,
    sourceRef: null,
  };
}

describe("focusImageRectForNode", () => {
  it("builds a padded image-space focus rectangle around a selected word", () => {
    expect(focusImageRectForNode(
      word({ kind: "bbox", x: 400, y: 1000, width: 100, height: 20 }),
      page,
      2000,
      4000,
    )).toEqual({ x: 400, y: 1840, width: 1000, height: 360 });
  });

  it("clamps focus padding to the image bounds", () => {
    expect(focusImageRectForNode(
      word({ kind: "bbox", x: 0, y: 0, width: 10, height: 10 }),
      page,
      1000,
      2000,
    )).toEqual({ x: 0, y: 0, width: 30, height: 50 });
  });

  it("returns null when the target has no geometry", () => {
    expect(focusImageRectForNode(word(null), page, 1000, 2000)).toBeNull();
  });
});
