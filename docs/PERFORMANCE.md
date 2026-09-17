# Viewer rendering performance

## Why benchmark the overlay

HF Page Viewer uses one synchronized SVG overlay on top of OpenSeadragon. SVG is useful here because geometry stays directly selectable, keyboard-focusable, stylable and easy to synchronize with the structure/validation UI. The cost is one DOM element per live OCR geometry, which does not scale indefinitely.

The early viewer therefore had an **18,000 interactive-shape safety budget**. That value was only a guardrail, not a measured performance threshold. Issue #5 introduced a reproducible browser benchmark before changing the renderer architecture.

## Reproducible benchmark harness

The repository contains a browser-only benchmark page (`frontend/benchmark.html`) and a Playwright Core runner (`frontend/benchmark/run-renderer.mjs`). The harness renders the real `PageViewer`, including OpenSeadragon and the same interactive SVG shape component used in production.

The benchmark can run the viewer in two policies:

- `all`: bypass adaptive rendering and instantiate every requested geometry, used as the control;
- `adaptive`: use the production level-of-detail, viewport culling and final live-shape budget.

Synthetic loads include:

- 1,000 word boxes;
- 10,000 word boxes;
- 50,000 mixed geometry objects, approximately 1% regions, 9% lines and 90% words.

It records:

- synthetic normalized-node generation time;
- initial browser render/OpenSeadragon-open time;
- live SVG and total DOM-node counts;
- selection latency for a late SVG node;
- `requestAnimationFrame` intervals during an OpenSeadragon zoom;
- layer-hide update latency;
- Long Task API entries when available;
- Chrome JS heap usage when available.

The `Renderer Benchmark` GitHub Actions workflow runs against the system Chrome on `ubuntu-24.04`, emits JSON and Markdown reports, and stores them as workflow artifacts. Overlay-related pull requests rerun the same harness.

These numbers are **CI baselines, not universal UX timings**. GitHub-hosted runners vary. Relative behavior within the same run is the architectural signal.

## Why full SVG was rejected

The first 1k/10k/50k baseline already showed that geometry generation was cheap relative to browser DOM/reconciliation/painting work. At 50,000 live interactive SVG shapes, selection could take around a second and zoom animation collapsed to only a handful of frames.

The important finding was therefore not “50,000 is a magic bad number”. It was that **tens of thousands of simultaneous interactive DOM/SVG nodes are the wrong production policy**, while the normalized geometry itself remains cheap enough to keep in memory.

## Adaptive SVG renderer

The production renderer now remains SVG-first, but only instantiates geometry that is useful for the current view.

### Level of detail

LOD uses zoom **relative to OpenSeadragon's Fit-page zoom**, rather than absolute image-pixel zoom. This makes the policy independent of whether the raster is 2,000 or 10,000 pixels high.

- `< 2× Fit`: `overview` — regions and lines are eligible;
- `2×–< 6× Fit`: `words` — word boxes become eligible;
- `>= 6× Fit`: `glyphs` — glyph boxes become eligible when their layer is enabled.

The thresholds are explicit and tested in `renderPolicy.test.ts`.

### Viewport culling

The OpenSeadragon viewport is converted from image coordinates to the XML/page coordinate system. Geometry outside that rectangle is excluded with a **12% overscan margin** to reduce visible pop-in.

Culling also applies to baselines and reading-order drawing, with two correctness constraints:

- a baseline is not discarded merely because its parent line lacks a bounding box;
- reading-order segments remain edges between the original adjacent references. Culling never reconnects two non-adjacent visible nodes across a hidden intermediate node.

### Priority geometry

The following geometry bypasses ordinary layer/LOD/viewport exclusion:

- the active word-search result;
- all word-search matches on the current page;
- the currently selected element.

This prevents performance logic from making a navigation target disappear.

### Final safety budget

After LOD and culling, a deterministic maximum of **6,000 interactive geometry shapes** remains as a final guardrail. It is no longer the primary rendering strategy.

Priority inside that guardrail is:

1. active search target;
2. current selection;
3. search matches;
4. ordinary eligible geometry.

