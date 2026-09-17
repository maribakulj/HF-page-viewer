import type {
  GeometryDTO,
  ImageInfo,
  OverlayNode,
  PageDTO,
  ReadingOrderGroupDTO,
  RegionDTO,
  TextAlternativeDTO,
  TextLineDTO,
  WordDTO,
} from "./types";

export type PageCounts = {
  regions: number;
  lines: number;
  words: number;
  glyphs: number;
};

export type AlignmentStatus = {
  kind: "ready" | "scaled" | "warning" | "blocked";
  canRender: boolean;
  message: string;
};

function bestText(alternatives: TextAlternativeDTO[]): string | null {
  return (
    alternatives.find((alternative) => alternative.kind === "primary")?.text ??
    alternatives[0]?.text ??
    null
  );
}

function sourceKey(kind: OverlayNode["kind"], sourcePath: string | undefined, id: string): string {
  return `${kind}:${sourcePath ?? id}`;
}

export function flattenPage(page: PageDTO): OverlayNode[] {
  const nodes: OverlayNode[] = [];

  function visitWord(word: WordDTO): void {
    nodes.push({
      key: sourceKey("word", word.source_ref?.path, word.element_id),
      elementId: word.element_id,
      kind: "word",
      subtype: null,
      geometry: word.geometry,
      baseline: null,
      text: bestText(word.text_alternatives),
      confidence: word.confidence,
      sourceRef: word.source_ref,
    });
    for (const glyph of word.glyphs) {
      nodes.push({
        key: sourceKey("glyph", glyph.source_ref?.path, glyph.element_id),
        elementId: glyph.element_id,
        kind: "glyph",
        subtype: null,
        geometry: glyph.geometry,
        baseline: null,
        text: bestText(glyph.text_alternatives),
        confidence: glyph.confidence,
        sourceRef: glyph.source_ref,
      });
    }
  }

  function visitLine(line: TextLineDTO): void {
    nodes.push({
      key: sourceKey("line", line.source_ref?.path, line.element_id),
      elementId: line.element_id,
      kind: "line",
      subtype: null,
      geometry: line.geometry,
      baseline: line.baseline,
      text: bestText(line.text_alternatives),
      confidence: null,
      sourceRef: line.source_ref,
    });
    line.words.forEach(visitWord);
  }

  function visitRegion(region: RegionDTO): void {
    nodes.push({
      key: sourceKey("region", region.source_ref?.path, region.element_id),
      elementId: region.element_id,
      kind: "region",
      subtype: region.region_type,
      geometry: region.geometry,
      baseline: null,
      text: bestText(region.text_alternatives),
      confidence: null,
      sourceRef: region.source_ref,
    });
    region.lines.forEach(visitLine);
    region.regions.forEach(visitRegion);
  }

  page.regions.forEach(visitRegion);
  return nodes;
}

export function countPageElements(page: PageDTO): PageCounts {
  const counts: PageCounts = { regions: 0, lines: 0, words: 0, glyphs: 0 };

  function visitRegion(region: RegionDTO): void {
    counts.regions += 1;
    for (const line of region.lines) {
      counts.lines += 1;
      for (const word of line.words) {
        counts.words += 1;
        counts.glyphs += word.glyphs.length;
      }
    }
    region.regions.forEach(visitRegion);
  }

  page.regions.forEach(visitRegion);
  return counts;
}

export function assessAlignment(page: PageDTO | null, image: ImageInfo | null): AlignmentStatus {
  if (!page || !image) {
    return { kind: "blocked", canRender: false, message: "Load an image and ALTO page." };
  }
  if (page.measurement_unit !== "pixel") {
    return {
      kind: "blocked",
      canRender: false,
      message: `ALTO uses ${page.measurement_unit} coordinates; pixel conversion requires resolution metadata.`,
    };
  }
  if (!page.width || !page.height || page.width <= 0 || page.height <= 0) {
    return {
      kind: "blocked",
      canRender: false,
      message: "ALTO page dimensions are missing or invalid.",
    };
  }
  if (page.width === image.width && page.height === image.height) {
    return { kind: "ready", canRender: true, message: "Image and ALTO dimensions match." };
  }

  const scaleX = image.width / page.width;
  const scaleY = image.height / page.height;
  const relativeScaleDifference = Math.abs(scaleX - scaleY) / Math.max(scaleX, scaleY);
  if (relativeScaleDifference <= 0.005) {
    return {
      kind: "scaled",
      canRender: true,
      message: `Coordinate scaling active: ALTO ${page.width}×${page.height} → image ${image.width}×${image.height}.`,
    };
  }

  return {
    kind: "warning",
    canRender: true,
    message: `Aspect ratio mismatch: ALTO ${page.width}×${page.height}, image ${image.width}×${image.height}. Overlay alignment may be unreliable.`,
  };
}

export function geometryCenter(geometry: GeometryDTO | null): { x: number; y: number } | null {
  if (!geometry) return null;
  if (geometry.kind === "bbox") {
    return { x: geometry.x + geometry.width / 2, y: geometry.y + geometry.height / 2 };
  }
  if (geometry.points.length === 0) return null;
  const total = geometry.points.reduce(
    (accumulator, point) => ({ x: accumulator.x + point.x, y: accumulator.y + point.y }),
    { x: 0, y: 0 },
  );
  return { x: total.x / geometry.points.length, y: total.y / geometry.points.length };
}

export function flattenReadingOrderRefs(group: ReadingOrderGroupDTO | null): string[] {
  if (!group) return [];
  return [...group.refs, ...group.groups.flatMap(flattenReadingOrderRefs)];
}

export function formatGeometry(geometry: GeometryDTO | null): string {
  if (!geometry) return "None";
  if (geometry.kind === "bbox") {
    return `x=${geometry.x}, y=${geometry.y}, w=${geometry.width}, h=${geometry.height}`;
  }
  return `${geometry.points.length}-point polygon`;
}
