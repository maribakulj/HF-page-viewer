import { describe, expect, it } from "vitest";

import type { IiifInspection } from "./iiifModel";
import { initialIiifSelection, resolveIiifSelection, selectionForCanvas } from "./iiifViewer";

const manifest: IiifInspection = {
  kind: "manifest",
  version: "presentation-3",
  id: "https://example.org/manifest",
  label: "Book",
  image_service: null,
  canvases: [
    {
      id: "https://example.org/canvas/1",
      label: "Page 1",
      width: 1000,
      height: 1500,
      images: [
        {
          id: "https://example.org/page1.jpg",
          format: "image/jpeg",
          width: 1000,
          height: 1500,
          service: null,
        },
      ],
    },
    {
      id: "https://example.org/canvas/2",
      label: "Page 2",
      width: 1000,
      height: 1500,
      images: [
        { id: "https://example.org/page2-a.jpg", format: "image/jpeg", width: 1000, height: 1500, service: null },
        { id: "https://example.org/page2-b.jpg", format: "image/jpeg", width: 1000, height: 1500, service: null },
      ],
    },
  ],
};

describe("IIIF viewer selection", () => {
  it("auto-selects a sole painting image but not an ambiguous candidate set", () => {
    expect(initialIiifSelection(manifest)).toEqual({ canvasIndex: 0, imageIndex: 0 });
    expect(selectionForCanvas(manifest, 1)).toEqual({ canvasIndex: 1, imageIndex: null });
  });

  it("turns a direct painting image into the normalized viewer image", () => {
    const resolved = resolveIiifSelection(manifest, { canvasIndex: 0, imageIndex: 0 });
    expect(resolved.image).toMatchObject({
      url: "https://example.org/page1.jpg",
      width: 1000,
      height: 1500,
      source_kind: "iiif",
      tile_source_url: null,
    });
  });

  it("uses Image API info.json as the OpenSeadragon tile source", () => {
    const inspection: IiifInspection = {
      kind: "image_service",
      version: "image-3",
      id: "https://images.example.org/iiif/3/page-1",
      label: null,
      canvases: [],
      image_service: {
        id: "https://images.example.org/iiif/3/page-1",
        api_version: "3",
        profile: "level2",
        width: 2000,
        height: 3000,
        info_json_url: "https://images.example.org/iiif/3/page-1/info.json",
        full_image_url: "https://images.example.org/iiif/3/page-1/full/max/0/default.jpg",
      },
    };

    expect(resolveIiifSelection(inspection, { canvasIndex: null, imageIndex: null }).image).toMatchObject({
      tile_source_url: "https://images.example.org/iiif/3/page-1/info.json",
      width: 2000,
      height: 3000,
    });
  });

  it("uses resolved service dimensions when a manifest service reference omitted them", () => {
    const withService = structuredClone(manifest);
    withService.canvases[0].images[0] = {
      ...withService.canvases[0].images[0],
      width: null,
      height: null,
      service: {
        id: "https://images.example.org/iiif/3/page-1",
        api_version: "3",
        profile: "level2",
        width: null,
        height: null,
        info_json_url: "https://images.example.org/iiif/3/page-1/info.json",
        full_image_url: "https://images.example.org/iiif/3/page-1/full/max/0/default.jpg",
      },
    };
    const resolvedService = {
      ...withService.canvases[0].images[0].service!,
      width: 2400,
      height: 3600,
    };

    expect(resolveIiifSelection(withService, { canvasIndex: 0, imageIndex: 0 }, resolvedService).image).toMatchObject({
      width: 2400,
      height: 3600,
      tile_source_url: resolvedService.info_json_url,
    });
  });
});
