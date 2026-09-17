import type { IiifImageService, IiifInspection } from "./iiifModel";
import type { IiifSelection } from "./iiifViewer";
import { resolveIiifSelection } from "./iiifViewer";
import { countPageElements } from "./pageModel";
import type { FileFingerprint } from "./fileFingerprint";
import type { ImageInfo, PageDocumentDTO } from "./types";
import type { WordTextEdit } from "./wordEdits";
import type { CombinedValidationReport } from "./xsdFindings";

export const QC_REPORT_VERSION = "1.1.0";
export const QC_GENERATOR_VERSION = "0.2.0";

export type QcReportInput = {
  document: PageDocumentDTO;
  validation: CombinedValidationReport;
  xmlFingerprint: FileFingerprint | null;
  imageFingerprint: FileFingerprint | null;
  activeImage: ImageInfo | null;
  pageIndex: number;
  edits?: WordTextEdit[];
  iiif: {
    loadedUrl: string | null;
    inspection: IiifInspection | null;
    selection: IiifSelection;
    resolvedService: IiifImageService | null;
  };
  generatedAt?: string;
};

export type QcReport = {
  report_version: string;
  generated_at: string;
  generator: { name: "HF Page Viewer"; version: string; runtime: "browser" };
  working_copy: { modified: boolean; word_text_edits: WordTextEdit[] };
  document: {
    source_format: PageDocumentDTO["source_format"];
    source_version: string | null;
    namespace: string | null;
    page_count: number;
    xml_fingerprint: FileFingerprint | null;
    pages: Array<{
      index: number; element_id: string; width: number | null; height: number | null;
      measurement_unit: string; image_reference: string | null; regions: number; lines: number; words: number; glyphs: number;
    }>;
  };
  image: {
    source_kind: "local" | "iiif" | null; name: string | null; width: number | null; height: number | null;
    tile_source_url: string | null; local_fingerprint: FileFingerprint | null;
  };
  iiif: null | {
    loaded_url: string | null; kind: IiifInspection["kind"]; version: IiifInspection["version"]; id: string;
    selected_canvas_id: string | null; selected_image_id: string | null; selected_service_id: string | null;
    canvas_dimensions: { width: number | null; height: number | null } | null;
    image_dimensions: { width: number | null; height: number | null } | null;
  };
  validation: CombinedValidationReport;
};

export function buildQcReport(input: QcReportInput): QcReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const edits = input.edits ?? [];
  const resolvedIiif = input.iiif.inspection
    ? resolveIiifSelection(input.iiif.inspection, input.iiif.selection, input.iiif.resolvedService)
    : null;
  return {
    report_version: QC_REPORT_VERSION,
    generated_at: generatedAt,
    generator: { name: "HF Page Viewer", version: QC_GENERATOR_VERSION, runtime: "browser" },
    working_copy: { modified: edits.length > 0, word_text_edits: edits },
    document: {
      source_format: input.document.source_format,
      source_version: input.document.source_version,
      namespace: input.document.namespace,
      page_count: input.document.pages.length,
      xml_fingerprint: input.xmlFingerprint,
      pages: input.document.pages.map((page, index) => {
        const counts = countPageElements(page);
        return {
          index, element_id: page.element_id, width: page.width, height: page.height,
          measurement_unit: page.measurement_unit, image_reference: page.image_reference,
          regions: counts.regions, lines: counts.lines, words: counts.words, glyphs: counts.glyphs,
        };
      }),
    },
    image: {
      source_kind: input.activeImage?.source_kind ?? null,
      name: input.activeImage?.name ?? null,
      width: input.activeImage?.width ?? null,
      height: input.activeImage?.height ?? null,
      tile_source_url: input.activeImage?.tile_source_url ?? null,
      local_fingerprint: input.imageFingerprint,
    },
    iiif: input.iiif.inspection ? {
      loaded_url: input.iiif.loadedUrl,
      kind: input.iiif.inspection.kind,
      version: input.iiif.inspection.version,
      id: input.iiif.inspection.id,
      selected_canvas_id: resolvedIiif?.canvas?.id ?? null,
      selected_image_id: resolvedIiif?.candidate?.id ?? null,
      selected_service_id: resolvedIiif?.service?.id ?? null,
      canvas_dimensions: resolvedIiif?.canvas ? { width: resolvedIiif.canvas.width, height: resolvedIiif.canvas.height } : null,
      image_dimensions: resolvedIiif?.candidate || resolvedIiif?.service ? {
        width: resolvedIiif?.candidate?.width ?? resolvedIiif?.service?.width ?? null,
        height: resolvedIiif?.candidate?.height ?? resolvedIiif?.service?.height ?? null,
      } : null,
    } : null,
    validation: input.validation,
  };
}

export function qcReportFilename(input: QcReport): string {
  const stem = input.document.xml_fingerprint?.name?.replace(/\.xml$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "document";
  return `${stem}.qc.json`;
}
