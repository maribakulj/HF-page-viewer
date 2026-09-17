import { useEffect, useMemo, useState } from "react";

import { applyAdditionalValidation } from "./additionalValidation";
import { parseDocumentFile } from "./api";
import { FileDrop } from "./components/FileDrop";
import { Inspector } from "./components/Inspector";
import { LayerControls } from "./components/LayerControls";
import { PageViewer } from "./components/PageViewer";
import { WordSearch } from "./components/WordSearch";
import { assessAlignment, countPageElements, flattenPage } from "./pageModel";
import { resolveSchema } from "./schemaRegistry";
import type { LayerState, PageDocumentDTO } from "./types";
import { useLocalImage } from "./useLocalImage";
import { validateDocument } from "./validation";
import type { ValidationFinding } from "./validation";
import { searchDocumentWords, wrapSearchIndex } from "./wordSearch";
import { combineValidationReport } from "./xsdFindings";
import { validateFileWithPinnedXsd } from "./xsdValidationClient";
import type { BrowserXsdValidation } from "./xsdValidationProtocol";

const defaultLayers: LayerState = {
  regions: true,
  lines: true,
  words: true,
  glyphs: false,
  baselines: true,
  readingOrder: true,
};

function formatName(document: PageDocumentDTO): string {
  return document.source_format === "alto" ? "ALTO" : "PAGE XML";
}

