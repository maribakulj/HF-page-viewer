# Architecture

## Deployment constraint

HF Page Viewer must be deployable on a free Hugging Face account. Since Hugging Face now requires a paid plan to create Docker or ordinary Gradio compute Spaces, the production target is a **Static Space**.

That is a product constraint, not merely a hosting detail: the deployed application cannot depend on a server process.

## Target system

```text
Local image/XML     Public IIIF resources
      │                    │
      └─────────┬──────────┘
                ▼
       browser ingestion
                │
                ▼
       standards adapters
        ALTO / PAGE / IIIF
                │
                ▼
      normalized PageDocument
          ┌─────┴─────┐
          ▼           ▼
      validation    analysis
          │           │
          └─────┬─────┘
                ▼
     OpenSeadragon + overlays
```

## Runtime boundaries

### Browser core

The canonical production implementation lives under `frontend/src` and contains pure modules for:

- XML ingestion and format detection;
- ALTO/PAGE normalization;
- geometry and reading-order analysis;
- deterministic validation;
- IIIF normalization/fetching subject to browser CORS;
- report serialization.

React owns interaction state and presentation only. Parsing and validation modules must remain callable from Vitest without rendering React.

### XML safety

Uploaded XML is capped before parsing. DTD/entity declarations are rejected. The browser parser never intentionally resolves external resources. Future XSD validation will use pinned local schemas through WebAssembly; user documents will never trigger arbitrary schema/DTD network fetches.

### XSD validation

Browser-side `libxml2-wasm` is the preferred route for normative XSD validation. Schemas and required imports/includes will be vendored and version-pinned. This preserves deterministic validation without server compute.

### IIIF

Remote IIIF requests originate from the user's browser. This removes server-side SSRF risk, but introduces the normal browser CORS boundary. A fetch failure caused by CORS must be reported as an interoperability/access limitation, not as proof that the remote resource is invalid.

## Viewer

OpenSeadragon displays local rasters and later IIIF tile sources. OCR geometry is expressed in image/page coordinates and rendered as a synchronized SVG layer initially. Dense pages are subject to an explicit interactive-shape budget until browser benchmarks justify SVG, Canvas or WebGL thresholds.

## Python reference implementation

`backend/` currently remains as a reference implementation and regression oracle because the secure XML/domain/ALTO work was first implemented there. It is **not part of the deployed Static Space**. Once the browser implementation reaches fixture parity, the project should either remove the Python runtime or turn it into an explicitly optional CLI/library rather than maintaining two accidental canonical implementations.

## Build and deployment

Vite emits `dist/` at repository root. Hugging Face uses:

```yaml
sdk: static
app_build_command: cd frontend && npm install --no-audit --no-fund && npm run build
app_file: dist/index.html
```

No Dockerfile, Python server or paid Hugging Face compute is required for production.
