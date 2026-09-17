import type { PageDocumentDTO, RegionDTO, WordDTO } from "./types";

export type WordSearchMatch = {
  pageIndex: number;
  nodeKey: string;
  elementId: string;
  text: string;
  matchedText: string;
  sourcePath: string | null;
};

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "");
}

function wordKey(word: WordDTO): string {
  return `word:${word.source_ref?.path ?? word.element_id}`;
}

function findMatchingAlternative(word: WordDTO, normalizedQuery: string): string | null {
  for (const alternative of word.text_alternatives) {
    if (normalizeSearchText(alternative.text) === normalizedQuery) return alternative.text;
  }
  return null;
}

function bestWordText(word: WordDTO): string {
  return word.text_alternatives.find((alternative) => alternative.kind === "primary")?.text
    ?? word.text_alternatives[0]?.text
    ?? word.element_id;
}

export function searchDocumentWords(document: PageDocumentDTO, query: string): WordSearchMatch[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const matches: WordSearchMatch[] = [];
  document.pages.forEach((page, pageIndex) => {
    const visitRegion = (region: RegionDTO): void => {
      for (const line of region.lines) {
        for (const word of line.words) {
          const matchedText = findMatchingAlternative(word, normalizedQuery);
          if (matchedText != null) {
            matches.push({
              pageIndex,
              nodeKey: wordKey(word),
              elementId: word.element_id,
              text: bestWordText(word),
              matchedText,
              sourcePath: word.source_ref?.path ?? null,
            });
          }
        }
      }
      region.regions.forEach(visitRegion);
    };
    page.regions.forEach(visitRegion);
  });
  return matches;
}

export function wrapSearchIndex(index: number, matchCount: number): number {
  if (matchCount <= 0) return 0;
  return ((index % matchCount) + matchCount) % matchCount;
}
