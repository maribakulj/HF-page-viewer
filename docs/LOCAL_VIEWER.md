# Local image + ALTO viewer

The first interactive viewer slice deliberately keeps the raster image in the browser. Only the
ALTO XML is sent to the backend parser. This avoids uploading large source images when server-side
processing is unnecessary and makes the eventual IIIF path an additional image source rather than
a requirement for the core application.

## Rendering model

OpenSeadragon owns image pan/zoom. A single sibling SVG is positioned over the exact displayed
image bounds using `TiledImage.imageToViewerElementCoordinates`. The SVG keeps ALTO page
coordinates in its `viewBox`, so overlay geometry is never rewritten during viewport movement.
React renders the geometry tree only when document/layer/selection data change; pan/zoom updates
only the overlay element's CSS position and size.

This is intentionally different from creating one OpenSeadragon HTML overlay per word. Dense
newspaper pages can contain thousands of words, and thousands of independent positioned DOM
overlays are an avoidable tax.

## Dimension policy

- Pixel ALTO dimensions matching the raster are rendered directly.
- A proportional derivative image is rendered with explicit coordinate scaling and a visible
  notice.
- An aspect-ratio mismatch remains renderable for diagnosis but is displayed as unreliable.
- `mm10` and `inch1200` ALTO coordinates are blocked until a trustworthy resolution conversion is
  available. Guessing DPI would be convenient in exactly the wrong way.

## Selection and structure

Every normalized object receives a frontend key based on source path rather than XML ID alone.
This means malformed files with duplicate IDs can still be inspected without React conflating
nodes. Overlay clicks and the lazy structure tree share that key and therefore synchronize the
selection inspector.

## Density strategy

The current interactive SVG renderer has an 18,000-shape safety budget. Regions, lines and words
are enabled by default; glyphs are opt-in. When selected layers exceed the budget the viewer says
so explicitly rather than silently hanging the browser.

This is a safety valve, not the final dense-page renderer. Before closing the viewer performance
work, representative 1k/10k/50k pages should be profiled in a real browser. The renderer boundary
is intentionally isolated in `PageViewer` so a Canvas/WebGL layer (with hit-testing/spatial index)
can replace or complement SVG without changing parsers, API DTOs, selection state or the
inspector.

## Tests

Pure page-model logic is covered with Vitest: flattening, element counts, reading-order reference
flattening and exact/proportional/mismatched dimension classification. CI runs frontend tests
before the TypeScript/Vite production build.
