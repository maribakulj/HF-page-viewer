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
- OpenSeadragon pan/zoom;
- synchronized overlays for regions, lines, words, glyphs, baselines and reading order;
- metadata, processing history, styles/tags/extensions, source attributes and parser notices;
- explicit image/XML dimension alignment diagnostics;
- deterministic browser-side validation with stable rule IDs for geometry, confidence, XML IDs, reading order and provenance;
- normative XSD validation for pinned ALTO 4.4 and PAGE XML 2019-07-15 schemas through `libxml2-wasm` in a dedicated browser Worker;
- schema diagnostics mapped to `XML.SCHEMA_INVALID` findings with line/XPath evidence when available;
- validation findings linked back to viewer targets, with evidence/remediation and JSON report export;
- explicit `XSD not pinned for this version` status for parseable legacy/other namespaces rather than validating them against the wrong schema;
- frontend tests and TypeScript build gates.

## Architecture

```text
Local image + XML
        │
        ├──────────────► ALTO / PAGE parser ─────► normalized PageDocument
        │                                                │
        │                                                ▼
        │                                     semantic validation rules
        │
        └──────────────► XSD Worker
                           │
                           ├─ pinned same-origin schemas
                           └─ libxml2-wasm
                                   │
                                   ▼
                             XSD diagnostics

normalized document + diagnostics
                │
        ┌───────┴────────┐
        ▼                ▼
 OpenSeadragon        Inspector
 + overlays           validation / metadata
```

The canonical runtime is the TypeScript frontend. The existing Python backend is retained temporarily as a reference implementation and fixture oracle while browser parity is established; the deployed application does not call it.

Semantic validation is implemented as a pure TypeScript rule registry. Normative XSD validation uses `libxml2-wasm` 0.7.2 in a separate ES-module Worker. Schema files are version-pinned, SHA-256 verified during CI/build, bundled into the static application, and loaded only from the deployed Space's own origin at runtime. See [`docs/SCHEMAS.md`](docs/SCHEMAS.md).

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

The Vite build is emitted to `dist/` at the repository root. In production, GitHub Actions copies the contents of `dist/` to the root of the Hugging Face Space repository. The Space therefore serves `index.html` directly and has no `app_build_command`.

## Deployment

`main` is automatically published to `Ma-Ri-Ba-Ku/Inspector-ALTO` through the keyless OIDC workflow documented in [`docs/HUGGINGFACE_DEPLOYMENT.md`](docs/HUGGINGFACE_DEPLOYMENT.md). Hugging Face only serves the already-built static files; all compilation and schema bundling happen on GitHub Actions.

## Standards baseline

- ALTO 4.4: parser + pinned normative XSD validation;
- common ALTO v2/v3/v4 namespaces: parser + semantic validation; additional normative schemas can be pinned incrementally;
- PAGE XML page content `2019-07-15`: parser + pinned normative XSD validation;
- other dated PAGE namespaces: parser compatibility notices + semantic validation until their exact XSD is pinned;
- IIIF Image API 2.x/3.0 and Presentation API 2.1/3.0 planned as browser-side adapters.

See `docs/ARCHITECTURE.md`, `docs/ALTO_ADAPTER.md`, `docs/PAGE_XML_ADAPTER.md`, `docs/VALIDATION_MODEL.md`, `docs/SCHEMAS.md`, `docs/ROADMAP.md` and the ADRs in `docs/adr/`.

## License

MIT.
