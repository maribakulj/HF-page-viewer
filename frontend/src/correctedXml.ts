import { DOMParser, XMLSerializer, onErrorStopParsing, type Document as XmlDocument, type Element as XmlElement } from "@xmldom/xmldom";

import type { BBoxEdit } from "./bboxEdits";
import type { PageDocumentDTO } from "./types";
import type { WordTextEdit } from "./wordEdits";

export type CorrectedXmlWarning = {
  code:
    | "EXPORT.TARGET_NOT_FOUND"
    | "EXPORT.TARGET_KIND_MISMATCH"
    | "EXPORT.PAGE_BBOX_UNSUPPORTED"
    | "EXPORT.PAGE_TEXT_TARGET_MISSING";
  message: string;
  target_key: string;
};

export type CorrectedXmlResult = {
  xml: string;
  applied_word_text_edits: number;
  applied_bbox_edits: number;
  skipped_edits: number;
  warnings: CorrectedXmlWarning[];
  preservation: {
    strategy: "patch-original-dom";
    untouched_elements_preserved: true;
    byte_identical_roundtrip: false;
  };
};

const PATH_SEGMENT_RE = /^([^\[]+)(?:\[(\d+)\])?$/;

function localName(element: XmlElement): string {
  return element.localName || element.tagName.split(":").at(-1) || element.tagName;
}

function childElements(element: XmlElement): XmlElement[] {
  return Array.from(element.childNodes).filter((node): node is XmlElement => node.nodeType === 1);
}

function allElements(document: XmlDocument): XmlElement[] {
  const result: XmlElement[] = [];
  const root = document.documentElement;
  const visit = (element: XmlElement): void => {
    result.push(element);
    childElements(element).forEach(visit);
  };
  visit(root);
  return result;
}

function resolveById(document: XmlDocument, elementId: string): XmlElement | null {
  if (!elementId || elementId.startsWith("anon:")) return null;
  return allElements(document).find((element) => (
    element.getAttribute("ID") === elementId || element.getAttribute("id") === elementId
  )) ?? null;
}

function resolveByPath(document: XmlDocument, path: string | null): XmlElement | null {
  if (!path?.startsWith("/")) return null;
  const parts = path.slice(1).split("/").filter(Boolean);
  if (!parts.length) return null;
  const rootMatch = PATH_SEGMENT_RE.exec(parts[0]);
  if (!rootMatch || localName(document.documentElement) !== rootMatch[1]) return null;

  let current = document.documentElement;
  for (const rawPart of parts.slice(1)) {
    const match = PATH_SEGMENT_RE.exec(rawPart);
    if (!match) return null;
    const name = match[1];
    const index = Number(match[2] ?? "1");
    const matches = childElements(current).filter((child) => localName(child) === name);
    current = matches[index - 1];
    if (!current) return null;
  }
  return current;
}

function resolveTarget(document: XmlDocument, elementId: string, sourcePath: string | null): XmlElement | null {
  return resolveById(document, elementId) ?? resolveByPath(document, sourcePath);
}

function firstChild(element: XmlElement, name: string): XmlElement | null {
  return childElements(element).find((child) => localName(child) === name) ?? null;
}

function patchAltoWordText(target: XmlElement, edit: WordTextEdit): CorrectedXmlWarning | null {
  if (localName(target) !== "String") {
    return { code: "EXPORT.TARGET_KIND_MISMATCH", message: `Expected ALTO String for ${edit.target_key}, found ${localName(target)}.`, target_key: edit.target_key };
  }
  target.setAttribute("CONTENT", edit.after);
  return null;
}

function patchPageWordText(target: XmlElement, edit: WordTextEdit): CorrectedXmlWarning | null {
  if (localName(target) !== "Word") {
    return { code: "EXPORT.TARGET_KIND_MISMATCH", message: `Expected PAGE Word for ${edit.target_key}, found ${localName(target)}.`, target_key: edit.target_key };
  }
  const textEquiv = firstChild(target, "TextEquiv");
  const textNode = textEquiv ? firstChild(textEquiv, "Unicode") ?? firstChild(textEquiv, "PlainText") : null;
  if (!textNode) {
    return { code: "EXPORT.PAGE_TEXT_TARGET_MISSING", message: `PAGE Word ${edit.element_id} has no existing primary TextEquiv/Unicode or PlainText node to patch safely.`, target_key: edit.target_key };
  }
  while (textNode.firstChild) textNode.removeChild(textNode.firstChild);
  textNode.appendChild(target.ownerDocument!.createTextNode(edit.after));
  return null;
}

function patchAltoBBox(target: XmlElement, edit: BBoxEdit): CorrectedXmlWarning | null {
  const expected = edit.target_kind === "word" ? "String" : edit.target_kind === "line" ? "TextLine" : null;
  if (expected && localName(target) !== expected) {
    return { code: "EXPORT.TARGET_KIND_MISMATCH", message: `Expected ALTO ${expected} for ${edit.target_key}, found ${localName(target)}.`, target_key: edit.target_key };
  }
  target.setAttribute("HPOS", String(edit.after.x));
  target.setAttribute("VPOS", String(edit.after.y));
  target.setAttribute("WIDTH", String(edit.after.width));
  target.setAttribute("HEIGHT", String(edit.after.height));
  return null;
}

export function buildCorrectedXml(args: {
  sourceXml: string;
  document: PageDocumentDTO;
  wordTextEdits: WordTextEdit[];
  bboxEdits: BBoxEdit[];
}): CorrectedXmlResult {
  const parsed = new DOMParser({ onError: onErrorStopParsing }).parseFromString(args.sourceXml, "application/xml");
  const warnings: CorrectedXmlWarning[] = [];
  let appliedWordTextEdits = 0;
  let appliedBBoxEdits = 0;

  for (const edit of args.wordTextEdits) {
    const target = resolveTarget(parsed, edit.element_id, edit.source_path);
    if (!target) {
      warnings.push({ code: "EXPORT.TARGET_NOT_FOUND", message: `Could not resolve ${edit.target_key} in the original XML.`, target_key: edit.target_key });
      continue;
    }
    const warning = args.document.source_format === "alto" ? patchAltoWordText(target, edit) : patchPageWordText(target, edit);
    if (warning) warnings.push(warning);
    else appliedWordTextEdits += 1;
  }

  for (const edit of args.bboxEdits) {
    const target = resolveTarget(parsed, edit.element_id, edit.source_path);
    if (!target) {
      warnings.push({ code: "EXPORT.TARGET_NOT_FOUND", message: `Could not resolve ${edit.target_key} in the original XML.`, target_key: edit.target_key });
      continue;
    }
    if (args.document.source_format === "page_xml") {
      warnings.push({ code: "EXPORT.PAGE_BBOX_UNSUPPORTED", message: "PAGE XML geometry is polygonal; rectangular working-copy edits are not serialized as lossy Coords polygons.", target_key: edit.target_key });
      continue;
    }
    const warning = patchAltoBBox(target, edit);
    if (warning) warnings.push(warning);
    else appliedBBoxEdits += 1;
  }

  return {
    xml: new XMLSerializer().serializeToString(parsed),
    applied_word_text_edits: appliedWordTextEdits,
    applied_bbox_edits: appliedBBoxEdits,
    skipped_edits: warnings.length,
    warnings,
    preservation: {
      strategy: "patch-original-dom",
      untouched_elements_preserved: true,
      byte_identical_roundtrip: false,
    },
  };
}


export function correctedXmlFilename(sourceName: string): string {
  const stem = sourceName
    .replace(/\.xml$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "document";
  return `${stem}.corrected.xml`;
}
