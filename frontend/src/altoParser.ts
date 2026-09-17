import { DOMParser, onErrorStopParsing, type Element as XmlElement } from "@xmldom/xmldom";

import type {
  BBoxDTO,
  GeometryDTO,
  GlyphDTO,
  MetadataEntryDTO,
  PageDTO,
  PageDocumentDTO,
  ParserNoticeDTO,
  PointDTO,
  PolylineDTO,
  ProcessingStepDTO,
  ReadingOrderGroupDTO,
  RegionDTO,
  SourceExtensionDTO,
  SourceRefDTO,
  TextAlternativeDTO,
  TextLineDTO,
  WordDTO,
} from "./types";

export const MAX_XML_BYTES = 10 * 1024 * 1024;

const NUMBER_RE = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g;
const PAGE_SPACE_TYPES: Record<string, string> = {
  TopMargin: "top_margin",
  LeftMargin: "left_margin",
  RightMargin: "right_margin",
  BottomMargin: "bottom_margin",
  PrintSpace: "print_space",
};
const BLOCK_TYPES: Record<string, string> = {
  TextBlock: "text",
  ComposedBlock: "composed",
  Illustration: "illustration",
  GraphicalElement: "graphical",
};

class AltoParseError extends Error {}

type PendingRef = { relation: string; target: string; source_ref: SourceRefDTO };
type ParseContext = {
  paths: Map<XmlElement, string>;
  notices: ParserNoticeDTO[];
  allIds: Set<string>;
  references: PendingRef[];
};

function localName(element: XmlElement): string {
  return element.localName || element.tagName.split(":").at(-1) || element.tagName;
}

function childElements(element: XmlElement): XmlElement[] {
  return Array.from(element.childNodes).filter(
    (node): node is XmlElement => node.nodeType === 1,
  );
}

function children(element: XmlElement, ...names: string[]): XmlElement[] {
  const wanted = new Set(names);
  return childElements(element).filter((child) => wanted.has(localName(child)));
}

function firstChild(element: XmlElement, ...names: string[]): XmlElement | null {
  return children(element, ...names)[0] ?? null;
}

function descendants(element: XmlElement, ...names: string[]): XmlElement[] {
  const wanted = new Set(names);
  const result: XmlElement[] = [];
  const visit = (parent: XmlElement) => {
    for (const child of childElements(parent)) {
      if (wanted.has(localName(child))) result.push(child);
      visit(child);
    }
  };
  visit(element);
  return result;
}

function firstDescendant(element: XmlElement, ...names: string[]): XmlElement | null {
  return descendants(element, ...names)[0] ?? null;
}

function text(element: XmlElement | null): string | null {
  const value = element?.textContent?.trim() ?? "";
  return value || null;
}

function attributes(element: XmlElement): Record<string, string> {
  const result: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) result[attribute.name] = attribute.value;
  return result;
}

function buildPaths(root: XmlElement): Map<XmlElement, string> {
  const paths = new Map<XmlElement, string>();
  const visit = (element: XmlElement, path: string) => {
    paths.set(element, path);
    const kids = childElements(element);
    const totals = new Map<string, number>();
    const seen = new Map<string, number>();
    for (const child of kids) {
      const name = localName(child);
      totals.set(name, (totals.get(name) ?? 0) + 1);
    }
    for (const child of kids) {
      const name = localName(child);
      const index = (seen.get(name) ?? 0) + 1;
      seen.set(name, index);
      const suffix = (totals.get(name) ?? 0) > 1 ? `[${index}]` : "";
      visit(child, `${path}/${name}${suffix}`);
    }
  };
  visit(root, `/${localName(root)}`);
  return paths;
}

function sourceRef(element: XmlElement, context: ParseContext): SourceRefDTO {
  return {
    element_name: localName(element),
    path: context.paths.get(element) ?? `/${localName(element)}`,
    xml_id: element.getAttribute("ID") ?? element.getAttribute("id"),
    attributes: attributes(element),
  };
}

