import type { PointDTO } from "./types";

export type InspectionCycle = {
  keys: string[];
  anchor: PointDTO;
  index: number;
};

// CSS pixels, not document units: stable at any image zoom or DPI.
const CLICK_TOLERANCE = 6;

export function sameInspectionPoint(
  previous: InspectionCycle | null,
  keys: string[],
  point: PointDTO,
): previous is InspectionCycle {
  return previous !== null
    && Math.hypot(previous.anchor.x - point.x, previous.anchor.y - point.y) <= CLICK_TOLERANCE
    && previous.keys.length === keys.length
    && previous.keys.every((key, index) => key === keys[index]);
}

export function nextInspectionCycle(
  previous: InspectionCycle | null,
  keys: string[],
  point: PointDTO,
): InspectionCycle | null {
  if (!keys.length) return null;
  const continuing = sameInspectionPoint(previous, keys, point);
  return {
    keys,
    anchor: continuing ? previous.anchor : point,
    index: continuing ? (previous.index + 1) % keys.length : 0,
  };
}
