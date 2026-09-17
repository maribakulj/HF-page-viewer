import type { IiifImageService, IiifInspection } from "./iiifModel";
import type { IiifSelection } from "./iiifViewer";
import { resolveIiifSelection } from "./iiifViewer";
import type { PageDocumentDTO } from "./types";
import type { ValidationFinding, ValidationReport, ValidationSummary } from "./validation";

export const IIIF_VALIDATOR_VERSION = "0.4.0";

function summarize(findings: ValidationFinding[]): ValidationSummary {
  const summary: ValidationSummary = { errors: 0, warnings: 0, info: 0, total: findings.length };
  for (const finding of findings) {
    if (finding.severity === "error") summary.errors += 1;
    else if (finding.severity === "warning") summary.warnings += 1;
    else summary.info += 1;
  }
  return summary;
}

function pageTarget(document: PageDocumentDTO, pageIndex: number) {
  const page = document.pages[pageIndex];
  return {
    page_index: pageIndex,
    element_id: page?.element_id ?? null,
    node_key: null,
    source_path: page?.source_ref?.path ?? null,
  };
}

function dimensionsComparable(width: number | null, height: number | null): width is number {
  return width != null && height != null && width > 0 && height > 0;
}

function aspectMismatch(aWidth: number, aHeight: number, bWidth: number, bHeight: number): boolean {
  const scaleX = bWidth / aWidth;
  const scaleY = bHeight / aHeight;
  return Math.abs(scaleX - scaleY) / Math.max(scaleX, scaleY) > 0.005;
}

function dimensionFinding(
  ruleId: "IIIF.IMAGE_DIMENSION_MISMATCH" | "IIIF.CANVAS_DIMENSION_MISMATCH",
  label: string,
  document: PageDocumentDTO,
  pageIndex: number,
  iiifWidth: number,
  iiifHeight: number,
  sourceId: string,
): ValidationFinding | null {
  const page = document.pages[pageIndex];
  if (!page || page.measurement_unit !== "pixel" || !dimensionsComparable(page.width, page.height)) return null;
  if (page.width === iiifWidth && page.height === iiifHeight) return null;
  const badAspect = aspectMismatch(page.width, page.height!, iiifWidth, iiifHeight);
  return {
    rule_id: ruleId,
    severity: badAspect ? "warning" : "info",
    message: badAspect
      ? `${label} dimensions have a different aspect ratio from the XML page.`
      : `${label} dimensions differ from the XML page but preserve the same aspect ratio; coordinate scaling is possible.`,
    target: pageTarget(document, pageIndex),
    evidence: {
      xml: { width: page.width, height: page.height },
      iiif: { width: iiifWidth, height: iiifHeight, id: sourceId },
      aspect_ratio_mismatch: badAspect,
    },
    remediation: badAspect
      ? "Verify that the selected IIIF Canvas/image corresponds to this XML page and that neither source encodes incorrect dimensions."
      : "Verify that the size difference is an intentional derivative/rescaling before relying on coordinate conversion.",
  };
}

export function iiifValidationFindings(
  document: PageDocumentDTO,
  pageIndex: number,
  inspection: IiifInspection,
  selection: IiifSelection,
  resolvedService: IiifImageService | null = null,
): ValidationFinding[] {
  if (pageIndex < 0 || pageIndex >= document.pages.length) return [];
  const resolved = resolveIiifSelection(inspection, selection, resolvedService);
  const findings: ValidationFinding[] = [];

  if (inspection.kind === "manifest" && resolved.canvas && resolved.canvas.width && resolved.canvas.height) {
    const mismatch = dimensionFinding(
      "IIIF.CANVAS_DIMENSION_MISMATCH",
      "IIIF Canvas",
      document,
      pageIndex,
      resolved.canvas.width,
      resolved.canvas.height,
      resolved.canvas.id,
    );
    if (mismatch) findings.push(mismatch);
  }

  const imageWidth = resolved.candidate?.width ?? resolved.service?.width ?? null;
  const imageHeight = resolved.candidate?.height ?? resolved.service?.height ?? null;
  const imageId = resolved.service?.id ?? resolved.candidate?.id ?? inspection.image_service?.id ?? null;
  if (imageId && dimensionsComparable(imageWidth, imageHeight)) {
    const mismatch = dimensionFinding(
      "IIIF.IMAGE_DIMENSION_MISMATCH",
      "IIIF image",
      document,
      pageIndex,
      imageWidth,
      imageHeight!,
      imageId,
    );
    if (mismatch) findings.push(mismatch);
  }

  if (resolved.canvas && resolved.canvas.images.length > 1 && selection.imageIndex == null) {
    findings.push({
      rule_id: "IIIF.MULTIPLE_IMAGE_CANDIDATES",
      severity: "info",
      message: `Selected Canvas exposes ${resolved.canvas.images.length} painting-image candidates; no image has been chosen automatically.`,
      target: pageTarget(document, pageIndex),
      evidence: {
        canvas_id: resolved.canvas.id,
        candidate_ids: resolved.canvas.images.map((candidate) => candidate.id),
      },
      remediation: "Choose the painting image that corresponds to the XML page before using image-level IIIF validation or display.",
    });
  }

  return findings;
}

export function applyIiifValidation<T extends ValidationReport>(
  base: T,
  document: PageDocumentDTO,
  pageIndex: number,
  inspection: IiifInspection | null,
  selection: IiifSelection,
  resolvedService: IiifImageService | null = null,
): T {
  if (!inspection) return base;
  const findings = [
    ...base.findings,
    ...iiifValidationFindings(document, pageIndex, inspection, selection, resolvedService),
  ];
  return {
    ...base,
    validator_version: IIIF_VALIDATOR_VERSION,
    summary: summarize(findings),
    findings,
  };
}
