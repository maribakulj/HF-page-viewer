import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type OpenSeadragon from "openseadragon";

import { inspectCandidatesAtPoint } from "./inspectGeometry";
import { nextInspectionCycle, sameInspectionPoint } from "./inspectionCycle";
import type { InspectionCycle } from "./inspectionCycle";
import { layerAllowsNode } from "./renderPolicy";
import type { LayerState, OverlayNode, PointDTO } from "./types";

const EMPTY = { candidates: [] as OverlayNode[], index: 0 };

export function useOverlayInspection({
  viewerRef,
  overlayRef,
  enabled,
  nodes,
  layers,
  width,
  height,
  imageKey,
  onSelect,
  onExit,
}: {
  viewerRef: RefObject<OpenSeadragon.Viewer | null>;
  overlayRef: RefObject<SVGSVGElement | null>;
  enabled: boolean;
  nodes: OverlayNode[];
  layers: LayerState;
  width: number;
  height: number;
  imageKey: string;
  onSelect: (key: string) => void;
  onExit: () => void;
}) {
  const [preview, setPreview] = useState(EMPTY);
  const callbacks = useRef({ onSelect, onExit });
  callbacks.current = { onSelect, onExit };
  // Hit testing must not use the SVG LOD, viewport culling or shape budget.
  const eligibleNodes = useMemo(() => nodes.filter((node) => node.geometry && layerAllowsNode(node, layers)), [layers, nodes]);

  useEffect(() => {
    setPreview(EMPTY);
    if (!enabled) return;
    const viewer = viewerRef.current;
    const overlay = overlayRef.current;
    if (!viewer || !overlay) return;
    const canvas = viewer.canvas;
    const frame = overlay.closest(".viewer-frame");
    let cycle: InspectionCycle | null = null;
    let pendingPoint: PointDTO | null = null;
    let animationFrame = 0;
    let displayedKeys: string[] = [];
    let displayedIndex = 0;

    const candidatesAt = (client: PointDTO): OverlayNode[] => {
      const rect = overlay.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return [];
      const point = {
        x: (client.x - rect.left) / rect.width * width,
        y: (client.y - rect.top) / rect.height * height,
      };
      if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) return [];
      return inspectCandidatesAtPoint(eligibleNodes, point);
    };
    const publish = (candidates: OverlayNode[], index: number) => {
      const keys = candidates.map((candidate) => candidate.key);
      if (index === displayedIndex && keys.length === displayedKeys.length && keys.every((key, i) => key === displayedKeys[i])) return;
      displayedKeys = keys;
      displayedIndex = index;
      setPreview({ candidates, index });
    };
    const cancelHoverFrame = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      pendingPoint = null;
    };
    const clear = () => {
      cancelHoverFrame();
      cycle = null;
      publish([], 0);
    };
    const move = (event: PointerEvent) => {
      if (event.buttons !== 0 || event.pointerType === "touch") return;
      pendingPoint = { x: event.clientX, y: event.clientY };
      if (animationFrame) return;
      animationFrame = requestAnimationFrame(() => {
        animationFrame = 0;
        const point = pendingPoint;
        pendingPoint = null;
        if (!point) return;
        const candidates = candidatesAt(point);
        const keys = candidates.map((candidate) => candidate.key);
        if (!sameInspectionPoint(cycle, keys, point)) cycle = null;
        publish(candidates, cycle?.index ?? 0);
      });
    };
    const click = (raw: unknown) => {
      const event = raw as { quick: boolean; position: PointDTO; preventDefaultAction: boolean };
      event.preventDefaultAction = true;
      // OpenSeadragon distinguishes an actual click/tap from a drag release.
      if (!event.quick) return;
      cancelHoverFrame();
      const bounds = canvas.getBoundingClientRect();
      const point = { x: bounds.left + event.position.x, y: bounds.top + event.position.y };
      const candidates = candidatesAt(point);
      cycle = nextInspectionCycle(cycle, candidates.map((candidate) => candidate.key), point);
      const index = cycle?.index ?? 0;
      publish(candidates, index);
      const target = candidates[index];
      if (target) callbacks.current.onSelect(target.key);
    };
    const doubleClick = (raw: unknown) => {
      // The two canvas-click events already advanced the stack. Do not also zoom.
      (raw as { preventDefaultAction: boolean }).preventDefaultAction = true;
    };
    const keyDown = (raw: Event) => {
      const event = raw as KeyboardEvent;
      if (event.key !== "Escape") return;
      clear();
      callbacks.current.onExit();
    };

    // The SVG stays pointer-transparent. Navigation and picking share OSD's
    // gesture recognition instead of competing sibling DOM event surfaces.
    canvas.addEventListener("pointermove", move, { passive: true });
    canvas.addEventListener("pointerleave", clear);
    canvas.addEventListener("pointercancel", clear);
    frame?.addEventListener("keydown", keyDown);
    viewer.addHandler("canvas-click", click);
    viewer.addHandler("canvas-double-click", doubleClick);
    viewer.addHandler("canvas-drag", clear);
    viewer.addHandler("animation-start", clear);
    viewer.addHandler("resize", clear);

    return () => {
      cancelHoverFrame();
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", clear);
      canvas.removeEventListener("pointercancel", clear);
      frame?.removeEventListener("keydown", keyDown);
      viewer.removeHandler("canvas-click", click);
      viewer.removeHandler("canvas-double-click", doubleClick);
      viewer.removeHandler("canvas-drag", clear);
      viewer.removeHandler("animation-start", clear);
      viewer.removeHandler("resize", clear);
    };
  }, [eligibleNodes, enabled, height, imageKey, overlayRef, viewerRef, width]);

  const hoveredKeys = useMemo(() => new Set(preview.candidates.map((node) => node.key)), [preview.candidates]);
  return {
    hoveredKeys,
    target: preview.candidates[preview.index] ?? null,
    index: preview.index,
    count: preview.candidates.length,
  };
}
