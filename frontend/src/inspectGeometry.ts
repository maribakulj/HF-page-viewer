import type { GeometryDTO, OverlayNode, PointDTO } from "./types";

const KIND_ORDER: Record<OverlayNode["kind"], number> = {
  glyph: 0,
  word: 1,
  line: 2,
  region: 3,
};

export function geometryContainsPoint(geometry: GeometryDTO | null, point: PointDTO): boolean {
  if (!geometry) return false;
  if (geometry.kind === "bbox") {
    return point.x >= geometry.x
      && point.x <= geometry.x + geometry.width
      && point.y >= geometry.y
      && point.y <= geometry.y + geometry.height;
  }

  const points = geometry.points;
  if (points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i];
    const pj = points[j];
    const crosses = ((pi.y > point.y) !== (pj.y > point.y))
      && point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function geometryArea(geometry: GeometryDTO | null): number {
  if (!geometry) return Number.POSITIVE_INFINITY;
  if (geometry.kind === "bbox") return Math.abs(geometry.width * geometry.height);

  const points = geometry.points;
  if (points.length < 3) return Number.POSITIVE_INFINITY;
  let twiceArea = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twiceArea) / 2;
}

export function inspectCandidatesAtPoint(nodes: OverlayNode[], point: PointDTO): OverlayNode[] {
  return nodes
    .filter((node) => geometryContainsPoint(node.geometry, point))
    .sort((left, right) => {
      const kindDelta = KIND_ORDER[left.kind] - KIND_ORDER[right.kind];
      if (kindDelta !== 0) return kindDelta;
      return geometryArea(left.geometry) - geometryArea(right.geometry);
    });
}

export function candidateForClickDetail(candidates: OverlayNode[], detail: number): OverlayNode | null {
  if (!candidates.length) return null;
  const index = Math.max(0, detail - 1) % candidates.length;
  return candidates[index] ?? null;
}
