import { describe, expect, it } from "vitest";

import { candidateForClickDetail, geometryContainsPoint, inspectCandidatesAtPoint } from "./inspectGeometry";
import type { OverlayNode } from "./types";

function node(kind: OverlayNode["kind"], key: string, x: number, y: number, width: number, height: number): OverlayNode {
  return {
    key,
    elementId: key,
    kind,
    subtype: null,
    geometry: { kind: "bbox", x, y, width, height },
    baseline: null,
    text: null,
    confidence: null,
    sourceRef: null,
  };
}

describe("inspect geometry", () => {
  it("tests bbox and polygon containment", () => {
    expect(geometryContainsPoint({ kind: "bbox", x: 10, y: 10, width: 20, height: 20 }, { x: 15, y: 15 })).toBe(true);
    expect(geometryContainsPoint({ kind: "bbox", x: 10, y: 10, width: 20, height: 20 }, { x: 5, y: 5 })).toBe(false);
    expect(geometryContainsPoint({ kind: "polygon", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }] }, { x: 5, y: 4 })).toBe(true);
  });

  it("orders nested candidates from the most specific kind to the broadest", () => {
    const candidates = inspectCandidatesAtPoint([
      node("region", "region", 0, 0, 100, 100),
      node("line", "line", 10, 10, 80, 20),
      node("word", "word", 20, 10, 20, 20),
    ], { x: 25, y: 15 });

    expect(candidates.map((candidate) => candidate.key)).toEqual(["word", "line", "region"]);
  });

  it("uses successive click detail values to cycle through overlaps", () => {
    const candidates = [
      node("word", "word", 0, 0, 10, 10),
      node("line", "line", 0, 0, 20, 10),
      node("region", "region", 0, 0, 30, 30),
    ];

    expect(candidateForClickDetail(candidates, 1)?.key).toBe("word");
    expect(candidateForClickDetail(candidates, 2)?.key).toBe("line");
    expect(candidateForClickDetail(candidates, 3)?.key).toBe("region");
    expect(candidateForClickDetail(candidates, 4)?.key).toBe("word");
  });
});
