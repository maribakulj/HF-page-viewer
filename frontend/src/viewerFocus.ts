import { geometryBounds } from "./renderPolicy";
import type { OverlayNode, PageDTO } from "./types";

export type FocusImageRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function focusImageRectForNode(
  node: OverlayNode | null,
  page: PageDTO,
  imageWidth: number,
  imageHeight: number,
): FocusImageRect | null {
  if (!node?.geometry || !page.width || !page.height || page.width <= 0 || page.height <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return null;
  }

  const bounds = geometryBounds(node.geometry);
  if (!bounds) return null;

  const scaleX = imageWidth / page.width;
  const scaleY = imageHeight / page.height;
  const x = bounds.minX * scaleX;
  const y = bounds.minY * scaleY;
  const width = Math.max((bounds.maxX - bounds.minX) * scaleX, 1);
  const height = Math.max((bounds.maxY - bounds.minY) * scaleY, 1);
  const padX = Math.max(width * 2, imageWidth * 0.006);
  const padY = Math.max(height * 4, imageHeight * 0.006);
  const left = Math.max(0, x - padX);
  const top = Math.max(0, y - padY);
  const right = Math.min(imageWidth, x + width + padX);
  const bottom = Math.min(imageHeight, y + height + padY);

  return {
    x: left,
    y: top,
    width: Math.max(right - left, 1),
    height: Math.max(bottom - top, 1),
  };
}
