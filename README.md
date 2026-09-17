---
title: HF Page Viewer
emoji: 🔎
colorFrom: gray
colorTo: blue
sdk: static
app_build_command: cd frontend && npm install --no-audit --no-fund && npm run build
app_file: dist/index.html
fullWidth: true
header: mini
short_description: Inspect ALTO/PAGE XML against page images and IIIF resources entirely in the browser.
---

# HF Page Viewer

HF Page Viewer is a browser-only OCR/layout inspection application. Load a page image and an ALTO or PAGE XML file, inspect the encoded geometry over the raster, browse metadata and structure, and progressively run deterministic validation checks.

Production Space: **[Ma-Ri-Ba-Ku/Inspector-ALTO](https://huggingface.co/spaces/Ma-Ri-Ba-Ku/Inspector-ALTO)**.

The deployed Hugging Face Space is deliberately **static**. Since 2026, creating Docker or ordinary Gradio compute Spaces requires a paid Hugging Face plan, while Static Spaces remain free. The application therefore does not require a server at runtime: image and XML files stay in the browser.

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
- frontend tests and TypeScript build gates.

## Architecture

```text
Local files / public IIIF URLs
          │
          ▼
 React + TypeScript ingestion
          │
          ▼
 ALTO / PAGE / IIIF adapters
          │
          ▼
 normalized PageDocument
      ┌───┴─────────────┐
      ▼                 ▼
 validation          analysis
      │                 │
      └──────┬──────────┘
             ▼
 OpenSeadragon + SVG/Canvas overlays
```

The canonical runtime is the TypeScript frontend. The existing Python backend is retained temporarily as a reference implementation and fixture oracle while browser parity is established; the deployed application does not call it.

Normative XSD validation is planned with browser-side WebAssembly (`libxml2-wasm`) so schema validation does not require paid server compute.

## Local development

```bash
cd frontend
npm install
npm run dev
```

Tests and production build:

```bash
cd frontend
npm test
npm run build
```

The Vite build is emitted to `dist/` at the repository root. Hugging Face Static Spaces runs the build command from this README and serves `dist/index.html`.

## Deployment

`main` is automatically publishable to `Ma-Ri-Ba-Ku/Inspector-ALTO` through the keyless OIDC workflow documented in [`docs/HUGGINGFACE_DEPLOYMENT.md`](docs/HUGGINGFACE_DEPLOYMENT.md). The Space remains a static, no-subscription deployment.

## Standards baseline

- ALTO 4.4, with common v2/v3/v4 namespace compatibility;
- PAGE XML page content `2019-07-15`, with dated namespace compatibility notices;
- IIIF Image API 2.x/3.0 and Presentation API 2.1/3.0 planned as browser-side adapters.

See `docs/ARCHITECTURE.md`, `docs/ALTO_ADAPTER.md`, `docs/PAGE_XML_ADAPTER.md`, `docs/VALIDATION_MODEL.md`, `docs/ROADMAP.md` and the ADRs in `docs/adr/`.

## License

MIT.