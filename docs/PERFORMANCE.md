# Viewer rendering performance

## Why benchmark the overlay

HF Page Viewer currently uses a single synchronized SVG overlay on top of OpenSeadragon. SVG is valuable here because shapes stay directly inspectable, keyboard-focusable and easy to synchronize with the structure/validation UI, but one DOM element per OCR geometry does not scale indefinitely.

The production viewer historically used an **18,000 interactive-shape safety budget**. That number was a guardrail, not a measured performance threshold. Issue #5 therefore requires a reproducible browser baseline before choosing level-of-detail, culling, Canvas or WebGL.

## Reproducible benchmark harness

The repository contains a browser-only benchmark page (`frontend/benchmark.html`) and a Playwright Core runner (`frontend/benchmark/run-renderer.mjs`). The harness renders the real `PageViewer`, including OpenSeadragon and the same interactive SVG shape components used in production.

The benchmark deliberately bypasses the production 18,000-shape guardrail so the renderer can be observed at the requested loads:

- 1,000 word boxes;
- 10,000 word boxes;
- 50,000 mixed geometry objects (roughly 1% regions, 9% lines, 90% words).

It records:

- synthetic node-generation time;
- initial browser render/open time;
- interactive SVG and total DOM node counts;
- selection latency for a late SVG node;
- requestAnimationFrame intervals during an OpenSeadragon zoom;
- hide-all layer-update latency;
- Long Task API entries when available;
- Chrome JS heap usage when available.

`Renderer Benchmark` runs in GitHub Actions against the system Chrome already installed on `ubuntu-24.04`. Reports are emitted as JSON and Markdown artifacts.

## Baseline — 2026-09-17

Benchmark workflow run: `35241850184`  
Benchmark source commit: `40fe97aab1496f34f43d06c961597f9b7ecb0bfc`  
Artifact: `renderer-benchmark-40fe97aab1496f34f43d06c961597f9b7ecb0bfc`  
Chrome: `152.0.7977.82`  
Runner: GitHub-hosted Ubuntu 24.04, reported `hardwareConcurrency = 4`

| case | SVG shapes | total DOM nodes | initial render | selection | zoom p95 frame | zoom max frame | hide all | initial JS heap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1k words | 1,000 | 2,048 | 726.1 ms | 59.7 ms | 100.1 ms | 100.1 ms | 9.9 ms | 10.5 MB |
| 10k words | 10,000 | 20,048 | 840.6 ms | 323.2 ms | 133.3 ms | 133.3 ms | 56.6 ms | 32.2 MB |
| 50k geometry | 50,000 | 100,048 | 2,259.6 ms | 1,118.0 ms | 250.0 ms | 250.0 ms | 468.2 ms | 121.6 MB |

Zoom probe (700 ms window):

- 1k: 16 measured frame intervals, 6 above 33 ms;
- 10k: 13 intervals, 5 above 33 ms;
- 50k: only 3 intervals, all about 250 ms.

The roughly 2× DOM-node multiplier is expected: each interactive SVG geometry currently also contains a `<title>` element for its accessible/lightweight label.

## Interpretation

These are **CI baselines, not universal UX timings**. Headless Chrome on a shared GitHub runner is not a substitute for testing a user's desktop hardware. The relative scaling is nevertheless decisive enough for an architectural choice:

1. Full interactive SVG at 50k is not acceptable. Selection alone blocks for about 1.1 seconds and zoom animation effectively collapses to a few frames.
2. 10k interactive shapes are renderable, but a ~323 ms selection update is already too expensive for a viewer that should feel directly manipulable.
3. The dominant problem is not generation of normalized geometry (48 ms even at 50k); it is maintaining/reconciling/painting tens of thousands of interactive DOM/SVG nodes.
4. A fixed 18k cap prevents the worst case but does not solve the underlying rendering policy. It can still discard arbitrary later geometry and does not adapt to zoom or viewport.

## Rendering decision

Do **not** replace the entire overlay with Canvas/WebGL yet. The next renderer should keep SVG for the subset that is useful at the current view and reduce the number of live interactive SVG nodes through **adaptive level-of-detail plus viewport culling**:

- page overview: regions and lines only;
- medium/close zoom: words appear when they are visually useful;
- close zoom: glyphs become eligible;
- words/glyphs outside the visible image rectangle are culled, with a small overscan margin to avoid obvious pop-in;
- selected nodes and word-search matches are force-included even if their ordinary layer/LOD would hide them;
- the interactive-shape budget remains only as a final deterministic guardrail, not as the primary rendering strategy.

This preserves the strongest properties of SVG (direct interaction, accessibility, DOM selection, simple geometry styling) while attacking the measured bottleneck: excessive simultaneous DOM nodes.

Canvas or WebGL remains a fallback if the adaptive SVG implementation still fails representative real newspaper pages after the same benchmark is rerun.

## Benchmark limitations / follow-up

The synthetic benchmark deliberately isolates overlay density. It does not yet represent every cost of a real page:

- complex polygons may cost more than rectangles;
- baselines and very large reading-order graphs add SVG nodes outside the geometry count;
- real browser hardware and GPU behavior vary;
- a real high-density ALTO/PAGE newspaper fixture should be added once a redistributable representative sample is selected.

Performance changes to the overlay should rerun this benchmark and compare results rather than changing the safety budget by intuition.
