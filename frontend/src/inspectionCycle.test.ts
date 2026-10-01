import { describe, expect, it } from "vitest";
import { inspectCandidatesAtPoint } from "./inspectGeometry";
import { nextInspectionCycle, sameInspectionPoint } from "./inspectionCycle";
import { layerAllowsNode, shouldRenderNode } from "./renderPolicy";
import type { LayerState, OverlayNode } from "./types";

const point = { x: 50, y: 50 };
const keys = ["word:a", "line:a", "region:a"];
const layers: LayerState = { regions: true, lines: true, words: true, glyphs: false, baselines: true, readingOrder: false };
function node(key: string, kind: OverlayNode["kind"]): OverlayNode {
  return { key, kind, elementId: key, subtype: null, geometry: { kind: "bbox", x: 0, y: 0, width: 100, height: 100 }, baseline: null, text: null, confidence: null, sourceRef: null };
}

describe("inspection overlap cycle", () => {
  it("cycles repeatedly without depending on a browser click count or timeout", () => {
    const first = nextInspectionCycle(null, keys, point);
    const second = nextInspectionCycle(first, keys, point);
    const third = nextInspectionCycle(second, keys, point);
    expect([first?.index, second?.index, third?.index, nextInspectionCycle(third, keys, point)?.index]).toEqual([0, 1, 2, 0]);
    expect(first?.index).toBe(0);
  });
  it("resets on another word even when the containing line and block are unchanged", () => {
    const first = nextInspectionCycle(null, keys, point);
    const second = nextInspectionCycle(first, keys, point);
    expect(nextInspectionCycle(second, ["word:b", "line:a", "region:a"], point)?.index).toBe(0);
  });
  it("resets when the pointer moves rather than treating a whole line as one click location", () => {
    const previous = nextInspectionCycle(null, keys, point);
    expect(nextInspectionCycle(previous, keys, { x: 70, y: 50 })?.index).toBe(0);
  });
  it("allows small pointer jitter but does not let the cycle anchor drift", () => {
    const first = nextInspectionCycle(null, keys, point);
    const second = nextInspectionCycle(first, keys, { x: 54, y: 50 });
    expect(second?.index).toBe(1);
    expect(second?.anchor).toEqual(point);
    expect(nextInspectionCycle(second, keys, { x: 58, y: 50 })?.index).toBe(0);
  });
  it("clears an empty stack and handles a single candidate", () => {
    expect(nextInspectionCycle(null, [], point)).toBeNull();
    const single = nextInspectionCycle(null, ["word:a"], point);
    expect(nextInspectionCycle(single, ["word:a"], point)?.index).toBe(0);
    expect(sameInspectionPoint(null, keys, point)).toBe(false);
  });
  it("compares keys without delimiter collisions and resets on layer changes", () => {
    const previous = nextInspectionCycle(null, ["a|b", "c"], point);
    expect(sameInspectionPoint(previous, ["a", "b|c"], point)).toBe(false);
    expect(sameInspectionPoint(previous, ["a|b"], point)).toBe(false);
  });
});

describe("inspection uses document geometry, not rendered shapes", () => {
  it("still finds a word omitted at overview LOD and by a one-shape render budget", () => {
    const nodes = [node("region:a", "region"), node("line:a", "line"), node("word:a", "word")];
    const rendered = nodes.filter((candidate) => shouldRenderNode({ node: candidate, layers, lod: "overview", window: null })).slice(0, 1);
    expect(rendered.map((candidate) => candidate.key)).toEqual(["region:a"]);
    expect(inspectCandidatesAtPoint(nodes.filter((candidate) => layerAllowsNode(candidate, layers)), point).map((candidate) => candidate.key)).toEqual(keys);
  });
  it("does not pick a disabled layer, even when a previous selection forced it into the renderer", () => {
    const disabled = { ...layers, words: false };
    const nodes = [node("word:a", "word"), node("line:a", "line")];
    expect(shouldRenderNode({ node: nodes[0], layers: disabled, lod: "overview", window: null, forced: true })).toBe(true);
    expect(inspectCandidatesAtPoint(nodes.filter((candidate) => layerAllowsNode(candidate, disabled)), point).map((candidate) => candidate.key)).toEqual(["line:a"]);
  });
});
