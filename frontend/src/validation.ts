import type {
  GeometryDTO,
  ImageInfo,
  PageDocumentDTO,
  PageDTO,
  ReadingOrderGroupDTO,
  SourceRefDTO,
  TextAlternativeDTO,
} from "./types";

export type ValidationSeverity = "error" | "warning" | "info";

export type ValidationTarget = {
  page_index: number | null;
  element_id: string | null;
  node_key: string | null;
  source_path: string | null;
};

export type ValidationFinding = {
  rule_id: string;
  severity: ValidationSeverity;
  message: string;
  target: ValidationTarget;
  evidence: Record<string, unknown>;
  remediation: string | null;
};

export type ValidationSummary = {
  errors: number;
  warnings: number;
  info: number;
  total: number;
};

export type ValidationReport = {
  validator_version: string;
  source_format: PageDocumentDTO["source_format"];
  source_version: string | null;
  page_count: number;
  summary: ValidationSummary;
  findings: ValidationFinding[];
};

export type ValidationContext = {
  image?: ImageInfo | null;
  imagePageIndex?: number | null;
};

type ElementKind = "page" | "region" | "line" | "word" | "glyph";

type ElementRecord = {
  pageIndex: number;
  kind: ElementKind;
  elementId: string;
  nodeKey: string | null;
  sourceRef: SourceRefDTO | null;
  geometry: GeometryDTO | null;
  confidence: number | null;
  textAlternatives: TextAlternativeDTO[];
  parent: ElementRecord | null;
};

type ReadingOrderRecord = {
  pageIndex: number;
  group: ReadingOrderGroupDTO;
};

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

type ValidationState = {
  document: PageDocumentDTO;
  context: ValidationContext;
  elements: ElementRecord[];
  readingOrderGroups: ReadingOrderRecord[];
};

export type ValidationRule = {
  rule_id: string;
  default_severity: ValidationSeverity;
  description: string;
  evaluate: (state: ValidationState) => ValidationFinding[];
};

export const VALIDATOR_VERSION = "0.1.0";

function nodeKey(kind: Exclude<ElementKind, "page">, sourceRef: SourceRefDTO | null, elementId: string): string {
  return `${kind}:${sourceRef?.path ?? elementId}`;
}

function target(record: ElementRecord): ValidationTarget {
  return {
    page_index: record.pageIndex,
    element_id: record.elementId,
    node_key: record.nodeKey,
    source_path: record.sourceRef?.path ?? null,
  };
}

function groupTarget(record: ReadingOrderRecord): ValidationTarget {
  return {
    page_index: record.pageIndex,
    element_id: record.group.element_id,
    node_key: null,
    source_path: record.group.source_ref?.path ?? null,
  };
}

function pageTarget(page: PageDTO, pageIndex: number): ValidationTarget {
  return {
    page_index: pageIndex,
    element_id: page.element_id,
    node_key: null,
    source_path: page.source_ref?.path ?? null,
  };
}

function finding(
  ruleId: string,
  severity: ValidationSeverity,
  message: string,
  findingTarget: ValidationTarget,
  evidence: Record<string, unknown> = {},
  remediation: string | null = null,
): ValidationFinding {
  return { rule_id: ruleId, severity, message, target: findingTarget, evidence, remediation };
}

