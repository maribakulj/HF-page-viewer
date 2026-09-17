import type { ImageInfo } from "./types";

export type ViewerTileSource = string | { type: "image"; url: string };

export type ViewerSourceKind = "iiif_tiles" | "raster";

export function viewerTileSource(image: ImageInfo): ViewerTileSource {
  return image.tile_source_url?.trim() || { type: "image", url: image.url };
}

export function viewerSourceKind(image: ImageInfo): ViewerSourceKind {
  return image.tile_source_url?.trim() ? "iiif_tiles" : "raster";
}

export function viewerOpenFailureCode(image: ImageInfo): "IIIF.TILE_SOURCE_OPEN_FAILED" | "VIEWER.IMAGE_OPEN_FAILED" {
  return viewerSourceKind(image) === "iiif_tiles"
    ? "IIIF.TILE_SOURCE_OPEN_FAILED"
    : "VIEWER.IMAGE_OPEN_FAILED";
}

export function viewerTileFailureCode(image: ImageInfo): "IIIF.TILE_LOAD_FAILED" | "VIEWER.IMAGE_TILE_LOAD_FAILED" {
  return viewerSourceKind(image) === "iiif_tiles"
    ? "IIIF.TILE_LOAD_FAILED"
    : "VIEWER.IMAGE_TILE_LOAD_FAILED";
}