function elementId(element: XmlElement, context: ParseContext): string {
  return element.getAttribute("ID") ?? element.getAttribute("id") ?? `anon:${context.paths.get(element)}`;
}

function notice(context: ParseContext, code: string, message: string, element?: XmlElement): void {
  context.notices.push({ code, message, source_ref: element ? sourceRef(element, context) : null });
}

function numberAttribute(element: XmlElement, name: string, context: ParseContext): number | null {
  const raw = element.getAttribute(name);
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    notice(context, "alto.invalid_number", `Attribute ${name}=${JSON.stringify(raw)} is not numeric`, element);
    return null;
  }
  return value;
}

function points(
  value: string | null,
  minimum: number,
  context: ParseContext,
  element: XmlElement,
  code: string,
): PointDTO[] | null {
  if (!value) return null;
  const tokens = value.match(NUMBER_RE) ?? [];
  if (tokens.length % 2 !== 0 || tokens.length < minimum * 2) {
    notice(context, code, `Invalid coordinate list ${JSON.stringify(value)}`, element);
    return null;
  }
  const result: PointDTO[] = [];
  for (let index = 0; index < tokens.length; index += 2) {
    result.push({ x: Number(tokens[index]), y: Number(tokens[index + 1]) });
  }
  return result;
}

function bbox(element: XmlElement, context: ParseContext): BBoxDTO | null {
  const names = ["HPOS", "VPOS", "WIDTH", "HEIGHT"] as const;
  if (!names.every((name) => element.hasAttribute(name))) return null;
  const values = names.map((name) => numberAttribute(element, name, context));
  if (values.some((value) => value == null)) return null;
  return { kind: "bbox", x: values[0]!, y: values[1]!, width: values[2]!, height: values[3]! };
}

function geometry(element: XmlElement, context: ParseContext): GeometryDTO | null {
  const shape = firstChild(element, "Shape");
  if (shape) {
    const polygon = firstChild(shape, "Polygon");
    if (!polygon) {
      notice(context, "alto.unsupported_shape", "Shape is present but no Polygon child could be normalized", shape);
    } else {
      const polygonPoints = points(polygon.getAttribute("POINTS"), 3, context, polygon, "alto.invalid_polygon");
      if (polygonPoints) return { kind: "polygon", points: polygonPoints };
    }
  }
  return bbox(element, context);
}

function baseline(element: XmlElement, context: ParseContext): PolylineDTO | null {
  const value = element.getAttribute("BASELINE");
  const linePoints = points(value, 2, context, element, "alto.invalid_baseline");
  return linePoints ? { kind: "polyline", points: linePoints } : null;
}

function textAlternatives(element: XmlElement, context: ParseContext): TextAlternativeDTO[] {
  const result: TextAlternativeDTO[] = [];
  const content = element.getAttribute("CONTENT");
  if (content != null) result.push({ text: content, confidence: numberAttribute(element, "WC", context), kind: "primary" });
  const substitution = element.getAttribute("SUBS_CONTENT");
  if (substitution != null) {
    result.push({ text: substitution, confidence: null, kind: `substitution:${element.getAttribute("SUBS_TYPE") ?? "unknown"}` });
  }
  for (const alternative of children(element, "ALTERNATIVE")) {
    const value = alternative.getAttribute("CONTENT") ?? text(alternative);
    if (value != null) result.push({ text: value, confidence: null, kind: "alternative" });
  }
  return result;
}

function parseGlyph(element: XmlElement, context: ParseContext): GlyphDTO {
  const alternatives: TextAlternativeDTO[] = [];
  const content = element.getAttribute("CONTENT");
  const confidence = numberAttribute(element, "GC", context);
  if (content != null) alternatives.push({ text: content, confidence, kind: "primary" });
  for (const variant of children(element, "Variant")) {
    const value = variant.getAttribute("CONTENT") ?? text(variant);
    if (value != null) alternatives.push({ text: value, confidence: numberAttribute(variant, "VC", context), kind: "variant" });
  }
  return { element_id: elementId(element, context), geometry: geometry(element, context), text_alternatives: alternatives, confidence, source_ref: sourceRef(element, context) };
}

