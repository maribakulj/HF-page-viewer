import type { BBoxDTO, NodeKind, PageDocumentDTO, RegionDTO, TextLineDTO, WordDTO } from "./types";

export type BBoxEdit = {
  kind: "bbox";
  target_kind: Extract<NodeKind, "region" | "line" | "word">;
  target_key: string;
  page_index: number;
  element_id: string;
  source_path: string | null;
  before: BBoxDTO;
  after: BBoxDTO;
};

function key(kind: BBoxEdit["target_kind"], sourcePath: string | undefined, elementId: string): string {
  return `${kind}:${sourcePath ?? elementId}`;
}

function equalBBox(left: BBoxDTO, right: BBoxDTO): boolean {
  return left.x === right.x
    && left.y === right.y
    && left.width === right.width
    && left.height === right.height;
}

function editWord(word: WordDTO, edits: Map<string, BBoxEdit>): WordDTO {
  const edit = edits.get(key("word", word.source_ref?.path, word.element_id));
  return edit && word.geometry?.kind === "bbox" && !equalBBox(word.geometry, edit.after)
    ? { ...word, geometry: edit.after }
    : word;
}

function editLine(line: TextLineDTO, edits: Map<string, BBoxEdit>): TextLineDTO {
  const lineEdit = edits.get(key("line", line.source_ref?.path, line.element_id));
  let changed = false;
  let geometry = line.geometry;
  if (lineEdit && geometry?.kind === "bbox" && !equalBBox(geometry, lineEdit.after)) {
    geometry = lineEdit.after;
    changed = true;
  }
  const words = line.words.map((word) => {
    const edited = editWord(word, edits);
    if (edited !== word) changed = true;
    return edited;
  });
  return changed ? { ...line, geometry, words } : line;
}

function editRegion(region: RegionDTO, edits: Map<string, BBoxEdit>): RegionDTO {
  const regionEdit = edits.get(key("region", region.source_ref?.path, region.element_id));
  let changed = false;
  let geometry = region.geometry;
  if (regionEdit && geometry?.kind === "bbox" && !equalBBox(geometry, regionEdit.after)) {
    geometry = regionEdit.after;
    changed = true;
  }
  const lines = region.lines.map((line) => {
    const edited = editLine(line, edits);
    if (edited !== line) changed = true;
    return edited;
  });
  const regions = region.regions.map((child) => {
    const edited = editRegion(child, edits);
    if (edited !== child) changed = true;
    return edited;
  });
  return changed ? { ...region, geometry, lines, regions } : region;
}

export function applyBBoxEdits(document: PageDocumentDTO, edits: BBoxEdit[]): PageDocumentDTO {
  if (edits.length === 0) return document;
  const latest = new Map<string, BBoxEdit>();
  for (const edit of edits) latest.set(edit.target_key, edit);
  let changed = false;
  const pages = document.pages.map((page, pageIndex) => {
    const pageEdits = new Map([...latest].filter(([, edit]) => edit.page_index === pageIndex));
    if (pageEdits.size === 0) return page;
    const regions = page.regions.map((region) => {
      const edited = editRegion(region, pageEdits);
      if (edited !== region) changed = true;
      return edited;
    });
    return regions.some((region, index) => region !== page.regions[index]) ? { ...page, regions } : page;
  });
  return changed ? { ...document, pages } : document;
}

export function createBBoxEdit(args: {
  targetKind: BBoxEdit["target_kind"];
  targetKey: string;
  pageIndex: number;
  elementId: string;
  sourcePath: string | null;
  before: BBoxDTO;
  after: BBoxDTO;
}): BBoxEdit | null {
  if (equalBBox(args.before, args.after)) return null;
  return {
    kind: "bbox",
    target_kind: args.targetKind,
    target_key: args.targetKey,
    page_index: args.pageIndex,
    element_id: args.elementId,
    source_path: args.sourcePath,
    before: { ...args.before },
    after: { ...args.after },
  };
}