function geometryBounds(geometry: GeometryDTO | null): Bounds | null {
  if (!geometry) return null;
  if (geometry.kind === "bbox") {
    return {
      minX: Math.min(geometry.x, geometry.x + geometry.width),
      minY: Math.min(geometry.y, geometry.y + geometry.height),
      maxX: Math.max(geometry.x, geometry.x + geometry.width),
      maxY: Math.max(geometry.y, geometry.y + geometry.height),
    };
  }
  if (geometry.points.length === 0) return null;
  const xs = geometry.points.map((point) => point.x);
  const ys = geometry.points.map((point) => point.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function polygonArea(geometry: GeometryDTO): number | null {
  if (geometry.kind !== "polygon" || geometry.points.length < 3) return null;
  let doubledArea = 0;
  for (let index = 0; index < geometry.points.length; index += 1) {
    const current = geometry.points[index];
    const next = geometry.points[(index + 1) % geometry.points.length];
    doubledArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(doubledArea) / 2;
}

function boundsContain(parent: Bounds, child: Bounds, tolerance = 0.001): boolean {
  return child.minX >= parent.minX - tolerance
    && child.minY >= parent.minY - tolerance
    && child.maxX <= parent.maxX + tolerance
    && child.maxY <= parent.maxY + tolerance;
}

function collectState(document: PageDocumentDTO, context: ValidationContext): ValidationState {
  const elements: ElementRecord[] = [];
  const readingOrderGroups: ReadingOrderRecord[] = [];

  document.pages.forEach((page, pageIndex) => {
    const pageRecord: ElementRecord = {
      pageIndex,
      kind: "page",
      elementId: page.element_id,
      nodeKey: null,
      sourceRef: page.source_ref,
      geometry: null,
      confidence: null,
      textAlternatives: [],
      parent: null,
    };
    elements.push(pageRecord);

    const addRegion = (region: PageDTO["regions"][number], parent: ElementRecord): void => {
      const regionRecord: ElementRecord = {
        pageIndex,
        kind: "region",
        elementId: region.element_id,
        nodeKey: nodeKey("region", region.source_ref, region.element_id),
        sourceRef: region.source_ref,
        geometry: region.geometry,
        confidence: null,
        textAlternatives: region.text_alternatives,
        parent,
      };
      elements.push(regionRecord);

      for (const line of region.lines) {
        const lineRecord: ElementRecord = {
          pageIndex,
          kind: "line",
          elementId: line.element_id,
          nodeKey: nodeKey("line", line.source_ref, line.element_id),
          sourceRef: line.source_ref,
          geometry: line.geometry,
          confidence: null,
          textAlternatives: line.text_alternatives,
          parent: regionRecord,
        };
        elements.push(lineRecord);

        for (const word of line.words) {
          const wordRecord: ElementRecord = {
            pageIndex,
            kind: "word",
            elementId: word.element_id,
            nodeKey: nodeKey("word", word.source_ref, word.element_id),
            sourceRef: word.source_ref,
            geometry: word.geometry,
            confidence: word.confidence,
            textAlternatives: word.text_alternatives,
            parent: lineRecord,
          };
          elements.push(wordRecord);

          for (const glyph of word.glyphs) {
            elements.push({
              pageIndex,
              kind: "glyph",
              elementId: glyph.element_id,
              nodeKey: nodeKey("glyph", glyph.source_ref, glyph.element_id),
              sourceRef: glyph.source_ref,
              geometry: glyph.geometry,
              confidence: glyph.confidence,
              textAlternatives: glyph.text_alternatives,
              parent: wordRecord,
            });
          }
        }
      }
      region.regions.forEach((child) => addRegion(child, regionRecord));
    };

    page.regions.forEach((region) => addRegion(region, pageRecord));

    const addReadingOrder = (group: ReadingOrderGroupDTO): void => {
      readingOrderGroups.push({ pageIndex, group });
      group.groups.forEach(addReadingOrder);
    };
    if (page.reading_order) addReadingOrder(page.reading_order);
  });

  return { document, context, elements, readingOrderGroups };
}

const invalidBoxRule: ValidationRule = {
  rule_id: "GEOM.INVALID_BOX",
  default_severity: "error",
  description: "Bounding boxes must not have negative width or height.",
  evaluate: (state) => state.elements.flatMap((record) => {
    const geometry = record.geometry;
    if (!geometry || geometry.kind !== "bbox" || (geometry.width >= 0 && geometry.height >= 0)) return [];
    return [finding(
      "GEOM.INVALID_BOX",
      "error",
      `${record.kind} ${record.elementId} has a negative box dimension.`,
      target(record),
      { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height },
      "Correct the encoded bounding box dimensions.",
    )];
  }),
};

const zeroAreaRule: ValidationRule = {
  rule_id: "GEOM.ZERO_AREA",
  default_severity: "error",
  description: "Encoded geometry should cover a non-zero area.",
  evaluate: (state) => state.elements.flatMap((record) => {
    const geometry = record.geometry;
    if (!geometry) return [];
    const zero = geometry.kind === "bbox"
      ? geometry.width === 0 || geometry.height === 0
      : polygonArea(geometry) === 0;
    if (!zero) return [];
    return [finding(
      "GEOM.ZERO_AREA",
      "error",
      `${record.kind} ${record.elementId} has zero-area geometry.`,
      target(record),
      { geometry },
      "Correct or remove the zero-area geometry.",
    )];
  }),
};

const invalidPolygonRule: ValidationRule = {
  rule_id: "GEOM.INVALID_POLYGON",
  default_severity: "error",
  description: "Polygons need at least three distinct points.",
  evaluate: (state) => state.elements.flatMap((record) => {
    const geometry = record.geometry;
    if (!geometry || geometry.kind !== "polygon") return [];
    const distinct = new Set(geometry.points.map((point) => `${point.x}:${point.y}`)).size;
    if (geometry.points.length >= 3 && distinct >= 3) return [];
    return [finding(
      "GEOM.INVALID_POLYGON",
      "error",
      `${record.kind} ${record.elementId} has an invalid polygon.`,
      target(record),
      { point_count: geometry.points.length, distinct_point_count: distinct },
      "Encode at least three distinct polygon points.",
    )];
  }),
};

const outOfBoundsRule: ValidationRule = {
  rule_id: "GEOM.OUT_OF_BOUNDS",
  default_severity: "error",
  description: "Element geometry should remain inside page dimensions.",
  evaluate: (state) => {
    const findings: ValidationFinding[] = [];
    for (const record of state.elements) {
      if (!record.geometry) continue;
      const page = state.document.pages[record.pageIndex];
      if (!page.width || !page.height || page.width <= 0 || page.height <= 0) continue;
      const bounds = geometryBounds(record.geometry);
      if (!bounds) continue;
      if (bounds.minX >= 0 && bounds.minY >= 0 && bounds.maxX <= page.width && bounds.maxY <= page.height) continue;
      findings.push(finding(
        "GEOM.OUT_OF_BOUNDS",
        "error",
        `${record.kind} ${record.elementId} extends beyond the encoded page bounds.`,
        target(record),
        { bounds, page: { width: page.width, height: page.height } },
        "Correct the element coordinates or verify the page dimensions.",
      ));
    }
    return findings;
  },
};

const childOutsideParentRule: ValidationRule = {
  rule_id: "GEOM.CHILD_OUTSIDE_PARENT",
  default_severity: "warning",
  description: "Child geometry should normally fit within parent geometry.",
  evaluate: (state) => state.elements.flatMap((record) => {
    if (!record.geometry || !record.parent?.geometry) return [];
    const childBounds = geometryBounds(record.geometry);
    const parentBounds = geometryBounds(record.parent.geometry);
    if (!childBounds || !parentBounds || boundsContain(parentBounds, childBounds)) return [];
    return [finding(
      "GEOM.CHILD_OUTSIDE_PARENT",
      "warning",
      `${record.kind} ${record.elementId} extends beyond its ${record.parent.kind} parent.`,
      target(record),
      { child_bounds: childBounds, parent_bounds: parentBounds, parent_id: record.parent.elementId, containment_test: "bounding_box" },
      "Inspect the parent/child segmentation and correct the coordinates if the containment is unintended.",
    )];
  }),
};

const confidenceRangeRule: ValidationRule = {
  rule_id: "TEXT.CONFIDENCE_RANGE",
  default_severity: "error",
  description: "Confidence values must be between 0 and 1.",
  evaluate: (state) => {
    const findings: ValidationFinding[] = [];
    for (const record of state.elements) {
      const values = [
        ...(record.confidence == null ? [] : [{ value: record.confidence, kind: "element" }]),
        ...record.textAlternatives
          .filter((alternative) => alternative.confidence != null)
          .map((alternative) => ({ value: alternative.confidence as number, kind: `text:${alternative.kind}` })),
      ];
      for (const item of values) {
        if (item.value >= 0 && item.value <= 1) continue;
        findings.push(finding(
          "TEXT.CONFIDENCE_RANGE",
          "error",
          `${record.kind} ${record.elementId} has confidence ${item.value}, outside [0, 1].`,
          target(record),
          { confidence: item.value, confidence_kind: item.kind },
          "Normalize or correct the confidence value to the 0–1 range.",
        ));
      }
    }
    return findings;
  },
};

const duplicateIdRule: ValidationRule = {
  rule_id: "XML.DUPLICATE_ID",
  default_severity: "error",
  description: "XML identifiers must be unique within the document.",
  evaluate: (state) => {
    const byId = new Map<string, ValidationTarget[]>();
    for (const record of state.elements) {
      const xmlId = record.sourceRef?.xml_id;
      if (!xmlId) continue;
      const occurrences = byId.get(xmlId) ?? [];
      occurrences.push(target(record));
      byId.set(xmlId, occurrences);
    }
    for (const record of state.readingOrderGroups) {
      const xmlId = record.group.source_ref?.xml_id;
      if (!xmlId) continue;
      const occurrences = byId.get(xmlId) ?? [];
      occurrences.push(groupTarget(record));
      byId.set(xmlId, occurrences);
    }
    return [...byId.entries()]
      .filter(([, occurrences]) => occurrences.length > 1)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([xmlId, occurrences]) => finding(
        "XML.DUPLICATE_ID",
        "error",
        `XML id ${xmlId} is used ${occurrences.length} times.`,
        occurrences[0],
        { xml_id: xmlId, occurrences },
        "Assign a unique XML identifier to each encoded element.",
      ));
  },
};

const readingOrderDanglingRule: ValidationRule = {
  rule_id: "ORDER.DANGLING_REFERENCE",
  default_severity: "error",
  description: "Reading-order references must resolve to encoded content.",
  evaluate: (state) => {
    const knownIds = new Set<string>();
    for (const record of state.elements) {
      knownIds.add(record.elementId);
      if (record.sourceRef?.xml_id) knownIds.add(record.sourceRef.xml_id);
    }
    const findings: ValidationFinding[] = [];
    for (const record of state.readingOrderGroups) {
      for (const ref of record.group.refs) {
        if (knownIds.has(ref)) continue;
        findings.push(finding(
          "ORDER.DANGLING_REFERENCE",
          "error",
          `Reading-order reference ${ref} does not resolve to parsed content.`,
          groupTarget(record),
          { reference: ref },
          "Correct the reference or restore the missing target element.",
        ));
      }
    }
    return findings;
  },
};

const readingOrderDuplicateRule: ValidationRule = {
  rule_id: "ORDER.DUPLICATE_REFERENCE",
  default_severity: "warning",
  description: "Reading order should not reference the same content repeatedly.",
  evaluate: (state) => {
    const seen = new Map<string, ValidationTarget>();
    const findings: ValidationFinding[] = [];
    for (const record of state.readingOrderGroups) {
      for (const ref of record.group.refs) {
        const previous = seen.get(ref);
        if (previous) {
          findings.push(finding(
            "ORDER.DUPLICATE_REFERENCE",
            "warning",
            `Reading-order reference ${ref} appears more than once.`,
            groupTarget(record),
            { reference: ref, first_occurrence: previous },
            "Keep a single reading-order reference unless duplication is intentional and supported by the source standard.",
          ));
        } else {
          seen.set(ref, groupTarget(record));
        }
      }
    }
    return findings;
  },
};

const missingSourceImageRule: ValidationRule = {
  rule_id: "META.MISSING_SOURCE_IMAGE",
  default_severity: "info",
  description: "A source image reference improves provenance and linkage checks.",
  evaluate: (state) => state.document.pages.flatMap((page, pageIndex) => {
    if (page.image_reference?.trim()) return [];
    return [finding(
      "META.MISSING_SOURCE_IMAGE",
      "info",
      `Page ${page.element_id} has no source image reference.`,
      pageTarget(page, pageIndex),
      {},
      "Encode the source image filename/reference when the format and workflow allow it.",
    )];
  }),
};

const imageDimensionMismatchRule: ValidationRule = {
  rule_id: "GEOM.IMAGE_DIMENSION_MISMATCH",
  default_severity: "warning",
  description: "Raster dimensions should be checked against the selected XML page.",
  evaluate: (state) => {
    const image = state.context.image;
    const pageIndex = state.context.imagePageIndex;
    if (!image || pageIndex == null) return [];
    const page = state.document.pages[pageIndex];
    if (!page || !page.width || !page.height || page.measurement_unit !== "pixel") return [];
    if (page.width === image.width && page.height === image.height) return [];
    return [finding(
      "GEOM.IMAGE_DIMENSION_MISMATCH",
      "warning",
      `Image dimensions ${image.width}×${image.height} differ from XML page dimensions ${page.width}×${page.height}.`,
      pageTarget(page, pageIndex),
      { image: { width: image.width, height: image.height, name: image.name }, xml_page: { width: page.width, height: page.height } },
      "Verify that the XML belongs to this raster or document the intended coordinate scaling.",
    )];
  },
};

const nonPixelUnitRule: ValidationRule = {
  rule_id: "GEOM.NON_PIXEL_UNIT_UNRESOLVED",
  default_severity: "warning",
  description: "Non-pixel coordinates need trustworthy resolution metadata before raster alignment.",
  evaluate: (state) => {
    const image = state.context.image;
    const pageIndex = state.context.imagePageIndex;
    if (!image || pageIndex == null) return [];
    const page = state.document.pages[pageIndex];
    if (!page || page.measurement_unit === "pixel") return [];
    return [finding(
      "GEOM.NON_PIXEL_UNIT_UNRESOLVED",
      "warning",
      `Page coordinates use ${page.measurement_unit}; raster alignment cannot be validated as pixels.`,
      pageTarget(page, pageIndex),
      { measurement_unit: page.measurement_unit, image: { width: image.width, height: image.height } },
      "Provide trustworthy resolution metadata before converting non-pixel coordinates.",
    )];
  },
};

export const VALIDATION_RULES: ValidationRule[] = [
  invalidBoxRule,
  zeroAreaRule,
  invalidPolygonRule,
  outOfBoundsRule,
  childOutsideParentRule,
  confidenceRangeRule,
  duplicateIdRule,
  readingOrderDanglingRule,
  readingOrderDuplicateRule,
  missingSourceImageRule,
  imageDimensionMismatchRule,
  nonPixelUnitRule,
];

function summarize(findings: ValidationFinding[]): ValidationSummary {
  const summary: ValidationSummary = { errors: 0, warnings: 0, info: 0, total: findings.length };
  for (const item of findings) {
    if (item.severity === "error") summary.errors += 1;
    else if (item.severity === "warning") summary.warnings += 1;
    else summary.info += 1;
  }
  return summary;
}

export function validateDocument(document: PageDocumentDTO, context: ValidationContext = {}): ValidationReport {
  const state = collectState(document, context);
  const findings: ValidationFinding[] = [];
  for (const rule of VALIDATION_RULES) {
    try {
      findings.push(...rule.evaluate(state));
    } catch (error) {
      findings.push(finding(
        "VALIDATOR.RULE_FAILURE",
        "warning",
        `Validation rule ${rule.rule_id} failed and was skipped.`,
        { page_index: null, element_id: null, node_key: null, source_path: null },
        { failed_rule: rule.rule_id, error: error instanceof Error ? error.message : String(error) },
        "Report this validator failure; unrelated rules have continued to run.",
      ));
    }
  }
  return {
    validator_version: VALIDATOR_VERSION,
    source_format: document.source_format,
    source_version: document.source_version,
    page_count: document.pages.length,
    summary: summarize(findings),
    findings,
  };
}