function parseWord(element: XmlElement, context: ParseContext): WordDTO {
  return {
    element_id: elementId(element, context),
    geometry: geometry(element, context),
    text_alternatives: textAlternatives(element, context),
    confidence: numberAttribute(element, "WC", context),
    glyphs: children(element, "Glyph").map((child) => parseGlyph(child, context)),
    source_ref: sourceRef(element, context),
  };
}

function parseLine(element: XmlElement, context: ParseContext): TextLineDTO {
  let reconstructed = "";
  for (const child of childElements(element)) {
    const name = localName(child);
    if (name === "String") reconstructed += child.getAttribute("CONTENT") ?? "";
    else if (name === "SP") reconstructed += " ";
    else if (name === "HYP") reconstructed += child.getAttribute("CONTENT") ?? "-";
  }
  return {
    element_id: elementId(element, context),
    geometry: geometry(element, context),
    baseline: baseline(element, context),
    text_alternatives: reconstructed ? [{ text: reconstructed, confidence: null, kind: "reconstructed" }] : [],
    words: children(element, "String").map((child) => parseWord(child, context)),
    source_ref: sourceRef(element, context),
  };
}

function regionType(name: string): string {
  if (PAGE_SPACE_TYPES[name]) return PAGE_SPACE_TYPES[name];
  if (BLOCK_TYPES[name]) return BLOCK_TYPES[name];
  if (name.endsWith("Block")) return `block:${name.slice(0, -5).toLowerCase()}`;
  return name.toLowerCase();
}

function isRegionElement(element: XmlElement): boolean {
  const name = localName(element);
  return Boolean(PAGE_SPACE_TYPES[name] || BLOCK_TYPES[name] || name.endsWith("Block"));
}

function parseRegion(element: XmlElement, context: ParseContext): RegionDTO {
  return {
    element_id: elementId(element, context),
    region_type: regionType(localName(element)),
    geometry: geometry(element, context),
    text_alternatives: [],
    lines: localName(element) === "TextBlock" ? children(element, "TextLine").map((child) => parseLine(child, context)) : [],
    regions: childElements(element).filter(isRegionElement).map((child) => parseRegion(child, context)),
    source_ref: sourceRef(element, context),
  };
}

function parseReadingOrderGroup(element: XmlElement, context: ParseContext): ReadingOrderGroupDTO {
  const refs: string[] = [];
  const groups: ReadingOrderGroupDTO[] = [];
  for (const child of childElements(element)) {
    const name = localName(child);
    if (name === "ElementRef") {
      const target = child.getAttribute("IDREF");
      if (target) {
        refs.push(target);
        context.references.push({ relation: "reading_order", target, source_ref: sourceRef(child, context) });
      } else notice(context, "alto.missing_reference", "Reading-order ElementRef has no IDREF attribute", child);
    } else if (name === "OrderedGroup" || name === "UnorderedGroup") groups.push(parseReadingOrderGroup(child, context));
  }
  return { element_id: element.getAttribute("ID"), ordered: localName(element) === "OrderedGroup", refs, groups, source_ref: sourceRef(element, context) };
}

function parseReadingOrder(element: XmlElement, context: ParseContext): ReadingOrderGroupDTO | null {
  const groups = childElements(element)
    .filter((child) => ["OrderedGroup", "UnorderedGroup"].includes(localName(child)))
    .map((child) => parseReadingOrderGroup(child, context));
  if (!groups.length) {
    notice(context, "alto.empty_reading_order", "ReadingOrder is present but contains no supported group", element);
    return null;
  }
  if (groups.length === 1) return groups[0];
  return { element_id: element.getAttribute("ID"), ordered: false, refs: [], groups, source_ref: sourceRef(element, context) };
}

function measurementUnit(description: XmlElement | null): PageDTO["measurement_unit"] {
  const value = text(description ? firstChild(description, "MeasurementUnit") : null)?.toLowerCase();
  if (value === "pixel" || value === "mm10" || value === "inch1200") return value;
  return "unknown";
}

