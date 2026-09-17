---
title: HF Page Viewer
emoji: 🔎
colorFrom: gray
colorTo: blue
sdk: static
app_file: index.html
fullWidth: true
header: mini
short_description: Inspect ALTO/PAGE XML against page images and IIIF.
---

# HF Page Viewer

HF Page Viewer is a browser-only OCR/layout inspection application. Load a page image and an ALTO or PAGE XML file, inspect the encoded geometry over the raster, browse metadata and structure, and run deterministic quality checks without uploading the document to an application server.

Production Space: **[Ma-Ri-Ba-Ku/Inspector-ALTO](https://huggingface.co/spaces/Ma-Ri-Ba-Ku/Inspector-ALTO)**.

The deployed Hugging Face Space is deliberately **static**. The production Space does not run Docker, Gradio compute, or a Hugging Face build job. GitHub Actions tests and compiles the Vite frontend, then publishes the prebuilt `index.html` and assets directly to Hugging Face. This avoids the credit-gated Static Space build step while keeping the deployed application browser-only.

## Current capabilities

- local image loading through browser object URLs;
- automatic ALTO vs PAGE XML detection;
- ALTO v2/v3/v4 parsing in the browser;
- PAGE XML page-content parsing with `2019-07-15` as the baseline;
- normalized page model shared by both XML formats;
- provider-neutral IIIF Image API 2/3 and Presentation API 2/3 normalization in pure TypeScript;
- direct browser-side IIIF metadata loading with timeout/size limits, no credential forwarding and explicit HTTP/JSON/network/CORS diagnostics;
- explicit Canvas and painting-image selection, with no silent choice when a Canvas exposes multiple painting candidates;
- local and IIIF images can coexist and the user can explicitly choose which raster is displayed;
- deterministic XML↔IIIF Canvas/image dimension findings while preserving local-raster validation separately;
- OpenSeadragon pan/zoom;
- synchronized overlays for regions, lines, words, glyphs, baselines and reading order;
- adaptive SVG rendering with Fit-relative level-of-detail, viewport culling, 12% overscan and a 6,000-shape final safety budget for dense pages;
- search/selection geometry is force-preserved across LOD, culling and layer visibility;
- exact word search across ALTO/PAGE text with all page-local matches highlighted, previous/next navigation and automatic OpenSeadragon focus on the active occurrence;
- metadata, processing history, styles/tags/extensions, source attributes and parser notices;
- explicit image/XML dimension alignment diagnostics;
- deterministic browser-side validation with stable rule IDs for geometry, confidence, XML IDs, reading order, provenance and selected IIIF context;
- normative XSD validation for pinned ALTO 4.4 and PAGE XML 2019-07-15 schemas through `libxml2-wasm` in a dedicated browser Worker;
- schema diagnostics mapped to `XML.SCHEMA_INVALID` findings with line/XPath evidence when available;
- validation findings linked back to viewer targets, with evidence/remediation and JSON report export;
- explicit `XSD not pinned for this version` status for parseable legacy/other namespaces rather than validating them against the wrong schema;
- reproducible Chrome-headless overlay benchmarks comparing full SVG with adaptive rendering at 1k/10k/50k source-geometry loads; results are documented in [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md);
- frontend tests and TypeScript build gates.

Native OpenSeadragon consumption of normalized IIIF `info.json` tile sources is the next IIIF rendering tranche. The current browser-core implementation uses the canonical full-image request for display while retaining `info.json` in the normalized source model. See [`docs/IIIF.md`](docs/IIIF.md).

## Architecture

```text
Local image + XML                     Public IIIF URL
        │                                  │
        │                                  ▼
        │                         bounded browser fetch
        │                         + CORS diagnostics
        │                                  │
        │                                  ▼
        │                      Image 2/3 + Presentation 2/3
        │                         normalized IIIF model
        │                                  │
        ├──────────────► ALTO / PAGE parser│
        │                      │            │
        │                      ▼            ▼
        │              normalized PageDocument
        │                      │
        │                      ├────► semantic + IIIF validation
        │                      │
        │                      └────► adaptive SVG render policy
        │                              LOD + viewport culling
        │
        └──────────────► XSD Worker
                           │
                           ├─ pinned same-origin schemas
                           └─ libxml2-wasm
                                   │
                                   ▼
                             XSD diagnostics

normalized sources + diagnostics
                │
        ┌───────┴────────┐
        ▼                ▼
 OpenSeadragon        Inspector
 + SVG overlays        validation / metadata
```

The canonical runtime is the TypeScript frontend. The existing Python backend is retained temporarily as a reference implementation and fixture oracle while browser parity is established; the deployed application does not call it.

Semantic validation is implemented as pure TypeScript rules. Normative XSD validation uses `libxml2-wasm` 0.7.2 in a separate ES-module Worker. Schema files are version-pinned, SHA-256 verified during CI/build, bundled into the static application, and loaded only from the deployed Space's own origin at runtime. See [`docs/SCHEMAS.md`](docs/SCHEMAS.md).

IIIF parsing, fetching, source selection and XML↔IIIF findings are provider-neutral. Browser fetch failures distinguish HTTP, malformed JSON, timeout/size failures and likely CORS denial; CORS denial is reported as an access/interoperability limitation rather than evidence that a remote IIIF resource is invalid. See [`docs/IIIF.md`](docs/IIIF.md).

The viewer remains SVG-first, but no longer attempts to instantiate the whole geometry tree at once. At Fit page it renders overview geometry; words become eligible at 2× Fit and glyphs at 6× Fit. Dense word/glyph layers are culled to the OpenSeadragon viewport with overscan, while active search/selection targets remain visible. The 1k/10k/50k benchmark and before/after evidence are documented in [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md).

## Local development

The XSD assets are generated from their pinned sources before running the frontend locally:

```bash
node scripts/fetch-schemas.mjs
cd frontend
npm install
npm run dev
```

Tests and production build:

```bash
node scripts/fetch-schemas.mjs
cd frontend
npm test
npm run build
```

The renderer benchmark can be run separately against a local Vite server with system Chrome; CI also exposes it as the `Renderer Benchmark` workflow.

The Vite build is emitted to `dist/` at the repository root. In production, GitHub Actions copies the contents of `dist/` to the root of the Hugging Face Space repository. The Space therefore serves `index.html` directly and has no `app_build_command`.

## Deployment

`main` is automatically published to `Ma-Ri-Ba-Ku/Inspector-ALTO` through the keyless OIDC workflow documented in [`docs/HUGGINGFACE_DEPLOYMENT.md`](docs/HUGGINGFACE_DEPLOYMENT.md). Hugging Face only serves the already-built static files; all compilation and schema bundling happen on GitHub Actions.

## Standards baseline

- ALTO 4.4: parser + pinned normative XSD validation;
- common ALTO v2/v3/v4 namespaces: parser + semantic validation; additional normative schemas can be pinned incrementally;
- PAGE XML page content `2019-07-15`: parser + pinned normative XSD validation;
- other dated PAGE namespaces: parser compatibility notices + semantic validation until their exact XSD is pinned;
- IIIF Image API 2.x/3.x: provider-neutral info-document normalization, service metadata and canonical full-image request construction;
- IIIF Presentation API 2.1/3.x: provider-neutral Manifest/Canvas/painting-image normalization and explicit ambiguity handling;
- native OpenSeadragon IIIF tiled loading: next rendering tranche, tracked under #7.

See `docs/ARCHITECTURE.md`, `docs/ALTO_ADAPTER.md`, `docs/PAGE_XML_ADAPTER.md`, `docs/VALIDATION_MODEL.md`, `docs/SCHEMAS.md`, `docs/IIIF.md`, `docs/PERFORMANCE.md`, `docs/ROADMAP.md` and the ADRs in `docs/adr/`.

## License

MIT.
