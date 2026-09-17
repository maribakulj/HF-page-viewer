import { describe, expect, it } from "vitest";

import { IiifParseError, inferIiifInputUrl, parseIiifJson } from "./iiifModel";

const IMAGE_3 = {
  "@context": "http://iiif.io/api/image/3/context.json",
  id: "https://images.example.org/iiif/3/book-1/page-1",
  type: "ImageService3",
  protocol: "http://iiif.io/api/image",
  profile: "level2",
  width: 6000,
  height: 4000,
};

const IMAGE_2 = {
  "@context": "http://iiif.io/api/image/2/context.json",
  "@id": "https://images.example.org/iiif/2/book-1/page-1",
  protocol: "http://iiif.io/api/image",
  profile: ["http://iiif.io/api/image/2/level2.json"],
  width: 3000,
  height: 2000,
};

const MANIFEST_3 = {
  "@context": "http://iiif.io/api/presentation/3/context.json",
  id: "https://example.org/manifest/3",
  type: "Manifest",
  label: { en: ["Example book"] },
  items: [
    {
      id: "https://example.org/canvas/1",
      type: "Canvas",
      label: { none: ["Page 1"] },
      width: 3000,
      height: 4000,
      items: [
        {
          id: "https://example.org/canvas/1/page",
          type: "AnnotationPage",
          items: [
            {
              id: "https://example.org/canvas/1/painting",
              type: "Annotation",
              motivation: "painting",
              target: "https://example.org/canvas/1",
              body: {
                id: "https://images.example.org/iiif/3/page-1/full/max/0/default.jpg",
                type: "Image",
                format: "image/jpeg",
                width: 3000,
                height: 4000,
                service: [
                  {
                    id: "https://images.example.org/iiif/3/page-1",
                    type: "ImageService3",
                    profile: "level2",
                  },
                ],
              },
            },
            {
              id: "https://example.org/canvas/1/comment",
              type: "Annotation",
              motivation: "commenting",
              body: { id: "https://example.org/comment.txt", type: "Text" },
            },
          ],
        },
      ],
    },
  ],
};

const MANIFEST_2 = {
  "@context": "http://iiif.io/api/presentation/2/context.json",
  "@id": "https://example.org/manifest/2",
  "@type": "sc:Manifest",
  label: "Example manuscript",
  sequences: [
    {
      "@type": "sc:Sequence",
      canvases: [
        {
          "@id": "https://example.org/canvas/v2-1",
          "@type": "sc:Canvas",
          label: "Folio 1r",
          width: 2000,
          height: 3000,
          images: [
            {
              "@type": "oa:Annotation",
              motivation: "sc:painting",
              resource: {
                "@id": "https://images.example.org/iiif/2/page-1/full/full/0/default.jpg",
                "@type": "dctypes:Image",
                format: "image/jpeg",
                width: 2000,
                height: 3000,
                service: {
                  "@id": "https://images.example.org/iiif/2/page-1",
                  profile: "http://iiif.io/api/image/2/level1.json",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

describe("IIIF normalization", () => {
  it("normalizes Image API 3 info and constructs a v3 full-image request", () => {
    const result = parseIiifJson(IMAGE_3);
    expect(result).toMatchObject({ kind: "image_service", version: "image-3" });
    expect(result.image_service).toMatchObject({
      id: IMAGE_3.id,
      width: 6000,
      height: 4000,
      info_json_url: `${IMAGE_3.id}/info.json`,
      full_image_url: `${IMAGE_3.id}/full/max/0/default.jpg`,
    });
  });

  it("normalizes Image API 2 info and retains the v2 full/full request syntax", () => {
    const result = parseIiifJson(IMAGE_2);
    expect(result.version).toBe("image-2");
    expect(result.image_service?.full_image_url).toBe(`${IMAGE_2["@id"]}/full/full/0/default.jpg`);
  });

  it("normalizes Presentation 3 canvases and only painting annotations", () => {
    const result = parseIiifJson(MANIFEST_3);
    expect(result).toMatchObject({ kind: "manifest", version: "presentation-3", label: "Example book" });
    expect(result.canvases).toHaveLength(1);
    expect(result.canvases[0]).toMatchObject({ label: "Page 1", width: 3000, height: 4000 });
    expect(result.canvases[0].images).toHaveLength(1);
    expect(result.canvases[0].images[0].service).toMatchObject({
      api_version: "3",
      info_json_url: "https://images.example.org/iiif/3/page-1/info.json",
      full_image_url: "https://images.example.org/iiif/3/page-1/full/max/0/default.jpg",
    });
  });

  it("normalizes Presentation 2 sequences/canvases/images into the same concepts", () => {
    const result = parseIiifJson(MANIFEST_2);
    expect(result).toMatchObject({ kind: "manifest", version: "presentation-2", label: "Example manuscript" });
    expect(result.canvases[0]).toMatchObject({ label: "Folio 1r", width: 2000, height: 3000 });
    expect(result.canvases[0].images[0].service).toMatchObject({
      api_version: "2",
      full_image_url: "https://images.example.org/iiif/2/page-1/full/full/0/default.jpg",
    });
  });

  it("preserves multiple painting candidates instead of guessing", () => {
    const manifest = structuredClone(MANIFEST_3);
    const page = manifest.items[0].items[0];
    page.items.push({
      id: "https://example.org/canvas/1/painting-2",
      type: "Annotation",
      motivation: "painting",
      target: "https://example.org/canvas/1",
      body: {
        id: "https://images.example.org/alternate.jpg",
        type: "Image",
        format: "image/jpeg",
        width: 3000,
        height: 4000,
        service: [],
      },
    });
    const result = parseIiifJson(manifest);
    expect(result.canvases[0].images.map((image) => image.id)).toEqual([
      "https://images.example.org/iiif/3/page-1/full/max/0/default.jpg",
      "https://images.example.org/alternate.jpg",
    ]);
  });

  it("rejects malformed image info instead of fabricating dimensions", () => {
    expect(() => parseIiifJson({ ...IMAGE_3, width: 0 })).toThrow(IiifParseError);
    expect(() => parseIiifJson({ ...IMAGE_3, width: 0 })).toThrow(/width and height/i);
  });

  it("rejects JSON that is not a supported IIIF resource", () => {
    expect(() => parseIiifJson({ hello: "world" })).toThrow(/not a supported IIIF/i);
  });
});

describe("IIIF input URL normalization", () => {
  it("turns an Image API service base into info.json", () => {
    expect(inferIiifInputUrl("https://images.example.org/iiif/3/abc"))
      .toBe("https://images.example.org/iiif/3/abc/info.json");
  });

  it("keeps explicit JSON and manifest URLs", () => {
    expect(inferIiifInputUrl("https://example.org/book/manifest.json"))
      .toBe("https://example.org/book/manifest.json");
    expect(inferIiifInputUrl("https://example.org/book/manifest"))
      .toBe("https://example.org/book/manifest");
  });

  it("rejects non-http URLs", () => {
    expect(() => inferIiifInputUrl("file:///tmp/info.json")).toThrow(/HTTP or HTTPS/i);
  });
});