function sourceImageMetadata(description: XmlElement | null, context: ParseContext): { metadata: MetadataEntryDTO[]; imageReference: string | null } {
  const metadata: MetadataEntryDTO[] = [];
  if (!description) return { metadata, imageReference: null };
  const info = firstChild(description, "sourceImageInformation");
  if (!info) return { metadata, imageReference: null };
  let imageReference: string | null = null;
  const labels: Record<string, string> = {
    fileName: "source_image.file_name",
    fileIdentifier: "source_image.file_identifier",
    documentIdentifier: "source_image.document_identifier",
  };
  for (const child of childElements(info)) {
    const value = text(child);
    if (!value) continue;
    const name = localName(child);
    metadata.push({ label: labels[name] ?? `source_image.${name}`, value, source_ref: sourceRef(child, context) });
    if (name === "fileName") imageReference = value;
  }
  for (const [key, value] of Object.entries(attributes(info))) {
    metadata.push({ label: `source_image.attribute.${key}`, value, source_ref: sourceRef(info, context) });
  }
  return { metadata, imageReference };
}

function processingSteps(description: XmlElement | null, context: ParseContext): ProcessingStepDTO[] {
  if (!description) return [];
  const result: ProcessingStepDTO[] = [];
  const containers = childElements(description).filter((child) => ["OCRProcessing", "Processing"].includes(localName(child)));
  for (const container of containers) {
    let candidates = childElements(container).filter((child) => ["ocrProcessingStep", "processingStep"].includes(localName(child)));
    if (!candidates.length) candidates = [container];
    for (const step of candidates) {
      const software = firstDescendant(step, "processingSoftware");
      const extra: Record<string, string> = {};
      const creator = software ? text(firstDescendant(software, "softwareCreator")) : null;
      const agency = text(firstDescendant(step, "processingAgency"));
      const settings = text(firstDescendant(step, "processingStepSettings"));
      const descriptionText = text(firstDescendant(step, "processingStepDescription"));
      const stepType = step.getAttribute("processingStepType");
      if (creator) extra.software_creator = creator;
      if (agency) extra.processing_agency = agency;
      if (settings) extra.settings = settings;
      if (descriptionText) extra.description = descriptionText;
      if (stepType) extra.processing_step_type = stepType;
      result.push({
        identifier: step.getAttribute("ID") ?? container.getAttribute("ID") ?? `anon:${context.paths.get(step)}`,
        software_name: software ? text(firstDescendant(software, "softwareName")) : null,
        software_version: software ? text(firstDescendant(software, "softwareVersion")) : null,
        timestamp: text(firstDescendant(step, "processingDateTime")),
        attributes: extra,
        source_ref: sourceRef(step, context),
      });
    }
  }
  return result;
}

function extensions(root: XmlElement, context: ParseContext): SourceExtensionDTO[] {
  const result: SourceExtensionDTO[] = [];
  for (const [sectionName, category] of [["Styles", "style"], ["Tags", "tag"]] as const) {
    const section = firstChild(root, sectionName);
    if (!section) continue;
    for (const child of childElements(section)) {
      result.push({ category, name: localName(child), identifier: child.getAttribute("ID"), text: text(child), attributes: attributes(child), source_ref: sourceRef(child, context) });
    }
  }
  return result;
}

function parsePage(element: XmlElement, context: ParseContext, unit: PageDTO["measurement_unit"], imageReference: string | null): PageDTO {
  const readingOrderElement = firstChild(element, "ReadingOrder");
  return {
    element_id: elementId(element, context),
    width: numberAttribute(element, "WIDTH", context),
    height: numberAttribute(element, "HEIGHT", context),
    measurement_unit: unit,
    image_reference: imageReference,
    language: element.getAttribute("LANG"),
    other_languages: (element.getAttribute("OTHERLANGS") ?? "").split(/\s+/).filter(Boolean),
    rotation: numberAttribute(element, "ROTATION", context),
    regions: childElements(element).filter(isRegionElement).map((child) => parseRegion(child, context)),
    reading_order: readingOrderElement ? parseReadingOrder(readingOrderElement, context) : null,
    source_ref: sourceRef(element, context),
  };
}

