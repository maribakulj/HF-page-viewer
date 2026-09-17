export type PointDTO = {
  x: number;
  y: number;
};

export type BBoxDTO = {
  kind: "bbox";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PolygonDTO = {
  kind: "polygon";
  points: PointDTO[];
};

export type GeometryDTO = BBoxDTO | PolygonDTO;

export type PolylineDTO = {
  kind: "polyline";
  points: PointDTO[];
};

export type SourceRefDTO = {
  element_name: string;
  path: string;
  xml_id: string | null;
  attributes: Record<string, string>;
};

export type TextAlternativeDTO = {
  text: string;
  confidence: number | null;
  kind: string;
};

export type GlyphDTO = {
  element_id: string;
  geometry: GeometryDTO | null;
  text_alternatives: TextAlternativeDTO[];
  confidence: number | null;
  source_ref: SourceRefDTO | null;
};

export type WordDTO = {
  element_id: string;
  geometry: GeometryDTO | null;
  text_alternatives: TextAlternativeDTO[];
  confidence: number | null;
  glyphs: GlyphDTO[];
  source_ref: SourceRefDTO | null;
};

export type TextLineDTO = {
  element_id: string;
  geometry: GeometryDTO | null;
  baseline: PolylineDTO | null;
  text_alternatives: TextAlternativeDTO[];
  words: WordDTO[];
  source_ref: SourceRefDTO | null;
};

export type RegionDTO = {
  element_id: string;
  region_type: string;
  geometry: GeometryDTO | null;
  text_alternatives: TextAlternativeDTO[];
  lines: TextLineDTO[];
  regions: RegionDTO[];
  source_ref: SourceRefDTO | null;
};

export type ReadingOrderGroupDTO = {
  element_id: string | null;
  ordered: boolean;
  refs: string[];
  groups: ReadingOrderGroupDTO[];
  source_ref: SourceRefDTO | null;
};

export type PageDTO = {
  element_id: string;
  width: number | null;
  height: number | null;
  measurement_unit: "pixel" | "mm10" | "inch1200" | "unknown";
  image_reference: string | null;
  language: string | null;
  other_languages: string[];
  rotation: number | null;
  regions: RegionDTO[];
  reading_order: ReadingOrderGroupDTO | null;
  source_ref: SourceRefDTO | null;
};

export type MetadataEntryDTO = {
  label: string;
  value: string;
  source_ref: SourceRefDTO | null;
};

export type ProcessingStepDTO = {
  identifier: string | null;
  software_name: string | null;
  software_version: string | null;
  timestamp: string | null;
  attributes: Record<string, string>;
  source_ref: SourceRefDTO | null;
};

export type SourceExtensionDTO = {
  category: string;
  name: string;
  identifier: string | null;
  text: string | null;
  attributes: Record<string, string>;
  source_ref: SourceRefDTO | null;
};

export type ParserNoticeDTO = {
  code: string;
  message: string;
  source_ref: SourceRefDTO | null;
};

export type PageDocumentDTO = {
  source_format: "alto" | "page_xml";
  source_version: string | null;
  namespace: string | null;
  pages: PageDTO[];
  metadata: MetadataEntryDTO[];
  processing_steps: ProcessingStepDTO[];
  extensions: SourceExtensionDTO[];
  notices: ParserNoticeDTO[];
  source_attributes: Record<string, string>;
};

export type NodeKind = "region" | "line" | "word" | "glyph";

export type OverlayNode = {
  key: string;
  elementId: string;
  kind: NodeKind;
  subtype: string | null;
  geometry: GeometryDTO | null;
  baseline: PolylineDTO | null;
  text: string | null;
  confidence: number | null;
  sourceRef: SourceRefDTO | null;
};

export type ImageInfo = {
  url: string;
  name: string;
  width: number;
  height: number;
  source_kind?: "local" | "iiif";
  tile_source_url?: string | null;
};

export type LayerState = {
  regions: boolean;
  lines: boolean;
  words: boolean;
  glyphs: boolean;
  baselines: boolean;
  readingOrder: boolean;
};
