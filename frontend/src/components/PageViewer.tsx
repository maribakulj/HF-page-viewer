import { useEffect, useMemo, useRef, useState } from "react";
import OpenSeadragon from "openseadragon";

import { flattenReadingOrderRefs, geometryCenter } from "../pageModel";
import type { AlignmentStatus } from "../pageModel";
import {
  boundsIntersect,
  geometryBounds,
  geometryIntersectsWindow,
  overscannedWindow,
  renderLodForRelativeZoom,
  shouldRenderNode,
} from "../renderPolicy";
import type { RenderLod, RenderWindow } from "../renderPolicy";
import type { ImageInfo, LayerState, OverlayNode, PageDTO } from "../types";
import {
  viewerOpenFailureCode,
  viewerSourceKind,
  viewerTileFailureCode,
  viewerTileSource,
} from "../viewerTileSource";

const INTERACTIVE_SVG_BUDGET = 6000;

type RenderViewState = {
  lod: RenderLod;
  relativeZoom: number | null;
  window: RenderWindow | null;
};

type ReadingOrderEntry = {
  reference: string;
  center: { x: number; y: number };
};

type ViewerLoadDiagnostic = {
  code: string;
  message: string;
  source: string | null;
};

const DEFAULT_RENDER_VIEW: RenderViewState = {
  lod: "overview",
  relativeZoom: null,
  window: null,
};

function nodeTitle(node: OverlayNode): string {
  const text = node.text ? ` · ${node.text}` : "";
  const confidence = node.confidence == null ? "" : ` · ${(node.confidence * 100).toFixed(1)}%`;
  return `${node.kind} ${node.elementId}${text}${confidence}`;
}

function renderWindowEqual(left: RenderWindow | null, right: RenderWindow | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return Math.abs(left.minX - right.minX) < 0.5
    && Math.abs(left.minY - right.minY) < 0.5
    && Math.abs(left.maxX - right.maxX) < 0.5
    && Math.abs(left.maxY - right.maxY) < 0.5;
}

function renderViewEqual(left: RenderViewState, right: RenderViewState): boolean {
  return left.lod === right.lod
    && (left.relativeZoom == null || right.relativeZoom == null
      ? left.relativeZoom === right.relativeZoom
      : Math.abs(left.relativeZoom - right.relativeZoom) < 0.005)
    && renderWindowEqual(left.window, right.window);
}

function centerInsideWindow(center: { x: number; y: number }, window: RenderWindow | null): boolean {
  return !window || (
    center.x >= window.minX
    && center.x <= window.maxX
    && center.y >= window.minY
    && center.y <= window.maxY
  );
}

function segmentIntersectsWindow(
  first: { x: number; y: number },
  second: { x: number; y: number },
  window: RenderWindow | null,
): boolean {
  if (!window) return true;
  return boundsIntersect({
    minX: Math.min(first.x, second.x),
    minY: Math.min(first.y, second.y),
    maxX: Math.max(first.x, second.x),
    maxY: Math.max(first.y, second.y),
  }, window);
}