function collectIdsAndRefs(root: XmlElement, context: ParseContext): void {
  const visit = (element: XmlElement) => {
    const id = element.getAttribute("ID") ?? element.getAttribute("id");
    if (id) context.allIds.add(id);
    const next = element.getAttribute("IDNEXT");
    if (next) context.references.push({ relation: "idnext", target: next, source_ref: sourceRef(element, context) });
    for (const child of childElements(element)) visit(child);
  };
  visit(root);
}

function addReferenceNotices(context: ParseContext): void {
  const seen = new Set<string>();
  for (const reference of context.references) {
    if (context.allIds.has(reference.target)) continue;
    const key = `${reference.relation}|${reference.target}|${reference.source_ref.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    context.notices.push({ code: "alto.dangling_reference", message: `${reference.relation} reference targets unknown ID ${JSON.stringify(reference.target)}`, source_ref: reference.source_ref });
  }
}

function parseXml(xml: string): XmlElement {
  if (new TextEncoder().encode(xml).byteLength > MAX_XML_BYTES) throw new AltoParseError("XML input exceeds the 10 MiB limit.");
  if (/<!DOCTYPE\b/i.test(xml) || /<!ENTITY\b/i.test(xml)) throw new AltoParseError("DTD and entity declarations are not accepted.");
  try {
    const document = new DOMParser({ onError: onErrorStopParsing }).parseFromString(xml, "application/xml");
    if (!document?.documentElement) throw new AltoParseError("XML document has no root element.");
    return document.documentElement;
  } catch (error) {
    if (error instanceof AltoParseError) throw error;
    throw new AltoParseError(error instanceof Error ? `Malformed XML: ${error.message}` : "Malformed XML.");
  }
}

export function parseAltoString(xml: string): PageDocumentDTO {
  const root = parseXml(xml);
  if (localName(root).toLowerCase() !== "alto") throw new AltoParseError(`Expected ALTO root element, found ${localName(root)}.`);
  const namespace = root.namespaceURI;
  const namespaceMatch = namespace?.match(/\/alto\/ns-v([234])#?$/);
  if (!namespaceMatch) throw new AltoParseError(`Unsupported ALTO namespace ${JSON.stringify(namespace)}.`);

  const context: ParseContext = { paths: buildPaths(root), notices: [], allIds: new Set(), references: [] };
  collectIdsAndRefs(root, context);
  const description = firstChild(root, "Description");
  const unit = measurementUnit(description);
  const unitElement = description ? firstChild(description, "MeasurementUnit") : null;
  if (unit === "unknown" && text(unitElement)) notice(context, "alto.unknown_measurement_unit", `Unsupported measurement unit ${JSON.stringify(text(unitElement))}`, unitElement ?? undefined);

  const { metadata, imageReference } = sourceImageMetadata(description, context);
  const layout = firstChild(root, "Layout");
  let pages: PageDTO[] = [];
  if (!layout) notice(context, "alto.missing_layout", "ALTO document has no Layout section", root);
  else {
    pages = children(layout, "Page").map((page) => parsePage(page, context, unit, imageReference));
    if (!pages.length) notice(context, "alto.missing_page", "ALTO Layout contains no Page", layout);
  }

  const known = new Set(["Description", "Styles", "Tags", "Layout"]);
  for (const child of childElements(root)) {
    if (!known.has(localName(child))) notice(context, "alto.unhandled_root_element", `Root child ${JSON.stringify(localName(child))} is preserved only as a notice`, child);
  }
  addReferenceNotices(context);

  return {
    source_format: "alto",
    source_version: root.getAttribute("SCHEMAVERSION") ?? namespaceMatch[1],
    namespace,
    pages,
    metadata,
    processing_steps: processingSteps(description, context),
    extensions: extensions(root, context),
    notices: context.notices,
    source_attributes: attributes(root),
  };
}

export { AltoParseError };
