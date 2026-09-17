import { DOMParser, onErrorStopParsing, type Element as XmlElement } from "@xmldom/xmldom";

import type {
  GeometryDTO,
  GlyphDTO,
  MetadataEntryDTO,
  PageDTO,
  PageDocumentDTO,
  ParserNoticeDTO,
  PointDTO,
  PolylineDTO,
  ReadingOrderGroupDTO,
  RegionDTO,
  SourceExtensionDTO,
  SourceRefDTO,
  TextAlternativeDTO,
  TextLineDTO,
  WordDTO,
} from "./types";

const MAX_XML_BYTES = 10 * 1024 * 1024;
const NUMBER_RE = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g;
const PAGE_NAMESPACE_RE = /\/PAGE\/gts\/pagecontent\/(\d{4}-\d{2}-\d{2})\/?$/i;
const BASELINE_VERSION = "2019-07-15";

type PendingRef = { relation: string; target: string; source_ref: SourceRefDTO };
type ParseContext = {
  paths: Map<XmlElement, string>;
  notices: ParserNoticeDTO[];
  allIds: Set<string>;
  references: PendingRef[];
};

export class PageXmlParseError extends Error {}

function localName(element: XmlElement): string {
  return element.localName || element.tagName.split(":").at(-1) || element.tagName;
}

function childElements(element: XmlElement): XmlElement[] {
  return Array.from(element.childNodes).filter((node): node is XmlElement => node.nodeType === 1);
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
  const visit = (parent: XmlElement): void => {
    for (const child of childElements(parent)) {
      if (wanted.has(localName(child))) result.push(child);
      visit(child);
    }
  };
  visit(element);
  return result;
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
  const visit = (element: XmlElement, path: string): void => {
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
      visit(child, `${path}/${name}${(totals.get(name) ?? 0) > 1 ? `[${index}]` : ""}`);
    }
  };
  visit(root, `/${localName(root)}`);
  return paths;
}

function sourceRef(element: XmlElement, context: ParseContext): SourceRefDTO {
  return {
    element_name: localName(element),
    path: context.paths.get(element) ?? `/${localName(element)}`,
    xml_id: element.getAttribute("id") ?? element.getAttribute("ID"),
    attributes: attributes(element),
  };
}

function elementId(element: XmlElement, context: ParseContext): string {
  return element.getAttribute("id") ?? element.getAttribute("ID") ?? `anon:${context.paths.get(element)}`;
}

function notice(context: ParseContext, code: string, message: string, element?: XmlElement): void {
  context.notices.push({ code, message, source_ref: element ? sourceRef(element, context) : null });
}

function numberAttribute(element: XmlElement, name: string, context: ParseContext): number | null {
  const raw = element.getAttribute(name);
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    notice(context, "page.invalid_number", `Attribute ${name}=${JSON.stringify(raw)} is not numeric`, element);
    return null;
  }
  return value;
}

