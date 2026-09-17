import type { FormEvent } from "react";

import type { IiifSourceState } from "../useIiifSource";

export function IiifSourcePanel({
  state,
  active,
  onInputChange,
  onLoad,
  onClear,
  onCanvasChange,
  onImageChange,
  onUseViewer,
}: {
  state: IiifSourceState;
  active: boolean;
  onInputChange: (value: string) => void;
  onLoad: () => void;
  onClear: () => void;
  onCanvasChange: (index: number) => void;
  onImageChange: (index: number | null) => void;
  onUseViewer: () => void;
}) {
  const inspection = state.inspection;
  const resolved = state.resolved;
  const canvas = resolved?.canvas ?? null;
  const candidate = resolved?.candidate ?? null;
  const service = resolved?.service ?? null;

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!state.loading && state.input.trim()) onLoad();
  };

  return (
    <section className="iiif-source-card" aria-label="IIIF source">
      <div className="iiif-source-heading">
        <div>
          <h3>IIIF source</h3>
          <p>Image API base/info.json or Presentation 2.1/3 manifest.</p>
        </div>
        {inspection && <span className="iiif-version-chip">{inspection.version}</span>}
      </div>

      <form className="iiif-source-form" onSubmit={submit}>
        <label className="field-label">
          IIIF URL
          <input
            type="url"
            inputMode="url"
            placeholder="https://…/manifest.json or …/iiif/3/id"
            value={state.input}
            onChange={(event) => onInputChange(event.target.value)}
            spellCheck={false}
          />
        </label>
        <div className="iiif-actions">
          <button type="submit" disabled={state.loading || !state.input.trim()}>{state.loading ? "Loading…" : "Load IIIF"}</button>
          {inspection && <button type="button" className="button-secondary" onClick={onClear}>Clear</button>}
        </div>
      </form>

      {state.error && (
        <div className="iiif-diagnostic iiif-diagnostic-error" role="status">
          <strong>{state.error.code}</strong>
          <span>{state.error.message}</span>
        </div>
      )}

      {inspection && (
        <div className="iiif-loaded">
          <dl className="compact-dl">
            <div><dt>Resource</dt><dd>{inspection.kind === "manifest" ? "Manifest" : "Image service"}</dd></div>
            <div><dt>ID</dt><dd title={inspection.id}>{inspection.id}</dd></div>
            {inspection.label && <div><dt>Label</dt><dd>{inspection.label}</dd></div>}
            {state.loadedUrl && <div><dt>Fetched</dt><dd title={state.loadedUrl}>{state.loadedUrl}</dd></div>}
          </dl>

          {inspection.kind === "manifest" && (
            <>
              <label className="field-label">
                Canvas
                <select
                  value={state.selection.canvasIndex ?? ""}
                  onChange={(event) => onCanvasChange(Number(event.target.value))}
                >
                  {inspection.canvases.map((item, index) => (
                    <option key={item.id} value={index}>{index + 1} · {item.label ?? item.id}</option>
                  ))}
                </select>
              </label>

              {canvas && canvas.images.length > 1 && (
                <label className="field-label">
                  Painting image
                  <select
                    value={state.selection.imageIndex ?? ""}
                    onChange={(event) => onImageChange(event.target.value === "" ? null : Number(event.target.value))}
                  >
                    <option value="">Choose explicitly…</option>
                    {canvas.images.map((image, index) => (
                      <option key={`${image.id}:${index}`} value={index}>{index + 1} · {image.id}</option>
                    ))}
                  </select>
                </label>
              )}

              {canvas && canvas.images.length === 0 && (
                <div className="iiif-diagnostic iiif-diagnostic-warning">
                  <strong>IIIF.NO_PAINTING_IMAGE</strong>
                  <span>This Canvas contains no normalized painting-image candidate.</span>
                </div>
              )}
            </>
          )}

          {state.serviceLoading && <p className="inline-state">Inspecting selected Image API service…</p>}
          {state.serviceError && (
            <div className="iiif-diagnostic iiif-diagnostic-warning" role="status">
              <strong>{state.serviceError.code}</strong>
              <span>{state.serviceError.message}</span>
            </div>
          )}

          {(canvas || candidate || service) && (
            <dl className="compact-dl iiif-selection-summary">
              {canvas && <div><dt>Canvas</dt><dd>{canvas.width ?? "?"} × {canvas.height ?? "?"}</dd></div>}
              {candidate && <div><dt>Image</dt><dd>{candidate.width ?? service?.width ?? "?"} × {candidate.height ?? service?.height ?? "?"}</dd></div>}
              {service && <div><dt>Image API</dt><dd>v{service.api_version} · {service.profile ?? "profile not encoded"}</dd></div>}
            </dl>
          )}

          {inspection.kind === "manifest" && canvas && canvas.images.length > 1 && state.selection.imageIndex == null && (
            <div className="iiif-diagnostic iiif-diagnostic-info">
              <strong>IIIF.MULTIPLE_IMAGE_CANDIDATES</strong>
              <span>{canvas.images.length} painting images are available. The viewer will not guess which one you meant.</span>
            </div>
          )}

          <button
            type="button"
            className={active ? "iiif-use-button is-active" : "iiif-use-button"}
            disabled={!resolved?.image}
            onClick={onUseViewer}
          >
            {active ? "IIIF image active" : resolved?.image ? "Use IIIF image in viewer" : "IIIF image dimensions unresolved"}
          </button>
        </div>
      )}
    </section>
  );
}
