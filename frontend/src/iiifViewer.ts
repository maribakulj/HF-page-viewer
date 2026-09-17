import type { IiifCanvas, IiifImageCandidate, IiifImageService, IiifInspection } from "./iiifModel";
import type { ImageInfo } from "./types";

export type IiifSelection = {
  canvasIndex: number | null;
  imageIndex: number | null;
};

export type IiifResolvedSelection = {
  canvas: IiifCanvas | null;
  candidate: IiifImageCandidate | null;
  service: IiifImageService | null;
  image: ImageInfo | null;
};

function validIndex(index: number | null, length: number): index is number {
  return index != null && Number.isInteger(index) && index >= 0 && index < length;
}

export function initialIiifSelection(inspection: IiifInspection): IiifSelection {
  if (inspection.kind === "image_service") return { canvasIndex: null, imageIndex: null };
  if (!inspection.canvases.length) return { canvasIndex: null, imageIndex: null };
  const firstCanvas = inspection.canvases[0];
  return {
    canvasIndex: 0,
    imageIndex: firstCanvas.images.length === 1 ? 0 : null,
  };
}

export function selectionForCanvas(inspection: IiifInspection, canvasIndex: number): IiifSelection {
  if (inspection.kind !== "manifest" || !validIndex(canvasIndex, inspection.canvases.length)) {
    return { canvasIndex: null, imageIndex: null };
  }
  const canvas = inspection.canvases[canvasIndex];
  return {
    canvasIndex,
    imageIndex: canvas.images.length === 1 ? 0 : null,
  };
}

export function resolveIiifSelection(
  inspection: IiifInspection,
  selection: IiifSelection,
  resolvedService: IiifImageService | null = null,
): IiifResolvedSelection {
  if (inspection.kind === "image_service") {
    const service = resolvedService ?? inspection.image_service;
    if (!service?.width || !service.height) {
      return { canvas: null, candidate: null, service: service ?? null, image: null };
    }
    return {
      canvas: null,
      candidate: null,
      service,
      image: {
        url: service.full_image_url,
        name: inspection.label ?? service.id,
        width: service.width,
        height: service.height,
        source_kind: "iiif",
        tile_source_url: service.info_json_url,
      },
    };
  }

  if (!validIndex(selection.canvasIndex, inspection.canvases.length)) {
    return { canvas: null, candidate: null, service: null, image: null };
  }
  const canvas = inspection.canvases[selection.canvasIndex];
  if (!validIndex(selection.imageIndex, canvas.images.length)) {
    return { canvas, candidate: null, service: null, image: null };
  }
  const candidate = canvas.images[selection.imageIndex];
  const referencedService = candidate.service;
  const service = resolvedService && referencedService && resolvedService.id === referencedService.id
    ? resolvedService
    : referencedService;
  const width = candidate.width ?? service?.width ?? null;
  const height = candidate.height ?? service?.height ?? null;
  if (!width || !height) return { canvas, candidate, service: service ?? null, image: null };

  return {
    canvas,
    candidate,
    service: service ?? null,
    image: {
      url: service?.full_image_url ?? candidate.id,
      name: canvas.label ?? candidate.id,
      width,
      height,
      source_kind: "iiif",
      tile_source_url: service?.info_json_url ?? null,
    },
  };
}

export function selectedIiifService(inspection: IiifInspection, selection: IiifSelection): IiifImageService | null {
  if (inspection.kind === "image_service") return inspection.image_service;
  if (!validIndex(selection.canvasIndex, inspection.canvases.length)) return null;
  const canvas = inspection.canvases[selection.canvasIndex];
  if (!validIndex(selection.imageIndex, canvas.images.length)) return null;
  return canvas.images[selection.imageIndex].service;
}
