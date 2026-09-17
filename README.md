---
title: HF Page Viewer
emoji: 🔎
colorFrom: gray
colorTo: blue
sdk: docker
app_port: 7860
fullWidth: true
header: mini
short_description: Inspect and validate ALTO/PAGE XML against page images and IIIF resources.
---

# HF Page Viewer

HF Page Viewer is a document-page inspection and validation application for OCR/layout XML.
It is designed to make an ALTO or PAGE XML file understandable at a glance: load a page
image, overlay the encoded geometry, inspect text and metadata, and obtain precise,
actionable validation findings.

The application is deliberately provider-agnostic. IIIF is a first-class integration, not a
hard dependency, so local images and XML files remain fully usable.

> Project status: **Phase 0 / architecture bootstrap**. The repository currently contains the
> deployable application shell and the engineering plan. ALTO/PAGE parsing and interactive
> overlays are the next implementation slice.

## Product goals

- Load an image plus ALTO XML or PAGE XML by drag-and-drop.
- Accept IIIF Image API `info.json`, image-service URLs, and Presentation API manifests.
- Auto-detect format/version and expose useful metadata and provenance.
- Overlay regions, text lines, words, glyphs, baselines, polygons and reading order.
- Keep image, structure tree, text and diagnostics synchronized on hover/click.
- Validate XML syntax, schema conformance, geometry, references, reading order, image/XML
  consistency, text hierarchy and IIIF linkage.
- Produce deterministic findings with severity, evidence, location and remediation hints.
- Export validation reports and a normalized machine-readable representation.
- Stay usable on CPU-only Hugging Face Spaces and locally with Docker.

## Architecture principles

1. **Standards adapters, not standards leakage.** ALTO and PAGE are parsed into a common,
   loss-aware domain model. Format-specific fields remain available as source attributes.
2. **Validation is a library.** The validation engine does not depend on React, FastAPI or
   Hugging Face and can later be reused from notebooks, scripts and tests.
3. **Pixel coordinates remain authoritative.** Rendering transforms are applied only in the
   viewer; source geometry is never silently rewritten.
4. **No magical score.** Findings are explicit and rule-based. A future summary may aggregate
   them, but it will never hide the underlying evidence.
5. **Remote content is untrusted.** XML entity expansion and network DTD access are disabled;
   remote URL loading will be SSRF-protected and size/time limited.
6. **One deployable artifact.** A React/TypeScript frontend is built into a FastAPI container,
   giving Hugging Face Spaces a single Docker service on port `7860`.

## Repository layout

```text
backend/                 FastAPI application and, next, parsing/validation libraries
frontend/                React/TypeScript user interface
docs/                    Architecture, validation contract, roadmap and ADRs
.github/workflows/        CI gates
Dockerfile               Single production container for Hugging Face Spaces
```

## Local development

Backend:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e './backend[dev]'
uvicorn hf_page_viewer.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Production-equivalent container:

```bash
docker build -t hf-page-viewer .
docker run --rm -p 7860:7860 hf-page-viewer
```

Then open `http://localhost:7860`.

## Hugging Face Spaces

This README already contains the Docker Space metadata (`sdk: docker`, `app_port: 7860`).
Push the repository contents to a Docker Space and Hugging Face will build the root
`Dockerfile`. No GPU is required for the core viewer/validator.

## Standards baseline

The first supported baseline will target:

- ALTO 4.4, while keeping adapters capable of handling common 2.x/3.x/4.x documents;
- PAGE XML page content schema `2019-07-15`;
- IIIF Image API 2.x/3.0 and Presentation API 2.1/3.0, normalized internally around the
  Presentation 3 / Image 3 concepts where possible.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
[`docs/VALIDATION_MODEL.md`](docs/VALIDATION_MODEL.md) and
[`docs/ROADMAP.md`](docs/ROADMAP.md) for the implementation plan.

## License

MIT. See [`LICENSE`](LICENSE).
