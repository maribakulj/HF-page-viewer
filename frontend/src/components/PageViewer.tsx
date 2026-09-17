import { useEffect, useMemo, useRef } from "react";
import OpenSeadragon from "openseadragon";

import { flattenReadingOrderRefs, geometryCenter } from "../pageModel";
import type { AlignmentStatus } from "../pageModel";
import type { GeometryDTO, ImageInfo, LayerState, OverlayNode, PageDTO } from "../types";

const INTERACTIVE_SVG_BUDGET = 18000;

type GeometryBounds = { minX: number; minY: number; maxX: number; maxY: number };

function isLayerVisible(node: OverlayNode, layers: LayerState): boolean {
  if (node.kind === "region") return layers.regions;
  if (node.kind === "line") return layers.lines;
  if (node.kind === "word") return layers.words;
  return layers.glyphs;
}

function nodeTitle(node: OverlayNode): string {
  const text = node.text ? ` · ${node.text}` : "";
  const confidence = node.confidence == null ? "" : ` · ${(node.confidence * 100).toFixed(1)}%`;
  return `${node.kind} ${node.elementId}${text}${confidence}`;
}

function geometryBounds(geometry: GeometryDTO | null): GeometryBounds | null {
  if (!geometry) return null;
  if (geometry.kind === "bbox") {
    return {
      minX: Math.min(geometry.x, geometry.x + geometry.width),
      minY: Math.min(geometry.y, geometry.y + geometry.height),
      maxX: Math.max(geometry.x, geometry.x + geometry.width),
      maxY: Math.max(geometry.y, geometry.y + geometry.height),
    };
  }
  if (!geometry.points.length) return null;
  const xs = geometry.points.map((point) => point.x);
  const ys = geometry.points.map((point) => point.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
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
      >
        <title>{nodeTitle(node)}</title>
      </rect>
    );
  }

  return (
    <polygon
      {...common}
      points={geometry.points.map((point) => `${point.x},${point.y}`).join(" ")}
      vectorEffect="non-scaling-stroke"
    >
      <title>{nodeTitle(node)}</title>
    </polygon>
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
  onSelect: (key: string) => void;
}) {
  const osdElementRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const syncOverlayRef = useRef<() => void>(() => undefined);
  const focusSearchRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const element = osdElementRef.current;
    if (!element) return;

    const viewer = OpenSeadragon({
      element,
      tileSources: { type: "image", url: image.url },
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

    const onOpen = () => {
      syncOverlay();
      focusSearchRef.current();
    };
    viewer.addHandler("open", onOpen);
    viewer.addHandler("animation", syncOverlay);
    viewer.addHandler("animation-finish", syncOverlay);
    viewer.addHandler("resize", syncOverlay);

    return () => {
      syncOverlayRef.current = () => undefined;
      focusSearchRef.current = () => undefined;
      viewerRef.current = null;
      viewer.destroy();
    };
  }, [image.height, image.url, image.width]);

  useEffect(() => {
    if (!page || !alignment.canRender) return;
    const frame = requestAnimationFrame(() => syncOverlayRef.current());
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

  const visibleNodes = useMemo(
    () => nodes.filter((node) => (
      node.geometry !== null
      && (isLayerVisible(node, layers) || highlightedKeys.has(node.key) || node.key === focusKey)
    )),
    [focusKey, highlightedKeys, layers, nodes],
  );
  const renderedNodes = useMemo(() => {
    if (visibleNodes.length <= INTERACTIVE_SVG_BUDGET) return visibleNodes;
    const result: OverlayNode[] = [];
    const used = new Set<string>();
    const add = (node: OverlayNode | undefined): void => {
      if (!node || used.has(node.key) || result.length >= INTERACTIVE_SVG_BUDGET) return;
      used.add(node.key);
      result.push(node);
    };

    add(visibleNodes.find((node) => node.key === focusKey));
    add(visibleNodes.find((node) => node.key === selectedKey));
    for (const node of visibleNodes) {
      if (highlightedKeys.has(node.key)) add(node);
      if (result.length >= INTERACTIVE_SVG_BUDGET) break;
    }
    for (const node of visibleNodes) {
      add(node);
      if (result.length >= INTERACTIVE_SVG_BUDGET) break;
    }
    return result;
  }, [focusKey, highlightedKeys, selectedKey, visibleNodes]);
  const budgetExceeded = visibleNodes.length > renderedNodes.length;

  const nodeById = useMemo(() => {
    const map = new Map<string, OverlayNode>();
    for (const node of nodes) {
      if (!map.has(node.elementId)) map.set(node.elementId, node);
    }
    return map;
  }, [nodes]);

  const readingOrder = useMemo(() => {
    if (!page || !layers.readingOrder) return [];
    return flattenReadingOrderRefs(page.reading_order)
      .map((reference) => {
        const node = nodeById.get(reference);
        const center = geometryCenter(node?.geometry ?? null);
        return center ? { reference, center } : null;
      })
      .filter((entry): entry is { reference: string; center: { x: number; y: number } } => entry !== null);
  }, [layers.readingOrder, nodeById, page]);

  const viewWidth = page?.width && page.width > 0 ? page.width : image.width;
  const viewHeight = page?.height && page.height > 0 ? page.height : image.height;

  return (
    <section className="viewer-frame" aria-label="Page image and OCR layout viewer">
      <div ref={osdElementRef} className="osd-canvas" />
      {page && alignment.canRender && (
        <svg
          ref={overlayRef}
          className="page-overlay"
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          preserveAspectRatio="none"
          aria-label="OCR layout overlay"
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
          {layers.baselines &&
            nodes
              .filter((node) => node.kind === "line" && node.baseline)
              .map((node) => (
                <polyline
                  key={`${node.key}:baseline`}
                  className="overlay-baseline"
                  points={node.baseline!.points.map((point) => `${point.x},${point.y}`).join(" ")}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
          {layers.readingOrder &&
            readingOrder.slice(1).map((entry, index) => {
              const previous = readingOrder[index];
              return (
                <line
                  key={`ro-line:${previous.reference}:${entry.reference}`}
                  className="overlay-reading-order"
                  x1={previous.center.x}
                  y1={previous.center.y}
                  x2={entry.center.x}
                  y2={entry.center.y}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          {layers.readingOrder &&
            readingOrder.map((entry, index) => (
              <g key={`ro-label:${entry.reference}`} className="reading-order-label">
                <circle cx={entry.center.x} cy={entry.center.y} r={8} vectorEffect="non-scaling-stroke" />
                <text x={entry.center.x} y={entry.center.y} dominantBaseline="middle" textAnchor="middle">
                  {index + 1}
                </text>
              </g>
            ))}
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

      {budgetExceeded && (
        <div className="viewer-banner viewer-banner-warning">
          Dense page: showing {renderedNodes.length.toLocaleString()} of {visibleNodes.length.toLocaleString()} interactive shapes. Search matches and the active selection are prioritized.
        </div>
      )}
      {!alignment.canRender && <div className="viewer-banner viewer-banner-warning">{alignment.message}</div>}
    </section>
  );
}
