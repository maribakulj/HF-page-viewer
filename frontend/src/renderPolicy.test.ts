import { describe, expect, it } from "vitest";

import type { LayerState, OverlayNode } from "./types";
import {
  GLYPH_LOD_MIN_IMAGE_ZOOM,
  WORD_LOD_MIN_IMAGE_ZOOM,
  geometryIntersectsWindow,
  overscannedWindow,
  renderLodForImageZoom,
  shouldRenderNode,
} from "./renderPolicy";

const layers: LayerState = {
  regions: true,
  lines: true,
  words: true,
  glyphs: true,
  baselines: true,
  readingOrder: true,
};

function node(kind: OverlayNode["kind"], x = 10, y = 10): OverlayNode {
  return {
    key: `${kind}:${x}:${y}`,
    elementId: `${kind}-${x}-${y}`,
    kind,
    subtype: null,
    geometry: { kind: "bbox", x, y, width: 20, height: 10 },
    baseline: null,
    text: kind === "word" || kind === "glyph" ? "x" : null,
    confidence: null,
    sourceRef: null,
  };
}

describe("adaptive render policy", () => {
  it("uses overview, word and glyph LOD at explicit image-zoom thresholds", () => {
    expect(renderLodForImageZoom(null)).toBe("overview");
    expect(renderLodForImageZoom(WORD_LOD_MIN_IMAGE_ZOOM - 0.01)).toBe("overview");
    expect(renderLodForImageZoom(WORD_LOD_MIN_IMAGE_ZOOM)).toBe("words");
    expect(renderLodForImageZoom(GLYPH_LOD_MIN_IMAGE_ZOOM - 0.01)).toBe("words");
    expect(renderLodForImageZoom(GLYPH_LOD_MIN_IMAGE_ZOOM)).toBe("glyphs");
  });

  it("keeps regions and lines at overview while deferring words and glyphs", () => {
    expect(shouldRenderNode({ node: node("region"), layers, lod: "overview", window: null })).toBe(true);
    expect(shouldRenderNode({ node: node("line"), layers, lod: "overview", window: null })).toBe(true);
    expect(shouldRenderNode({ node: node("word"), layers, lod: "overview", window: null })).toBe(false);
    expect(shouldRenderNode({ node: node("glyph"), layers, lod: "overview", window: null })).toBe(false);
  });

  it("makes words eligible before glyphs", () => {
    expect(shouldRenderNode({ node: node("word"), layers, lod: "words", window: null })).toBe(true);
    expect(shouldRenderNode({ node: node("glyph"), layers, lod: "words", window: null })).toBe(false);
    expect(shouldRenderNode({ node: node("glyph"), layers, lod: "glyphs", window: null })).toBe(true);
  });

  it("culls ordinary geometry outside the overscanned viewport", () => {
    const window = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    expect(geometryIntersectsWindow(node("word", 20, 20).geometry, window)).toBe(true);
    expect(geometryIntersectsWindow(node("word", 200, 200).geometry, window)).toBe(false);
    expect(shouldRenderNode({ node: node("word", 200, 200), layers, lod: "words", window })).toBe(false);
  });

  it("force-includes selection/search targets regardless of LOD, viewport or layer toggle", () => {
    const hiddenLayers = { ...layers, words: false };
    expect(shouldRenderNode({
      node: node("word", 500, 500),
      layers: hiddenLayers,
      lod: "overview",
      window: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      forced: true,
    })).toBe(true);
  });

  it("converts an image viewport to XML coordinates with bounded overscan", () => {
    expect(overscannedWindow({
      x: 100,
      y: 200,
      width: 500,
      height: 600,
      scaleX: 2,
      scaleY: 2,
      pageWidth: 2000,
      pageHeight: 3000,
    })).toEqual({
      minX: 80,
      minY: 256,
      maxX: 1320,
      maxY: 1744,
    });
  });
});
