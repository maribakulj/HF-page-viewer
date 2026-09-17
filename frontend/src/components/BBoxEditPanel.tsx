import { useEffect, useMemo, useState } from "react";

import type { BBoxDTO, OverlayNode } from "../types";

type Draft = { x: string; y: string; width: string; height: string };

function draftFromBBox(box: BBoxDTO): Draft {
  return { x: String(box.x), y: String(box.y), width: String(box.width), height: String(box.height) };
}

export function BBoxEditPanel({
  selected,
  editCount,
  onCommit,
  onUndo,
  onReset,
}: {
  selected: OverlayNode | null;
  editCount: number;
  onCommit: (bbox: BBoxDTO) => void;
  onUndo: () => void;
  onReset: () => void;
}) {
  const editable = Boolean(selected && ["region", "line", "word"].includes(selected.kind) && selected.geometry?.kind === "bbox");
  const current = editable ? selected!.geometry as BBoxDTO : null;
  const [draft, setDraft] = useState<Draft>(current ? draftFromBBox(current) : { x: "", y: "", width: "", height: "" });

  useEffect(() => {
    setDraft(current ? draftFromBBox(current) : { x: "", y: "", width: "", height: "" });
  }, [current?.x, current?.y, current?.width, current?.height, selected?.key]);

  const parsed = useMemo(() => {
    const x = Number(draft.x); const y = Number(draft.y); const width = Number(draft.width); const height = Number(draft.height);
    if (![x, y, width, height].every(Number.isFinite)) return null;
    return { kind: "bbox" as const, x, y, width, height };
  }, [draft]);
  const valid = Boolean(parsed && parsed.width > 0 && parsed.height > 0);
  const changed = Boolean(parsed && current && (parsed.x !== current.x || parsed.y !== current.y || parsed.width !== current.width || parsed.height !== current.height));

  const field = (name: keyof Draft, label: string) => (
    <label className="field-label">{label}<input inputMode="decimal" value={draft[name]} onChange={(event) => setDraft((value) => ({ ...value, [name]: event.target.value }))} /></label>
  );

  return (
    <section className="bbox-edit-panel" aria-label="Edit selected bounding box">
      <div className="word-edit-heading">
        <div><h3>Edit bounding box</h3><p>Numeric bbox edits apply only to the browser working copy.</p></div>
        {editCount > 0 && <span className="iiif-version-chip">{editCount} bbox edit{editCount === 1 ? "" : "s"}</span>}
      </div>
      {editable ? (
        <>
          <div className="bbox-edit-grid">{field("x", "X")}{field("y", "Y")}{field("width", "Width")}{field("height", "Height")}</div>
          {!valid && <p className="inline-error">Width and height must be positive finite numbers.</p>}
          <button type="button" className="source-image-switch" disabled={!valid || !changed} onClick={() => parsed && onCommit(parsed)}>Apply bbox edit</button>
        </>
      ) : <p className="muted">Select a region, line or word encoded with a rectangular bbox. Polygon geometry is intentionally not rewritten here.</p>}
      {editCount > 0 && <div className="word-edit-actions"><button type="button" onClick={onUndo}>Undo bbox</button><button type="button" onClick={onReset}>Reset bbox edits</button></div>}
    </section>
  );
}