export default function App() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [document, setDocument] = useState<PageDocumentDTO | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [xsdValidation, setXsdValidation] = useState<BrowserXsdValidation>({ status: "idle" });
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [layers, setLayers] = useState<LayerState>(defaultLayers);
  const { image, error: imageError } = useLocalImage(imageFile);

  useEffect(() => {
    setDocument(null);
    setParseError(null);
    setXsdValidation({ status: "idle" });
    setSelectedKey(null);
    setSearchQuery("");
    setActiveSearchIndex(0);
    setPageIndex(0);
    if (!xmlFile) return;

    const controller = new AbortController();
    setParsing(true);
    parseDocumentFile(xmlFile, controller.signal)
      .then((parsed) => {
        setDocument(parsed);
        setPageIndex(0);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setParseError(error instanceof Error ? error.message : "XML parsing failed.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setParsing(false);
      });
    return () => controller.abort();
  }, [xmlFile]);

  useEffect(() => {
    if (!xmlFile || !document) {
      setXsdValidation({ status: "idle" });
      return;
    }

    const resolution = resolveSchema(document);
    if (resolution.status === "unsupported") {
      setXsdValidation({ status: "unsupported", reason: resolution.reason });
      return;
    }

    const descriptor = resolution.descriptor;
    const controller = new AbortController();
    setXsdValidation({ status: "validating", schemaId: descriptor.id, schemaLabel: descriptor.label });
    validateFileWithPinnedXsd(xmlFile, document, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setXsdValidation(result);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setXsdValidation({
          status: "error",
          schemaId: descriptor.id,
          schemaLabel: descriptor.label,
          stage: "load",
          message: error instanceof Error ? error.message : String(error),
          diagnostics: [],
        });
      });
    return () => controller.abort();
  }, [document, xmlFile]);

  useEffect(() => {
    setActiveSearchIndex(0);
  }, [document, searchQuery]);

  const page = document?.pages[pageIndex] ?? null;
  const nodes = useMemo(() => (page ? flattenPage(page) : []), [page]);
  const counts = useMemo(() => (page ? countPageElements(page) : null), [page]);
  const selected = useMemo(() => nodes.find((node) => node.key === selectedKey) ?? null, [nodes, selectedKey]);
  const alignment = useMemo(() => assessAlignment(page, image), [image, page]);
  const searchMatches = useMemo(
    () => document ? searchDocumentWords(document, searchQuery) : [],
    [document, searchQuery],
  );
  const normalizedSearchIndex = wrapSearchIndex(activeSearchIndex, searchMatches.length);
  const activeSearchMatch = searchMatches[normalizedSearchIndex] ?? null;
  const searchHighlightKeys = useMemo(
    () => new Set(searchMatches.filter((match) => match.pageIndex === pageIndex).map((match) => match.nodeKey)),
    [pageIndex, searchMatches],
  );
  const activeSearchKey = activeSearchMatch?.pageIndex === pageIndex ? activeSearchMatch.nodeKey : null;

  useEffect(() => {
    if (!activeSearchMatch) return;
    if (activeSearchMatch.pageIndex !== pageIndex) setPageIndex(activeSearchMatch.pageIndex);
    setSelectedKey(activeSearchMatch.nodeKey);
  }, [activeSearchMatch, pageIndex]);

  const semanticValidationReport = useMemo(
    () => document ? applyAdditionalValidation(
      validateDocument(document, { image, imagePageIndex: image ? pageIndex : null }),
      document,
    ) : null,
    [document, image, pageIndex],
  );
  const validationReport = useMemo(
    () => semanticValidationReport ? combineValidationReport(semanticValidationReport, xsdValidation) : null,
    [semanticValidationReport, xsdValidation],
  );

  const selectValidationFinding = (finding: ValidationFinding): void => {
    const findingPage = finding.target.page_index;
    if (findingPage != null && findingPage >= 0 && findingPage < (document?.pages.length ?? 0)) {
      setPageIndex(findingPage);
    }
    if (finding.target.node_key) setSelectedKey(finding.target.node_key);
  };

  const moveSearch = (delta: number): void => {
    if (!searchMatches.length) return;
    setActiveSearchIndex((current) => wrapSearchIndex(current + delta, searchMatches.length));
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">OCR layout inspection</p>
          <h1>HF Page Viewer</h1>
        </div>
        <div className="topbar-statuses">
          {document && <span className="status status-neutral">{formatName(document)} {document.source_version ?? "?"}</span>}
          {validationReport && validationReport.summary.errors > 0 && <span className="status status-error">{validationReport.summary.errors} validation error{validationReport.summary.errors === 1 ? "" : "s"}</span>}
          {xsdValidation.status === "valid" && <span className="status status-ok">XSD valid</span>}
          {xsdValidation.status === "validating" && <span className="status status-neutral">XSD validating…</span>}
          <span className="status status-ok">Static · browser-local</span>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel source-panel">
          <div>
            <h2>Sources</h2>
            <p className="panel-intro">Drop one page image and its ALTO or PAGE XML. Neither file leaves your browser.</p>
          </div>
          <FileDrop title="Page image" description="JPEG, PNG, WebP, TIFF if your browser supports it" accept="image/*" file={imageFile} onFile={setImageFile} />
          <FileDrop title="OCR/layout XML" description="ALTO v2–v4 or PAGE XML" accept=".xml,application/xml,text/xml" file={xmlFile} onFile={setXmlFile} />
          {parsing && <p className="inline-state">Parsing XML locally…</p>}
          {parseError && <p className="inline-error">{parseError}</p>}
          {imageError && <p className="inline-error">{imageError}</p>}

          {document && document.pages.length > 1 && (
            <label className="field-label">
              XML page
              <select value={pageIndex} onChange={(event) => setPageIndex(Number(event.target.value))}>
                {document.pages.map((candidate, index) => (
                  <option key={candidate.source_ref?.path ?? candidate.element_id} value={index}>{index + 1} · {candidate.element_id}</option>
                ))}
              </select>
            </label>
          )}
          <WordSearch
            query={searchQuery}
            disabled={!document}
            matchCount={searchMatches.length}
            activeIndex={normalizedSearchIndex}
            activePageIndex={activeSearchMatch?.pageIndex ?? null}
            onQueryChange={setSearchQuery}
            onPrevious={() => moveSearch(-1)}
            onNext={() => moveSearch(1)}
          />
          <LayerControls layers={layers} onChange={setLayers} />
          <div className="source-summary">
            <span>{image ? `${image.width} × ${image.height}px` : "No image"}</span>
            <span>{page ? `${page.width ?? "?"} × ${page.height ?? "?"} ${page.measurement_unit}` : "No XML page"}</span>
          </div>
        </aside>

        <section className="viewer-column">
          {image ? (
            <>
              <div className={`alignment-strip alignment-${alignment.kind}`}>{alignment.message}</div>
              <PageViewer
                image={image}
                page={page}
                nodes={nodes}
                layers={layers}
                selectedKey={selectedKey}
                highlightedKeys={searchHighlightKeys}
                focusKey={activeSearchKey}
                alignment={alignment}
                onSelect={setSelectedKey}
              />
            </>
          ) : (
            <div className="viewer-empty"><div><p className="eyebrow">Local workflow</p><h2>Load a page image</h2><p>The raster and XML stay local. ALTO and PAGE parsing run entirely in your browser.</p></div></div>
          )}
        </section>

        <Inspector
          document={document}
          page={page}
          image={image}
          counts={counts}
          selected={selected}
          selectedKey={selectedKey}
          alignment={alignment}
          validationReport={validationReport}
          xsdValidation={xsdValidation}
          onSelect={setSelectedKey}
          onValidationSelect={selectValidationFinding}
        />
      </section>
    </main>
  );
}
