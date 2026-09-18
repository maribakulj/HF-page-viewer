import { useEffect, useMemo, useState } from "react";

import { applyAdditionalValidation } from "./additionalValidation";
import { parseDocumentFile } from "./api";
import { applyBBoxEdits, createBBoxEdit } from "./bboxEdits";
import type { BBoxEdit } from "./bboxEdits";
import { BBoxEditPanel } from "./components/BBoxEditPanel";
import { CorrectedXmlPanel } from "./components/CorrectedXmlPanel";
import { FileDrop } from "./components/FileDrop";
import { IiifSourcePanel } from "./components/IiifSourcePanel";
import { Inspector } from "./components/Inspector";
import { LayerControls } from "./components/LayerControls";
import { PageViewer } from "./components/PageViewer";
import { QcReportPanel } from "./components/QcReportPanel";
import { WordSearch } from "./components/WordSearch";
import { WordTextEditPanel } from "./components/WordTextEditPanel";
import { applyIiifValidation } from "./iiifValidation";
import { assessAlignment, countPageElements, flattenPage } from "./pageModel";
import { buildQcReport } from "./qcReport";
import { resolveSchema } from "./schemaRegistry";
import type { BBoxDTO, LayerState, PageDocumentDTO } from "./types";
import { useCorrectedXmlExport } from "./useCorrectedXmlExport";
import { useFileFingerprint } from "./useFileFingerprint";
import { useIiifSource } from "./useIiifSource";
import { useLocalImage } from "./useLocalImage";
import { validateDocument } from "./validation";
import type { ValidationFinding } from "./validation";
import { compareValidationReports } from "./validationComparison";
import { searchDocumentWords, wrapSearchIndex } from "./wordSearch";
import { applyWordTextEdits, createWordTextEdit } from "./wordEdits";
import type { WordTextEdit } from "./wordEdits";
import { combineValidationReport } from "./xsdFindings";
import { validateFileWithPinnedXsd } from "./xsdValidationClient";
import type { BrowserXsdValidation } from "./xsdValidationProtocol";

const defaultLayers: LayerState = { regions: true, lines: true, words: true, glyphs: false, baselines: true, readingOrder: true };

function formatName(document: PageDocumentDTO): string {
  return document.source_format === "alto" ? "ALTO" : "PAGE XML";
}

