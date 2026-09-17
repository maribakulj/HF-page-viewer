import type { LayerState } from "../types";

const labels: Record<keyof LayerState, string> = {
  regions: "Regions",
  lines: "Lines",
  words: "Words",
  glyphs: "Glyphs",
  baselines: "Baselines",
  readingOrder: "Reading order",
};

export function LayerControls({
  layers,
  onChange,
}: {
  layers: LayerState;
  onChange: (layers: LayerState) => void;
}) {
  return (
    <fieldset className="layer-controls">
      <legend>Overlay layers</legend>
      <div className="layer-grid">
        {(Object.keys(labels) as (keyof LayerState)[]).map((key) => (
          <label key={key} className="toggle-row">
            <input
              type="checkbox"
              checked={layers[key]}
              onChange={(event) => onChange({ ...layers, [key]: event.target.checked })}
            />
            <span>{labels[key]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
