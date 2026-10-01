# Inspection mode

Load an image (local or IIIF) and compatible ALTO/PAGE XML, then enable **Inspect** in the viewer controls.

- Hover lightly tints the geometry under the pointer. The current target and its position in the overlap stack are shown below the controls.
- One click selects the most specific enabled element. A second click at the same point selects the next overlap, usually word -> line -> region. Further clicks cycle the stack. Double/triple clicks also work, but rapid clicking is not required.
- Moving to another word starts a new stack, even when both words belong to the same line. Small pointer jitter of up to six CSS pixels is tolerated.
- Wheel zoom, dragging to pan, and touch navigation remain OpenSeadragon gestures. A drag release is not a selection click. Double-click zoom is suppressed only while inspecting because that gesture is used for overlap selection.
- Leaving the viewer clears the hover. **Escape** while focus is in the viewer exits Inspect. The red outline is the persistent inspector selection; the light fill is the transient hover target.

## Picking versus rendering

Hit testing uses the current document geometries filtered by the enabled overlay layers. It is independent of overview LOD, viewport culling and the interactive SVG budget. A word therefore remains inspectable at overview zoom even when its outline has not been drawn. At most one additional target shape is drawn for hover, rather than materializing every word or glyph in the document. Disabled layers are not picked, including shapes retained by search or a previous selection.

The SVG is pointer-transparent in Inspect mode. OpenSeadragon's `canvas-click` identifies real clicks/taps, and passive canvas pointer events drive hover once per animation frame. Handlers and pending animation frames are cleaned up on mode, page/image, geometry or layer changes.

## Regression check

From `frontend`, run:

```sh
CHROME_BIN=/usr/bin/google-chrome node benchmark/inspect-interaction.mjs
```

The script starts Vite, loads local synthetic image/ALTO data into the actual app, and uses native Playwright mouse/keyboard events with real OpenSeadragon. Set `INSPECTION_URL` to test an already running app instead. Results and failure screenshots are written to `frontend/benchmark-results/inspection/`. The **Inspection Interaction** workflow runs this on frontend pull requests. The renderer benchmark is not a replacement for this interaction check.