function parsePoints(value: string | null, minimum: number, context: ParseContext, element: XmlElement, code: string): PointDTO[] | null {
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

function geometry(element: XmlElement, context: ParseContext): GeometryDTO | null {
  const coords = firstChild(element, "Coords");
  if (!coords) return null;
  const points = parsePoints(coords.getAttribute("points"), 3, context, coords, "page.invalid_polygon");
  return points ? { kind: "polygon", points } : null;
}

function baseline(element: XmlElement, context: ParseContext): PolylineDTO | null {
  const baselineElement = firstChild(element, "Baseline");
  if (!baselineElement) return null;
  const points = parsePoints(baselineElement.getAttribute("points"), 2, context, baselineElement, "page.invalid_baseline");
  return points ? { kind: "polyline", points } : null;
}

function textAlternatives(element: XmlElement, context: ParseContext): TextAlternativeDTO[] {
  return children(element, "TextEquiv")
    .map((equiv, position): TextAlternativeDTO | null => {
      const unicode = text(firstChild(equiv, "Unicode")) ?? text(firstChild(equiv, "PlainText"));
      if (unicode == null) return null;
      const explicitIndex = equiv.getAttribute("index");
      return {
        text: unicode,
        confidence: numberAttribute(equiv, "conf", context),
        kind: position === 0 ? "primary" : `alternative:${explicitIndex ?? position}`,
      };
    })
    .filter((value): value is TextAlternativeDTO => value !== null);
}

function primaryConfidence(alternatives: TextAlternativeDTO[]): number | null {
  return alternatives[0]?.confidence ?? null;
}

function parseGlyph(element: XmlElement, context: ParseContext): GlyphDTO {
  const alternatives = textAlternatives(element, context);
  return {
    element_id: elementId(element, context),
    geometry: geometry(element, context),
    text_alternatives: alternatives,
    confidence: primaryConfidence(alternatives),
    source_ref: sourceRef(element, context),
  };
}

function parseWord(element: XmlElement, context: ParseContext): WordDTO {
  const alternatives = textAlternatives(element, context);
  return {
    element_id: elementId(element, context),
    geometry: geometry(element, context),
    text_alternatives: alternatives,
    confidence: primaryConfidence(alternatives),
    glyphs: children(element, "Glyph").map((child) => parseGlyph(child, context)),
    source_ref: sourceRef(element, context),
  };
}

function parseLine(element: XmlElement, context: ParseContext): TextLineDTO {
  return {
    element_id: elementId(element, context),
    geometry: geometry(element, context),
    baseline: baseline(element, context),
    text_alternatives: textAlternatives(element, context),
    words: children(element, "Word").map((child) => parseWord(child, context)),
    source_ref: sourceRef(element, context),
  };
}

function isRegionElement(element: XmlElement): boolean {
  return localName(element).endsWith("Region");
}

function regionType(element: XmlElement): string {
  const name = localName(element);
  const base = name.endsWith("Region") ? name.slice(0, -6).toLowerCase() : name.toLowerCase();
  const semanticType = element.getAttribute("type");
  return semanticType ? `${base}:${semanticType}` : base;
}

function parseRegion(element: XmlElement, context: ParseContext): RegionDTO {
  return {
    element_id: elementId(element, context),
    region_type: regionType(element),
    geometry: geometry(element, context),
    text_alternatives: textAlternatives(element, context),
    lines: localName(element) === "TextRegion" ? children(element, "TextLine").map((child) => parseLine(child, context)) : [],
    regions: childElements(element).filter(isRegionElement).map((child) => parseRegion(child, context)),
    source_ref: sourceRef(element, context),
  };
}

function isGroup(element: XmlElement): boolean {
  return /^(?:Ordered|Unordered)Group(?:Indexed)?$/.test(localName(element));
}

function parseReadingOrderGroup(element: XmlElement, context: ParseContext): ReadingOrderGroupDTO {
  const ordered = localName(element).startsWith("Ordered");
  const refs = childElements(element)
    .filter((child) => /^RegionRef(?:Indexed)?$/.test(localName(child)))
    .map((child, position) => ({
      target: child.getAttribute("regionRef"),
      index: Number(child.getAttribute("index") ?? position),
      child,
    }))
    .filter((entry): entry is { target: string; index: number; child: XmlElement } => Boolean(entry.target))
    .sort((left, right) => (ordered ? left.index - right.index : 0));

  for (const entry of refs) {
    context.references.push({ relation: "reading_order", target: entry.target, source_ref: sourceRef(entry.child, context) });
  }

  const groups = childElements(element).filter(isGroup).map((child) => parseReadingOrderGroup(child, context));
  return {
    element_id: element.getAttribute("id"),
    ordered,
    refs: refs.map((entry) => entry.target),
    groups,
    source_ref: sourceRef(element, context),
  };
}

function parseReadingOrder(page: XmlElement, context: ParseContext): ReadingOrderGroupDTO | null {
  const readingOrder = firstChild(page, "ReadingOrder");
  if (!readingOrder) return null;
  const groups = childElements(readingOrder).filter(isGroup).map((group) => parseReadingOrderGroup(group, context));
  if (!groups.length) {
    notice(context, "page.empty_reading_order", "ReadingOrder is present but contains no supported group", readingOrder);
    return null;
  }
  if (groups.length === 1) return groups[0];
  return { element_id: null, ordered: false, refs: [], groups, source_ref: sourceRef(readingOrder, context) };
}

function collectIds(root: XmlElement, context: ParseContext): void {
  const visit = (element: XmlElement): void => {
    const id = element.getAttribute("id") ?? element.getAttribute("ID");
    if (id) context.allIds.add(id);
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
    context.notices.push({
      code: "page.dangling_reference",
      message: `${reference.relation} reference targets unknown ID ${JSON.stringify(reference.target)}`,
      source_ref: reference.source_ref,
    });
  }
}

function metadata(root: XmlElement, context: ParseContext): MetadataEntryDTO[] {
  const metadataElement = firstChild(root, "Metadata");
  if (!metadataElement) return [];
  const result: MetadataEntryDTO[] = [];
  for (const child of childElements(metadataElement)) {
    const name = localName(child);
    if (["Creator", "Created", "LastChange", "Comments"].includes(name)) {
      const value = text(child);
      if (value) result.push({ label: `page.metadata.${name.toLowerCase()}`, value, source_ref: sourceRef(child, context) });
    }
  }
  return result;
}

function metadataExtensions(root: XmlElement, context: ParseContext): SourceExtensionDTO[] {
  const metadataElement = firstChild(root, "Metadata");
  if (!metadataElement) return [];
  return descendants(metadataElement, "MetadataItem").map((item) => ({
    category: "metadata",
    name: item.getAttribute("type") ?? item.getAttribute("name") ?? "MetadataItem",
    identifier: item.getAttribute("name"),
    text: item.getAttribute("value") ?? text(item),
    attributes: attributes(item),
    source_ref: sourceRef(item, context),
  }));
}

function parsePage(page: XmlElement, context: ParseContext): PageDTO {
  const imageFilename = page.getAttribute("imageFilename");
  return {
    element_id: elementId(page, context),
    width: numberAttribute(page, "imageWidth", context),
    height: numberAttribute(page, "imageHeight", context),
    measurement_unit: "pixel",
    image_reference: imageFilename,
    language: null,
    other_languages: [],
    rotation: numberAttribute(page, "orientation", context),
    regions: childElements(page).filter(isRegionElement).map((region) => parseRegion(region, context)),
    reading_order: parseReadingOrder(page, context),
    source_ref: sourceRef(page, context),
  };
}

function parseRoot(xml: string): XmlElement {
  if (new TextEncoder().encode(xml).byteLength > MAX_XML_BYTES) throw new PageXmlParseError("XML input exceeds the 10 MiB limit.");
  if (/<!DOCTYPE\b/i.test(xml) || /<!ENTITY\b/i.test(xml)) throw new PageXmlParseError("DTD and entity declarations are not accepted.");
  try {
    const document = new DOMParser({ onError: onErrorStopParsing }).parseFromString(xml, "application/xml");
    if (!document?.documentElement) throw new PageXmlParseError("XML document has no root element.");
    return document.documentElement;
  } catch (error) {
    if (error instanceof PageXmlParseError) throw error;
    throw new PageXmlParseError(error instanceof Error ? `Malformed XML: ${error.message}` : "Malformed XML.");
  }
}

export function parsePageXmlString(xml: string): PageDocumentDTO {
  const root = parseRoot(xml);
  if (localName(root) !== "PcGts") throw new PageXmlParseError(`Expected PAGE PcGts root element, found ${localName(root)}.`);
  const namespace = root.namespaceURI;
  const match = namespace?.match(PAGE_NAMESPACE_RE);
  if (!match) throw new PageXmlParseError(`Unsupported PAGE namespace ${JSON.stringify(namespace)}.`);

  const context: ParseContext = { paths: buildPaths(root), notices: [], allIds: new Set(), references: [] };
  collectIds(root, context);
  const version = match[1];
  if (version !== BASELINE_VERSION) {
    notice(context, "page.nonbaseline_version", `PAGE namespace ${version} is parsed using the ${BASELINE_VERSION} compatibility adapter`, root);
  }

  const pageElements = children(root, "Page");
  if (!pageElements.length) notice(context, "page.missing_page", "PAGE document contains no Page element", root);
  const pages = pageElements.map((page) => parsePage(page, context));
  for (const page of pageElements) {
    const filename = page.getAttribute("imageFilename");
    if (filename) context.notices.push({ code: "page.image_reference", message: `PAGE imageFilename is ${JSON.stringify(filename)}`, source_ref: sourceRef(page, context) });
  }
  addReferenceNotices(context);

  return {
    source_format: "page_xml",
    source_version: version,
    namespace,
    pages,
    metadata: metadata(root, context),
    processing_steps: [],
    extensions: metadataExtensions(root, context),
    notices: context.notices,
    source_attributes: attributes(root),
  };
}
