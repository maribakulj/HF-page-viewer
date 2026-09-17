import { useEffect, useMemo, useState } from "react";

import { parseDocumentFile } from "./api";
import { FileDrop } from "./components/FileDrop";
import { Inspector } from "./components/Inspector";
import { LayerControls } from "./components/LayerControls";
import { PageViewer } from "./components/PageViewer";
import { assessAlignment, countPageElements, flattenPage } from "./pageModel";
import type { LayerState, PageDocumentDTO } from "./types";
import { useLocalImage } from "./useLocalImage";

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
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerState>(defaultLayers);
  const { image, error: imageError } = useLocalImage(imageFile);

  useEffect(() => {
    setDocument(null);
    setParseError(null);
    setSelectedKey(null);
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

  const page = document?.pages[pageIndex] ?? null;
  const nodes = useMemo(() => (page ? flattenPage(page) : []), [page]);
  const counts = useMemo(() => (page ? countPageElements(page) : null), [page]);
  const selected = useMemo(() => nodes.find((node) => node.key === selectedKey) ?? null, [nodes, selectedKey]);
  const alignment = useMemo(() => assessAlignment(page, image), [image, page]);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">OCR layout inspection</p>
          <h1>HF Page Viewer</h1>
        </div>
        <div className="topbar-statuses">
          {document && <span className="status status-neutral">{formatName(document)} {document.source_version ?? "?"}</span>}
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
              <PageViewer image={image} page={page} nodes={nodes} layers={layers} selectedKey={selectedKey} alignment={alignment} onSelect={setSelectedKey} />
            </>
          ) : (
            <div className="viewer-empty"><div><p className="eyebrow">Local workflow</p><h2>Load a page image</h2><p>The raster and XML stay local. ALTO and PAGE parsing run entirely in your browser.</p></div></div>
          )}
        </section>

        <Inspector document={document} page={page} image={image} counts={counts} selected={selected} selectedKey={selectedKey} alignment={alignment} onSelect={setSelectedKey} />
      </section>
    </main>
  );
}
