import { DOMParser, onErrorStopParsing } from "@xmldom/xmldom";

import { parseAltoString } from "./altoParser";
import { parsePageXmlString } from "./pageXmlParser";
import type { PageDocumentDTO } from "./types";

export const MAX_XML_BYTES = 10 * 1024 * 1024;

function sniff(xml: string): { root: string; namespace: string | null } {
  if (new TextEncoder().encode(xml).byteLength > MAX_XML_BYTES) throw new Error("XML input exceeds the 10 MiB limit.");
  if (/<!DOCTYPE\b/i.test(xml) || /<!ENTITY\b/i.test(xml)) throw new Error("DTD and entity declarations are not accepted.");
  try {
    const document = new DOMParser({ onError: onErrorStopParsing }).parseFromString(xml, "application/xml");
    const element = document?.documentElement;
    if (!element) throw new Error("XML document has no root element.");
    return {
      root: element.localName || element.tagName.split(":").at(-1) || element.tagName,
      namespace: element.namespaceURI,
    };
  } catch (error) {
    throw new Error(error instanceof Error ? `Malformed XML: ${error.message}` : "Malformed XML.");
  }
}

export function parseDocumentString(xml: string): PageDocumentDTO {
  const detected = sniff(xml);
  if (detected.root.toLowerCase() === "alto" && /\/alto\/ns-v[234]#?$/i.test(detected.namespace ?? "")) {
    return parseAltoString(xml);
  }
  if (detected.root === "PcGts" && /\/PAGE\/gts\/pagecontent\/\d{4}-\d{2}-\d{2}\/?$/i.test(detected.namespace ?? "")) {
    return parsePageXmlString(xml);
  }
  throw new Error(`Unsupported OCR/layout XML root ${JSON.stringify(detected.root)} with namespace ${JSON.stringify(detected.namespace)}.`);
}
