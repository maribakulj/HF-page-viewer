import { describe, expect, it } from "vitest";

import type { IiifInspection } from "./iiifModel";
import { iiifValidationFindings } from "./iiifValidation";
import type { PageDocumentDTO } from "./types";

const document: PageDocumentDTO = {
  source_format: "alto",
  source_version: "4.4",
  namespace: "http://www.loc.gov/standards/alto/ns-v4#",
  pages: [
    {
      element_id: "page-1",
      width: 2000,
      height: 3000,
      measurement_unit: "pixel",
      image_reference: null,
      language: null,
      other_languages: [],
      rotation: null,
      regions: [],
      reading_order: null,
      source_ref: null,
    },
  ],
  metadata: [],
  processing_steps: [],
  extensions: [],
  notices: [],
  source_attributes: {},
};

function manifest(canvasWidth: number, canvasHeight: number, imageWidth = canvasWidth, imageHeight = canvasHeight): IiifInspection {
  return {
    kind: "manifest",
    version: "presentation-3",
    id: "https://example.org/manifest",
    label: "Book",
    image_service: null,
    canvases: [
      {
        id: "https://example.org/canvas/1",
        label: "Page 1",
        width: canvasWidth,
        height: canvasHeight,
        images: [
          {
            id: "https://example.org/page.jpg",
            format: "image/jpeg",
            width: imageWidth,
            height: imageHeight,
            service: null,
          },
        ],
      },
    ],
  };
}

describe("IIIF validation", () => {
  it("produces no dimension findings when XML, Canvas and image match", () => {
    expect(iiifValidationFindings(document, 0, manifest(2000, 3000), { canvasIndex: 0, imageIndex: 0 })).toEqual([]);
  });

  it("reports same-aspect scaling as informational rather than an alignment failure", () => {
    const findings = iiifValidationFindings(document, 0, manifest(1000, 1500), { canvasIndex: 0, imageIndex: 0 });
    expect(findings.map((finding) => [finding.rule_id, finding.severity])).toEqual([
      ["IIIF.CANVAS_DIMENSION_MISMATCH", "info"],
      ["IIIF.IMAGE_DIMENSION_MISMATCH", "info"],
    ]);
  });

  it("reports aspect-ratio mismatch as a warning", () => {
    const findings = iiifValidationFindings(document, 0, manifest(1000, 1000), { canvasIndex: 0, imageIndex: 0 });
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule_id: "IIIF.CANVAS_DIMENSION_MISMATCH", severity: "warning" }),
      expect.objectContaining({ rule_id: "IIIF.IMAGE_DIMENSION_MISMATCH", severity: "warning" }),
    ]));
  });

  it("does not pretend an ambiguous Canvas has a selected image", () => {
    const inspection = manifest(2000, 3000);
    inspection.canvases[0].images.push({
      id: "https://example.org/alternate.jpg",
      format: "image/jpeg",
      width: 2000,
      height: 3000,
      service: null,
    });
    const findings = iiifValidationFindings(document, 0, inspection, { canvasIndex: 0, imageIndex: null });
    expect(findings).toContainEqual(expect.objectContaining({
      rule_id: "IIIF.MULTIPLE_IMAGE_CANDIDATES",
      severity: "info",
    }));
    expect(findings.some((finding) => finding.rule_id === "IIIF.IMAGE_DIMENSION_MISMATCH")).toBe(false);
  });

  it("skips pixel comparisons for non-pixel XML coordinates", () => {
    const nonPixel = structuredClone(document);
    nonPixel.pages[0].measurement_unit = "mm10";
    expect(iiifValidationFindings(nonPixel, 0, manifest(1000, 1000), { canvasIndex: 0, imageIndex: 0 })).toEqual([]);
  });
});
