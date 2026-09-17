import { StrictMode, useCallback, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { PageViewer } from "../components/PageViewer";
import type { AlignmentStatus } from "../pageModel";
import type { ImageInfo, LayerState, OverlayNode, PageDTO } from "../types";
import "../styles.css";
import "../search.css";
import "./benchmark.css";

const PAGE_WIDTH = 5000;
const PAGE_HEIGHT = 7000;
const EMPTY_KEYS = new Set<string>();

const IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}"><rect width="100%" height="100%" fill="#f8fafc"/><path d="M0 0H${PAGE_WIDTH}V${PAGE_HEIGHT}H0Z" fill="none" stroke="#cbd5e1" stroke-width="12"/></svg>`;
const IMAGE_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(IMAGE_SVG)}`;

const image: ImageInfo = {
  url: IMAGE_URL,
  name: "synthetic-benchmark.svg",
  width: PAGE_WIDTH,
  height: PAGE_HEIGHT,
};

const page: PageDTO = {
  element_id: "benchmark-page",
  width: PAGE_WIDTH,
  height: PAGE_HEIGHT,
  measurement_unit: "pixel",
  image_reference: image.name,
  language: null,
  other_languages: [],
  rotation: null,
  regions: [],
  reading_order: null,
  source_ref: null,
};

const alignment: AlignmentStatus = {
  kind: "ready",
  canRender: true,
  message: "Synthetic benchmark image and XML dimensions match.",
};

const initialLayers: LayerState = {
  regions: true,
  lines: true,
  words: true,
  glyphs: false,
  baselines: false,
  readingOrder: false,
};

type BenchmarkMode = "words" | "mixed";

type BenchmarkPublicState = {
  caseId: string;
  requestedShapes: number;
  mode: BenchmarkMode;
  generationMs: number;
  renderStart: number;
  initialRenderMs: number | null;
  shapeCount: number | null;
  ready: boolean;
  osdReady: boolean;
};

declare global {
  interface Window {
    __HF_PAGE_VIEWER_BENCHMARK__?: BenchmarkPublicState;
  }
}

function parseConfig(): { count: number; mode: BenchmarkMode; caseId: string } {
  const params = new URLSearchParams(window.location.search);
  const requested = Number(params.get("count") ?? "1000");
  const count = Number.isFinite(requested) ? Math.min(100000, Math.max(1, Math.floor(requested))) : 1000;
  const mode: BenchmarkMode = params.get("mode") === "mixed" ? "mixed" : "words";
  const caseId = params.get("case")?.trim() || `${count}-${mode}`;
  return { count, mode, caseId };
}

function kindFor(index: number, mode: BenchmarkMode): OverlayNode["kind"] {
  if (mode === "words") return "word";
  const slot = index % 100;
  if (slot === 0) return "region";
  if (slot < 10) return "line";
  return "word";
}

function generateNodes(count: number, mode: BenchmarkMode): OverlayNode[] {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * (PAGE_WIDTH / PAGE_HEIGHT))));
  const rows = Math.max(1, Math.ceil(count / columns));
  const cellWidth = PAGE_WIDTH / columns;
  const cellHeight = PAGE_HEIGHT / rows;

  return Array.from({ length: count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const kind = kindFor(index, mode);
    const id = `bench-${kind}-${index}`;
    return {
      key: `${kind}:/benchmark/${id}`,
      elementId: id,
      kind,
      subtype: kind === "region" ? "synthetic" : null,
      geometry: {
        kind: "bbox" as const,
        x: column * cellWidth + cellWidth * 0.1,
        y: row * cellHeight + cellHeight * 0.15,
        width: Math.max(cellWidth * 0.78, 1),
        height: Math.max(cellHeight * 0.68, 1),
      },
      baseline: null,
      text: kind === "word" ? `token-${index}` : null,
      confidence: kind === "word" ? 0.95 : null,
      sourceRef: null,
    } satisfies OverlayNode;
  });
}

function BenchmarkApp({
  nodes,
  config,
  generationMs,
  renderStart,
}: {
  nodes: OverlayNode[];
  config: ReturnType<typeof parseConfig>;
  generationMs: number;
  renderStart: number;
}) {
  const [layers, setLayers] = useState<LayerState>(initialLayers);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const firstPaintReadyRef = useRef(false);
  const viewerReadyRef = useRef(false);
  const publishedRef = useRef(false);

  const publishReady = useCallback(() => {
    if (publishedRef.current || !firstPaintReadyRef.current || !viewerReadyRef.current) return;
    const shapeCount = document.querySelectorAll(".overlay-node").length;
    if (shapeCount !== nodes.length) return;
    publishedRef.current = true;
    window.__HF_PAGE_VIEWER_BENCHMARK__ = {
      caseId: config.caseId,
      requestedShapes: config.count,
      mode: config.mode,
      generationMs,
      renderStart,
      initialRenderMs: performance.now() - renderStart,
      shapeCount,
      ready: true,
      osdReady: true,
    };
    document.documentElement.dataset.benchmarkReady = "true";
  }, [config.caseId, config.count, config.mode, generationMs, nodes.length, renderStart]);

  const onViewerOpen = useCallback(() => {
    viewerReadyRef.current = true;
    if (window.__HF_PAGE_VIEWER_BENCHMARK__) window.__HF_PAGE_VIEWER_BENCHMARK__!.osdReady = true;
    publishReady();
  }, [publishReady]);

  useLayoutEffect(() => {
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        firstPaintReadyRef.current = true;
        publishReady();
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [publishReady]);

  return (
    <main className="benchmark-shell">
      <header className="benchmark-header">
        <div>
          <strong>{config.caseId}</strong>
          <span>{nodes.length.toLocaleString()} interactive SVG shapes · {config.mode}</span>
        </div>
        <button
          type="button"
          data-benchmark-hide-all
          onClick={() => setLayers({ regions: false, lines: false, words: false, glyphs: false, baselines: false, readingOrder: false })}
        >
          Hide all geometry
        </button>
      </header>
      <section className="benchmark-viewer">
        <PageViewer
          image={image}
          page={page}
          nodes={nodes}
          layers={layers}
          selectedKey={selectedKey}
          highlightedKeys={EMPTY_KEYS}
          focusKey={null}
          alignment={alignment}
          interactiveBudget={nodes.length}
          onViewerOpen={onViewerOpen}
          onSelect={setSelectedKey}
        />
      </section>
    </main>
  );
}

const config = parseConfig();
const generationStart = performance.now();
const nodes = generateNodes(config.count, config.mode);
const generationMs = performance.now() - generationStart;
const renderStart = performance.now();

window.__HF_PAGE_VIEWER_BENCHMARK__ = {
  caseId: config.caseId,
  requestedShapes: config.count,
  mode: config.mode,
  generationMs,
  renderStart,
  initialRenderMs: null,
  shapeCount: null,
  ready: false,
  osdReady: false,
};

createRoot(document.getElementById("benchmark-root")!).render(
  <StrictMode>
    <BenchmarkApp nodes={nodes} config={config} generationMs={generationMs} renderStart={renderStart} />
  </StrictMode>,
);
