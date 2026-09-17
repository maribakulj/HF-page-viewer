import { useEffect, useMemo, useRef } from "react";
import OpenSeadragon from "openseadragon";

import { flattenReadingOrderRefs, geometryCenter } from "../pageModel";
import type { AlignmentStatus } from "../pageModel";
import type { ImageInfo, LayerState, OverlayNode, PageDTO } from "../types";

const INTERACTIVE_SVG_BUDGET = 18000;

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

function GeometryShape({
  node,
  selected,
  onSelect,
}: {
  node: OverlayNode;
  selected: boolean;
  onSelect: (key: string) => void;
}) {
  const geometry = node.geometry;
  if (!geometry) return null;

  const common = {
    className: `overlay-node overlay-${node.kind} ${selected ? "is-selected" : ""}`,
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
  alignment,
  onSelect,
}: {
  image: ImageInfo;
  page: PageDTO | null;
  nodes: OverlayNode[];
  layers: LayerState;
  selectedKey: string | null;
  alignment: AlignmentStatus;
  onSelect: (key: string) => void;
}) {
  const osdElementRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);

  useEffect(() => {
    const element = osdElementRef.current;
    if (!element) return;

    const viewer = OpenSeadragon({
      element,
      tileSources: { type: "image", url: image.url, buildPyramid: true },
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

    viewer.addHandler("open", syncOverlay);
    viewer.addHandler("animation", syncOverlay);
    viewer.addHandler("animation-finish", syncOverlay);
    viewer.addHandler("resize", syncOverlay);

    return () => {
      viewerRef.current = null;
      viewer.destroy();
    };
  }, [image.height, image.url, image.width]);

  const visibleNodes = useMemo(
    () => nodes.filter((node) => isLayerVisible(node, layers) && node.geometry !== null),
    [layers, nodes],
  );
  const renderedNodes = visibleNodes.slice(0, INTERACTIVE_SVG_BUDGET);
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
          Dense page: showing {renderedNodes.length.toLocaleString()} of {visibleNodes.length.toLocaleString()} interactive shapes. Disable a dense layer or zoom via the structure inspector.
        </div>
      )}
      {!alignment.canRender && <div className="viewer-banner viewer-banner-warning">{alignment.message}</div>}
    </section>
  );
}
