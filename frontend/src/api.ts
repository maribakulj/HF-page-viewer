import { MAX_XML_BYTES, parseAltoString } from "./altoParser";
import type { PageDocumentDTO } from "./types";

export async function parseAltoFile(
  file: File,
  signal?: AbortSignal,
): Promise<PageDocumentDTO> {
  if (signal?.aborted) throw new DOMException("Parsing aborted", "AbortError");
  if (file.size > MAX_XML_BYTES) {
    throw new Error(`XML file is too large (${file.size.toLocaleString()} bytes; limit ${MAX_XML_BYTES.toLocaleString()}).`);
  }

  const xml = await file.text();
  if (signal?.aborted) throw new DOMException("Parsing aborted", "AbortError");
  return parseAltoString(xml);
}
