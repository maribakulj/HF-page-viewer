import { useEffect, useState } from "react";

import type { OverlayNode } from "../types";

export function WordTextEditPanel({
  selected,
  editCount,
  onCommit,
  onUndo,
  onReset,
}: {
  selected: OverlayNode | null;
  editCount: number;
  onCommit: (value: string) => void;
  onUndo: () => void;
  onReset: () => void;
}) {
  const editable = selected?.kind === "word";
  const currentText = editable ? selected.text ?? "" : "";
  const [draft, setDraft] = useState(currentText);

  useEffect(() => {
    setDraft(currentText);
  }, [currentText, selected?.key]);

  return (
    <section className="word-edit-panel" aria-label="Edit selected word">
      <div className="word-edit-heading">
        <div>
          <h3>Edit selected word</h3>
          <p>The parsed source remains immutable; edits are applied to a browser working copy.</p>
        </div>
        {editCount > 0 && <span className="iiif-version-chip">{editCount} edit{editCount === 1 ? "" : "s"}</span>}
      </div>
      {editable ? (
        <>
          <label className="field-label">
            Text
            <input value={draft} onChange={(event) => setDraft(event.target.value)} />
          </label>
          <button type="button" className="source-image-switch" disabled={draft === currentText} onClick={() => onCommit(draft)}>
            Apply text edit
          </button>
        </>
      ) : <p className="muted">Select a word box to edit its primary transcription.</p>}
      {editCount > 0 && (
        <div className="word-edit-actions">
          <button type="button" onClick={onUndo}>Undo last</button>
          <button type="button" onClick={onReset}>Reset edits</button>
        </div>
      )}
    </section>
  );
}