The previous 18,000 fixed-cap-only behavior is gone.

### DOM reduction

Interactive SVG shapes retain `tabIndex`, `role="button"`, `aria-label` and keyboard activation. The redundant child `<title>` element was removed because it doubled geometry-related DOM nodes while the accessible name was already provided by `aria-label` and detailed content is available in the Inspector.

## Final before/after benchmark — 2026-09-17

Exact branch head: `65f61d34d3a4eb0988e741849f7da895b7521943`  
Workflow run: `35243945505`  
Artifact: `renderer-benchmark-65f61d34d3a4eb0988e741849f7da895b7521943` (artifact id `10506189364`)  
Chrome: `152.0.7977.82`  
Runner: GitHub-hosted Ubuntu 24.04, reported `hardwareConcurrency = 4`

| case | source shapes | live SVG shapes | LOD | initial render | selection | zoom p95 frame | hide layers | prepared heap |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| full 1k words | 1,000 | 1,000 | all | 1,042.5 ms | 45.8 ms | 116.7 ms | 13.0 ms | 17.3 MB |
| full 10k words | 10,000 | 10,000 | all | 787.1 ms | 154.7 ms | 116.7 ms | 39.2 ms | 61.1 MB |
| full 50k geometry | 50,000 | 50,000 | all | 1,766.2 ms | 747.6 ms | 233.4 ms | 174.7 ms | 195.1 MB |
| adaptive 50k · Fit page | 50,000 | 5,000 | overview | 672.7 ms | 146.3 ms | 116.7 ms | 18.1 ms | 54.5 MB |
| adaptive 50k · ~2.74× Fit | 50,000 | 6,000 | words | 615.7 ms | 316.3 ms | 249.9 ms | 21.0 ms | 61.7 MB |

The first-render numbers vary on shared CI runners, which is why they should not be interpreted as hard UX SLAs. The live-node, memory and interaction differences are much more stable architectural evidence.

For the 50k source case at Fit page, compared with rendering all 50k shapes in the same run:

- live interactive shapes: **50,000 → 5,000**;
- DOM nodes: roughly **50,049 → 5,050**;
- selection latency: **747.6 ms → 146.3 ms**;
- layer-hide latency: **174.7 ms → 18.1 ms**;
- prepared JS heap: **195.1 MB → 54.5 MB**;
- initial render: **1,766.2 ms → 672.7 ms**.

After three 1.4× zoom actions, or about **2.74× Fit**, the renderer correctly switches to `words` and the last-resort budget holds the live SVG set at **6,000** shapes rather than admitting all 50,000 source objects.

## Interpretation and decision

The benchmark supports the following production decision:

1. **Keep SVG** for the interactive subset. Direct selection, keyboard focus, accessibility and synchronization remain useful.
2. **Do not render the entire ALTO/PAGE geometry tree at once.** The measured bottleneck is live DOM/SVG density, not normalized geometry generation.
3. **Use LOD + viewport culling as the primary policy**, with the 6,000-shape cap only as a deterministic last resort.
4. **Do not move to Canvas/WebGL yet.** The adaptive SVG implementation removes most of the measured cost while retaining simpler direct interaction.

The word-level 50k synthetic case is still not perfectly smooth in headless CI: the zoom p95 probe can approach 250 ms while the live set is changing at an LOD transition. That is a reason to keep the safety budget and to test real dense newspapers, not a reason to restore full SVG or immediately rebuild everything in WebGL.

## Known benchmark limitations / follow-up

The synthetic benchmark deliberately isolates overlay density. It does not reproduce every cost of a real newspaper page:

- complex polygons may cost more than rectangles;
- dense real baselines and reading-order graphs add other SVG elements;
- text distribution and spatial clustering are more irregular than the synthetic grid;
- browser hardware, GPU and accessibility tooling vary;
- a representative redistributable high-density ALTO/PAGE newspaper fixture would provide a useful additional regression case.

Any future Canvas/WebGL renderer should be justified by rerunning the same benchmark plus a real-page fixture. It should not be introduced merely because “50k” sounds large, a surprisingly common substitute for measurement.
