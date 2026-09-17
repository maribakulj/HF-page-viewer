import { describe, expect, it } from "vitest";

import type { ImageInfo } from "./types";
import {
  viewerOpenFailureCode,
  viewerSourceKind,
  viewerTileFailureCode,
  viewerTileSource,
} from "./viewerTileSource";

const raster: ImageInfo = {
  url: "blob:https://viewer.example.org/local-image",
  name: "page.jpg",
  width: 2000,
  height: 3000,
  source_kind: "local",
};

const iiif: ImageInfo = {
  url: "https://images.example.org/iiif/3/page/full/max/0/default.jpg",
  name: "Page 1",
  width: 2000,
  height: 3000,
  source_kind: "iiif",
  tile_source_url: "https://images.example.org/iiif/3/page/info.json",
};

describe("OpenSeadragon source selection", () => {
  it("keeps ordinary raster images on the simple image tile source", () => {
    expect(viewerTileSource(raster)).toEqual({ type: "image", url: raster.url });
    expect(viewerSourceKind(raster)).toBe("raster");
    expect(viewerOpenFailureCode(raster)).toBe("VIEWER.IMAGE_OPEN_FAILED");
  });

  it("passes IIIF info.json to OpenSeadragon as a URL tile-source specifier", () => {
    expect(viewerTileSource(iiif)).toBe(iiif.tile_source_url);
    expect(viewerSourceKind(iiif)).toBe("iiif_tiles");
    expect(viewerOpenFailureCode(iiif)).toBe("IIIF.TILE_SOURCE_OPEN_FAILED");
    expect(viewerTileFailureCode(iiif)).toBe("IIIF.TILE_LOAD_FAILED");
  });

  it("ignores a blank tile-source URL instead of opening an empty network source", () => {
    expect(viewerTileSource({ ...iiif, tile_source_url: "   " })).toEqual({ type: "image", url: iiif.url });
  });
});