export default function App() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [document, setDocument] = useState<PageDocumentDTO | null>(null);
  const [wordEdits, setWordEdits] = useState<WordTextEdit[]>([]);
  const [bboxEdits, setBBoxEdits] = useState<BBoxEdit[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [xsdValidation, setXsdValidation] = useState<BrowserXsdValidation>({ status: "idle" });
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [layers, setLayers] = useState<LayerState>(defaultLayers);
  const [preferredImageSource, setPreferredImageSource] = useState<"local" | "iiif">("local");
  const { image, error: imageError } = useLocalImage(imageFile);
  const xmlFingerprint = useFileFingerprint(xmlFile);
  const imageFingerprint = useFileFingerprint(imageFile);
  const { state: iiif, setInput: setIiifInput, load: loadIiif, clear: clearIiif, selectCanvas: selectIiifCanvas, selectImage: selectIiifImage } = useIiifSource();

  useEffect(() => {
    setDocument(null);
    setWordEdits([]);
    setBBoxEdits([]);
    setParseError(null);
    setXsdValidation({ status: "idle" });
    setSelectedKey(null);
    setFocusKey(null);
    setSearchQuery("");
    setActiveSearchIndex(0);
    setPageIndex(0);
    if (!xmlFile) return;
    const controller = new AbortController();
    setParsing(true);
    parseDocumentFile(xmlFile, controller.signal)
      .then((parsed) => { setDocument(parsed); setPageIndex(0); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setParseError(error instanceof Error ? error.message : "XML parsing failed."); })
      .finally(() => { if (!controller.signal.aborted) setParsing(false); });
    return () => controller.abort();
  }, [xmlFile]);

  useEffect(() => {
    if (!xmlFile || !document) { setXsdValidation({ status: "idle" }); return; }
    const resolution = resolveSchema(document);
    if (resolution.status === "unsupported") { setXsdValidation({ status: "unsupported", reason: resolution.reason }); return; }
    const descriptor = resolution.descriptor;
    const controller = new AbortController();
    setXsdValidation({ status: "validating", schemaId: descriptor.id, schemaLabel: descriptor.label });
    validateFileWithPinnedXsd(xmlFile, document, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setXsdValidation(result); })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setXsdValidation({ status: "error", schemaId: descriptor.id, schemaLabel: descriptor.label, stage: "load", message: error instanceof Error ? error.message : String(error), diagnostics: [] });
      });
    return () => controller.abort();
  }, [document, xmlFile]);

  const workingDocument = useMemo(() => {
    if (!document) return null;
    return applyBBoxEdits(applyWordTextEdits(document, wordEdits), bboxEdits);
  }, [bboxEdits, document, wordEdits]);

  useEffect(() => { setActiveSearchIndex(0); }, [workingDocument, searchQuery]);
  useEffect(() => { if (image) setPreferredImageSource("local"); }, [image]);
  useEffect(() => { if (!image && iiif.resolved?.image) setPreferredImageSource("iiif"); }, [iiif.resolved?.image, image]);

  const iiifImage = iiif.resolved?.image ?? null;
  const activeImage = preferredImageSource === "iiif" ? iiifImage ?? image : image ?? iiifImage;
  const iiifActive = Boolean(activeImage && iiifImage && activeImage === iiifImage);
  const page = workingDocument?.pages[pageIndex] ?? null;
  const nodes = useMemo(() => (page ? flattenPage(page) : []), [page]);
  const counts = useMemo(() => (page ? countPageElements(page) : null), [page]);
  const selected = useMemo(() => nodes.find((node) => node.key === selectedKey) ?? null, [nodes, selectedKey]);
  const alignment = useMemo(() => assessAlignment(page, activeImage), [activeImage, page]);
  const searchMatches = useMemo(() => workingDocument ? searchDocumentWords(workingDocument, searchQuery) : [], [workingDocument, searchQuery]);
  const normalizedSearchIndex = wrapSearchIndex(activeSearchIndex, searchMatches.length);
  const activeSearchMatch = searchMatches[normalizedSearchIndex] ?? null;
  const searchHighlightKeys = useMemo(() => new Set(searchMatches.filter((match) => match.pageIndex === pageIndex).map((match) => match.nodeKey)), [pageIndex, searchMatches]);
  const activeSearchKey = activeSearchMatch?.pageIndex === pageIndex ? activeSearchMatch.nodeKey : null;

  useEffect(() => {
    if (!activeSearchMatch) return;
    if (activeSearchMatch.pageIndex !== pageIndex) setPageIndex(activeSearchMatch.pageIndex);
    setSelectedKey(activeSearchMatch.nodeKey);
    setFocusKey(activeSearchMatch.nodeKey);
  }, [activeSearchMatch, pageIndex]);

  const sourceSemanticValidationReport = useMemo(() => document ? applyAdditionalValidation(
    validateDocument(document, { image, imagePageIndex: image ? pageIndex : null }), document,
  ) : null, [document, image, pageIndex]);
  const sourceComparisonReport = useMemo(() => document && sourceSemanticValidationReport ? applyIiifValidation(
    sourceSemanticValidationReport, document, pageIndex, iiif.inspection, iiif.selection, iiif.resolvedService,
  ) : sourceSemanticValidationReport, [document, iiif.inspection, iiif.resolvedService, iiif.selection, pageIndex, sourceSemanticValidationReport]);

  const semanticValidationReport = useMemo(() => workingDocument ? applyAdditionalValidation(
    validateDocument(workingDocument, { image, imagePageIndex: image ? pageIndex : null }), workingDocument,
  ) : null, [workingDocument, image, pageIndex]);
  const workingComparisonReport = useMemo(() => workingDocument && semanticValidationReport ? applyIiifValidation(
    semanticValidationReport, workingDocument, pageIndex, iiif.inspection, iiif.selection, iiif.resolvedService,
  ) : semanticValidationReport, [workingDocument, iiif.inspection, iiif.resolvedService, iiif.selection, pageIndex, semanticValidationReport]);
  const validationComparison = useMemo(
    () => sourceComparisonReport && workingComparisonReport
      ? compareValidationReports(sourceComparisonReport, workingComparisonReport)
      : null,
    [sourceComparisonReport, workingComparisonReport],
  );

  const schemaValidationReport = useMemo(() => semanticValidationReport ? combineValidationReport(semanticValidationReport, xsdValidation) : null, [semanticValidationReport, xsdValidation]);
  const validationReport = useMemo(() => workingDocument && schemaValidationReport ? applyIiifValidation(
    schemaValidationReport, workingDocument, pageIndex, iiif.inspection, iiif.selection, iiif.resolvedService,
  ) : schemaValidationReport, [workingDocument, iiif.inspection, iiif.resolvedService, iiif.selection, pageIndex, schemaValidationReport]);
  const correctedXml = useCorrectedXmlExport({ sourceFile: xmlFile, document, wordTextEdits: wordEdits, bboxEdits });
  const qcReport = useMemo(() => workingDocument && validationReport ? buildQcReport({
    document: workingDocument,
    validation: validationReport,
    xmlFingerprint: xmlFingerprint.fingerprint,
    imageFingerprint: imageFingerprint.fingerprint,
    activeImage,
    pageIndex,
    wordTextEdits: wordEdits,
    bboxEdits,
    validationComparison,
    correctedOutput: correctedXml.result && correctedXml.fingerprint && correctedXml.filename ? { result: correctedXml.result, fingerprint: correctedXml.fingerprint, filename: correctedXml.filename, xsdValidation: correctedXml.xsdValidation } : null,
    iiif: { loadedUrl: iiif.loadedUrl, inspection: iiif.inspection, selection: iiif.selection, resolvedService: iiif.resolvedService },
  }) : null, [activeImage, bboxEdits, correctedXml.filename, correctedXml.fingerprint, correctedXml.result, correctedXml.xsdValidation, workingDocument, iiif.inspection, iiif.loadedUrl, iiif.resolvedService, iiif.selection, imageFingerprint.fingerprint, pageIndex, validationComparison, validationReport, wordEdits, xmlFingerprint.fingerprint]);
  const fingerprinting = xmlFingerprint.hashing || imageFingerprint.hashing;
  const fingerprintError = xmlFingerprint.error ?? imageFingerprint.error;

  const selectValidationFinding = (finding: ValidationFinding): void => {
    const findingPage = finding.target.page_index;
    if (findingPage != null && findingPage >= 0 && findingPage < (workingDocument?.pages.length ?? 0)) setPageIndex(findingPage);
    if (finding.target.node_key) {
      setSelectedKey(finding.target.node_key);
      setFocusKey(finding.target.node_key);
    }
  };
  const selectAndFocus = (key: string): void => {
    setSelectedKey(key);
    setFocusKey(key);
  };
  const moveSearch = (delta: number): void => { if (searchMatches.length) setActiveSearchIndex((current) => wrapSearchIndex(current + delta, searchMatches.length)); };
  const commitWordEdit = (value: string): void => {
    if (!selected || selected.kind !== "word") return;
    const edit = createWordTextEdit({ targetKey: selected.key, pageIndex, elementId: selected.elementId, sourcePath: selected.sourceRef?.path ?? null, before: selected.text ?? "", after: value });
    if (edit) setWordEdits((current) => [...current, edit]);
  };
  const commitBBoxEdit = (bbox: BBoxDTO): void => {
    if (!selected || !["region", "line", "word"].includes(selected.kind) || selected.geometry?.kind !== "bbox") return;
    const edit = createBBoxEdit({
      targetKind: selected.kind as "region" | "line" | "word",
      targetKey: selected.key,
      pageIndex,
      elementId: selected.elementId,
      sourcePath: selected.sourceRef?.path ?? null,
      before: selected.geometry,
      after: bbox,
    });
    if (edit) setBBoxEdits((current) => [...current, edit]);
  };
  const totalEdits = wordEdits.length + bboxEdits.length;

  return (
    <main className="shell">
      <header className="topbar">
        <div><p className="eyebrow">OCR layout inspection</p><h1>HF Page Viewer</h1></div>
        <div className="topbar-statuses">
          {workingDocument && <span className="status status-neutral">{formatName(workingDocument)} {workingDocument.source_version ?? "?"}</span>}
          {totalEdits > 0 && <span className="status status-neutral">Working copy · {totalEdits} edit{totalEdits === 1 ? "" : "s"}</span>}
          {iiif.inspection && <span className="status status-neutral">IIIF {iiif.inspection.version}</span>}
          {validationReport && validationReport.summary.errors > 0 && <span className="status status-error">{validationReport.summary.errors} validation error{validationReport.summary.errors === 1 ? "" : "s"}</span>}
          {xsdValidation.status === "valid" && <span className="status status-ok">Source XSD valid</span>}
          {xsdValidation.status === "validating" && <span className="status status-neutral">XSD validating…</span>}
          <span className="status status-ok">Static · browser-side</span>
        </div>
      </header>
      <section className="workspace">
        <aside className="panel source-panel">
          <div><h2>Sources</h2><p className="panel-intro">Local image/XML stay in your browser. IIIF metadata is fetched directly by your browser when you provide a public URL.</p></div>
          <FileDrop title="Page image" description="JPEG, PNG, WebP, TIFF if your browser supports it" accept="image/*" file={imageFile} onFile={setImageFile} />
          <FileDrop title="OCR/layout XML" description="ALTO v2–v4 or PAGE XML" accept=".xml,application/xml,text/xml" file={xmlFile} onFile={setXmlFile} />
          <IiifSourcePanel state={iiif} active={iiifActive} onInputChange={setIiifInput} onLoad={() => { void loadIiif(); }} onClear={() => { clearIiif(); if (image) setPreferredImageSource("local"); }} onCanvasChange={selectIiifCanvas} onImageChange={selectIiifImage} onUseViewer={() => setPreferredImageSource("iiif")} />
          {image && iiifImage && iiifActive && <button type="button" className="source-image-switch" onClick={() => setPreferredImageSource("local")}>Use local image in viewer</button>}
          {parsing && <p className="inline-state">Parsing XML locally…</p>}
          {parseError && <p className="inline-error">{parseError}</p>}
          {imageError && <p className="inline-error">{imageError}</p>}
          {workingDocument && workingDocument.pages.length > 1 && <label className="field-label">XML page<select value={pageIndex} onChange={(event) => setPageIndex(Number(event.target.value))}>{workingDocument.pages.map((candidate, index) => <option key={candidate.source_ref?.path ?? candidate.element_id} value={index}>{index + 1} · {candidate.element_id}</option>)}</select></label>}
          <WordSearch query={searchQuery} disabled={!workingDocument} matchCount={searchMatches.length} activeIndex={normalizedSearchIndex} activePageIndex={activeSearchMatch?.pageIndex ?? null} onQueryChange={setSearchQuery} onPrevious={() => moveSearch(-1)} onNext={() => moveSearch(1)} />
          <WordTextEditPanel selected={selected} editCount={wordEdits.length} onCommit={commitWordEdit} onUndo={() => setWordEdits((current) => current.slice(0, -1))} onReset={() => setWordEdits([])} />
          <BBoxEditPanel selected={selected} editCount={bboxEdits.length} onCommit={commitBBoxEdit} onUndo={() => setBBoxEdits((current) => current.slice(0, -1))} onReset={() => setBBoxEdits([])} />
          <LayerControls layers={layers} onChange={setLayers} />
          <CorrectedXmlPanel state={correctedXml} />
          <QcReportPanel report={qcReport} hashing={fingerprinting} fingerprintError={fingerprintError} />
          <div className="source-summary"><span>{activeImage ? `${activeImage.width} × ${activeImage.height}px · ${iiifActive ? "IIIF" : "local"}` : "No viewer image"}</span><span>{page ? `${page.width ?? "?"} × ${page.height ?? "?"} ${page.measurement_unit}` : "No XML page"}</span></div>
        </aside>
        <section className="viewer-column">
          {activeImage ? <><div className={`alignment-strip alignment-${alignment.kind}`}>{alignment.message}</div><PageViewer image={activeImage} page={page} nodes={nodes} layers={layers} selectedKey={selectedKey} highlightedKeys={searchHighlightKeys} searchActiveKey={activeSearchKey} focusKey={focusKey} alignment={alignment} onSelect={setSelectedKey} /></> : <div className="viewer-empty"><div><p className="eyebrow">Browser-side workflow</p><h2>Load a page image or IIIF source</h2><p>Local files stay in your browser. Public IIIF resources are fetched directly from their provider without an application proxy.</p></div></div>}
        </section>
        <Inspector document={workingDocument} page={page} image={activeImage} counts={counts} selected={selected} selectedKey={selectedKey} alignment={alignment} validationReport={validationReport} xsdValidation={xsdValidation} onSelect={selectAndFocus} onValidationSelect={selectValidationFinding} />
      </section>
    </main>
  );
}