function GeometryShape({
  node,
  selected,
  searchMatch,
  searchActive,
  onSelect,
}: {
  node: OverlayNode;
  selected: boolean;
  searchMatch: boolean;
  searchActive: boolean;
  onSelect: (key: string) => void;
}) {
  const geometry = node.geometry;
  if (!geometry) return null;

  const classes = [
    "overlay-node",
    `overlay-${node.kind}`,
    selected ? "is-selected" : "",
    searchMatch ? "is-search-match" : "",
    searchActive ? "is-search-active" : "",
  ].filter(Boolean).join(" ");

  const common = {
    className: classes,
    tabIndex: 0,
    role: "button",
    "aria-label": nodeTitle(node),
    onClick: () => onSelect(node.key),
    onKeyDown: (event: React.KeyboardEvent<SVGElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(node.key);
      }
    },
  };

  if (geometry.kind === "bbox") {
    return (
      <rect
        {...common}
        x={geometry.x}
        y={geometry.y}
        width={geometry.width}
        height={geometry.height}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  return (
    <polygon
      {...common}
      points={geometry.points.map((point) => `${point.x},${point.y}`).join(" ")}
      vectorEffect="non-scaling-stroke"
    />
  );
}

export function PageViewer({
  image,
  page,
  nodes,
  layers,
  selectedKey,
  highlightedKeys,
  focusKey,
  alignment,
  interactiveBudget = INTERACTIVE_SVG_BUDGET,
  renderPolicy = "adaptive",
  onViewerOpen,
  onSelect,
}: {
  image: ImageInfo;
  page: PageDTO | null;
  nodes: OverlayNode[];
  layers: LayerState;
  selectedKey: string | null;
  highlightedKeys: ReadonlySet<string>;
  focusKey: string | null;
  alignment: AlignmentStatus;
  interactiveBudget?: number;
  renderPolicy?: "adaptive" | "all";
  onViewerOpen?: () => void;
  onSelect: (key: string) => void;
}) {
  const osdElementRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const syncOverlayRef = useRef<() => void>(() => undefined);
  const focusSearchRef = useRef<() => void>(() => undefined);
  const updateRenderViewRef = useRef<() => void>(() => undefined);
  const pageRef = useRef<PageDTO | null>(page);
  const alignmentRef = useRef(alignment);
  const onViewerOpenRef = useRef(onViewerOpen);
  const [renderView, setRenderView] = useState<RenderViewState>(DEFAULT_RENDER_VIEW);
  const [viewerDiagnostic, setViewerDiagnostic] = useState<ViewerLoadDiagnostic | null>(null);
  pageRef.current = page;
  alignmentRef.current = alignment;
  onViewerOpenRef.current = onViewerOpen;

  useEffect(() => {
    const element = osdElementRef.current;
    if (!element) return;

    setViewerDiagnostic(null);
    const viewer = OpenSeadragon({
      element,
      tileSources: viewerTileSource(image),
      showNavigationControl: false,
      showNavigator: true,
      animationTime: 0.35,
      blendTime: 0.05,
      maxZoomPixelRatio: 8,
      gestureSettingsMouse: { clickToZoom: false },
      gestureSettingsTouch: { pinchToZoom: true },
    });
    viewerRef.current = viewer;

    const syncOverlay = () => {
      const overlay = overlayRef.current;
      const item = viewer.world.getItemAt(0);
      if (!overlay || !item) return;

      const topLeft = item.imageToViewerElementCoordinates(new OpenSeadragon.Point(0, 0));
      const bottomRight = item.imageToViewerElementCoordinates(
        new OpenSeadragon.Point(image.width, image.height),
      );
      overlay.style.left = `${topLeft.x}px`;
      overlay.style.top = `${topLeft.y}px`;
      overlay.style.width = `${bottomRight.x - topLeft.x}px`;
      overlay.style.height = `${bottomRight.y - topLeft.y}px`;
    };
    syncOverlayRef.current = syncOverlay;

    const updateRenderView = () => {
      const currentPage = pageRef.current;
      const currentAlignment = alignmentRef.current;
      const item = viewer.world.getItemAt(0);
      if (!item || !currentPage || !currentAlignment.canRender || !currentPage.width || !currentPage.height) {
        setRenderView((current) => renderViewEqual(current, DEFAULT_RENDER_VIEW) ? current : DEFAULT_RENDER_VIEW);
        return;
      }

      const viewportBounds = viewer.viewport.getBounds(true);
      const imageBounds = item.viewportToImageRectangle(
        viewportBounds.x,
        viewportBounds.y,
        viewportBounds.width,
        viewportBounds.height,
        true,
      );
      const homeZoom = viewer.viewport.getHomeZoom();
      const currentZoom = viewer.viewport.getZoom(true);
      const relativeZoom = homeZoom > 0 ? currentZoom / homeZoom : 1;
      const next: RenderViewState = {
        lod: renderLodForRelativeZoom(relativeZoom),
        relativeZoom,
        window: overscannedWindow({
          x: imageBounds.x,
          y: imageBounds.y,
          width: imageBounds.width,
          height: imageBounds.height,
          scaleX: currentPage.width / image.width,
          scaleY: currentPage.height / image.height,
          pageWidth: currentPage.width,
          pageHeight: currentPage.height,
        }),
      };
      setRenderView((current) => renderViewEqual(current, next) ? current : next);
    };
    updateRenderViewRef.current = updateRenderView;

    const onOpen = () => {
      setViewerDiagnostic(null);
      syncOverlay();
      updateRenderView();
      focusSearchRef.current();
      onViewerOpenRef.current?.();
    };
    const onAnimationFinish = () => {
      syncOverlay();
      updateRenderView();
    };
    const onResize = () => {
      syncOverlay();
      updateRenderView();
    };
    const onOpenFailed = (event: unknown) => {
      const failure = event as { message?: string; source?: string };
      setViewerDiagnostic({
        code: viewerOpenFailureCode(image),
        message: failure.message || `OpenSeadragon could not open the ${viewerSourceKind(image) === "iiif_tiles" ? "IIIF tile source" : "image source"}.`,
        source: failure.source ?? image.tile_source_url ?? image.url,
      });
    };
    const onTileLoadFailed = (event: unknown) => {
      const failure = event as { message?: string; maxReached?: boolean; tile?: { url?: string } };
      if (failure.maxReached === false) return;
      setViewerDiagnostic({
        code: viewerTileFailureCode(image),
        message: failure.message || "OpenSeadragon exhausted retries for an image tile.",
        source: failure.tile?.url ?? image.tile_source_url ?? image.url,
      });
    };
    viewer.addHandler("open", onOpen);
    viewer.addHandler("open-failed", onOpenFailed);
    viewer.addHandler("tile-load-failed", onTileLoadFailed);
    viewer.addHandler("animation", syncOverlay);
    viewer.addHandler("animation-finish", onAnimationFinish);
    viewer.addHandler("resize", onResize);

    return () => {
      syncOverlayRef.current = () => undefined;
      focusSearchRef.current = () => undefined;
      updateRenderViewRef.current = () => undefined;
      viewerRef.current = null;
      viewer.destroy();
    };
  }, [image.height, image.tile_source_url, image.url, image.width]);

  useEffect(() => {
    if (!page || !alignment.canRender) return;
    const frame = requestAnimationFrame(() => {
      syncOverlayRef.current();
      updateRenderViewRef.current();
    });
    return () => cancelAnimationFrame(frame);
  }, [alignment.canRender, page]);

  useEffect(() => {
    const focusSearch = () => {
      if (!focusKey || !page || !alignment.canRender || !page.width || !page.height) return;
      const viewer = viewerRef.current;
      const item = viewer?.world.getItemAt(0);
      const node = nodes.find((candidate) => candidate.key === focusKey);
      const bounds = geometryBounds(node?.geometry ?? null);
      if (!viewer || !item || !bounds) return;

      const scaleX = image.width / page.width;
      const scaleY = image.height / page.height;
      const x = bounds.minX * scaleX;
      const y = bounds.minY * scaleY;
      const width = Math.max((bounds.maxX - bounds.minX) * scaleX, 1);
      const height = Math.max((bounds.maxY - bounds.minY) * scaleY, 1);
      const padX = Math.max(width * 2, image.width * 0.006);
      const padY = Math.max(height * 4, image.height * 0.006);
      const left = Math.max(0, x - padX);
      const top = Math.max(0, y - padY);
      const right = Math.min(image.width, x + width + padX);
      const bottom = Math.min(image.height, y + height + padY);
      const viewportBounds = item.imageToViewportRectangle(
        left,
        top,
        Math.max(right - left, 1),
        Math.max(bottom - top, 1),
      );
      viewer.viewport.fitBoundsWithConstraints(viewportBounds, false);
    };
    focusSearchRef.current = focusSearch;
    const frame = requestAnimationFrame(focusSearch);
    return () => cancelAnimationFrame(frame);
  }, [alignment.canRender, focusKey, image.height, image.width, nodes, page]);

  const safeInteractiveBudget = Math.max(1, Math.floor(interactiveBudget));
  const effectiveLod: RenderLod = renderPolicy === "all" ? "glyphs" : renderView.lod;
  const effectiveWindow = renderPolicy === "all" ? null : renderView.window;
  const visibleNodes = useMemo(
    () => nodes.filter((node) => shouldRenderNode({
      node,
      layers,
      lod: effectiveLod,
      window: effectiveWindow,
      forced: highlightedKeys.has(node.key) || node.key === focusKey || node.key === selectedKey,
    })),
    [effectiveLod, effectiveWindow, focusKey, highlightedKeys, layers, nodes, selectedKey],
  );
  const renderedNodes = useMemo(() => {
    if (visibleNodes.length <= safeInteractiveBudget) return visibleNodes;
    const result: OverlayNode[] = [];
    const used = new Set<string>();
    const add = (node: OverlayNode | undefined): void => {
      if (!node || used.has(node.key) || result.length >= safeInteractiveBudget) return;
      used.add(node.key);
      result.push(node);
    };

    add(visibleNodes.find((node) => node.key === focusKey));
    add(visibleNodes.find((node) => node.key === selectedKey));
    for (const node of visibleNodes) {
      if (highlightedKeys.has(node.key)) add(node);
      if (result.length >= safeInteractiveBudget) break;
    }
    for (const node of visibleNodes) {
      add(node);
      if (result.length >= safeInteractiveBudget) break;
    }
    return result;
  }, [focusKey, highlightedKeys, safeInteractiveBudget, selectedKey, visibleNodes]);
  const budgetExceeded = visibleNodes.length > renderedNodes.length;

  const renderedBaselines = useMemo(() => {
    if (!layers.baselines) return [];
    return nodes
      .filter((node) => (
        node.kind === "line"
        && node.baseline
        && (!node.geometry || geometryIntersectsWindow(node.geometry, effectiveWindow))
      ))
      .slice(0, safeInteractiveBudget);
  }, [effectiveWindow, layers.baselines, nodes, safeInteractiveBudget]);

  const nodeById = useMemo(() => {
    const map = new Map<string, OverlayNode>();
    for (const node of nodes) {
      if (!map.has(node.elementId)) map.set(node.elementId, node);
    }
    return map;
  }, [nodes]);

  const readingOrder = useMemo((): ReadingOrderEntry[] => {
    if (!page || !layers.readingOrder) return [];
    return flattenReadingOrderRefs(page.reading_order)
      .map((reference) => {
        const node = nodeById.get(reference);
        const center = geometryCenter(node?.geometry ?? null);
        return center ? { reference, center } : null;
      })
      .filter((entry): entry is ReadingOrderEntry => entry !== null);
  }, [layers.readingOrder, nodeById, page]);

  const visibleReadingOrderLabels = useMemo(
    () => readingOrder.filter((entry) => centerInsideWindow(entry.center, effectiveWindow)),
    [effectiveWindow, readingOrder],
  );

  const visibleReadingOrderSegments = useMemo(
    () => readingOrder.slice(1).map((entry, index) => ({
      previous: readingOrder[index],
      entry,
    })).filter(({ previous, entry }) => segmentIntersectsWindow(previous.center, entry.center, effectiveWindow)),
    [effectiveWindow, readingOrder],
  );

  const hasWords = useMemo(() => nodes.some((node) => node.kind === "word"), [nodes]);
  const hasGlyphs = useMemo(() => nodes.some((node) => node.kind === "glyph"), [nodes]);
  const wordsDeferred = renderPolicy === "adaptive" && layers.words && hasWords && renderView.lod === "overview";
  const glyphsDeferred = renderPolicy === "adaptive" && layers.glyphs && hasGlyphs && renderView.lod !== "glyphs";

  const viewWidth = page?.width && page.width > 0 ? page.width : image.width;
  const viewHeight = page?.height && page.height > 0 ? page.height : image.height;

  return (
    <section
      className="viewer-frame"
      aria-label="Page image and OCR layout viewer"
      data-viewer-source-kind={viewerSourceKind(image)}
    >
      <div ref={osdElementRef} className="osd-canvas" />
      {page && alignment.canRender && (
        <svg
          ref={overlayRef}
          className="page-overlay"
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          preserveAspectRatio="none"
          aria-label="OCR layout overlay"
          data-render-lod={effectiveLod}
          data-render-relative-zoom={renderView.relativeZoom ?? ""}
          data-rendered-shapes={renderedNodes.length}
        >
          {renderedNodes.map((node) => (
            <GeometryShape
              key={node.key}
              node={node}
              selected={node.key === selectedKey}
              searchMatch={highlightedKeys.has(node.key)}
              searchActive={node.key === focusKey}
              onSelect={onSelect}
            />
          ))}
          {renderedBaselines.map((node) => (
            <polyline
              key={`${node.key}:baseline`}
              className="overlay-baseline"
              points={node.baseline!.points.map((point) => `${point.x},${point.y}`).join(" ")}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {layers.readingOrder && visibleReadingOrderSegments.map(({ previous, entry }) => (
            <line
              key={`ro-line:${previous.reference}:${entry.reference}`}
              className="overlay-reading-order"
              x1={previous.center.x}
              y1={previous.center.y}
              x2={entry.center.x}
              y2={entry.center.y}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {layers.readingOrder && visibleReadingOrderLabels.map((entry) => {
            const index = readingOrder.indexOf(entry);
            return (
              <g key={`ro-label:${entry.reference}`} className="reading-order-label">
                <circle cx={entry.center.x} cy={entry.center.y} r={8} vectorEffect="non-scaling-stroke" />
                <text x={entry.center.x} y={entry.center.y} dominantBaseline="middle" textAnchor="middle">
                  {index + 1}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      <div className="viewer-controls" aria-label="Viewer controls">
        <button type="button" onClick={() => viewerRef.current?.viewport.zoomBy(1.4)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => viewerRef.current?.viewport.zoomBy(1 / 1.4)} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={() => viewerRef.current?.viewport.goHome()} aria-label="Fit page">
          Fit
        </button>
      </div>

      {(wordsDeferred || glyphsDeferred) && (
        <div className="viewer-banner viewer-banner-detail">
          Adaptive detail: {wordsDeferred ? "zoom in to show word boxes" : "zoom closer to show glyph boxes"}.
        </div>
      )}
      {viewerDiagnostic ? (
        <div className="viewer-banner viewer-banner-warning" role="status">
          <strong>{viewerDiagnostic.code}</strong> · {viewerDiagnostic.message}
        </div>
      ) : budgetExceeded ? (
        <div className="viewer-banner viewer-banner-warning">
          Dense view: showing {renderedNodes.length.toLocaleString()} of {visibleNodes.length.toLocaleString()} eligible interactive shapes. Search matches and the active selection are prioritized.
        </div>
      ) : null}
      {!alignment.canRender && <div className="viewer-banner viewer-banner-warning">{alignment.message}</div>}
    </section>
  );
}