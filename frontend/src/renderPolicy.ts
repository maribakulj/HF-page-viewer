import type { GeometryDTO, LayerState, OverlayNode } from "./types";

export type RenderLod = "overview" | "words" | "glyphs";

export type RenderWindow = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export const WORD_LOD_MIN_RELATIVE_ZOOM = 2;
export const GLYPH_LOD_MIN_RELATIVE_ZOOM = 6;
export const VIEWPORT_OVERSCAN_RATIO = 0.12;

export function geometryBounds(geometry: GeometryDTO | null): RenderWindow | null {
  if (!geometry) return null;
  if (geometry.kind === "bbox") {
    return {
      minX: Math.min(geometry.x, geometry.x + geometry.width),
      minY: Math.min(geometry.y, geometry.y + geometry.height),
      maxX: Math.max(geometry.x, geometry.x + geometry.width),
      maxY: Math.max(geometry.y, geometry.y + geometry.height),
    };
  }
  if (!geometry.points.length) return null;
  const xs = geometry.points.map((point) => point.x);
  const ys = geometry.points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

export function renderLodForRelativeZoom(relativeZoom: number | null): RenderLod {
  if (relativeZoom == null || !Number.isFinite(relativeZoom) || relativeZoom < WORD_LOD_MIN_RELATIVE_ZOOM) return "overview";
  if (relativeZoom < GLYPH_LOD_MIN_RELATIVE_ZOOM) return "words";
  return "glyphs";
}

export function boundsIntersect(left: RenderWindow, right: RenderWindow): boolean {
  return left.maxX >= right.minX
    && left.minX <= right.maxX
    && left.maxY >= right.minY
    && left.minY <= right.maxY;
}

export function geometryIntersectsWindow(geometry: GeometryDTO | null, window: RenderWindow | null): boolean {
  if (!window) return true;
  const bounds = geometryBounds(geometry);
  return bounds ? boundsIntersect(bounds, window) : false;
}

export function layerAllowsNode(node: OverlayNode, layers: LayerState): boolean {
  if (node.kind === "region") return layers.regions;
  if (node.kind === "line") return layers.lines;
  if (node.kind === "word") return layers.words;
  return layers.glyphs;
}

export function lodAllowsNode(node: OverlayNode, lod: RenderLod): boolean {
  if (node.kind === "region" || node.kind === "line") return true;
  if (node.kind === "word") return lod === "words" || lod === "glyphs";
  return lod === "glyphs";
}

export function shouldRenderNode({
  node,
  layers,
  lod,
  window,
  forced = false,
}: {
  node: OverlayNode;
  layers: LayerState;
  lod: RenderLod;
  window: RenderWindow | null;
  forced?: boolean;
}): boolean {
  if (!node.geometry) return false;
  if (forced) return true;
  return layerAllowsNode(node, layers)
    && lodAllowsNode(node, lod)
    && geometryIntersectsWindow(node.geometry, window);
}

export function overscannedWindow({
  x,
  y,
  width,
  height,
  scaleX,
  scaleY,
  pageWidth,
  pageHeight,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  pageWidth: number;
  pageHeight: number;
}): RenderWindow {
  const overscanX = width * VIEWPORT_OVERSCAN_RATIO;
  const overscanY = height * VIEWPORT_OVERSCAN_RATIO;
  return {
    minX: Math.max(0, (x - overscanX) * scaleX),
    minY: Math.max(0, (y - overscanY) * scaleY),
    maxX: Math.min(pageWidth, (x + width + overscanX) * scaleX),
    maxY: Math.min(pageHeight, (y + height + overscanY) * scaleY),
  };
}
