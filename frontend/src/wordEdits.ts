import type { PageDocumentDTO, RegionDTO, TextAlternativeDTO, WordDTO } from "./types";

export type WordTextEdit = {
  kind: "word_text";
  target_key: string;
  page_index: number;
  element_id: string;
  source_path: string | null;
  before: string;
  after: string;
};

function wordKey(word: WordDTO): string {
  return `word:${word.source_ref?.path ?? word.element_id}`;
}

function currentText(word: WordDTO): string {
  return word.text_alternatives.find((entry) => entry.kind === "primary")?.text
    ?? word.text_alternatives[0]?.text
    ?? "";
}

function replaceText(alternatives: TextAlternativeDTO[], value: string): TextAlternativeDTO[] {
  const primaryIndex = alternatives.findIndex((entry) => entry.kind === "primary");
  if (primaryIndex >= 0) {
    return alternatives.map((entry, index) => index === primaryIndex ? { ...entry, text: value } : entry);
  }
  if (alternatives.length > 0) {
    return alternatives.map((entry, index) => index === 0 ? { ...entry, text: value } : entry);
  }
  return [{ text: value, confidence: null, kind: "primary" }];
}

function editRegion(region: RegionDTO, edits: Map<string, WordTextEdit>): RegionDTO {
  let changed = false;
  const lines = region.lines.map((line) => {
    let lineChanged = false;
    const words = line.words.map((word) => {
      const edit = edits.get(wordKey(word));
      if (!edit || edit.after === currentText(word)) return word;
      lineChanged = true;
      return { ...word, text_alternatives: replaceText(word.text_alternatives, edit.after) };
    });
    if (!lineChanged) return line;
    changed = true;
    return { ...line, words };
  });
  const regions = region.regions.map((child) => {
    const edited = editRegion(child, edits);
    if (edited !== child) changed = true;
    return edited;
  });
  return changed ? { ...region, lines, regions } : region;
}

export function applyWordTextEdits(document: PageDocumentDTO, edits: WordTextEdit[]): PageDocumentDTO {
  if (edits.length === 0) return document;
  const latest = new Map<string, WordTextEdit>();
  for (const edit of edits) latest.set(edit.target_key, edit);
  let changed = false;
  const pages = document.pages.map((page) => {
    const regions = page.regions.map((region) => {
      const edited = editRegion(region, latest);
      if (edited !== region) changed = true;
      return edited;
    });
    return regions.some((region, index) => region !== page.regions[index]) ? { ...page, regions } : page;
  });
  return changed ? { ...document, pages } : document;
}

export function createWordTextEdit(args: {
  targetKey: string;
  pageIndex: number;
  elementId: string;
  sourcePath: string | null;
  before: string;
  after: string;
}): WordTextEdit | null {
  const before = args.before;
  const after = args.after;
  if (before === after) return null;
  return {
    kind: "word_text",
    target_key: args.targetKey,
    page_index: args.pageIndex,
    element_id: args.elementId,
    source_path: args.sourcePath,
    before,
    after,
  };
}
